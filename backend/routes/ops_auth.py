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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import create_access_token, _current_token_version

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
        "WHERE lower(COALESCE(email,'')) = ? OR username = ? LIMIT 1",
        [SERVICE_EMAIL, SERVICE_USERNAME],
    ).fetchone()
    if row is None:
        from main import hash_pw  # local import: main imports this router
        user_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (id, username, password_hash, name, email, created_at, points, "
            "unlocked_modules, preferred_language, onboarding_completed, is_super_admin) "
            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, 'en', 1, 1)",
            [user_id, SERVICE_USERNAME, hash_pw(secrets.token_urlsafe(32)), "PyMasters Ops",
             SERVICE_EMAIL, json.dumps(["module_1"])],
        )
        conn.commit()
        row = conn.execute("SELECT id, username, 1 AS is_super_admin FROM users WHERE id = ?", [user_id]).fetchone()
    elif int(row["is_super_admin"]) != 1:
        conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [row["id"]])
        conn.commit()
    return row


@router.post("/service-login")
def service_login(body: ServiceLogin):
    expected = _ops_token()
    if not expected:
        raise HTTPException(status_code=503, detail="Service login is not enabled on this deployment")
    supplied = (body.token or "").strip()
    if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        time.sleep(0.5)
        print("[ops-auth] rejected service-login attempt")
        raise HTTPException(status_code=403, detail="Invalid service token")
    conn = sqlite3.connect(_db_path())
    try:
        row = _ensure_service_account(conn)
    finally:
        conn.close()
    token = create_access_token(row["id"], row["username"], _current_token_version(row["id"]))
    print(f"[ops-auth] service-login issued for {row['username']}")
    return {"access_token": token, "token_type": "bearer", "user_id": row["id"], "username": row["username"]}
