"""
org_challenges.py -- Competitive challenge sets scoped to an organization/school.

An org admin/manager assembles a "competition" from the platform's vetted,
sandbox-graded challenges and assigns it to the whole org or a specific group.
Members solve them through the normal /challenges/submit path (same hardened
execution + XP), and this router computes a per-competition leaderboard plus an
overall org leaderboard.

Reusing the existing CHALLENGES registry + challenge_submissions table means we
inherit the proven, tested grading engine rather than re-implementing execution.

Prefix: /api/org
"""

import os
import json
import uuid
import sqlite3
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import get_current_user_id
from routes.organizations import require_org_role
from routes.challenges import CHALLENGES

# Email-safe display name for leaderboard rows. Some users' `name` column holds
# the email they signed up with; rendering `COALESCE(u.name,u.username)` verbatim
# leaked full email addresses onto the org leaderboards (visible to every org
# member). Reuse the single source of truth from routes.social; fall back to an
# inline copy so the leaderboard never breaks if that import is ever unavailable.
try:  # pragma: no cover - exercised via routes.social in normal operation
    from routes.social import _public_display_name as _safe_name
except Exception:  # pragma: no cover - defensive; keep leaderboard resilient
    def _safe_name(name, username):
        name = (name or "").strip()
        username = (username or "").strip()
        if name and "@" not in name:
            return name
        if username and "@" not in username:
            return username
        for v in (name, username):
            if v and "@" in v:
                local = v.split("@", 1)[0].strip()
                if local:
                    return local
        return "Learner"

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/org", tags=["org-challenges"])

_CHALLENGE_BY_ID = {c["id"]: c for c in CHALLENGES}


# ── Schema ──────────────────────────────────────────────────────────────────

