"""
organizations.py -- FastAPI router for organization/enterprise management.
Prefix: /api/org
"""

import os
import json
import sqlite3
import uuid
import secrets
import threading
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from auth import get_current_user_id

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://pymasters.net")

router = APIRouter(prefix="/api/org", tags=["organizations"])


def _send_invite_emails(org_name: str, recipients: list, inviter: str = None):
    """Send invite emails (best-effort). recipients: list of {email, token, role}."""
    try:
        from notifications.email_sender import send_email, build_invite_email
    except Exception as e:
        print(f"[invite email] sender unavailable: {e}")
        return
    for r in recipients:
        try:
            link = f"{APP_BASE_URL}/join/{r['token']}"
            text, html = build_invite_email(org_name, r.get("role", "member"), link, inviter)
            send_email(r["email"], f"You're invited to {org_name} on PyMasters", text, html)
        except Exception as e:
            print(f"[invite email] failed for {r.get('email')}: {e}")


def _dispatch_invite_emails(org_name: str, recipients: list, inviter: str = None):
    """Fire-and-forget invite emails so the HTTP response isn't blocked on SMTP."""
    if not recipients:
        return
    threading.Thread(
        target=_send_invite_emails,
        args=(org_name, recipients, inviter),
        daemon=True,
    ).start()


def _org_name(conn, org_id: str) -> str:
    row = conn.execute("SELECT name FROM organizations WHERE id = ?", [org_id]).fetchone()
    return row[0] if row else "your organization"

# -- Role hierarchy -------------------------------------------------------
ROLE_LEVELS = {"super_admin": 4, "admin": 3, "manager": 2, "member": 1}

def _cap_invite_role(requested: str, inviter_role: str) -> str:
    """Clamp an invited role so an inviter can never grant a role ABOVE their own.

    Privilege boundary: promoting an existing member to admin/super_admin is gated
    to super_admin via change_role(). The invite path (admin+) must not be a
    backdoor around that gate — otherwise a mere admin could invite an email they
    control as 'super_admin', redeem it, and self-escalate. Legitimate
    equal-or-lower invites (the normal case) are returned unchanged; unknown roles
    fall back to 'member'. Additive/defensive: does not alter response shape."""
    if requested not in ROLE_LEVELS:
        return "member"
    if ROLE_LEVELS.get(requested, 0) > ROLE_LEVELS.get(inviter_role, 0):
        return inviter_role
    return requested

def require_org_role(db_path, org_id, user_id, min_role="member"):
    """Check user has at least min_role in org. Returns member row or raises 403."""
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT role, department FROM org_members WHERE org_id = ? AND user_id = ?",
        [org_id, user_id]
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if ROLE_LEVELS.get(row[0], 0) < ROLE_LEVELS.get(min_role, 0):
        raise HTTPException(status_code=403, detail=f"Requires {min_role} role or higher")
    return {"role": row[0], "department": row[1]}

# -- Pydantic models ------------------------------------------------------

class CreateOrgRequest(BaseModel):
    name: str
    type: str = "other"  # school, university, enterprise, other
    domain: str = ""
    logo_url: str = ""
    description: str = ""
    user_id: str  # creator

class UpdateOrgRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    domain: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    plan: Optional[str] = None
    group_label: Optional[str] = None
    user_id: str

class InviteRequest(BaseModel):
    email: str
    role: str = "member"
    user_id: str  # inviter

class BulkInviteRequest(BaseModel):
    emails: Optional[List[str]] = None          # OrgSetup shape: ["a@x.com", ...]
    invites: Optional[List[dict]] = None        # OrgDashboard shape: [{"email","role"}, ...]
    role: str = "member"                        # fallback role
    user_id: str

class RoleChangeRequest(BaseModel):
    new_role: str
    user_id: str  # requester

class JoinOrgRequest(BaseModel):
    user_id: str

class SetGroupsRequest(BaseModel):
    groups: List[str] = []
    user_id: Optional[str] = None  # ignored; caller derived from token

# -- Endpoints (ORDER MATTERS: /my and /join before /{org_id}) -------------

