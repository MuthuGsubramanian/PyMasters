"""
support.py — public support entry points + super-admin review queue.

Two public submissions (rate-limited per client IP, no auth required):
  * Student access request — free 3-month access, student ID uploaded as proof.
    The ID is stored as a BLOB in SQLite (Litestream-replicated; the app has no
    other persistent file store) and is only readable by super admins.
  * Issue / bug report.

Approval of an access request grants the (non-purchasable) `student` plan for
90 days via the same plan/plan_expires_at columns the admin console uses. If
the requester has no account yet, the approval is stored and consumed
automatically when they register with the same email (hook in main.register).
"""

import io
import json
import os
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from auth import get_current_user_id, optional_user_id
from ratelimit import SlidingWindowRateLimiter

router = APIRouter(prefix="/api/support", tags=["support"])

STUDENT_PLAN = "student"
STUDENT_ACCESS_DAYS = 90  # "completely free for 3 months"

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# Magic-byte signatures — the uploaded student ID must actually be one of these.
_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"%PDF", "application/pdf"),
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Public, unauthenticated endpoints: keep abuse cheap to shed. Generous enough
# for a school lab behind one NAT IP to file a handful of requests.
_access_ip_limiter = SlidingWindowRateLimiter(max_calls=5, window_seconds=3600)
_issue_ip_limiter = SlidingWindowRateLimiter(max_calls=8, window_seconds=3600)


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_support_tables(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS support_requests (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('access', 'issue')),
                name TEXT DEFAULT '',
                email TEXT NOT NULL,
                message TEXT DEFAULT '',
                page_url TEXT DEFAULT '',
                user_id TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                admin_note TEXT DEFAULT '',
                granted_user_id TEXT,
                handled_by TEXT,
                handled_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS support_attachments (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                filename TEXT DEFAULT '',
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                data BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_support_requests_status "
            "ON support_requests (kind, status, created_at)"
        )
        conn.commit()
    finally:
        conn.close()


def _client_ip(request: Request | None) -> str:
    if request is None:
        return "unknown"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return (request.client.host if request.client else None) or "unknown"


def _enforce_ip_limit(limiter, request, what: str) -> None:
    key = _client_ip(request)
    if not limiter.allow(key):
        wait = max(1, limiter.retry_after(key))
        raise HTTPException(status_code=429, detail=f"Too many {what}. Try again in {wait}s.",
                            headers={"Retry-After": str(wait)})


def _sniff_content_type(data: bytes) -> str | None:
    for sig, ctype in _SIGNATURES:
        if data.startswith(sig):
            return ctype
    # WEBP: RIFF....WEBP
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _notify_admins(subject: str, text: str, html: str) -> None:
    """Fire-and-forget owner notification to every configured recipient."""
    try:
        from routes.platform_settings import get_notification_emails
        from notifications.email_sender import send_email
        recipients = get_notification_emails()
    except Exception as e:
        print(f"[support] notification setup failed: {e!r}")
        return

    def _send_all():
        for to in recipients:
            try:
                send_email(to, subject, text, html)
            except Exception as e:
                print(f"[support] notify {to} failed: {e!r}")

    threading.Thread(target=_send_all, daemon=True).start()


def _notify_requester(to_email: str, subject: str, text: str, html: str) -> None:
    def _send():
        try:
            from notifications.email_sender import send_email
            send_email(to_email, subject, text, html)
        except Exception as e:
            print(f"[support] requester email failed: {e!r}")

    threading.Thread(target=_send, daemon=True).start()


@router.post("/access-request")
async def submit_access_request(
    request: Request,
    name: str = Form(""),
    email: str = Form(...),
    message: str = Form(""),
    student_id: UploadFile = File(...),
):
    """Public: request free 3-month student access with a student-ID upload."""
    _enforce_ip_limit(_access_ip_limiter, request, "access requests")
    email = (email or "").strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="A valid email address is required.")
    name = (name or "").strip()[:120]
    message = (message or "").strip()[:2000]

    data = await student_id.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Student ID file is too large (max 5 MB).")
    if len(data) < 100:
        raise HTTPException(status_code=422, detail="Student ID file looks empty or corrupted.")
    ctype = _sniff_content_type(data)
    if ctype is None:
        raise HTTPException(
            status_code=422,
            detail="Student ID must be a JPG, PNG, WebP image or a PDF.",
        )

    req_id = str(uuid.uuid4())
    att_id = str(uuid.uuid4())
    conn = _conn()
    try:
        # An open (new/approved) duplicate for the same email just piles up
        # admin work — surface it kindly instead.
        dup = conn.execute(
            "SELECT 1 FROM support_requests WHERE kind='access' AND lower(email)=lower(?) "
            "AND status IN ('new','approved') LIMIT 1", [email]
        ).fetchone()
        if dup:
            raise HTTPException(
                status_code=409,
                detail="There's already a pending student access request for this email. "
                       "We'll get back to you soon!",
            )
        existing_user = conn.execute(
            "SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1", [email]
        ).fetchone()
        conn.execute(
            "INSERT INTO support_requests (id, kind, name, email, message, user_id) "
            "VALUES (?, 'access', ?, ?, ?, ?)",
            [req_id, name, email, message, existing_user["id"] if existing_user else None],
        )
        conn.execute(
            "INSERT INTO support_attachments (id, request_id, filename, content_type, size_bytes, data) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [att_id, req_id, (student_id.filename or "")[:200], ctype, len(data),
             sqlite3.Binary(data)],
        )
        conn.commit()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_support_notification_email
        text, html = build_support_notification_email(
            "access", name, email, message,
            extra=f"Student ID attached ({ctype}, {len(data) // 1024} KB)",
        )
        _notify_admins("New student access request — PyMasters", text, html)
    except Exception as e:
        print(f"[support] access notify failed: {e!r}")

    return {"ok": True, "message": "Request received! We review student IDs manually and "
                                   "you'll hear from us by email, usually within a day."}


