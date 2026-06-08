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

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _current_token_version(user_id: str):
    """Returns the user's current token_version, or None if the user row is missing."""
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute("SELECT COALESCE(token_version, 0) FROM users WHERE id = ?", [user_id]).fetchone()
        conn.close()
        return int(row[0]) if row else None
    except Exception:
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
