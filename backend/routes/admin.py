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
    # claude-qa@pymasters.net is the functional/service account MSG requested
    # (2026-07-02) so the autonomous QA/ops loops can exercise admin surfaces.
    for e in os.getenv(
        "SUPER_ADMIN_EMAILS",
        "muthu@pymasters.net,muthu.g.subramanian@gmail.com,claude-qa@pymasters.net",
    ).split(",")
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


def _validate_expiry(expires_at):
    """Accept None or an ISO 8601 date/datetime string; reject past dates."""
    if expires_at is None:
        return
    from datetime import datetime, timezone
    try:
        parsed = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="expires_at must be an ISO 8601 date, e.g. 2026-12-31")
    now = datetime.now(timezone.utc) if parsed.tzinfo else datetime.now()
    if parsed < now:
        raise HTTPException(status_code=422, detail="expires_at is in the past")


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
    # Optional validity period (ISO 8601 date or datetime). None = no expiry.
    # Lets the super admin manually grant a package "for the given period"
    # until self-serve billing exists.
    expires_at: Optional[str] = None


class EditUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    account_type: Optional[str] = None

class SuperAdminRequest(BaseModel):
    value: bool

class UserRoleRequest(BaseModel):
    org_id: str
    role: str


class OrgPlanRequest(BaseModel):
    plan: str
    expires_at: Optional[str] = None  # ISO 8601; None = no expiry

class OrgTypeRequest(BaseModel):
    type: str


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

    # Telemetry (tables created by routes.telemetry.ensure_telemetry_tables;
    # guarded so a missing migration can never break the whole overview).
    try:
        data["online_now"] = one(
            "SELECT COUNT(*) FROM users WHERE last_seen_at > datetime('now','-5 minutes')"
        )
        data["visits_today"] = one(
            "SELECT COUNT(*) FROM site_visits WHERE created_at > date('now')"
        )
        data["visits_total"] = one("SELECT COUNT(*) FROM site_visits")
        data["unique_visitors_today"] = one(
            "SELECT COUNT(DISTINCT COALESCE(user_id,'anon')) FROM site_visits WHERE created_at > date('now')"
        )
        data["ops_activity_today"] = one(
            "SELECT COUNT(*) FROM ops_activity WHERE created_at > date('now')"
        )
    except Exception as exc:
        print(f"[admin.overview] telemetry unavailable: {exc!r}")

    conn.close()
    return data


class OpsActivityRequest(BaseModel):
    source: str            # linkedin | youtube | daily-analysis | pilot-loop | ...
    title: str
    url: Optional[str] = None
    status: str = "done"   # done | failed | skipped
    detail: Optional[str] = None


@router.get("/ops-activity")
def ops_activity(caller: str = Depends(get_current_user_id), days: int = 7, limit: int = 100):
    """Ops feed for the Overview tab: what the automation did (LinkedIn post,
    YouTube upload, daily analysis, QA sweep...) and when."""
    require_super_admin(caller)
    days = max(1, min(days, 90))
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT id, source, title, url, status, detail, created_at FROM ops_activity "
            "WHERE created_at > datetime('now', ?) ORDER BY created_at DESC LIMIT ?",
            [f"-{days} days", max(1, min(limit, 500))],
        ).fetchall()
        return {"activity": [dict(r) for r in rows]}
    except Exception as exc:
        print(f"[admin.ops_activity] {exc!r}")
        return {"activity": []}
    finally:
        conn.close()


@router.post("/ops-activity")
def report_ops_activity(req: OpsActivityRequest, caller: str = Depends(get_current_user_id)):
    """Reported by the automation loops (signed in as the claude-qa service
    account) right after they publish/post/run something."""
    require_super_admin(caller)
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO ops_activity (id, source, title, url, status, detail) VALUES (?, ?, ?, ?, ?, ?)",
            [str(uuid.uuid4()), req.source[:50], req.title[:300], req.url, req.status[:20], (req.detail or "")[:1000]],
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/logins")
def recent_logins(caller: str = Depends(get_current_user_id), limit: int = 100):
    """Recent login events with coarse location (country/region/city)."""
    require_super_admin(caller)
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT le.user_id, u.username, u.email, le.ip, le.country, le.region, le.city, le.created_at "
            "FROM login_events le LEFT JOIN users u ON u.id = le.user_id "
            "ORDER BY le.created_at DESC LIMIT ?",
            [max(1, min(limit, 500))],
        ).fetchall()
        return {"logins": [dict(r) for r in rows]}
    except Exception as exc:
        print(f"[admin.logins] {exc!r}")
        return {"logins": []}
    finally:
        conn.close()