class IssueReport(BaseModel):
    name: str = ""
    email: str
    subject: str = ""
    message: str
    page_url: str = ""


@router.post("/issue")
def submit_issue(req: IssueReport, request: Request = None,
                 caller: str = Depends(optional_user_id)):
    """Public: report a bug or any other issue."""
    _enforce_ip_limit(_issue_ip_limiter, request, "support messages")
    email = (req.email or "").strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="A valid email address is required.")
    message = (req.message or "").strip()
    if len(message) < 10:
        raise HTTPException(status_code=422, detail="Please describe the issue (at least 10 characters).")
    subject = (req.subject or "").strip()[:200]
    body = f"[{subject}] {message}" if subject else message

    req_id = str(uuid.uuid4())
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO support_requests (id, kind, name, email, message, page_url, user_id) "
            "VALUES (?, 'issue', ?, ?, ?, ?, ?)",
            [req_id, (req.name or "").strip()[:120], email, body[:4000],
             (req.page_url or "").strip()[:500], caller],
        )
        conn.commit()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_support_notification_email
        text, html = build_support_notification_email(
            "issue", req.name, email, body,
            extra=f"Page: {req.page_url}" if req.page_url else "",
        )
        _notify_admins("New issue report — PyMasters", text, html)
    except Exception as e:
        print(f"[support] issue notify failed: {e!r}")

    return {"ok": True, "message": "Thanks for the report — we're on it. "
                                   "We'll follow up by email if we need more detail."}


# ── Registration hook ────────────────────────────────────────────────────────