def _ensure_org_schema(conn):
    """Defensively guarantee org tables + columns exist before writing. Long-lived
    prod DBs (Litestream) can lag the current schema; this prevents a missing-column
    OperationalError from 500-ing organization creation."""
    conn.execute("""CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'other',
        domain TEXT DEFAULT '', logo_url TEXT DEFAULT '', description TEXT DEFAULT '',
        settings TEXT DEFAULT '{}', plan TEXT DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS org_members (
        org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
        department TEXT DEFAULT '', joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        invited_by TEXT DEFAULT '', PRIMARY KEY (org_id, user_id))""")
    have = {r[1] for r in conn.execute("PRAGMA table_info(organizations)").fetchall()}
    for col, ddl in (("type","TEXT DEFAULT 'other'"), ("domain","TEXT DEFAULT ''"),
                     ("logo_url","TEXT DEFAULT ''"), ("description","TEXT DEFAULT ''"),
                     ("settings","TEXT DEFAULT '{}'"), ("plan","TEXT DEFAULT 'free'"),
                     ("created_at","TIMESTAMP"), ("updated_at","TIMESTAMP")):
        if col not in have:
            try: conn.execute(f"ALTER TABLE organizations ADD COLUMN {col} {ddl}")
            except Exception: pass


@router.post("")
def create_org(data: CreateOrgRequest, caller: str = Depends(get_current_user_id)):
    """Create a new organization. Creator becomes super_admin."""
    data.user_id = caller
    if not (data.name or "").strip():
        raise HTTPException(status_code=400, detail="Organization name is required.")
    org_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        _ensure_org_schema(conn)
        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT INTO organizations (id, name, type, domain, logo_url, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [org_id, data.name, data.type, data.domain, data.logo_url, data.description, now, now]
        )
        conn.execute(
            "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'super_admin', ?)",
            [org_id, data.user_id, now]
        )
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Could not create organization: {e}")
    finally:
        conn.close()
    return {
        "id": org_id, "org_id": org_id,
        "name": data.name, "org_name": data.name,
        "type": data.type, "org_type": data.type,
        "role": "super_admin"
    }


@router.get("/my")
def my_orgs(caller: str = Depends(get_current_user_id)):
    """List all organizations the user belongs to."""
    user_id = caller
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("""
        SELECT o.id, o.name, o.type, o.domain, o.logo_url, o.plan,
               om.role, om.department, om.joined_at,
               (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count
        FROM org_members om
        JOIN organizations o ON o.id = om.org_id
        WHERE om.user_id = ?
        ORDER BY om.joined_at DESC
    """, [user_id]).fetchall()
    conn.close()
    return {"organizations": [
        {
            "id": r[0], "org_id": r[0],  # dual keys for frontend compat
            "name": r[1], "org_name": r[1],
            "type": r[2], "org_type": r[2],
            "domain": r[3], "logo_url": r[4], "plan": r[5],
            "role": r[6], "department": r[7] or "",
            "joined_at": r[8], "member_count": r[9]
        } for r in rows
    ]}


@router.post("/join/{token}")
def join_org(token: str, data: JoinOrgRequest, caller: str = Depends(get_current_user_id)):
    """Accept an invite using the token."""
    data.user_id = caller
    conn = sqlite3.connect(DB_PATH)
    try:
        invite = conn.execute(
            "SELECT id, org_id, email, role, expires_at, used FROM org_invites WHERE token = ?",
            [token]
        ).fetchone()
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid invite token")
        if invite[5]:  # used
            raise HTTPException(status_code=400, detail="Invite already used")
        if invite[4] and datetime.fromisoformat(invite[4]) < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Invite has expired")

        # Check if already a member
        existing = conn.execute(
            "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
            [invite[1], data.user_id]
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Already a member of this organization")

        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            [invite[1], data.user_id, invite[3], now]
        )
        conn.execute(
            "UPDATE org_invites SET used = 1, used_by = ? WHERE id = ?",
            [data.user_id, invite[0]]
        )
        conn.commit()

        org = conn.execute("SELECT name, type FROM organizations WHERE id = ?", [invite[1]]).fetchone()
        org_type = org[1] if org else "other"
        return {
            "joined": True, "id": invite[1], "org_id": invite[1],
            "name": org[0] if org else "", "org_name": org[0] if org else "",
            "type": org_type, "org_type": org_type,
            "role": invite[3], "department": ""
        }
    finally:
        conn.close()


