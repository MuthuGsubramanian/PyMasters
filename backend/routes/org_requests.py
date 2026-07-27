"""
org_requests.py — org-admin capability requests reviewed by the platform admin.

An org/school super_admin requests something product-level (a plan/pilot,
enterprise access, more seats, or a free-text ask) that only the platform super
admin (muthu@pymasters.net) can grant. This is the mechanism that keeps
product-level power off org admins: they ask, the platform approves. Modeled on
the support_requests review-queue pattern (status machine + audit + email).

Approving a 'plan' request performs the grant on the SAME columns the admin
console uses (organizations.plan / plan_expires_at), which access.py reads —
so a granted org (and its members) become entitled immediately. Other kinds are
acknowledged (marked handled with a note); the platform admin performs any
manual step.
"""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter

router = APIRouter(tags=["org-requests"])

KINDS = ("plan", "enterprise", "seats", "other")
# Plans an org can be granted through this flow (enterprise unlocks the B2B
# tracks; student is the support-flow plan and not org-requestable).
GRANTABLE_PLANS = ("beginner", "pro", "enterprise")
PLAN_GRANT_DAYS = 90  # a requested/approved plan is time-boxed like a pilot

# Per-org: a handful of requests a day is plenty; sheds spam.
_request_limiter = SlidingWindowRateLimiter(max_calls=6, window_seconds=86400)


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_org_requests_table(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS org_admin_requests (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                requested_by TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT DEFAULT '{}',
                message TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                admin_note TEXT DEFAULT '',
                handled_by TEXT,
                handled_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_org_requests_status "
                     "ON org_admin_requests (status, created_at)")
        conn.commit()
    finally:
        conn.close()


class CreateOrgRequest(BaseModel):
    kind: str
    plan: str = ""           # for kind='plan'
    seats: int = 0           # for kind='seats'
    message: str = ""


class DecisionRequest(BaseModel):
    note: str = ""
    # Approver may override what a 'plan' request grants (e.g. the org asked for
    # enterprise, admin grants pro). Falls back to the requested plan.
    plan: str = ""
    expires_at: str = ""     # ISO date; '' → default 90-day box


def _notify_admins(subject: str, text: str, html: str) -> None:
    try:
        from routes.platform_settings import get_notification_emails
        from notifications.email_sender import send_email
        recipients = get_notification_emails()
    except Exception as e:
        print(f"[org_requests] notify setup failed: {e!r}")
        return

    def _send():
        for to in recipients:
            try:
                send_email(to, subject, text, html)
            except Exception as e:
                print(f"[org_requests] notify {to} failed: {e!r}")

    threading.Thread(target=_send, daemon=True).start()


def _notify_requester(to_email: str, subject: str, text: str, html: str) -> None:
    if not to_email:
        return

    def _send():
        try:
            from notifications.email_sender import send_email
            send_email(to_email, subject, text, html)
        except Exception as e:
            print(f"[org_requests] requester email failed: {e!r}")

    threading.Thread(target=_send, daemon=True).start()


def _summary(kind: str, payload: dict) -> str:
    if kind == "plan":
        return f"plan: {payload.get('plan', '?')}"
    if kind == "enterprise":
        return "enterprise access"
    if kind == "seats":
        return f"{payload.get('seats', '?')} seats"
    return "other"


# ── Org side (org super_admin) ───────────────────────────────────────────────

@router.post("/api/org/{org_id}/requests")
def create_request(org_id: str, req: CreateOrgRequest, caller: str = Depends(get_current_user_id)):
    """File a capability request for the org. Requires super_admin of the org."""
    from routes.organizations import require_org_role, _org_audit, _org_name
    require_org_role(_db_path(), org_id, caller, "super_admin")

    kind = (req.kind or "").strip().lower()
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {KINDS}")
    payload = {}
    if kind == "plan":
        plan = (req.plan or "").strip().lower()
        if plan not in GRANTABLE_PLANS:
            raise HTTPException(status_code=422, detail=f"plan must be one of {GRANTABLE_PLANS}")
        payload["plan"] = plan
    elif kind == "enterprise":
        payload["plan"] = "enterprise"
        kind = "plan"  # enterprise is a plan grant under the hood
    elif kind == "seats":
        if req.seats < 1:
            raise HTTPException(status_code=422, detail="seats must be a positive number")
        payload["seats"] = int(req.seats)

    if not _request_limiter.allow(org_id):
        raise HTTPException(status_code=429,
                            detail="You've filed several requests today — we'll get to them first.")

    conn = _conn()
    try:
        dup = conn.execute(
            "SELECT 1 FROM org_admin_requests WHERE org_id = ? AND kind = ? AND status = 'pending' LIMIT 1",
            [org_id, kind]).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="A similar request is already pending review.")
        rid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO org_admin_requests (id, org_id, requested_by, kind, payload, message) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [rid, org_id, caller, kind, json.dumps(payload), (req.message or "").strip()[:2000]])
        _org_audit(conn, org_id, caller, "request.create", "org_request", rid,
                   {"kind": kind, **payload})
        org_name = _org_name(conn, org_id)
        conn.commit()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_org_request_email
        text, html = build_org_request_email(org_name, _summary(kind, payload), req.message)
        _notify_admins("New organization request — PyMasters", text, html)
    except Exception as e:
        print(f"[org_requests] notify failed: {e!r}")
    return {"ok": True, "id": rid, "status": "pending",
            "message": "Request submitted — the PyMasters team will review it and email you."}


