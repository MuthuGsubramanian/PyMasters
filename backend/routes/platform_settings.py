"""
platform_settings.py — persisted platform configuration (super-admin editable).

First consumer: the support/tutor notification recipient list. Everything else
in the app is env-var configured; this table exists for the small set of values
the owner wants to change from the console without a redeploy. Values are JSON
strings keyed by a short name.
"""

import json
import os
import re
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

# Fallback when no super admin has saved a list yet: env override, then the
# owner addresses (same pair the rest of the platform treats as break-glass).
DEFAULT_NOTIFICATION_EMAILS = [
    e.strip()
    for e in os.getenv(
        "NOTIFY_EMAILS", "muthu@pymasters.net,muthu.g.subramanian@gmail.com"
    ).split(",")
    if e.strip()
]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_platform_settings_table(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS platform_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_by TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


def get_setting(key: str, default=None):
    """Read a JSON setting value; returns `default` on any failure."""
    try:
        conn = sqlite3.connect(_db_path())
        row = conn.execute(
            "SELECT value FROM platform_settings WHERE key = ?", [key]
        ).fetchone()
        conn.close()
        if row is None:
            return default
        return json.loads(row[0])
    except Exception:
        return default


def set_setting(key: str, value, actor: str = None):
    ensure_platform_settings_table()
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            "INSERT INTO platform_settings (key, value, updated_by, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
            "updated_by = excluded.updated_by, updated_at = excluded.updated_at",
            [key, json.dumps(value), actor, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")],
        )
        conn.commit()
    finally:
        conn.close()


def get_notification_emails() -> list:
    """Recipients for support / tutor-session notifications."""
    emails = get_setting("notification_emails")
    if isinstance(emails, list):
        cleaned = [str(e).strip() for e in emails if str(e).strip()]
        if cleaned:
            return cleaned
    return list(DEFAULT_NOTIFICATION_EMAILS)


class NotificationEmailsRequest(BaseModel):
    emails: list


@router.get("/notification-emails")
def read_notification_emails(caller: str = Depends(get_current_user_id)):
    from routes.admin import require_super_admin
    require_super_admin(caller)
    return {
        "emails": get_notification_emails(),
        "defaults": list(DEFAULT_NOTIFICATION_EMAILS),
        "customized": isinstance(get_setting("notification_emails"), list),
    }


@router.put("/notification-emails")
def write_notification_emails(
    req: NotificationEmailsRequest, caller: str = Depends(get_current_user_id)
):
    from routes.admin import require_super_admin, _audit, _conn
    require_super_admin(caller)
    emails = [str(e).strip() for e in (req.emails or []) if str(e).strip()]
    if not emails:
        raise HTTPException(status_code=422, detail="At least one recipient email is required.")
    if len(emails) > 10:
        raise HTTPException(status_code=422, detail="At most 10 recipient emails are allowed.")
    for e in emails:
        if not _EMAIL_RE.match(e):
            raise HTTPException(status_code=422, detail=f"Invalid email address: {e}")
    set_setting("notification_emails", emails, actor=caller)
    conn = _conn()
    try:
        _audit(conn, caller, "settings.notification_emails", "setting",
               "notification_emails", {"emails": emails})
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "emails": emails}
