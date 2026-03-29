"""
organizations.py -- FastAPI router for organization/enterprise management.
Prefix: /api/org
"""

import os
import sqlite3
import uuid
import secrets
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/org", tags=["organizations"])

# -- Role hierarchy -------------------------------------------------------
ROLE_LEVELS = {"super_admin": 4, "admin": 3, "manager": 2, "member": 1}

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
    user_id: str  # creator

class UpdateOrgRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    domain: Optional[str] = None
    logo_url: Optional[str] = None
    plan: Optional[str] = None
    user_id: str

class InviteRequest(BaseModel):
    email: str
    role: str = "member"
    user_id: str  # inviter

class BulkInviteRequest(BaseModel):
    emails: List[str]
    role: str = "member"
    user_id: str

class RoleChangeRequest(BaseModel):
    new_role: str
    user_id: str  # requester

class JoinOrgRequest(BaseModel):
    user_id: str

# -- Endpoints (ORDER MATTERS: /my and /join before /{org_id}) -------------

@router.post("")
def create_org(data: CreateOrgRequest):
    """Create a new organization. Creator becomes super_admin."""
    org_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT INTO organizations (id, name, type, domain, logo_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [org_id, data.name, data.type, data.domain, data.logo_url, now, now]
        )
        conn.execute(
            "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'super_admin', ?)",
            [org_id, data.user_id, now]
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": org_id, "name": data.name, "type": data.type, "role": "super_admin"}


@router.get("/my")
def my_orgs(user_id: str = Query(...)):
    """List all organizations the user belongs to."""
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
            "id": r[0], "name": r[1], "type": r[2], "domain": r[3],
            "logo_url": r[4], "plan": r[5], "role": r[6],
            "department": r[7] or "", "joined_at": r[8], "member_count": r[9]
        } for r in rows
    ]}


@router.post("/join/{token}")
def join_org(token: str, data: JoinOrgRequest):
    """Accept an invite using the token."""
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
        return {"joined": True, "org_id": invite[1], "org_name": org[0] if org else "", "role": invite[3]}
    finally:
        conn.close()


@router.get("/{org_id}")
def get_org(org_id: str, user_id: str = Query(...)):
    """Get organization details. Requires membership."""
    require_org_role(DB_PATH, org_id, user_id)
    conn = sqlite3.connect(DB_PATH)
    org = conn.execute(
        "SELECT id, name, type, domain, logo_url, settings, plan, created_at FROM organizations WHERE id = ?",
        [org_id]
    ).fetchone()
    member_count = conn.execute("SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]).fetchone()[0]
    conn.close()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": org[0], "name": org[1], "type": org[2], "domain": org[3],
        "logo_url": org[4], "settings": org[5], "plan": org[6],
        "created_at": org[7], "member_count": member_count
    }


@router.put("/{org_id}")
def update_org(org_id: str, data: UpdateOrgRequest):
    """Update organization. Requires admin+."""
    require_org_role(DB_PATH, org_id, data.user_id, "admin")
    conn = sqlite3.connect(DB_PATH)
    updates = []
    values = []
    for field in ["name", "type", "domain", "logo_url", "plan"]:
        val = getattr(data, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            values.append(val)
    if updates:
        updates.append("updated_at = ?")
        values.append(datetime.utcnow().isoformat())
        values.append(org_id)
        conn.execute(f"UPDATE organizations SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return {"updated": True}


@router.get("/{org_id}/members")
def list_members(org_id: str, user_id: str = Query(...), role: Optional[str] = None, department: Optional[str] = None):
    """List org members. Requires manager+."""
    require_org_role(DB_PATH, org_id, user_id, "manager")
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
            "id": r[0], "username": r[1], "name": r[2], "email": r[3],
            "points": r[4] or 0, "linkedin_url": r[5] or "", "github_url": r[6] or "",
            "role": r[7], "department": r[8] or "", "joined_at": r[9]
        } for r in rows
    ]}


@router.post("/{org_id}/invite")
def invite_member(org_id: str, data: InviteRequest):
    """Create a single invite. Requires admin+."""
    require_org_role(DB_PATH, org_id, data.user_id, "admin")
    if data.role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")
    invite_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO org_invites (id, org_id, email, role, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [invite_id, org_id, data.email, data.role, token, datetime.utcnow().isoformat(), expires]
    )
    conn.commit()
    conn.close()
    return {"invite_id": invite_id, "token": token, "email": data.email, "role": data.role, "expires_at": expires}


@router.post("/{org_id}/invite/bulk")
def bulk_invite(org_id: str, data: BulkInviteRequest):
    """Create multiple invites. Requires admin+."""
    require_org_role(DB_PATH, org_id, data.user_id, "admin")
    if data.role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")
    conn = sqlite3.connect(DB_PATH)
    invites = []
    now = datetime.utcnow().isoformat()
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    for email in data.emails[:100]:  # cap at 100
        email = email.strip()
        if not email or '@' not in email:
            continue
        invite_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT OR IGNORE INTO org_invites (id, org_id, email, role, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [invite_id, org_id, email, data.role, token, now, expires]
        )
        invites.append({"email": email, "token": token})
    conn.commit()
    conn.close()
    return {"created": len(invites), "invites": invites}


@router.put("/{org_id}/members/{member_id}/role")
def change_role(org_id: str, member_id: str, data: RoleChangeRequest):
    """Change member role. Requires super_admin."""
    require_org_role(DB_PATH, org_id, data.user_id, "super_admin")
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
def remove_member(org_id: str, member_id: str, user_id: str = Query(...)):
    """Remove a member. Requires admin+. Cannot remove last super_admin."""
    require_org_role(DB_PATH, org_id, user_id, "admin")
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


@router.get("/{org_id}/analytics")
def org_analytics(org_id: str, user_id: str = Query(...)):
    """Aggregated org stats. Requires manager+."""
    member = require_org_role(DB_PATH, org_id, user_id, "manager")
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
