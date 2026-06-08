"""
admin.py — Platform SUPER-ADMIN API.  Prefix: /api/admin

Distinct from org admins: these endpoints span the whole platform (all users,
all orgs) and are gated to an allowlist of super-admin identities. The acting
user is taken from the VERIFIED JWT (never a client-supplied user_id), so a
forged user_id cannot escalate.
"""

import json
import os
import sqlite3
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import get_current_user_id, optional_user_id

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

SUPER_ADMINS = {
    e.strip().lower()
    for e in os.getenv("SUPER_ADMIN_EMAILS", "muthu@pymasters.net,muthu.g.subramanian@gmail.com").split(",")
    if e.strip()
}

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def is_break_glass(username: str, email: str) -> bool:
    idents = {(username or "").lower(), (email or "").lower()}
    return bool(idents & SUPER_ADMINS)


def require_super_admin(user_id: str):
    conn = _conn()
    row = conn.execute(
        "SELECT username, email, COALESCE(is_super_admin,0) AS is_super_admin FROM users WHERE id = ?", [user_id]
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=403, detail="Super admin access required")
    if is_break_glass(row["username"], row["email"]) or int(row["is_super_admin"]) == 1:
        return True
    raise HTTPException(status_code=403, detail="Super admin access required")


def _actor_name(conn, user_id: str) -> str:
    r = conn.execute("SELECT COALESCE(NULLIF(name,''), username) FROM users WHERE id = ?", [user_id]).fetchone()
    return r[0] if r else user_id


def _audit(conn, actor_id, action, target_type=None, target_id=None, detail=None):
    conn.execute(
        "INSERT INTO admin_audit (id, actor_id, actor_name, action, target_type, target_id, detail) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [str(uuid.uuid4()), actor_id, _actor_name(conn, actor_id), action, target_type, target_id,
         json.dumps(detail or {})],
    )


class BlockRequest(BaseModel):
    blocked: bool


class PlanRequest(BaseModel):
    plan: str  # e.g. free | pro | enterprise


@router.get("/check")
def check(caller: str = Depends(optional_user_id)):
    """Lightweight gate so the frontend can decide whether to show the console."""
    if not caller:
        return {"is_super_admin": False}
    try:
        require_super_admin(caller)
        return {"is_super_admin": True}
    except HTTPException:
        return {"is_super_admin": False}