@router.get("/invite/{token}")
def get_invite_info(token: str):
    """Public: look up an invite by token so the join page can show org details."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        """SELECT i.email, i.role, i.expires_at, i.used, o.name, o.type, o.id
           FROM org_invites i JOIN organizations o ON o.id = i.org_id
           WHERE i.token = ?""",
        [token],
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid invite token")
    expired = bool(row[2]) and datetime.fromisoformat(row[2]) < datetime.utcnow()
    return {
        "email": row[0], "role": row[1], "expires_at": row[2],
        "used": bool(row[3]), "expired": expired,
        "org_name": row[4], "org_type": row[5], "org_id": row[6],
        "valid": (not row[3]) and (not expired),
    }


@router.get("/{org_id}")
def get_org(org_id: str, user_id: str = Query(None), caller: str = Depends(get_current_user_id)):
    """Get organization details. Requires membership."""
    member_info = require_org_role(DB_PATH, org_id, caller)
    conn = sqlite3.connect(DB_PATH)
    org = conn.execute(
        "SELECT id, name, type, domain, logo_url, description, settings, plan, created_at FROM organizations WHERE id = ?",
        [org_id]
    ).fetchone()
    member_count = conn.execute("SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]).fetchone()[0]

    # Pending invites for admin+ visibility
    pending_invites = []
    if ROLE_LEVELS.get(member_info["role"], 0) >= ROLE_LEVELS.get("admin", 0):
        inv_rows = conn.execute(
            "SELECT id, email, role, token, created_at, expires_at FROM org_invites WHERE org_id = ? AND used = 0 ORDER BY created_at DESC",
            [org_id]
        ).fetchall()
        _now = datetime.utcnow()
        for r in inv_rows:
            # Compute live vs expired so the console doesn't present a dead
            # (un-redeemable) invite as still "pending". join_org already rejects
            # expired tokens; this surfaces that truth to admins. Additive fields.
            _expired = False
            if r[5]:
                try:
                    _expired = datetime.fromisoformat(str(r[5]).replace(" ", "T")) < _now
                except Exception:
                    _expired = False
            pending_invites.append({
                "id": r[0], "email": r[1], "role": r[2], "token": r[3],
                "created_at": r[4], "expires_at": r[5],
                "expired": _expired,
                "status": "expired" if _expired else "pending",
            })

    conn.close()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": org[0], "org_id": org[0],  # dual keys for frontend compat
        "name": org[1], "org_name": org[1],
        "type": org[2], "org_type": org[2],
        "domain": org[3], "logo_url": org[4],
        "description": org[5] or "", "settings": org[6], "plan": org[7],
        "created_at": org[8], "member_count": member_count,
        "my_role": member_info["role"],
        "my_department": member_info["department"] or "",
        "pending_invites": pending_invites
    }


@router.put("/{org_id}")
def update_org(org_id: str, data: UpdateOrgRequest, caller: str = Depends(get_current_user_id)):
    """Update organization. Requires admin+."""
    require_org_role(DB_PATH, org_id, caller, "admin")
    conn = sqlite3.connect(DB_PATH)
    try:
        updates = []
        values = []
        for field in ["name", "type", "domain", "logo_url", "description", "plan"]:
            val = getattr(data, field, None)
            if val is not None:
                updates.append(f"{field} = ?")
                values.append(val)
        # group_label lives in the settings JSON blob, not a top-level column
        if data.group_label is not None:
            label = data.group_label.strip()[:30]
            if label:
                row = conn.execute("SELECT settings FROM organizations WHERE id = ?", [org_id]).fetchone()
                try:
                    settings = json.loads(row[0]) if row and row[0] else {}
                except Exception:
                    settings = {}
                settings["group_label"] = label
                updates.append("settings = ?")
                values.append(json.dumps(settings))
        if updates:
            updates.append("updated_at = ?")
            values.append(datetime.utcnow().isoformat())
            values.append(org_id)
            conn.execute(f"UPDATE organizations SET {', '.join(updates)} WHERE id = ?", values)
            conn.commit()
    finally:
        conn.close()
    return {"updated": True}


@router.get("/{org_id}/members")
def list_members(org_id: str, role: Optional[str] = None, department: Optional[str] = None, caller: str = Depends(get_current_user_id)):
    """List org members. Requires membership."""
    require_org_role(DB_PATH, org_id, caller, "member")
    conn = sqlite3.connect(DB_PATH)
    query = """
        SELECT u.id, u.username, u.name, u.email, u.points, u.linkedin_url, u.github_url,
               om.role, om.department, om.joined_at
        FROM org_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.org_id = ?
    """
    params = [org_id]
    if role:
        query += " AND om.role = ?"
        params.append(role)
    if department:
        query += " AND om.department = ?"
        params.append(department)
    query += " ORDER BY om.joined_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return {"members": [
        {
            "id": r[0], "user_id": r[0],  # dual keys for frontend compat
            "username": r[1], "name": r[2], "email": r[3],
            "points": r[4] or 0, "xp": r[4] or 0,  # alias for frontend
            "linkedin_url": r[5] or "", "github_url": r[6] or "",
            "role": r[7], "department": r[8] or "", "joined_at": r[9]
        } for r in rows
    ]}


@router.post("/{org_id}/invite")
def invite_member(org_id: str, data: InviteRequest, caller: str = Depends(get_current_user_id)):
    """Create a single invite. Requires admin+."""
    member = require_org_role(DB_PATH, org_id, caller, "admin")
    if data.role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")
    # An inviter may never grant a role higher than their own (see _cap_invite_role).
    data.role = _cap_invite_role(data.role, member["role"])
    invite_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO org_invites (id, org_id, email, role, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [invite_id, org_id, data.email, data.role, token, datetime.utcnow().isoformat(), expires]
    )
    conn.commit()
    org_name = _org_name(conn, org_id)
    conn.close()
    _dispatch_invite_emails(org_name, [{"email": data.email.strip(), "token": token, "role": data.role}])
    return {"invite_id": invite_id, "token": token, "email": data.email, "role": data.role, "expires_at": expires}


@router.post("/{org_id}/invite/bulk")
def bulk_invite(org_id: str, data: BulkInviteRequest, caller: str = Depends(get_current_user_id)):
    """Create multiple invites and email each invitee. Requires admin+.

    Accepts either {"emails": [...], "role": "member"} or
    {"invites": [{"email": ..., "role": ...}, ...]}.
    """
    member = require_org_role(DB_PATH, org_id, caller, "admin")
    inviter_role = member["role"]

    # Normalize both request shapes into (email, role) pairs. Every role is passed
    # through _cap_invite_role so a bulk invite can't escalate past the inviter's
    # own level (same privilege boundary enforced on the single-invite path).
    pairs = []
    if data.invites:
        for inv in data.invites:
            em = (inv.get("email") or "").strip()
            rl = _cap_invite_role(inv.get("role") or data.role, inviter_role)
            if em and '@' in em:
                pairs.append((em, rl))
    elif data.emails:
        rl = _cap_invite_role(data.role, inviter_role)
        for em in data.emails:
            em = (em or "").strip()
            if em and '@' in em:
                pairs.append((em, rl))
    pairs = pairs[:100]  # cap at 100

    conn = sqlite3.connect(DB_PATH)
    invites = []
    now = datetime.utcnow().isoformat()
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    for email, role in pairs:
        invite_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT OR IGNORE INTO org_invites (id, org_id, email, role, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [invite_id, org_id, email, role, token, now, expires]
        )
        invites.append({"email": email, "token": token, "role": role})
    conn.commit()
    org_name = _org_name(conn, org_id)
    conn.close()
    _dispatch_invite_emails(org_name, invites)
    return {"created": len(invites), "invites": invites, "emails_sent": len(invites)}


@router.put("/{org_id}/members/{member_id}/role")
def change_role(org_id: str, member_id: str, data: RoleChangeRequest, caller: str = Depends(get_current_user_id)):
    """Change member role. Requires super_admin."""
    require_org_role(DB_PATH, org_id, caller, "super_admin")
    if data.new_role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.new_role}")
    conn = sqlite3.connect(DB_PATH)
    # Guard: can't demote last super_admin
    if data.new_role != "super_admin":
        admins = conn.execute(
            "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND role = 'super_admin'",
            [org_id]
        ).fetchone()[0]
        current = conn.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [org_id, member_id]
        ).fetchone()
        if current and current[0] == "super_admin" and admins <= 1:
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot demote the last super admin")
    conn.execute(
        "UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?",
        [data.new_role, org_id, member_id]
    )
    conn.commit()
    conn.close()
    return {"updated": True, "new_role": data.new_role}


@router.delete("/{org_id}/members/{member_id}")
def remove_member(org_id: str, member_id: str, caller: str = Depends(get_current_user_id)):
    """Remove a member. Requires admin+. Cannot remove last super_admin."""
    require_org_role(DB_PATH, org_id, caller, "admin")
    conn = sqlite3.connect(DB_PATH)
    current = conn.execute(
        "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
        [org_id, member_id]
    ).fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Member not found")
    if current[0] == "super_admin":
        admins = conn.execute(
            "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND role = 'super_admin'",
            [org_id]
        ).fetchone()[0]
        if admins <= 1:
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot remove the last super admin")
    conn.execute("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", [org_id, member_id])
    conn.commit()
    conn.close()
    return {"removed": True}


@router.put("/{org_id}/members/{member_id}/groups")
def set_member_groups(org_id: str, member_id: str, data: SetGroupsRequest,
                      caller: str = Depends(get_current_user_id)):
    """Replace a member's full group-tag list. Requires admin+."""
    require_org_role(DB_PATH, org_id, caller, "admin")
    conn = sqlite3.connect(DB_PATH)
    try:
        is_member = conn.execute(
            "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?", [org_id, member_id]
        ).fetchone()
        if not is_member:
            raise HTTPException(status_code=404, detail="Member not found in this organization")

        # Normalize: trim, cap length 50, drop blanks, dedupe (preserve order), cap 20 tags
        cleaned = []
        for g in (data.groups or []):
            name = (g or "").strip()[:50]
            if name and name not in cleaned:
                cleaned.append(name)
        cleaned = cleaned[:20]

        now = datetime.utcnow().isoformat()
        conn.execute("DELETE FROM org_member_groups WHERE org_id = ? AND user_id = ?", [org_id, member_id])
        for name in cleaned:
            conn.execute(
                "INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name, created_at) "
                "VALUES (?, ?, ?, ?)",
                [org_id, member_id, name, now],
            )
        conn.commit()
    finally:
        conn.close()
    return {"updated": True, "groups": cleaned}


