"""OAuth `state` bound to the browser that started sign-in (login-CSRF guard, security review M2, 2026-11-05).

/start signs a state carrying a random nonce and sets the same nonce in an HttpOnly cookie scoped to the
provider's /api/auth/<provider> path. The callback accepts the state only when that cookie matches, so a
callback link produced by someone else's browser cannot sign the visitor into someone else's account.
SameSite=Lax still sends the cookie on the provider's top-level redirect back to /callback.
"""
import hmac
import secrets
import time

import jwt
from fastapi import Response
from jwt import PyJWTError as JWTError

from auth import JWT_ALG, JWT_SECRET

STATE_TTL = 600  # 10 minutes


def _cookie(provider: str) -> str:
    return f"pm_oauth_{provider}"


def _path(provider: str) -> str:
    return f"/api/auth/{provider}"


def issue_state(kind: str, provider: str, response: Response) -> str:
    """Signed state for the authorize URL; sets the matching nonce cookie on `response`."""
    nonce = secrets.token_urlsafe(16)
    state = jwt.encode({"k": kind, "n": nonce, "exp": int(time.time()) + STATE_TTL}, JWT_SECRET, algorithm=JWT_ALG)
    response.set_cookie(_cookie(provider), nonce, max_age=STATE_TTL, path=_path(provider),
                        httponly=True, secure=True, samesite="lax")
    return state


def state_matches(state: str | None, kind: str, cookie_nonce: str | None) -> bool:
    if not state or not cookie_nonce:
        return False
    try:
        payload = jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        return False
    nonce = payload.get("n")
    return (payload.get("k") == kind and isinstance(nonce, str)
            and hmac.compare_digest(nonce.encode(), cookie_nonce.encode()))


def clear_nonce(provider: str, response: Response) -> Response:
    """Single use: drop the nonce cookie once the callback has looked at it."""
    response.delete_cookie(_cookie(provider), path=_path(provider), httponly=True, secure=True, samesite="lax")
    return response


def cookie_name(provider: str) -> str:
    return _cookie(provider)
