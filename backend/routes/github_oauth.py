"""
github_oauth.py -- "Sign in with GitHub" via OAuth 2.0.

Mirrors routes/oauth.py (LinkedIn). Fully config-gated: the flow is only
advertised/enabled when the env vars below are present, so a stock
`git clone && run` (and CI) is unaffected. To turn it on, register a GitHub
OAuth app (https://github.com/settings/developers -> "New OAuth App") and set:

    GITHUB_CLIENT_ID
    GITHUB_CLIENT_SECRET
    GITHUB_REDIRECT_URI    e.g. https://pymasters.net/api/auth/github/callback
    FRONTEND_URL           e.g. https://pymasters.net   (where to bounce back)

No secrets live in code; everything reads from the environment / Secret Manager.
The oauth_identities table is shared with the LinkedIn flow (provider column).

Prefix: /api/auth/github
"""

import os
import time
import uuid
import json
import sqlite3
import secrets as _secrets
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from jose import jwt, JWTError
from auth import create_access_token, JWT_SECRET, JWT_ALG

# Shared identity table (provider, provider_user_id, user_id, ...)
from routes.oauth import ensure_oauth_tables

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/auth/github", tags=["oauth"])

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
EMAILS_URL = "https://api.github.com/user/emails"
SCOPE = "read:user user:email"
_STATE_TTL = 600  # 10 minutes


def _cfg():
    return {
        "client_id": os.getenv("GITHUB_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("GITHUB_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("GITHUB_REDIRECT_URI", "").strip(),
        "frontend": os.getenv("FRONTEND_URL", "https://pymasters.net").rstrip("/"),
    }


def is_enabled() -> bool:
    c = _cfg()
    return bool(c["client_id"] and c["client_secret"] and c["redirect_uri"])


def _sign_state() -> str:
    payload = {"k": "gh_oauth", "n": _secrets.token_urlsafe(12), "exp": int(time.time()) + _STATE_TTL}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _verify_state(state: str) -> bool:
    try:
        p = jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALG])
        return p.get("k") == "gh_oauth"
    except JWTError:
        return False


# ── Discovery: lets the frontend decide whether to render the button ────────

@router.get("/config")
def github_config():
    return {"enabled": is_enabled(), "provider": "github"}


# ── Step 1: hand the browser a GitHub authorize URL ─────────────────────────

