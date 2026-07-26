"""
tutor_sessions.py — live 1-on-1 tutor session requests.

A learner schedules a session (topic + preferred time); the platform owners are
notified by email (recipients configurable via platform settings) and confirm
or decline from the Super Admin console, which emails the learner back. There
is no calendar integration — sessions are coordinated over email for now.
"""

import os
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter

router = APIRouter(prefix="/api/tutor-sessions", tags=["tutor-sessions"])

DURATIONS = (30, 45, 60)
STATUSES = ("pending", "confirmed", "cancelled", "completed")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Per-user: a learner shouldn't queue more than a handful of requests a day.
_request_limiter = SlidingWindowRateLimiter(max_calls=5, window_seconds=86400)


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_tutor_session_tables(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tutor_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT DEFAULT '',
                email TEXT NOT NULL,
                topic TEXT NOT NULL,
                preferred_at TEXT NOT NULL,
                timezone TEXT DEFAULT '',
                duration_minutes INTEGER DEFAULT 30,
                notes TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                admin_note TEXT DEFAULT '',
                handled_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tutor_sessions_user "
            "ON tutor_sessions (user_id, created_at)"
        )
        conn.commit()
    finally:
        conn.close()


def _parse_preferred(preferred_at: str) -> datetime:
    try:
        dt = datetime.fromisoformat(str(preferred_at).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422,
                            detail="preferred_at must be an ISO 8601 date-time, e.g. 2026-08-01T17:30.")
    now = datetime.now(timezone.utc) if dt.tzinfo else datetime.now()
    if dt < now:
        raise HTTPException(status_code=422, detail="Please pick a future date and time.")
    return dt


class SessionRequest(BaseModel):
    topic: str
    preferred_at: str          # ISO 8601, learner-local unless it carries an offset
    timezone: str = ""         # IANA name from the browser, informational
    duration_minutes: int = 30
    notes: str = ""
    email: str = ""            # optional override; defaults to account email


class StatusRequest(BaseModel):
    status: str
    note: str = ""


def _row_out(r) -> dict:
    return {k: r[k] for k in r.keys() if k not in ("handled_by",)}


@router.post("")
def create_session(req: SessionRequest, caller: str = Depends(get_current_user_id)):
    topic = (req.topic or "").strip()
    if len(topic) < 3:
        raise HTTPException(status_code=422, detail="Please tell us the topic (at least 3 characters).")
    if req.duration_minutes not in DURATIONS:
        raise HTTPException(status_code=422, detail=f"Duration must be one of {DURATIONS} minutes.")
    _parse_preferred(req.preferred_at)
    if not _request_limiter.allow(caller):
        raise HTTPException(status_code=429,
                            detail="You already have several session requests today — "
                                   "we'll get back to you on those first.")

    conn = _conn()
    try:
        u = conn.execute(
            "SELECT COALESCE(NULLIF(name,''), username) AS name, email FROM users WHERE id = ?",
            [caller],
        ).fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="Account not found.")
        email = (req.email or "").strip() or (u["email"] or "").strip()
        if not _EMAIL_RE.match(email):
            raise HTTPException(
                status_code=422,
                detail="We need an email address to coordinate the session — add one to "
                       "your profile or include it in the request.")
        sid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO tutor_sessions (id, user_id, name, email, topic, preferred_at, "
            "timezone, duration_minutes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [sid, caller, u["name"], email, topic[:300], req.preferred_at.strip()[:64],
             (req.timezone or "").strip()[:64], req.duration_minutes,
             (req.notes or "").strip()[:2000]],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tutor_sessions WHERE id = ?", [sid]).fetchone()
    finally:
        conn.close()

    try:
        from notifications.email_sender import build_tutor_session_email
        from routes.platform_settings import get_notification_emails
        from notifications.email_sender import send_email
        text, html = build_tutor_session_email(
            u["name"], email, topic, req.preferred_at, req.timezone,
            req.duration_minutes, req.notes)
        recipients = get_notification_emails()

        def _send_all():
            for to in recipients:
                try:
                    send_email(to, "New live tutor session request — PyMasters", text, html)
                except Exception as e:
                    print(f"[tutor] notify {to} failed: {e!r}")

        threading.Thread(target=_send_all, daemon=True).start()
    except Exception as e:
        print(f"[tutor] notification failed: {e!r}")

    return {"ok": True, "session": _row_out(row),
            "message": "Request received! You'll get a confirmation email once we schedule it."}


@router.get("/mine")
def my_sessions(caller: str = Depends(get_current_user_id)):
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT * FROM tutor_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            [caller],
        ).fetchall()
    finally:
        conn.close()
    return {"sessions": [_row_out(r) for r in rows]}


@router.post("/{session_id}/cancel")
def cancel_my_session(session_id: str, caller: str = Depends(get_current_user_id)):
    conn = _conn()
    try:
        row = conn.execute("SELECT * FROM tutor_sessions WHERE id = ?", [session_id]).fetchone()
        if not row or row["user_id"] != caller:
            # 404 for both — don't reveal other users' session ids.
            raise HTTPException(status_code=404, detail="Session not found")
        if row["status"] not in ("pending", "confirmed"):
            raise HTTPException(status_code=409, detail=f"Session is already {row['status']}.")
        conn.execute(
            "UPDATE tutor_sessions SET status='cancelled', updated_at=datetime('now') WHERE id=?",
            [session_id])
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "status": "cancelled"}


# ── Super-admin ──────────────────────────────────────────────────────────────

@router.get("/admin/list")
def admin_list_sessions(status: str = "", limit: int = 100,
                        caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    require_super_admin(caller)
    limit = max(1, min(limit, 500))
    conn = _conn()
    try:
        if status in STATUSES:
            rows = conn.execute(
                "SELECT * FROM tutor_sessions WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                [status, limit]).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tutor_sessions ORDER BY created_at DESC LIMIT ?",
                [limit]).fetchall()
    finally:
        conn.close()
    return {"sessions": [dict(r) for r in rows], "total": len(rows)}


@router.post("/admin/{session_id}/status")
def admin_set_status(session_id: str, req: StatusRequest,
                     caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin, _audit
    require_super_admin(caller)
    status = (req.status or "").strip().lower()
    if status not in ("confirmed", "cancelled", "completed"):
        raise HTTPException(status_code=422, detail="status must be confirmed, cancelled or completed.")
    note = (req.note or "").strip()[:1000]
    conn = _conn()
    try:
        row = conn.execute("SELECT * FROM tutor_sessions WHERE id = ?", [session_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        conn.execute(
            "UPDATE tutor_sessions SET status=?, admin_note=?, handled_by=?, "
            "updated_at=datetime('now') WHERE id=?",
            [status, note, caller, session_id])
        _audit(conn, caller, f"tutor.session_{status}", "tutor_session", session_id,
               {"email": row["email"], "topic": row["topic"]})
        conn.commit()
    finally:
        conn.close()

    def _send():
        try:
            from notifications.email_sender import build_tutor_status_email, send_email
            text, html = build_tutor_status_email(
                row["name"], row["topic"], row["preferred_at"], status, note)
            send_email(row["email"], f"Your PyMasters tutor session is {status}", text, html)
        except Exception as e:
            print(f"[tutor] status email failed: {e!r}")

    threading.Thread(target=_send, daemon=True).start()
    return {"ok": True, "status": status}