def apply_approved_access_grant(user_id: str, email: str) -> bool:
    """Called from main.register(): consume a pending approved access request
    for this email and grant the student plan. Never raises."""
    if not email:
        return False
    try:
        conn = _conn()
        try:
            row = conn.execute(
                "SELECT id FROM support_requests WHERE kind='access' AND status='approved' "
                "AND granted_user_id IS NULL AND lower(email)=lower(?) "
                "ORDER BY created_at LIMIT 1", [email]
            ).fetchone()
            if not row:
                return False
            expires = (datetime.utcnow() + timedelta(days=STUDENT_ACCESS_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? "
                "WHERE id = ?", [STUDENT_PLAN, expires, user_id])
            conn.execute(
                "UPDATE support_requests SET status='granted', granted_user_id=?, user_id=? "
                "WHERE id = ?", [user_id, user_id, row["id"]])
            conn.commit()
            print(f"[support] auto-granted student plan to {user_id} (request {row['id']})")
            return True
        finally:
            conn.close()
    except Exception as e:
        print(f"[support] apply_approved_access_grant failed: {e!r}")
        return False


# ── Super-admin review queue ─────────────────────────────────────────────────

class DecisionRequest(BaseModel):
    note: str = ""


@router.get("/admin/requests")
def admin_list_requests(kind: str = "", status: str = "", limit: int = 100,
                        caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    require_super_admin(caller)
    limit = max(1, min(limit, 500))
    where, params = [], []
    if kind in ("access", "issue"):
        where.append("r.kind = ?")
        params.append(kind)
    if status:
        where.append("r.status = ?")
        params.append(status)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    conn = _conn()
    try:
        rows = conn.execute(
            f"""SELECT r.*, a.id AS attachment_id, a.content_type AS attachment_type,
                       a.size_bytes AS attachment_size,
                       u.username AS matched_username, u.plan AS matched_plan
                FROM support_requests r
                LEFT JOIN support_attachments a ON a.request_id = r.id
                LEFT JOIN users u ON lower(u.email) = lower(r.email)
                {clause}
                ORDER BY r.created_at DESC LIMIT ?""",
            params + [limit],
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d.pop("granted_user_id", None)
        out.append(d)
    return {"requests": out, "total": len(out)}


@router.get("/admin/attachments/{attachment_id}")
def admin_get_attachment(attachment_id: str, caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    require_super_admin(caller)
    conn = _conn()
    try:
        row = conn.execute(
            "SELECT content_type, data FROM support_attachments WHERE id = ?",
            [attachment_id],
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return Response(content=row["data"], media_type=row["content_type"],
                    headers={"Cache-Control": "private, no-store"})


def _load_request(conn, request_id: str, kind: str = None):
    row = conn.execute("SELECT * FROM support_requests WHERE id = ?", [request_id]).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if kind and row["kind"] != kind:
        raise HTTPException(status_code=400, detail=f"Not a {kind} request")
    return row


@router.post("/admin/requests/{request_id}/approve")
def admin_approve_access(request_id: str, req: DecisionRequest = None,
                         caller: str = Depends(get_current_user_id)):
    """Approve a student access request. Grants the 90-day student plan now if a
    user with the request email exists; otherwise the grant is applied when the
    requester registers with that email."""
    from routes.admin import require_super_admin, _audit
    require_super_admin(caller)
    note = (req.note if req else "") or ""
    conn = _conn()
    try:
        row = _load_request(conn, request_id, "access")
        if row["status"] not in ("new", "approved"):
            raise HTTPException(status_code=409, detail=f"Request already {row['status']}.")
        user = conn.execute(
            "SELECT id, COALESCE(NULLIF(name,''), username) AS name FROM users "
            "WHERE lower(email) = lower(?) LIMIT 1", [row["email"]]
        ).fetchone()
        if user:
            expires = (datetime.utcnow() + timedelta(days=STUDENT_ACCESS_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? "
                "WHERE id = ?", [STUDENT_PLAN, expires, user["id"]])
            new_status, granted_to = "granted", user["id"]
        else:
            expires = None
            new_status, granted_to = "approved", None
        conn.execute(
            "UPDATE support_requests SET status=?, granted_user_id=?, admin_note=?, "
            "handled_by=?, handled_at=datetime('now') WHERE id=?",
            [new_status, granted_to, note[:1000], caller, request_id])
        _audit(conn, caller, "support.access_approve", "support_request", request_id,
               {"email": row["email"], "granted_user_id": granted_to, "expires": expires})
        conn.commit()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_access_decision_email
        text, html = build_access_decision_email(
            row["name"], approved=True, note=note, needs_signup=(granted_to is None))
        _notify_requester(row["email"], "Your PyMasters student access is approved 🎉", text, html)
    except Exception as e:
        print(f"[support] approve email failed: {e!r}")
    return {"ok": True, "status": new_status,
            "granted": granted_to is not None,
            "plan_expires_at": expires}


@router.post("/admin/requests/{request_id}/reject")
def admin_reject_access(request_id: str, req: DecisionRequest = None,
                        caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin, _audit
    require_super_admin(caller)
    note = (req.note if req else "") or ""
    conn = _conn()
    try:
        row = _load_request(conn, request_id, "access")
        if row["status"] not in ("new", "approved"):
            raise HTTPException(status_code=409, detail=f"Request already {row['status']}.")
        conn.execute(
            "UPDATE support_requests SET status='rejected', admin_note=?, handled_by=?, "
            "handled_at=datetime('now') WHERE id=?", [note[:1000], caller, request_id])
        _audit(conn, caller, "support.access_reject", "support_request", request_id,
               {"email": row["email"]})
        conn.commit()
    finally:
        conn.close()
    try:
        from notifications.email_sender import build_access_decision_email
        text, html = build_access_decision_email(row["name"], approved=False, note=note)
        _notify_requester(row["email"], "About your PyMasters student access request", text, html)
    except Exception as e:
        print(f"[support] reject email failed: {e!r}")
    return {"ok": True, "status": "rejected"}


@router.post("/admin/requests/{request_id}/resolve")
def admin_resolve_issue(request_id: str, req: DecisionRequest = None,
                        caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin, _audit
    require_super_admin(caller)
    note = (req.note if req else "") or ""
    conn = _conn()
    try:
        row = _load_request(conn, request_id, "issue")
        conn.execute(
            "UPDATE support_requests SET status='resolved', admin_note=?, handled_by=?, "
            "handled_at=datetime('now') WHERE id=?", [note[:1000], caller, request_id])
        _audit(conn, caller, "support.issue_resolve", "support_request", request_id, {})
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "status": "resolved"}