@router.get("/users")
def list_users(caller: str = Depends(get_current_user_id), q: str = "", limit: int = 50, offset: int = 0):
    require_super_admin(caller)
    conn = _conn()
    where, params = "", []
    if q:
        where = "WHERE (u.username LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"
        # Escape LIKE metacharacters so '_' and '%' in the query are matched literally
        # (usernames/emails commonly contain '_'); otherwise they act as wildcards.
        safe = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{safe}%"
        params = [like, like, like]
    rows = conn.execute(f"""
        SELECT u.id, u.username, u.name, u.email,
               COALESCE(NULLIF(u.account_type,''),'individual') account_type,
               u.points, u.created_at, COALESCE(u.onboarding_completed,0) onboarding_completed,
               COALESCE(u.is_blocked,0) is_blocked, COALESCE(NULLIF(u.plan,''),'free') plan,
               COALESCE(u.is_super_admin,0) is_super_admin,
               (SELECT o.name FROM org_members om JOIN organizations o ON o.id=om.org_id WHERE om.user_id=u.id LIMIT 1) org_name,
               (SELECT MAX(created_at) FROM learning_signals ls WHERE ls.user_id=u.id) last_active,
               u.last_seen_at,
               (SELECT COALESCE(NULLIF(le.city || ', ' || le.country, ', '), le.ip)
                FROM login_events le WHERE le.user_id=u.id AND (le.country IS NOT NULL OR le.ip IS NOT NULL)
                ORDER BY le.created_at DESC LIMIT 1) last_login_from
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


@router.patch("/users/{target_id}")
def edit_user(target_id: str, req: EditUserRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    sets, vals, detail = [], [], {}
    for f in ["name", "email", "account_type"]:
        v = getattr(req, f, None)
        if v is not None:
            sets.append(f"{f} = ?"); vals.append(v.strip()); detail[f] = v.strip()
    if sets:
        vals.append(target_id)
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", vals)
        _audit(conn, caller, "user.edit", "user", target_id, detail)
        conn.commit()
    conn.close()
    return {"ok": True, "updated": detail}


@router.delete("/users/{target_id}")
def delete_user(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    if target_id == caller:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if is_break_glass(row["username"], row["email"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete a break-glass (env) super admin")
    for tbl in ["org_members", "lesson_completions", "learning_signals", "user_mastery",
                "generated_lessons", "module_generation_jobs", "notifications"]:
        try:
            conn.execute(f"DELETE FROM {tbl} WHERE user_id = ?", [target_id])
        except Exception:
            pass
    try:
        conn.execute("DELETE FROM playground_conversations WHERE user_id = ?", [target_id])
    except Exception:
        pass
    conn.execute("DELETE FROM users WHERE id = ?", [target_id])
    _audit(conn, caller, "user.delete", "user", target_id, {"username": row["username"]})
    conn.commit()
    conn.close()
    return {"ok": True, "deleted": target_id}


@router.post("/users/{target_id}/super-admin")
def set_super_admin(target_id: str, req: SuperAdminRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if is_break_glass(row["username"], row["email"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Break-glass (env) admins are managed via env, not the console")
    if target_id == caller and not req.value:
        conn.close()
        raise HTTPException(status_code=400, detail="You cannot remove your own super-admin access")
    conn.execute("UPDATE users SET is_super_admin = ? WHERE id = ?", [1 if req.value else 0, target_id])
    _audit(conn, caller, "user.super_admin", "user", target_id, {"value": bool(req.value)})
    conn.commit()
    conn.close()
    return {"ok": True, "is_super_admin": bool(req.value)}


@router.post("/users/{target_id}/role")
def set_user_org_role(target_id: str, req: UserRoleRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    if req.role not in ("super_admin", "admin", "manager", "member"):
        raise HTTPException(status_code=400, detail="Invalid role")
    conn = _conn()
    member = conn.execute("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
                          [req.org_id, target_id]).fetchone()
    if not member:
        conn.close()
        raise HTTPException(status_code=404, detail="User is not a member of that org")
    conn.execute("UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?",
                 [req.role, req.org_id, target_id])
    _audit(conn, caller, "user.role", "user", target_id, {"org_id": req.org_id, "role": req.role})
    conn.commit()
    conn.close()
    return {"ok": True, "role": req.role}


@router.post("/users/{target_id}/reset-password")
def admin_reset_password(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close(); raise HTTPException(status_code=404, detail="User not found")
    identifier = (row["email"] or "").strip() or (row["username"] or "").strip()
    if "@" not in identifier:
        conn.close(); raise HTTPException(status_code=400, detail="User has no email on file; add one via Edit first")
    _audit(conn, caller, "user.reset", "user", target_id, {"identifier": identifier})
    conn.commit(); conn.close()
    try:
        from main import forgot_password, ForgotPasswordRequest
        forgot_password(ForgotPasswordRequest(identifier=identifier))
    except Exception as e:
        print(f"[admin reset] send failed: {e}")
    return {"ok": True}


@router.post("/users/{target_id}/revoke-sessions")
def revoke_sessions(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id = ?", [target_id])
    _audit(conn, caller, "user.revoke", "user", target_id, {})
    conn.commit()
    conn.close()
    return {"ok": True}


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


@router.get("/orgs/{org_id}")
def org_detail(org_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    o = conn.execute("""SELECT id, name, COALESCE(NULLIF(type,''),'other') type,
                        COALESCE(NULLIF(plan,''),'free') plan, created_at FROM organizations WHERE id = ?""",
                     [org_id]).fetchone()
    if not o:
        conn.close(); raise HTTPException(status_code=404, detail="Org not found")
    members = [dict(r) for r in conn.execute(
        "SELECT u.id, COALESCE(NULLIF(u.name,''), u.username) name, om.role "
        "FROM org_members om JOIN users u ON u.id = om.user_id WHERE om.org_id = ? ORDER BY om.role",
        [org_id]).fetchall()]
    conn.close()
    d = dict(o); d["members"] = members; d["member_count"] = len(members)
    return d


@router.post("/orgs/{org_id}/plan")
def set_org_plan(org_id: str, req: OrgPlanRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    _validate_expiry(req.expires_at)
    conn = _conn()
    conn.execute(
        "UPDATE organizations SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? WHERE id = ?",
        [req.plan, req.expires_at, org_id])
    _audit(conn, caller, "org.plan", "org", org_id, {"plan": req.plan, "expires_at": req.expires_at})
    conn.commit(); conn.close()
    return {"ok": True, "plan": req.plan, "expires_at": req.expires_at}


@router.post("/orgs/{org_id}/type")
def set_org_type(org_id: str, req: OrgTypeRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE organizations SET type = ? WHERE id = ?", [req.type, org_id])
    _audit(conn, caller, "org.type", "org", org_id, {"type": req.type})
    conn.commit(); conn.close()
    return {"ok": True, "type": req.type}


@router.delete("/orgs/{org_id}")
def delete_org_admin(org_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    for tbl in ["org_members", "org_invites", "org_member_groups", "org_profiles"]:
        try:
            conn.execute(f"DELETE FROM {tbl} WHERE org_id = ?", [org_id])
        except Exception:
            pass
    conn.execute("DELETE FROM organizations WHERE id = ?", [org_id])
    _audit(conn, caller, "org.delete", "org", org_id, {})
    conn.commit(); conn.close()
    return {"ok": True, "deleted": org_id}


@router.get("/audit")
def list_audit(caller: str = Depends(get_current_user_id), limit: int = 50, offset: int = 0,
               target_type: str = None, target_id: str = None):
    require_super_admin(caller)
    conn = _conn()
    where, params = [], []
    if target_type:
        where.append("target_type = ?"); params.append(target_type)
    if target_id:
        where.append("target_id = ?"); params.append(target_id)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT id, actor_id, actor_name, action, target_type, target_id, detail, created_at "
        f"FROM admin_audit {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [min(limit, 200), offset]).fetchall()
    total = conn.execute(f"SELECT COUNT(*) FROM admin_audit {clause}", params).fetchone()[0]
    conn.close()
    return {"audit": [dict(r) for r in rows], "total": total}


@router.post("/users/{target_id}/block")
def block_user(target_id: str, req: BlockRequest, caller: str = Depends(get_current_user_id)):
    """Block (suspend) or unblock (grant) a user's access."""
    require_super_admin(caller)
    conn = _conn()
    if req.blocked:
        # Suspending must ALSO revoke any LIVE session, not just future logins.
        # login() gates blocked users with a 403, but an already-issued 30-day JWT
        # keeps passing get_current_user_id (auth._extract only checks token_version
        # and account existence — never is_blocked). So without bumping token_version
        # a just-suspended user retained full access to every protected endpoint until
        # their token expired. Incrementing token_version invalidates all outstanding
        # tokens for this user immediately — the same mechanism the revoke-sessions
        # endpoint uses — closing the gap so "suspend access" actually suspends access.
        conn.execute(
            "UPDATE users SET is_blocked = 1, token_version = COALESCE(token_version,0) + 1 WHERE id = ?",
            [target_id],
        )
    else:
        # Unblock path is byte-for-byte unchanged: grant access back, leave sessions as-is
        # (the user has no live token anyway — the block bump killed it — so they log in fresh).
        conn.execute("UPDATE users SET is_blocked = 0 WHERE id = ?", [target_id])
    _audit(conn, caller, "user.block", "user", target_id, {"blocked": bool(req.blocked)})
    conn.commit()
    conn.close()
    return {"ok": True, "blocked": req.blocked}


@router.post("/users/{target_id}/plan")
def set_user_plan(target_id: str, req: PlanRequest, caller: str = Depends(get_current_user_id)):
    """Set a user's subscription/access tier, optionally for a fixed period."""
    require_super_admin(caller)
    _validate_expiry(req.expires_at)
    conn = _conn()
    conn.execute(
        "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? WHERE id = ?",
        [req.plan, req.expires_at, target_id])
    _audit(conn, caller, "user.plan", "user", target_id, {"plan": req.plan, "expires_at": req.expires_at})
    conn.commit()
    conn.close()
    return {"ok": True, "plan": req.plan, "expires_at": req.expires_at}


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
