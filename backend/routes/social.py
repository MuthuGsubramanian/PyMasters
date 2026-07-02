"""
social.py -- Community layer for individual learners.

Two capabilities the platform was missing:
  1. A *global* ranking (leaderboard) by XP and by streak — the existing
     /challenges/leaderboard only ranked challenge completions.
  2. A member directory + follow/connect graph so learners can find and
     connect with other PyMasters members.

Prefix: /api  (routes namespaced below to avoid collisions)
"""

import os
import json
import sqlite3
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from auth import get_current_user_id, optional_user_id
from streaks import effective_current_streak

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api", tags=["community"])


# ── Helpers ───────────────────────────────────────────────────────────────

_TIERS = (
    (5000, "Master"),
    (2000, "Expert"),
    (1000, "Advanced"),
    (500, "Intermediate"),
    (100, "Apprentice"),
    (0, "Novice"),
)


def tier_for(xp: int) -> str:
    xp = xp or 0
    for threshold, name in _TIERS:
        if xp >= threshold:
            return name
    return "Novice"


def _public_display_name(name, username) -> str:
    """Public-safe display name. Some users' `name` column holds the email they
    signed up with; rendering it verbatim leaked full email addresses onto the
    public leaderboard, member directory and profile cards. Prefer any value
    that is NOT an email; if only email-like values exist, expose just the
    local-part (never the full @domain address), then fall back to a generic
    label. Never returns a string containing '@'."""
    name = (name or "").strip()
    username = (username or "").strip()
    # Prefer a value that is not an email address.
    if name and "@" not in name:
        return name
    if username and "@" not in username:
        return username
    # Only email-like (or empty) values remain — strip the domain so the full
    # contactable address is never published.
    for v in (name, username):
        if v and "@" in v:
            local = v.split("@", 1)[0].strip()
            if local:
                return local
    return "Learner"


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_social_tables(db_path: str = None):
    """Create the connections table if it doesn't exist. Idempotent; safe to
    call from init_db and lazily from endpoints (tests spin up fresh DBs)."""
    conn = sqlite3.connect(db_path or DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_connections (
                follower_id  TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conn_following ON user_connections(following_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conn_follower ON user_connections(follower_id)"
        )
        conn.commit()
    finally:
        conn.close()


def _conn_count(conn, user_id, direction) -> int:
    """Count a member's connections applying the SAME visibility filter the
    connection *lists* use (JOIN users + exclude blocked accounts), so a card's
    follower/following COUNT can never disagree with the people the list would
    actually show. Previously the counts were bare `COUNT(*)` over
    user_connections and silently included blocked/moderated accounts, so a card
    could read e.g. "3 followers" while list_connections returned only 2.

      direction="followers" -> members who follow user_id (exclude blocked followers)
      direction="following" -> members user_id follows   (exclude blocked followees)
    """
    if direction == "followers":
        sql = ("SELECT COUNT(*) FROM user_connections c JOIN users u ON u.id = c.follower_id "
               "WHERE c.following_id=? AND COALESCE(u.is_blocked,0)=0")
    else:
        sql = ("SELECT COUNT(*) FROM user_connections c JOIN users u ON u.id = c.following_id "
               "WHERE c.follower_id=? AND COALESCE(u.is_blocked,0)=0")
    return conn.execute(sql, [user_id]).fetchone()[0]


def _public_card(row, follower_count=0, following_count=0, is_following=False,
                 follows_you=False):
    xp = row["points"] or 0
    return {
        "user_id": row["id"],
        "name": _public_display_name(row["name"], row["username"]),
        "username": row["username"],
        "xp": xp,
        "tier": tier_for(xp),
        "avatar_url": (row["avatar_url"] if "avatar_url" in row.keys() else "") or "",
        "followers": follower_count,
        "following": following_count,
        "is_following": is_following,
        # ADDITIVE (2026-07-01): does THIS member follow the caller? Lets the UI
        # surface a "Follows you" hint (esp. useful when the caller doesn't follow
        # back yet). Defaults False for anonymous callers or when unknown, so
        # existing consumers that ignore the field see identical behavior.
        "follows_you": follows_you,
    }


def _community_scope_sql(conn, caller, col="u.id", requested_org_id=None):
    """SQL fragment + params restricting a learners query to the caller's community.

    Scope follows the caller's *active* context (``requested_org_id``):
      • If ``requested_org_id`` is supplied AND the caller is a member of that org,
        results are restricted to that org's members (org board).
      • Otherwise (no active org, or the caller is not a member of the one supplied),
        results are restricted to individual learners — those in no org at all.
    Membership is verified server-side, so a caller cannot view an arbitrary org's
    board by guessing its id. Returns (sql, params) to append to a WHERE clause; if
    the org tables are absent it returns ("", []) (unscoped/global fallback).
    """
    try:
        has_org = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='org_members'"
        ).fetchone()
    except Exception:
        has_org = None
    if not has_org:
        return ("", [])

    org_id = None
    if caller and requested_org_id:
        member = conn.execute(
            "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
            [requested_org_id, caller],
        ).fetchone()
        if member:
            org_id = requested_org_id

    if org_id:
        return (f" AND {col} IN (SELECT user_id FROM org_members WHERE org_id = ?)", [org_id])
    return (f" AND {col} NOT IN (SELECT user_id FROM org_members)", [])


# ── Global leaderboard ──────────────────────────────────────────────────────

@router.get("/leaderboard/global")
def global_leaderboard(
    scope: str = Query("xp", pattern="^(xp|streak)$"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    org_id: Optional[str] = Query(None),
    caller: Optional[str] = Depends(optional_user_id),
):
    """Platform-wide ranking. scope=xp ranks by total points; scope=streak ranks
    by current daily streak. Always returns the caller's own rank (if signed in),
    even when they fall outside the visible page."""
    ensure_social_tables()
    conn = _connect()
    try:
        sc_sql, sc_params = _community_scope_sql(conn, caller, "u.id", org_id)

        # Read-time streak-lapse correction (2026-07-02, adopts the shared rule from
        # streaks.effective_current_streak / touch_streak): a streak is only "live"
        # while last_active_date is today or yesterday; after a 2+ day gap it has
        # lapsed and must display/rank as 0. touch_streak only runs on the user's
        # NEXT activity, so the stored value silently over-reports lapsed streaks —
        # previously an inactive user could sit atop the streak board indefinitely.
        # Dates are computed in Python (server-local, the same clock touch_streak
        # writes with — NOT SQLite's UTC 'now') and bound as parameters; substr()
        # defensively tolerates any time suffix on last_active_date.
        _today = date.today().isoformat()
        _yday = (date.today() - timedelta(days=1)).isoformat()
        _eff_streak = ("CASE WHEN substr(s.last_active_date,1,10) IN (?, ?) "
                       "THEN COALESCE(s.current_streak,0) ELSE 0 END")

        if scope == "streak":
            base = f"""
                SELECT u.id, u.username, u.name, u.avatar_url,
                       COALESCE(u.points,0) AS points,
                       {_eff_streak} AS metric
                FROM users u
                LEFT JOIN user_streaks s ON s.user_id = u.id
                WHERE COALESCE(u.is_blocked,0) = 0{sc_sql}
                ORDER BY metric DESC, points DESC, u.created_at ASC
            """
            pre_params = [_today, _yday]
        else:
            base = f"""
                SELECT u.id, u.username, u.name, u.avatar_url,
                       COALESCE(u.points,0) AS points,
                       COALESCE(u.points,0) AS metric
                FROM users u
                WHERE COALESCE(u.is_blocked,0) = 0{sc_sql}
                ORDER BY metric DESC, u.created_at ASC
            """
            pre_params = []
        rows = conn.execute(
            base + " LIMIT ? OFFSET ?", pre_params + sc_params + [limit, offset]
        ).fetchall()

        leaders = []
        for i, r in enumerate(rows):
            xp = r["points"] or 0
            leaders.append({
                "rank": offset + i + 1,
                "user_id": r["id"],
                "name": _public_display_name(r["name"], r["username"]),
                "username": r["username"],
                "avatar_url": r["avatar_url"] or "",
                "xp": xp,
                "tier": tier_for(xp),
                "metric": r["metric"] or 0,
                "is_me": (r["id"] == caller),
            })

        tc_sql, tc_params = _community_scope_sql(conn, caller, "id", org_id)
        total = conn.execute(
            "SELECT COUNT(*) FROM users WHERE COALESCE(is_blocked,0)=0" + tc_sql, tc_params
        ).fetchone()[0]

        me = None
        if caller:
            # Compute the caller's rank as their POSITION in the same ordering the
            # visible list uses (ORDER BY metric DESC, [points DESC,] created_at ASC),
            # i.e. count everyone who sorts strictly before them + 1. Previously this
            # used competition ranking (COUNT(points > mine)+1), which disagreed with
            # the positional rank shown in the list rows whenever users were tied —
            # e.g. a whole org tied at the same XP showed every row's banner as "#1"
            # while the list placed them 2nd, 3rd, etc. (older created_at sorts first).
            if scope == "streak":
                myrow = conn.execute(
                    "SELECT COALESCE(s.current_streak,0), COALESCE(u.points,0), u.created_at, "
                    "s.last_active_date "
                    "FROM users u LEFT JOIN user_streaks s ON s.user_id=u.id WHERE u.id=?",
                    [caller],
                ).fetchone()
                # Same lapse correction as the visible list, so the caller's banner
                # metric/rank can never disagree with the rows on screen.
                my_metric = effective_current_streak(myrow[0], myrow[3], _today) if myrow else 0
                rsql, rparams = _community_scope_sql(conn, caller, "u.id", org_id)
                if myrow:
                    my_points, my_created = myrow[1], myrow[2]
                    rank = conn.execute(
                        "SELECT COUNT(*)+1 FROM users u LEFT JOIN user_streaks s ON s.user_id=u.id "
                        "WHERE COALESCE(u.is_blocked,0)=0 AND ("
                        f"{_eff_streak} > ? "
                        f"OR ({_eff_streak} = ? AND COALESCE(u.points,0) > ?) "
                        f"OR ({_eff_streak} = ? AND COALESCE(u.points,0) = ? AND u.created_at < ?)"
                        ")" + rsql,
                        [_today, _yday, my_metric,
                         _today, _yday, my_metric, my_points,
                         _today, _yday, my_metric, my_points, my_created] + rparams,
                    ).fetchone()[0]
            else:
                myrow = conn.execute(
                    "SELECT COALESCE(points,0), created_at FROM users WHERE id=?", [caller]
                ).fetchone()
                my_metric = myrow[0] if myrow else 0
                rsql, rparams = _community_scope_sql(conn, caller, "id", org_id)
                if myrow:
                    my_created = myrow[1]
                    rank = conn.execute(
                        "SELECT COUNT(*)+1 FROM users WHERE COALESCE(is_blocked,0)=0 AND ("
                        "COALESCE(points,0) > ? "
                        "OR (COALESCE(points,0) = ? AND created_at < ?)"
                        ")" + rsql,
                        [my_metric, my_metric, my_created] + rparams,
                    ).fetchone()[0]
            if myrow:
                me = {"rank": rank, "metric": my_metric, "tier": tier_for(my_metric if scope == "xp" else 0)}

        return {"scope": scope, "leaderboard": leaders, "total_participants": total, "me": me}
    finally:
        conn.close()


# ── Member directory ────────────────────────────────────────────────────────

@router.get("/members")
def list_members(
    q: str = Query("", max_length=80),
    limit: int = Query(24, ge=1, le=60),
    offset: int = Query(0, ge=0),
    org_id: Optional[str] = Query(None),
    caller: Optional[str] = Depends(optional_user_id),
):
    """Searchable directory of learners. Returns public cards with follow state."""
    ensure_social_tables()
    conn = _connect()
    try:
        sc_sql, sc_params = _community_scope_sql(conn, caller, "u.id", org_id)
        params = list(sc_params)
        where = "WHERE COALESCE(u.is_blocked,0) = 0" + sc_sql
        if q.strip():
            # Escape LIKE metacharacters so the search term matches LITERALLY.
            # Usernames very commonly contain '_' (e.g. "data_science"), which
            # SQLite's LIKE treats as a single-char wildcard — so a search for
            # "data_science" previously ALSO matched "dataXscience" (and any term
            # containing '%' matched arbitrary spans). Escape '\', '%', '_' and
            # declare ESCAPE '\'. Search terms with no special characters produce
            # byte-identical SQL and results to before (fully backward-compatible).
            where += (" AND (LOWER(u.name) LIKE ? ESCAPE '\\' "
                      "OR LOWER(u.username) LIKE ? ESCAPE '\\')")
            term = (q.strip().lower()
                    .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"))
            like = f"%{term}%"
            params += [like, like]
        rows = conn.execute(
            f"""SELECT u.id, u.username, u.name, u.avatar_url, COALESCE(u.points,0) AS points
                FROM users u {where}
                ORDER BY u.points DESC, u.created_at ASC
                LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()

        following = set()
        followers_of_me = set()
        if caller:
            following = {
                r[0] for r in conn.execute(
                    "SELECT following_id FROM user_connections WHERE follower_id=?", [caller]
                ).fetchall()
            }
            # Who follows the caller (for the additive "Follows you" hint). One query;
            # membership test below is O(1). Empty for anonymous callers.
            followers_of_me = {
                r[0] for r in conn.execute(
                    "SELECT follower_id FROM user_connections WHERE following_id=?", [caller]
                ).fetchall()
            }

        members = []
        for r in rows:
            fc = _conn_count(conn, r["id"], "followers")
            members.append(_public_card(
                r, follower_count=fc,
                is_following=(r["id"] in following),
                follows_you=(r["id"] in followers_of_me),
            ))
        return {"members": members, "count": len(members), "query": q}
    finally:
        conn.close()


@router.get("/members/{user_id}")
def member_profile(user_id: str, caller: Optional[str] = Depends(optional_user_id)):
    """Public profile card for a single member, plus connection counts."""
    ensure_social_tables()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, username, name, avatar_url, COALESCE(points,0) AS points, "
            "COALESCE(is_blocked,0) AS is_blocked FROM users WHERE id=?",
            [user_id],
        ).fetchone()
        if not row or row["is_blocked"]:
            raise HTTPException(status_code=404, detail="Member not found")
        followers = _conn_count(conn, user_id, "followers")
        following = _conn_count(conn, user_id, "following")
        streak = conn.execute(
            "SELECT COALESCE(current_streak,0), last_active_date "
            "FROM user_streaks WHERE user_id=?", [user_id]
        ).fetchone()
        is_following = False
        follows_you = False
        if caller and caller != user_id:
            is_following = conn.execute(
                "SELECT 1 FROM user_connections WHERE follower_id=? AND following_id=?",
                [caller, user_id],
            ).fetchone() is not None
            follows_you = conn.execute(
                "SELECT 1 FROM user_connections WHERE follower_id=? AND following_id=?",
                [user_id, caller],
            ).fetchone() is not None
        card = _public_card(row, follower_count=followers, following_count=following,
                            is_following=is_following, follows_you=follows_you)
        # Read-time lapse correction (2026-07-02): mirror the Dashboard/profile fix —
        # a lapsed streak (last activity 2+ days ago) shows as 0, not its stale value.
        card["streak"] = effective_current_streak(streak[0], streak[1]) if streak else 0
        card["is_me"] = (caller == user_id)
        return card
    finally:
        conn.close()


# ── Connections (follow / unfollow) ─────────────────────────────────────────

@router.post("/connections/{target_id}")
def follow(target_id: str, caller: str = Depends(get_current_user_id)):
    """Follow (connect with) another member."""
    if target_id == caller:
        raise HTTPException(status_code=400, detail="You can't connect with yourself.")
    ensure_social_tables()
    conn = _connect()
    try:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE id=? AND COALESCE(is_blocked,0)=0", [target_id]
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Member not found")
        conn.execute(
            "INSERT OR IGNORE INTO user_connections (follower_id, following_id) VALUES (?, ?)",
            [caller, target_id],
        )
        conn.commit()
        followers = _conn_count(conn, target_id, "followers")
        return {"status": "connected", "following": True, "target_followers": followers}
    finally:
        conn.close()


@router.delete("/connections/{target_id}")
def unfollow(target_id: str, caller: str = Depends(get_current_user_id)):
    """Remove a connection."""
    ensure_social_tables()
    conn = _connect()
    try:
        conn.execute(
            "DELETE FROM user_connections WHERE follower_id=? AND following_id=?",
            [caller, target_id],
        )
        conn.commit()
        followers = _conn_count(conn, target_id, "followers")
        return {"status": "disconnected", "following": False, "target_followers": followers}
    finally:
        conn.close()


@router.get("/auth/me")
def get_me(caller: str = Depends(get_current_user_id)):
    """Token-based 'who am I'. Returns the same session shape as /api/auth/login
    so OAuth (and any token-only client) can hydrate the user session."""
    conn = _connect()
    try:
        u = conn.execute(
            "SELECT id, name, username, COALESCE(points,0) AS points, unlocked_modules, "
            "COALESCE(onboarding_completed,0) AS oc, COALESCE(account_type,'individual') AS at, "
            "COALESCE(email,'') AS email "
            "FROM users WHERE id=?",
            [caller],
        ).fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        org = conn.execute(
            "SELECT o.id, o.name, o.type, om.role, om.department "
            "FROM org_members om JOIN organizations o ON o.id = om.org_id "
            "WHERE om.user_id=? LIMIT 1",
            [caller],
        ).fetchone()
        org_info = None
        if org:
            org_info = {
                "id": org["id"], "org_id": org["id"],
                "name": org["name"], "org_name": org["name"],
                "type": org["type"], "org_type": org["type"],
                "role": org["role"], "department": org["department"] or "",
            }
        try:
            unlocked = json.loads(u["unlocked_modules"]) if u["unlocked_modules"] else ["module_1"]
        except Exception:
            unlocked = ["module_1"]
        return {
            "id": u["id"], "name": u["name"], "username": u["username"],
            # Additive: mirror the /api/auth/login session shape (email was
            # missing from both, leaving pm_user.email empty after login —
            # broke the Razorpay checkout prefill on /dashboard/upgrade).
            "email": u["email"],
            "points": u["points"], "unlocked": unlocked,
            "onboarding_completed": bool(u["oc"]), "account_type": u["at"],
            "org": org_info,
        }
    finally:
        conn.close()


@router.get("/connections/{user_id}")
def list_connections(
    user_id: str,
    kind: str = Query("following", pattern="^(following|followers)$"),
    caller: Optional[str] = Depends(optional_user_id),
):
    """List a member's connections. kind=following -> who they follow;
    kind=followers -> who follows them."""
    ensure_social_tables()
    conn = _connect()
    try:
        if kind == "followers":
            join = ("SELECT u.id, u.username, u.name, u.avatar_url, COALESCE(u.points,0) AS points "
                    "FROM user_connections c JOIN users u ON u.id = c.follower_id "
                    "WHERE c.following_id=? AND COALESCE(u.is_blocked,0)=0 ORDER BY u.points DESC")
        else:
            join = ("SELECT u.id, u.username, u.name, u.avatar_url, COALESCE(u.points,0) AS points "
                    "FROM user_connections c JOIN users u ON u.id = c.following_id "
                    "WHERE c.follower_id=? AND COALESCE(u.is_blocked,0)=0 ORDER BY u.points DESC")
        rows = conn.execute(join, [user_id]).fetchall()
        my_following = set()
        if caller:
            my_following = {
                r[0] for r in conn.execute(
                    "SELECT following_id FROM user_connections WHERE follower_id=?", [caller]
                ).fetchall()
            }
        people = [_public_card(r, is_following=(r["id"] in my_following)) for r in rows]
        return {"kind": kind, "people": people, "count": len(people)}
    finally:
        conn.close()
