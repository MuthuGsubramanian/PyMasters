"""
ops_auth.py — machine-to-machine super-admin session for the ops automations.

    POST /api/admin/service-login   {"token": "<OPS_ADMIN_TOKEN>"}
        → {"access_token": ..., "user_id": ..., "username": "claude-qa"}

Why: the laptop automations (weekly QA, Vaathiyaar health checks, org-request
approvals, lifecycle runs) need the super-admin API, and the only alternatives
were a human's personal password or the bootstrap `admin` account, which is
seeded only on an empty database. This issues a normal JWT for the dedicated
service account claude-qa@pymasters.net (already in SUPER_ADMIN_EMAILS),
creating it on first use with an unguessable password that nobody holds.

Safety:
  * 503 when OPS_ADMIN_TOKEN is unset (local dev / CI never expose this).
  * constant-time compare; a failed attempt sleeps briefly and is logged.
  * the issued JWT honours token_version, so POST /api/admin/users/{id}/revoke-sessions
    still invalidates it; rotate the env secret to revoke the door itself.
"""

import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import create_access_token, _current_token_version
from ratelimit import SlidingWindowRateLimiter, enforce

router = APIRouter(prefix="/api/admin", tags=["admin-ops"])

SERVICE_USERNAME = "claude-qa"
SERVICE_EMAIL = "claude-qa@pymasters.net"


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _ops_token() -> str:
    return os.getenv("OPS_ADMIN_TOKEN", "").strip()


class ServiceLogin(BaseModel):
    token: str


def _ensure_service_account(conn: sqlite3.Connection) -> sqlite3.Row:
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, username, COALESCE(is_super_admin,0) AS is_super_admin FROM users "
        "WHERE username = ? LIMIT 1",  # username only: emails are user-editable (security fix 2026-11-02)
        [SERVICE_USERNAME],
    ).fetchone()
    if row is None:
        from main import hash_pw  # local import: main imports this router
        user_id = str(uuid.uuid4())
        # OR IGNORE + re-read: two first-ever logins can race here; the loser reuses the winner's row instead
        # of failing on the username UNIQUE constraint (found by the parallel scenario suite, 2026-11-03).
        conn.execute(
            "INSERT OR IGNORE INTO users (id, username, password_hash, name, email, created_at, points, "
            "unlocked_modules, preferred_language, onboarding_completed, is_super_admin) "
            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, 'en', 1, 1)",
            [user_id, SERVICE_USERNAME, hash_pw(secrets.token_urlsafe(32)), "PyMasters Ops",
             SERVICE_EMAIL, json.dumps(["module_1"])],
        )
        conn.commit()
        row = conn.execute("SELECT id, username, COALESCE(is_super_admin,0) AS is_super_admin FROM users "
                           "WHERE username = ? LIMIT 1", [SERVICE_USERNAME]).fetchone()
        if int(row["is_super_admin"]) != 1:
            conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [row["id"]])
            conn.commit()
    elif int(row["is_super_admin"]) != 1:
        conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [row["id"]])
        conn.commit()
    return row


# Internet-facing super-admin door (security fix 2026-11-03): per-IP budget plus a global cap on failures so
# the static token can't be brute-forced from many IPs, and short-lived tokens so a leaked session expires fast.
SERVICE_LOGIN_PER_IP = SlidingWindowRateLimiter(max_calls=10, window_seconds=3600)
SERVICE_LOGIN_FAILURES = SlidingWindowRateLimiter(max_calls=20, window_seconds=3600)
SERVICE_TOKEN_TTL_SECONDS = 2 * 3600


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else "") or (request.client.host if request.client else "unknown")


@router.post("/service-login")
def service_login(body: ServiceLogin, request: Request):
    expected = _ops_token()
    if not expected:
        raise HTTPException(status_code=503, detail="Service login is not enabled on this deployment")
    enforce(SERVICE_LOGIN_PER_IP, _client_ip(request), "service-login attempts")
    if SERVICE_LOGIN_FAILURES.retry_after("global"):
        raise HTTPException(status_code=429, detail="Service login temporarily locked. Try again later.")
    supplied = (body.token or "").strip()
    if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        SERVICE_LOGIN_FAILURES.allow("global")
        time.sleep(0.5)
        print("[ops-auth] rejected service-login attempt")
        raise HTTPException(status_code=403, detail="Invalid service token")
    conn = sqlite3.connect(_db_path())
    try:
        row = _ensure_service_account(conn)
    finally:
        conn.close()
    token = create_access_token(row["id"], row["username"], _current_token_version(row["id"]),
                                 ttl_seconds=SERVICE_TOKEN_TTL_SECONDS)
    print(f"[ops-auth] service-login issued for {row['username']}")
    return {"access_token": token, "token_type": "bearer", "user_id": row["id"], "username": row["username"]}