@router.get("/overview")
def overview(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()

    def one(q, p=()):
        r = conn.execute(q, p).fetchone()
        return r[0] if r and r[0] is not None else 0

    orgs_by_type = {r["t"]: r["c"] for r in conn.execute(
        "SELECT COALESCE(NULLIF(type,''),'other') t, COUNT(*) c FROM organizations GROUP BY t"
    ).fetchall()}

    data = {
        "total_users": one("SELECT COUNT(*) FROM users"),
        "individuals": one("SELECT COUNT(*) FROM users WHERE account_type='individual' OR account_type IS NULL OR account_type=''"),
        "org_users": one("SELECT COUNT(*) FROM users WHERE account_type='organization'"),
        "blocked_users": one("SELECT COUNT(*) FROM users WHERE is_blocked=1"),
        "total_orgs": one("SELECT COUNT(*) FROM organizations"),
        "orgs_by_type": orgs_by_type,
        "schools": orgs_by_type.get("school", 0),
        "universities": orgs_by_type.get("university", 0),
        "enterprises": orgs_by_type.get("enterprise", 0),
        "active_7d": one("SELECT COUNT(DISTINCT user_id) FROM learning_signals WHERE created_at > datetime('now','-7 days')"),
        "active_30d": one("SELECT COUNT(DISTINCT user_id) FROM learning_signals WHERE created_at > datetime('now','-30 days')"),
        "new_users_7d": one("SELECT COUNT(*) FROM users WHERE created_at > datetime('now','-7 days')"),
        "new_users_30d": one("SELECT COUNT(*) FROM users WHERE created_at > datetime('now','-30 days')"),
        "lessons_completed": one("SELECT COUNT(*) FROM lesson_completions"),
        "generated_lessons": one("SELECT COUNT(*) FROM generated_lessons"),
        "generation_jobs": one("SELECT COUNT(*) FROM module_generation_jobs"),
        "training_pairs": one("SELECT COUNT(*) FROM training_data"),
    }
    conn.close()
    return data


@router.get("/users")
def list_users(caller: str = Depends(get_current_user_id), q: str = "", limit: int = 50, offset: int = 0):
    require_super_admin(caller)
    conn = _conn()
    where, params = "", []
    if q:
        where = "WHERE (u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ?)"
        like = f"%{q}%"
        params = [like, like, like]
    rows = conn.execute(f"""
        SELECT u.id, u.username, u.name, u.email,
               COALESCE(NULLIF(u.account_type,''),'individual') account_type,
               u.points, u.created_at, COALESCE(u.onboarding_completed,0) onboarding_completed,
               COALESCE(u.is_blocked,0) is_blocked, COALESCE(NULLIF(u.plan,''),'free') plan,
               (SELECT o.name FROM org_members om JOIN organizations o ON o.id=om.org_id WHERE om.user_id=u.id LIMIT 1) org_name,
               (SELECT MAX(created_at) FROM learning_signals ls WHERE ls.user_id=u.id) last_active
        FROM users u {where}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    """, params + [min(limit, 200), offset]).fetchall()
    total = conn.execute(f"SELECT COUNT(*) FROM users u {where}", params).fetchone()[0]
    conn.close()
    return {"users": [dict(r) for r in rows], "total": total}


@router.get("/users/{target_id}")
def user_detail(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    u = conn.execute("""
        SELECT id, username, name, email,
               COALESCE(NULLIF(account_type,''),'individual') account_type,
               COALESCE(points,0) points, created_at,
               COALESCE(onboarding_completed,0) onboarding_completed,
               COALESCE(is_blocked,0) is_blocked, COALESCE(NULLIF(plan,''),'free') plan,
               COALESCE(is_super_admin,0) is_super_admin, COALESCE(token_version,0) token_version
        FROM users WHERE id = ?
    """, [target_id]).fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    lessons = conn.execute("SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?", [target_id]).fetchone()[0]
    last_active = conn.execute("SELECT MAX(created_at) FROM learning_signals WHERE user_id = ?", [target_id]).fetchone()[0]
    weak = [dict(r) for r in conn.execute(
        "SELECT topic, mastery_level, struggle_count FROM user_mastery WHERE user_id = ? "
        "ORDER BY mastery_level ASC, struggle_count DESC LIMIT 5", [target_id]).fetchall()]
    activity = [dict(r) for r in conn.execute(
        "SELECT signal_type, topic, created_at FROM learning_signals WHERE user_id = ? "
        "ORDER BY created_at DESC LIMIT 10", [target_id]).fetchall()]
    orgs = [dict(r) for r in conn.execute(
        "SELECT o.id org_id, o.name org_name, om.role FROM org_members om "
        "JOIN organizations o ON o.id = om.org_id WHERE om.user_id = ?", [target_id]).fetchall()]
    audit = [dict(r) for r in conn.execute(
        "SELECT action, actor_name, detail, created_at FROM admin_audit "
        "WHERE target_type='user' AND target_id = ? ORDER BY created_at DESC LIMIT 10", [target_id]).fetchall()]
    conn.close()
    d = dict(u)
    d["break_glass"] = is_break_glass(d["username"], d["email"])
    d["has_email"] = bool((d["email"] or "").strip())
    d["lessons_completed"] = lessons
    d["last_active"] = last_active
    d["weak_topics"] = weak
    d["activity"] = activity
    d["orgs"] = orgs
    d["recent_audit"] = audit
    return d


@router.get("/users/{target_id}/view-as")
def user_view_as(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    u = conn.execute("SELECT id, username, name, COALESCE(points,0) points FROM users WHERE id = ?",
                     [target_id]).fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    lessons = [dict(r) for r in conn.execute(
        "SELECT lesson_id, xp_awarded, completed_at FROM lesson_completions WHERE user_id = ? "
        "ORDER BY completed_at DESC LIMIT 20", [target_id]).fetchall()]
    mastery = [dict(r) for r in conn.execute(
        "SELECT topic, mastery_level, attempts, struggle_count FROM user_mastery WHERE user_id = ? "
        "ORDER BY mastery_level DESC LIMIT 30", [target_id]).fetchall()]
    signals_7d = conn.execute(
        "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND created_at > datetime('now','-7 days')",
        [target_id]).fetchone()[0]
    _audit(conn, caller, "user.view_as", "user", target_id, {})
    conn.commit()
    conn.close()
    return {"profile": dict(u), "summary": {"xp": u["points"], "lessons_completed": len(lessons),
            "signals_7d": signals_7d}, "lessons": lessons, "mastery": mastery}


@router.get("/orgs")
def list_orgs(caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    rows = conn.execute("""
        SELECT o.id, o.name, COALESCE(NULLIF(o.type,''),'other') type,
               COALESCE(NULLIF(o.plan,''),'free') plan, o.created_at,
               (SELECT COUNT(*) FROM org_members om WHERE om.org_id=o.id) member_count
        FROM organizations o ORDER BY o.created_at DESC
    """).fetchall()
    conn.close()
    return {"orgs": [dict(r) for r in rows]}


@router.post("/users/{target_id}/block")
def block_user(target_id: str, req: BlockRequest, caller: str = Depends(get_current_user_id)):
    """Block (suspend) or unblock (grant) a user's access."""
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE users SET is_blocked = ? WHERE id = ?", [1 if req.blocked else 0, target_id])
    _audit(conn, caller, "user.block", "user", target_id, {"blocked": bool(req.blocked)})
    conn.commit()
    conn.close()
    return {"ok": True, "blocked": req.blocked}


@router.post("/users/{target_id}/plan")
def set_user_plan(target_id: str, req: PlanRequest, caller: str = Depends(get_current_user_id)):
    """Set a user's subscription/access tier."""
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE users SET plan = ? WHERE id = ?", [req.plan, target_id])
    _audit(conn, caller, "user.plan", "user", target_id, {"plan": req.plan})
    conn.commit()
    conn.close()
    return {"ok": True, "plan": req.plan}


@router.get("/usage")
def usage(caller: str = Depends(get_current_user_id), days: int = 30):
    """Daily signups + active learners for the usage graph."""
    require_super_admin(caller)
    days = max(1, min(days, 120))
    conn = _conn()
    signups = {r["d"]: r["c"] for r in conn.execute(
        "SELECT date(created_at) d, COUNT(*) c FROM users WHERE created_at > datetime('now', ?) GROUP BY d",
        [f"-{days} days"]).fetchall()}
    active = {r["d"]: r["c"] for r in conn.execute(
        "SELECT date(created_at) d, COUNT(DISTINCT user_id) c FROM learning_signals WHERE created_at > datetime('now', ?) GROUP BY d",
        [f"-{days} days"]).fetchall()}
    conn.close()
    today = date.today()
    series = [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "signups": signups.get((today - timedelta(days=i)).isoformat(), 0),
            "active": active.get((today - timedelta(days=i)).isoformat(), 0),
        }
        for i in range(days - 1, -1, -1)
    ]
    return {"series": series, "days": days}
