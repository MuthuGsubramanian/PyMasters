"""
auth.py — real JWT authentication.

Issues signed access tokens at login/register and verifies them on protected
endpoints. Privileged endpoints derive the acting user from the verified token
(never from a client-supplied user_id), which closes the forged-user_id hole.
"""

import os
import sqlite3
import time

from fastapi import Header, HTTPException
from jose import jwt, JWTError

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days

def _get_db_path():
    """Resolved at call time, not import time (same pattern as
    routes/notifications.py): tests repoint DB_PATH to a temp DB after this
    module is imported, and an import-time binding would validate token
    versions against the stale path."""
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

_INSECURE_DEFAULT = "dev-insecure-secret-change-me"
_MIN_SECRET_LEN = 16


def is_production() -> bool:
    """True when running on Cloud Run (which injects K_SERVICE), false locally."""
    return bool(os.getenv("K_SERVICE"))


def assert_secret_is_safe(secret: str, is_production: bool) -> None:
    """
    Fail closed in production: a blank, default, or too-short signing secret lets
    anyone forge tokens (including super-admin). Locally we stay permissive so
    `git clone && run` just works.
    """
    if not is_production:
        return
    if not secret or secret == _INSECURE_DEFAULT or len(secret) < _MIN_SECRET_LEN:
        raise RuntimeError(
            "JWT_SECRET is missing, default, or too short. Set a strong JWT_SECRET "
            "(e.g. `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`) "
            "before deploying. Refusing to start with a forgeable signing key."
        )


# Enforce at import time so a misconfigured deploy fails fast instead of silently
# issuing forgeable tokens.
assert_secret_is_safe(JWT_SECRET, is_production())


def _current_token_version(user_id: str):
    """Returns the user's current token_version, or None if the user row is missing."""
    try:
        conn = sqlite3.connect(_get_db_path())
        try:
            row = conn.execute(
                "SELECT COALESCE(token_version, 0) FROM users WHERE id = ?", [user_id]
            ).fetchone()
        finally:
            conn.close()
        return int(row[0]) if row else None
    except Exception:
        # Fail-open only for tv=0 tokens: a revoked token has tv>=1 so it is still rejected.
        # DB being unavailable means the app is broken anyway.
        return 0


def create_access_token(user_id: str, username: str = None, token_version: int = 0) -> str:
    now = int(time.time())
    payload = {"sub": str(user_id), "username": username, "tv": int(token_version or 0),
               "iat": now, "exp": now + JWT_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def _extract(authorization: str) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    current = _current_token_version(sub)
    if current is None:
        raise HTTPException(status_code=401, detail="Account no longer exists.")
    if int(payload.get("tv") or 0) != current:
        raise HTTPException(status_code=401, detail="Session ended. Please sign in again.")
    return sub


def get_current_user_id(authorization: str = Header(None)) -> str:
    """FastAPI dependency: returns the authenticated user id from a verified JWT."""
    return _extract(authorization)


def optional_user_id(authorization: str = Header(None)) -> str | None:
    """Like get_current_user_id but returns None instead of raising when absent/invalid."""
    try:
        return _extract(authorization)
    except HTTPException:
        return None