@router.get("/{org_id}/groups")
def list_groups(org_id: str, caller: str = Depends(get_current_user_id)):
    """Distinct group names + member counts for the org. Requires manager+."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT group_name, COUNT(*) FROM org_member_groups WHERE org_id = ? "
            "GROUP BY group_name ORDER BY group_name",
            [org_id],
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]
        ).fetchone()[0]
        tagged = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM org_member_groups WHERE org_id = ?", [org_id]
        ).fetchone()[0]
        settings_row = conn.execute(
            "SELECT settings FROM organizations WHERE id = ?", [org_id]
        ).fetchone()
    finally:
        conn.close()
    label = "Group"
    if settings_row and settings_row[0]:
        try:
            label = (json.loads(settings_row[0]) or {}).get("group_label") or "Group"
        except Exception:
            label = "Group"
    return {
        "groups": [{"name": r[0], "count": r[1]} for r in rows],
        "ungrouped": max(0, total - tagged),
        "group_label": label,
    }


@router.get("/{org_id}/analytics")
def org_analytics(org_id: str, caller: str = Depends(get_current_user_id)):
    """Aggregated org stats. Requires manager+."""
    member = require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)

    # Member count
    total = conn.execute("SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]).fetchone()[0]

    # Avg XP
    avg_xp = conn.execute("""
        SELECT COALESCE(AVG(u.points), 0)
        FROM org_members om JOIN users u ON u.id = om.user_id
        WHERE om.org_id = ?
    """, [org_id]).fetchone()[0]

    # Top XP
    top_xp = conn.execute("""
        SELECT COALESCE(MAX(u.points), 0)
        FROM org_members om JOIN users u ON u.id = om.user_id
        WHERE om.org_id = ?
    """, [org_id]).fetchone()[0]

    # Active learners (last 7 days)
    active = conn.execute("""
        SELECT COUNT(DISTINCT ls.user_id)
        FROM learning_signals ls
        JOIN org_members om ON om.user_id = ls.user_id
        WHERE om.org_id = ? AND ls.created_at > datetime('now', '-7 days')
    """, [org_id]).fetchone()[0]

    # Lessons completed
    lessons = conn.execute("""
        SELECT COUNT(*)
        FROM lesson_completions lc
        JOIN org_members om ON om.user_id = lc.user_id
        WHERE om.org_id = ?
    """, [org_id]).fetchone()[0]

    # Role distribution
    roles = conn.execute("""
        SELECT role, COUNT(*) FROM org_members WHERE org_id = ? GROUP BY role
    """, [org_id]).fetchall()

    # Department distribution
    depts = conn.execute("""
        SELECT department, COUNT(*) FROM org_members WHERE org_id = ? AND department != '' GROUP BY department
    """, [org_id]).fetchall()

    conn.close()
    return {
        "total_members": total,
        "avg_xp": round(avg_xp, 1),
        "top_xp": top_xp,
        "active_7d": active,
        "lessons_completed": lessons,
        "roles": {r[0]: r[1] for r in roles},
        "departments": {d[0]: d[1] for d in depts} if depts else {}
    }


@router.get("/{org_id}/progress")
def org_progress(org_id: str, group: Optional[str] = None, caller: str = Depends(get_current_user_id)):
    """Per-student progress for teachers/admins. Requires manager+.
    Optional `group` filters by tag; `__ungrouped__` returns untagged members.
    Each student includes a `groups` list."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        query = """
            SELECT u.id, u.username, u.name, u.email, om.role, om.department,
                   COALESCE(u.points, 0) AS xp,
                   (SELECT COUNT(*) FROM lesson_completions lc WHERE lc.user_id = u.id) AS lessons_completed,
                   (SELECT MAX(created_at) FROM learning_signals ls WHERE ls.user_id = u.id) AS last_active,
                   (SELECT COALESCE(SUM(struggle_count), 0) FROM user_mastery um WHERE um.user_id = u.id) AS struggle_count,
                   (SELECT COUNT(*) FROM learning_signals ls WHERE ls.user_id = u.id AND ls.created_at > datetime('now','-7 days')) AS signals_7d
            FROM org_members om JOIN users u ON u.id = om.user_id
            WHERE om.org_id = ?
        """
        params = [org_id]
        if group == "__ungrouped__":
            query += " AND u.id NOT IN (SELECT user_id FROM org_member_groups WHERE org_id = ?)"
            params.append(org_id)
        elif group:
            query += " AND u.id IN (SELECT user_id FROM org_member_groups WHERE org_id = ? AND group_name = ?)"
            params.extend([org_id, group])
        query += " ORDER BY xp DESC"
        rows = conn.execute(query, params).fetchall()

        gmap = {}
        for uid, gname in conn.execute(
            "SELECT user_id, group_name FROM org_member_groups WHERE org_id = ?", [org_id]
        ).fetchall():
            gmap.setdefault(uid, []).append(gname)
    finally:
        conn.close()
    students = []
    for r in rows:
        d = dict(r)
        d["groups"] = sorted(gmap.get(d["id"], []))
        students.append(d)
    return {"students": students, "count": len(students)}


@router.get("/{org_id}/students/{member_id}")
def student_detail(org_id: str, member_id: str, caller: str = Depends(get_current_user_id)):
    """Drill-down detail for one student. Requires manager+. Target must be an org member."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        prof = conn.execute(
            """SELECT u.id, u.username, u.name, u.email, om.role, om.department, om.joined_at,
                      COALESCE(u.points, 0) AS xp
               FROM org_members om JOIN users u ON u.id = om.user_id
               WHERE om.org_id = ? AND om.user_id = ?""",
            [org_id, member_id],
        ).fetchone()
        if not prof:
            raise HTTPException(status_code=404, detail="Member not found in this organization")

        groups = [r[0] for r in conn.execute(
            "SELECT group_name FROM org_member_groups WHERE org_id = ? AND user_id = ? ORDER BY group_name",
            [org_id, member_id]).fetchall()]
        lessons_completed = conn.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?", [member_id]).fetchone()[0]
        struggle_total = conn.execute(
            "SELECT COALESCE(SUM(struggle_count), 0) FROM user_mastery WHERE user_id = ?", [member_id]).fetchone()[0]
        last_active = conn.execute(
            "SELECT MAX(created_at) FROM learning_signals WHERE user_id = ?", [member_id]).fetchone()[0]
        signals_7d = conn.execute(
            "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND created_at > datetime('now','-7 days')",
            [member_id]).fetchone()[0]
        mastery = [dict(r) for r in conn.execute(
            """SELECT topic, mastery_level, attempts, struggle_count, last_practiced
               FROM user_mastery WHERE user_id = ?
               ORDER BY mastery_level ASC, struggle_count DESC""", [member_id]).fetchall()]
        activity = [dict(r) for r in conn.execute(
            """SELECT signal_type, topic, created_at FROM learning_signals
               WHERE user_id = ? ORDER BY created_at DESC LIMIT 30""", [member_id]).fetchall()]
        lessons = [dict(r) for r in conn.execute(
            """SELECT lesson_id, xp_awarded, completed_at FROM lesson_completions
               WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20""", [member_id]).fetchall()]
    finally:
        conn.close()

    # Status derivation mirrors the frontend studentStatus() (incl. the 30-day idle cutoff).
    if struggle_total >= 3:
        status = "at_risk"
    elif signals_7d > 0:
        status = "active"
    else:
        status = "inactive"
        if last_active:
            try:
                ts = datetime.fromisoformat(str(last_active).replace(" ", "T"))
                if (datetime.utcnow() - ts) < timedelta(days=30):
                    status = "idle"
            except Exception:
                status = "idle"

    return {
        "profile": {**dict(prof), "groups": groups},
        "summary": {
            "xp": prof["xp"], "lessons_completed": lessons_completed,
            "struggle_total": struggle_total, "last_active": last_active, "status": status,
        },
        "mastery": mastery, "activity": activity, "lessons": lessons,
    }