@router.get("/api/org/{org_id}/requests")
def list_org_requests(org_id: str, caller: str = Depends(get_current_user_id)):
    """The org's own requests. Requires admin+ of the org."""
    from routes.organizations import require_org_role
    require_org_role(_db_path(), org_id, caller, "admin")
    conn = _conn()
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT id, kind, payload, message, status, admin_note, created_at, handled_at "
            "FROM org_admin_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 100",
            [org_id]).fetchall()]
    finally:
        conn.close()
    for r in rows:
        try:
            r["payload"] = json.loads(r["payload"]) if r["payload"] else {}
        except Exception:
            r["payload"] = {}
    return {"requests": rows}


# ── Platform side (super admin) ──────────────────────────────────────────────

@router.get("/api/admin/org-requests")
def admin_list_requests(status: str = "", caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    require_super_admin(caller)
    conn = _conn()
    try:
        if status:
            rows = conn.execute(
                "SELECT r.*, o.name AS org_name, COALESCE(NULLIF(u.name,''),u.username) AS requester "
                "FROM org_admin_requests r LEFT JOIN organizations o ON o.id = r.org_id "
                "LEFT JOIN users u ON u.id = r.requested_by "
                "WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 300", [status]).fetchall()
        else:
            rows = conn.execute(
                "SELECT r.*, o.name AS org_name, COALESCE(NULLIF(u.name,''),u.username) AS requester "
                "FROM org_admin_requests r LEFT JOIN organizations o ON o.id = r.org_id "
                "LEFT JOIN users u ON u.id = r.requested_by "
                "ORDER BY r.created_at DESC LIMIT 300").fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["payload"] = json.loads(d["payload"]) if d["payload"] else {}
        except Exception:
            d["payload"] = {}
        out.append(d)
    return {"requests": out, "total": len(out)}


def _requester_email(conn, user_id: str) -> str:
    r = conn.execute("SELECT email FROM users WHERE id = ?", [user_id]).fetchone()
    return (r["email"] or "").strip() if r else ""


@router.post("/api/admin/org-requests/{request_id}/approve")
def admin_approve_request(request_id: str, req: DecisionRequest = None,
                          caller: str = Depends(get_current_user_id)):
    """Approve a request. For a 'plan' request this grants the plan on the org
    (organizations.plan/plan_expires_at) so access.py entitles it immediately."""
    from routes.admin import require_super_admin, _audit, _validate_expiry
    from routes.organizations import _org_audit
    require_super_admin(caller)
    note = (req.note if req else "") or ""
    conn = _conn()
    try:
        row = conn.execute("SELECT * FROM org_admin_requests WHERE id = ?", [request_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Request already {row['status']}.")
        try:
            payload = json.loads(row["payload"]) if row["payload"] else {}
        except Exception:
            payload = {}

        granted = {}
        if row["kind"] == "plan":
            plan = ((req.plan if req else "") or payload.get("plan") or "").strip().lower()
            if plan not in GRANTABLE_PLANS:
                raise HTTPException(status_code=422, detail=f"plan must be one of {GRANTABLE_PLANS}")
            expires_at = (req.expires_at if req else "") or None
            if expires_at:
                _validate_expiry(expires_at)
            else:
                expires_at = (datetime.utcnow() + timedelta(days=PLAN_GRANT_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE organizations SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? "
                "WHERE id = ?", [plan, expires_at, row["org_id"]])
            granted = {"plan": plan, "expires_at": expires_at}
            _audit(conn, caller, "org.plan", "org", row["org_id"],
                   {"plan": plan, "expires_at": expires_at, "via": "org_request"})

        conn.execute(
            "UPDATE org_admin_requests SET status = 'approved', admin_note = ?, handled_by = ?, "
            "handled_at = datetime('now') WHERE id = ?", [note[:1000], caller, request_id])
        _org_audit(conn, row["org_id"], caller, "request.approved", "org_request", request_id, granted)
        email = _requester_email(conn, row["requested_by"])
        conn.commit()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_org_request_decision_email
        text, html = build_org_request_decision_email(True, note, granted)
        _notify_requester(email, "Your PyMasters organization request was approved", text, html)
    except Exception as e:
        print(f"[org_requests] approve email failed: {e!r}")
    return {"ok": True, "status": "approved", "granted": granted}


@router.post("/api/admin/org-requests/{request_id}/reject")
def admin_reject_request(request_id: str, req: DecisionRequest = None,
                         caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    from routes.organizations import _org_audit
    require_super_admin(caller)
    note = (req.note if req else "") or ""
    conn = _conn()
    try:
        row = conn.execute("SELECT * FROM org_admin_requests WHERE id = ?", [request_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Request already {row['status']}.")
        conn.execute(
            "UPDATE org_admin_requests SET status = 'rejected', admin_note = ?, handled_by = ?, "
            "handled_at = datetime('now') WHERE id = ?", [note[:1000], caller, request_id])
        _org_audit(conn, row["org_id"], caller, "request.rejected", "org_request", request_id, {})
        email = _requester_email(conn, row["requested_by"])
        conn.commit()
    finally:
        conn.close()
    try:
        from notifications.email_sender import build_org_request_decision_email
        text, html = build_org_request_decision_email(False, note, {})
        _notify_requester(email, "About your PyMasters organization request", text, html)
    except Exception as e:
        print(f"[org_requests] reject email failed: {e!r}")
    return {"ok": True, "status": "rejected"}
