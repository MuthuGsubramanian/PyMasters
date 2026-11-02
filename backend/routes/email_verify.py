"""Email verification (security fix 2026-11-02, audit M4).

users.email was never verified, yet it was trusted to (a) link a GitHub/LinkedIn sign-in to an existing
account and (b) hand out super-admin-approved student plans. An attacker could put a victim's address
on their own account and later receive the victim's OAuth sign-in or student grant.

Now users.email_verified marks a proven address. It becomes 1 when:
  * the learner opens the link we email them (POST /api/auth/verify-email),
  * they complete a password reset sent to that address, or
  * the account is created by GitHub/LinkedIn sign-in with the provider's verified email.
A DB trigger resets it to 0 whenever the email changes, on every write path. OAuth links by email and
student grants require a verified address.
"""
from html import escape as _esc
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter, enforce

router = APIRouter(prefix="/api/auth", tags=["auth"])
TOKEN_HOURS = 48
_request_limiter = SlidingWindowRateLimiter(max_calls=3, window_seconds=3600)


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_schema(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "email_verified" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0")
        # Backfill: an address already confirmed by a linked OAuth identity is verified.
        try:
            conn.execute(
                "UPDATE users SET email_verified = 1 WHERE COALESCE(email,'') != '' AND lower(email) IN "
                "(SELECT lower(oi.email) FROM oauth_identities oi WHERE oi.user_id = users.id)")
        except sqlite3.OperationalError:
            pass  # oauth_identities not created yet (fresh DB)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS email_verifications (
               token TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL,
               created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER DEFAULT 0)""")
    conn.execute(
        """CREATE TRIGGER IF NOT EXISTS users_email_unverify AFTER UPDATE OF email ON users
           WHEN lower(COALESCE(NEW.email,'')) != lower(COALESCE(OLD.email,''))
           BEGIN UPDATE users SET email_verified = 0 WHERE id = NEW.id; END""")
    conn.commit()


def mark_verified(conn: sqlite3.Connection, user_id: str) -> None:
    """Set email_verified=1 and apply any approved student grant waiting for this (now proven) address."""
    conn.execute("UPDATE users SET email_verified = 1 WHERE id = ? AND COALESCE(email,'') != ''", [user_id])
    conn.commit()
    row = conn.execute("SELECT email FROM users WHERE id = ?", [user_id]).fetchone()
    if row and row[0]:
        try:
            from routes.support import apply_approved_access_grant
            apply_approved_access_grant(user_id, row[0])
        except Exception as e:  # never break verification on a grant problem
            print(f"[verify-email] grant check failed: {e!r}")


def send_verification(user_id: str) -> bool:
    """Create a token and email the verification link (background thread). Returns True if queued."""
    conn = sqlite3.connect(_db_path())
    try:
        ensure_schema(conn)
        row = conn.execute("SELECT name, email, COALESCE(email_verified,0) FROM users WHERE id = ?",
                           [user_id]).fetchone()
        if not row or not row[1] or row[2]:
            return False
        token = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        conn.execute(
            "INSERT INTO email_verifications (token, user_id, email, created_at, expires_at) VALUES (?,?,?,?,?)",
            [token, user_id, row[1].strip().lower(), now.isoformat(), (now + timedelta(hours=TOKEN_HOURS)).isoformat()])
        conn.commit()
        name, to_email = row[0] or "there", row[1].strip()
    finally:
        conn.close()
    try:
        from notifications.email_sender import send_email, APP_BASE_URL
        link = f"{APP_BASE_URL}/verify-email/{token}"
        text = (f"Vanakkam {name}! Please confirm this is your email address for PyMasters: {link}\n"
                f"The link is valid for {TOKEN_HOURS} hours. If you didn't sign up, ignore this email.")
        html = (f"<div style=\"font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px\">"
                f"<h2 style=\"color:#7c3aed\">PyMasters</h2><p style=\"color:#334155\">Vanakkam {_esc(name)}! Please confirm "
                f"this is your email address.</p><a href=\"{link}\" style=\"display:inline-block;background:#7c3aed;"
                f"color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold\">Confirm my email</a>"
                f"<p style=\"color:#64748b;font-size:13px\">Valid for {TOKEN_HOURS} hours. Didn't sign up? Ignore this email.</p></div>")
        threading.Thread(target=send_email, args=(to_email, "Confirm your PyMasters email", text, html), daemon=True).start()
        return True
    except Exception as e:
        print(f"[verify-email] send failed: {e!r}")
        return False


@router.post("/verify-email/request")
def request_verification(caller: str = Depends(get_current_user_id)):
    enforce(_request_limiter, caller, "verification emails")
    queued = send_verification(caller)
    return {"ok": True, "sent": queued}


class VerifyBody(BaseModel):
    token: str


@router.post("/verify-email")
def verify_email(body: VerifyBody):
    conn = sqlite3.connect(_db_path())
    try:
        ensure_schema(conn)
        row = conn.execute("SELECT user_id, email, expires_at, used FROM email_verifications WHERE token = ?",
                           [body.token]).fetchone()
        if not row or row[3]:
            raise HTTPException(status_code=400, detail="This verification link is invalid or has already been used.")
        if datetime.fromisoformat(row[2]) < datetime.utcnow():
            raise HTTPException(status_code=400, detail="This verification link has expired. Request a new one from your profile.")
        current = conn.execute("SELECT lower(COALESCE(email,'')) FROM users WHERE id = ?", [row[0]]).fetchone()
        conn.execute("UPDATE email_verifications SET used = 1 WHERE token = ?", [body.token])
        conn.commit()
        if not current or current[0] != row[1]:
            raise HTTPException(status_code=400, detail="Your email has changed since this link was sent. Request a new one.")
        mark_verified(conn, row[0])
        return {"ok": True}
    finally:
        conn.close()