def ensure_org_challenge_tables(db_path: str = None):
    conn = sqlite3.connect(db_path or DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS org_challenge_sets (
                id            TEXT PRIMARY KEY,
                org_id        TEXT NOT NULL,
                title         TEXT NOT NULL,
                description   TEXT DEFAULT '',
                challenge_ids TEXT NOT NULL DEFAULT '[]',
                group_name    TEXT DEFAULT '',
                ends_at       TIMESTAMP,
                status        TEXT DEFAULT 'active',
                created_by    TEXT DEFAULT '',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_org_chset_org ON org_challenge_sets(org_id, status)"
        )
        conn.commit()
    finally:
        conn.close()


# ── Models ──────────────────────────────────────────────────────────────────

class CreateChallengeSet(BaseModel):
    title: str
    description: str = ""
    challenge_ids: List[str]
    group_name: str = ""          # "" = whole org
    ends_at: Optional[str] = None  # ISO datetime string, optional deadline


# ── Catalog (which platform challenges can be assigned) ─────────────────────

@router.get("/challenges/catalog")
def challenge_catalog(caller: str = Depends(get_current_user_id)):
    """The vetted challenges an org can compose a competition from."""
    return {
        "challenges": [
            {
                "id": c["id"],
                "title": c["title"],
                "difficulty": c.get("difficulty", "medium"),
                "category": c.get("category", "General"),
                "xp_reward": c.get("xp_reward", 0),
            }
            for c in CHALLENGES
        ]
    }


def _member_scope(conn, org_id: str, group_name: str):
    """Return the list of user_ids in scope for a competition."""
    if group_name:
        rows = conn.execute(
            "SELECT user_id FROM org_member_groups WHERE org_id=? AND group_name=?",
            [org_id, group_name],
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT user_id FROM org_members WHERE org_id=?", [org_id]
        ).fetchall()
    return [r[0] for r in rows]


# ── Create / list / delete ──────────────────────────────────────────────────

@router.post("/{org_id}/challenges")
def create_challenge_set(org_id: str, body: CreateChallengeSet, caller: str = Depends(get_current_user_id)):
    """Create a competition. Requires manager+ in the org."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    ensure_org_challenge_tables()

    valid_ids = [cid for cid in body.challenge_ids if cid in _CHALLENGE_BY_ID]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="Select at least one valid challenge.")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required.")

    set_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO org_challenge_sets (id, org_id, title, description, challenge_ids, "
            "group_name, ends_at, status, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
            [set_id, org_id, body.title.strip(), body.description.strip(),
             json.dumps(valid_ids), body.group_name.strip(), body.ends_at, "active", caller],
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": set_id, "status": "created", "challenge_count": len(valid_ids)}


@router.get("/{org_id}/challenges")
def list_challenge_sets(org_id: str, caller: str = Depends(get_current_user_id)):
    """List competitions. Members see those assigned to them (whole-org or their
    group); managers see all."""
    member = require_org_role(DB_PATH, org_id, caller, "member")
    ensure_org_challenge_tables()
    is_manager = member["role"] in ("manager", "admin", "super_admin")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        my_groups = {
            r[0] for r in conn.execute(
                "SELECT group_name FROM org_member_groups WHERE org_id=? AND user_id=?",
                [org_id, caller],
            ).fetchall()
        }
        rows = conn.execute(
            "SELECT * FROM org_challenge_sets WHERE org_id=? AND status='active' ORDER BY created_at DESC",
            [org_id],
        ).fetchall()
        sets = []
        for r in rows:
            d = dict(r)
            cids = json.loads(d["challenge_ids"] or "[]")
            visible = is_manager or (not d["group_name"]) or (d["group_name"] in my_groups)
            if not visible:
                continue
            # caller's own progress on this set
            done = 0
            if cids:
                placeholders = ",".join("?" * len(cids))
                done = conn.execute(
                    f"SELECT COUNT(*) FROM challenge_submissions WHERE user_id=? AND passed=1 "
                    f"AND challenge_id IN ({placeholders})",
                    [caller, *cids],
                ).fetchone()[0]
            sets.append({
                "id": d["id"],
                "title": d["title"],
                "description": d["description"],
                "group_name": d["group_name"],
                "ends_at": d["ends_at"],
                "created_at": d["created_at"],
                "challenges": [
                    {"id": cid, "title": _CHALLENGE_BY_ID[cid]["title"],
                     "difficulty": _CHALLENGE_BY_ID[cid].get("difficulty", "medium"),
                     "xp_reward": _CHALLENGE_BY_ID[cid].get("xp_reward", 0)}
                    for cid in cids if cid in _CHALLENGE_BY_ID
                ],
                "challenge_count": len(cids),
                "my_completed": done,
            })
        return {"challenge_sets": sets, "count": len(sets), "is_manager": is_manager}
    finally:
        conn.close()


@router.delete("/{org_id}/challenges/{set_id}")
def archive_challenge_set(org_id: str, set_id: str, caller: str = Depends(get_current_user_id)):
    """Archive a competition. Requires manager+."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    ensure_org_challenge_tables()
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(
            "UPDATE org_challenge_sets SET status='archived' WHERE id=? AND org_id=?",
            [set_id, org_id],
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Competition not found")
    finally:
        conn.close()
    return {"status": "archived"}


# ── Leaderboards ────────────────────────────────────────────────────────────

@router.get("/{org_id}/challenges/{set_id}/leaderboard")
def challenge_set_leaderboard(org_id: str, set_id: str, caller: str = Depends(get_current_user_id)):
    """Ranking for one competition: members ranked by # assigned challenges
    passed, then XP earned on them, then earliest finish."""
    require_org_role(DB_PATH, org_id, caller, "member")
    ensure_org_challenge_tables()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cs = conn.execute(
            "SELECT * FROM org_challenge_sets WHERE id=? AND org_id=?", [set_id, org_id]
        ).fetchone()
        if not cs:
            raise HTTPException(status_code=404, detail="Competition not found")
        cids = json.loads(cs["challenge_ids"] or "[]")
        scope_ids = _member_scope(conn, org_id, cs["group_name"])
        if not cids or not scope_ids:
            return {"title": cs["title"], "leaderboard": [], "total_challenges": len(cids)}

        cph = ",".join("?" * len(cids))
        uph = ",".join("?" * len(scope_ids))
        rows = conn.execute(
            f"""SELECT u.id, u.name AS name, u.username AS username, u.avatar_url,
                       COUNT(*) AS solved,
                       COALESCE(SUM(cs.xp_awarded),0) AS xp,
                       MAX(cs.submitted_at) AS last_at
                FROM challenge_submissions cs
                JOIN users u ON u.id = cs.user_id
                WHERE cs.passed=1 AND cs.challenge_id IN ({cph}) AND cs.user_id IN ({uph})
                GROUP BY cs.user_id
                ORDER BY solved DESC, xp DESC, last_at ASC""",
            [*cids, *scope_ids],
        ).fetchall()

        leaderboard = []
        for i, r in enumerate(rows):
            leaderboard.append({
                "rank": i + 1,
                "user_id": r["id"],
                "name": _safe_name(r["name"], r["username"]),
                "avatar_url": r["avatar_url"] or "",
                "solved": r["solved"],
                "total": len(cids),
                "xp": r["xp"],
                "is_me": (r["id"] == caller),
            })
        return {
            "title": cs["title"],
            "group_name": cs["group_name"],
            "total_challenges": len(cids),
            "participants_in_scope": len(scope_ids),
            "leaderboard": leaderboard,
        }
    finally:
        conn.close()


@router.get("/{org_id}/leaderboard")
def org_leaderboard(org_id: str, group: Optional[str] = None, caller: str = Depends(get_current_user_id)):
    """Overall org ranking by XP. Optional `group` filter. Visible to any member
    so learners can see where they stand among peers."""
    require_org_role(DB_PATH, org_id, caller, "member")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        params = [org_id]
        q = """
            SELECT u.id, u.name AS name, u.username AS username, u.avatar_url,
                   COALESCE(u.points,0) AS xp,
                   (SELECT COUNT(*) FROM challenge_submissions cs WHERE cs.user_id=u.id AND cs.passed=1) AS challenges,
                   -- Outer COALESCE so members with NO user_streaks row read 0, not
                   -- SQL NULL. The inner COALESCE only fires within a matched row, so
                   -- a missing row previously yielded NULL -> JSON null -> the frontend
                   -- rendered a bare "🔥" with no number. Outer COALESCE normalizes the
                   -- no-row case to 0 at the source.
                   COALESCE((SELECT current_streak FROM user_streaks st WHERE st.user_id=u.id), 0) AS streak
            FROM org_members om JOIN users u ON u.id = om.user_id
            WHERE om.org_id = ?
        """
        if group == "__ungrouped__":
            q += " AND u.id NOT IN (SELECT user_id FROM org_member_groups WHERE org_id=?)"
            params.append(org_id)
        elif group:
            q += " AND u.id IN (SELECT user_id FROM org_member_groups WHERE org_id=? AND group_name=?)"
            params += [org_id, group]
        q += " ORDER BY xp DESC, challenges DESC, u.created_at ASC"
        rows = conn.execute(q, params).fetchall()

        leaderboard = []
        for i, r in enumerate(rows):
            leaderboard.append({
                "rank": i + 1,
                "user_id": r["id"],
                "name": _safe_name(r["name"], r["username"]),
                "avatar_url": r["avatar_url"] or "",
                "xp": r["xp"],
                "challenges": r["challenges"],
                # Belt-and-suspenders: keep the response integer-typed even if the
                # subquery ever yields NULL, so the UI never renders a bare "🔥".
                "streak": r["streak"] or 0,
                "is_me": (r["id"] == caller),
            })
        return {"leaderboard": leaderboard, "count": len(leaderboard), "group": group or ""}
    finally:
        conn.close()
