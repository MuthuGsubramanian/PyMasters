"""
auth.py — real JWT authentication.

Issues signed access tokens at login/register and verifies them on protected
endpoints. Privileged endpoints derive the acting user from the verified token
(never from a client-supplied user_id), which closes the forged-user_id hole.
"""

import os
import time

from fastapi import Header, HTTPException
from jose import jwt, JWTError

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def create_access_token(user_id: str, username: str = None) -> str:
    now = int(time.time())
    payload = {"sub": str(user_id), "username": username, "iat": now, "exp": now + JWT_TTL_SECONDS}
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