@router.delete("/{org_id}")
def delete_organization(org_id: str, caller: str = Depends(get_current_user_id)):
    """
    Permanently delete an organization and all associated data.
    Requires super_admin role. Member user accounts are preserved.
    """
    user_id = caller
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()

        # Verify org exists
        cursor.execute("SELECT id, name FROM organizations WHERE id = ?", [org_id])
        org = cursor.fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Verify user is super_admin
        cursor.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [org_id, user_id]
        )
        member = cursor.fetchone()
        if not member or member["role"] != "super_admin":
            raise HTTPException(status_code=403, detail="Only super admins can delete an organization")

        # Delete all associated data
        cursor.execute("DELETE FROM org_members WHERE org_id = ?", [org_id])
        cursor.execute("DELETE FROM org_invites WHERE org_id = ?", [org_id])
        cursor.execute("DELETE FROM org_member_groups WHERE org_id = ?", [org_id])

        # Delete org_profiles (may not exist if onboarding wasn't completed)
        try:
            cursor.execute("DELETE FROM org_profiles WHERE org_id = ?", [org_id])
        except Exception:
            pass

        # Delete the organization itself
        cursor.execute("DELETE FROM organizations WHERE id = ?", [org_id])

        conn.commit()
        return {"deleted": True, "org_id": org_id}
    finally:
        conn.close()