@router.get("/start")
def github_start():
    if not is_enabled():
        raise HTTPException(status_code=503, detail="GitHub sign-in is not configured.")
    c = _cfg()
    params = {
        "response_type": "code",
        "client_id": c["client_id"],
        "redirect_uri": c["redirect_uri"],
        "scope": SCOPE,
        "state": _sign_state(),
        "allow_signup": "true",
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


# ── Step 2: GitHub redirects back here with ?code&state ─────────────────────

@router.get("/callback")
def github_callback(code: str = Query(None), state: str = Query(None), error: str = Query(None)):
    c = _cfg()
    frontend = c["frontend"]

    def _bounce(**qs):
        return RedirectResponse(url=f"{frontend}/login?{urlencode(qs)}")

    if not is_enabled():
        raise HTTPException(status_code=503, detail="GitHub sign-in is not configured.")
    if error:
        return _bounce(gh_error="GitHub sign-in was cancelled.")
    if not code or not state or not _verify_state(state):
        return _bounce(gh_error="Invalid or expired sign-in attempt. Please try again.")

    # Exchange the code for an access token.
    try:
        tok = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": c["redirect_uri"],
                "client_id": c["client_id"],
                "client_secret": c["client_secret"],
            },
            headers={"Accept": "application/json"},
            timeout=12,
        )
        tok.raise_for_status()
        access_token = tok.json().get("access_token")
        if not access_token:
            return _bounce(gh_error="GitHub did not return an access token.")
    except Exception:
        return _bounce(gh_error="Could not complete GitHub sign-in. Please try again.")

    auth_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "PyMasters",
    }

    # Fetch the GitHub profile.
    try:
        ur = requests.get(USER_URL, headers=auth_headers, timeout=12)
        ur.raise_for_status()
        info = ur.json()
    except Exception:
        return _bounce(gh_error="Could not read your GitHub profile. Please try again.")

    sub = str(info.get("id") or "").strip()
    if not sub:
        return _bounce(gh_error="GitHub profile was missing an identifier.")
    login_name = info.get("login") or ""
    name = info.get("name") or login_name or "GitHub User"
    picture = info.get("avatar_url") or ""
    email = (info.get("email") or "").strip().lower()

    # GitHub often hides the primary email on /user; pull it from /user/emails.
    if not email:
        try:
            er = requests.get(EMAILS_URL, headers=auth_headers, timeout=12)
            if er.ok:
                emails = er.json() or []
                primary = next(
                    (e for e in emails if e.get("primary") and e.get("verified")), None
                ) or next((e for e in emails if e.get("verified")), None)
                if primary:
                    email = (primary.get("email") or "").strip().lower()
        except Exception:
            pass

    ensure_oauth_tables()
    user_id, is_new, username, onboarding = _upsert_github_user(sub, email, name, picture, login_name)

    # Issue our own session JWT (same mechanism as password login).
    conn = sqlite3.connect(DB_PATH)
    try:
        tv = conn.execute(
            "SELECT COALESCE(token_version,0) FROM users WHERE id=?", [user_id]
        ).fetchone()
        token_version = tv[0] if tv else 0
    finally:
        conn.close()
    token = create_access_token(user_id, username, token_version)

    return _bounce(gh_token=token, gh_new=("1" if is_new else "0"),
                   onboarding=("1" if onboarding else "0"))


def _upsert_github_user(sub: str, email: str, name: str, picture: str, login_name: str):
    """Find-or-create a user for this GitHub identity. Links by provider id
    first, then by verified email, otherwise creates a fresh learner account."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        # 1) Already linked?
        row = cur.execute(
            "SELECT user_id FROM oauth_identities WHERE provider='github' AND provider_user_id=?",
            [sub],
        ).fetchone()
        if row:
            uid = row[0]
            u = cur.execute(
                "SELECT username, COALESCE(onboarding_completed,0) FROM users WHERE id=?", [uid]
            ).fetchone()
            if u:
                return uid, False, u[0], bool(u[1])

        # 2) Existing account with this email? Link it.
        if email:
            u = cur.execute(
                "SELECT id, username, COALESCE(onboarding_completed,0) FROM users WHERE LOWER(email)=?",
                [email],
            ).fetchone()
            if u:
                cur.execute(
                    "INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id, email) "
                    "VALUES ('github', ?, ?, ?)",
                    [sub, u[0], email],
                )
                conn.commit()
                return u[0], False, u[1], bool(u[2])

        # 3) Create a new learner.
        uid = str(uuid.uuid4())
        base = login_name or (email.split("@")[0] if email else "github") or "member"
        base = "".join(ch for ch in base if ch.isalnum() or ch in "._-")[:20] or "member"
        username = base
        while cur.execute("SELECT 1 FROM users WHERE username=?", [username]).fetchone():
            username = f"{base}-{_secrets.token_hex(2)}"
        cur.execute(
            "INSERT INTO users (id, username, password_hash, name, email, created_at, points, "
            "unlocked_modules, preferred_language, onboarding_completed, account_type, avatar_url) "
            "VALUES (?, ?, '', ?, ?, CURRENT_TIMESTAMP, 50, ?, 'en', 0, 'individual', ?)",
            [uid, username, name, email, json.dumps(["module_1"]), picture],
        )
        cur.execute(
            "INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id, email) "
            "VALUES ('github', ?, ?, ?)",
            [sub, uid, email],
        )
        conn.commit()
        return uid, True, username, False
    finally:
        conn.close()
