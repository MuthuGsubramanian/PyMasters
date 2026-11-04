"""
oauth.py -- "Sign in with LinkedIn" via OpenID Connect.

Fully config-gated: the flow is only advertised/enabled when the three env vars
below are present, so a stock `git clone && run` (and CI) is unaffected. To turn
it on, register a LinkedIn app (https://www.linkedin.com/developers/apps) with
the "Sign In with LinkedIn using OpenID Connect" product and set:

    LINKEDIN_CLIENT_ID
    LINKEDIN_CLIENT_SECRET
    LINKEDIN_REDIRECT_URI   e.g. https://pymasters.net/api/auth/linkedin/callback
    FRONTEND_URL            e.g. https://pymasters.net   (where to bounce back)

No secrets live in code; everything reads from the environment / Secret Manager.

Prefix: /api/auth/linkedin
"""

import os
import uuid
import json
import sqlite3
import secrets as _secrets
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Cookie, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from routes.oauth_state import clear_nonce, cookie_name, issue_state, state_matches
from auth import create_access_token, _is_blocked

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/auth/linkedin", tags=["oauth"])

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
SCOPE = "openid profile email"


def _cfg():
    return {
        "client_id": os.getenv("LINKEDIN_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("LINKEDIN_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("LINKEDIN_REDIRECT_URI", "").strip(),
        "frontend": os.getenv("FRONTEND_URL", "https://pymasters.net").rstrip("/"),
    }


def is_enabled() -> bool:
    c = _cfg()
    return bool(c["client_id"] and c["client_secret"] and c["redirect_uri"])


def ensure_oauth_tables(db_path: str = None):
    conn = sqlite3.connect(db_path or DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS oauth_identities (
                provider         TEXT NOT NULL,
                provider_user_id TEXT NOT NULL,
                user_id          TEXT NOT NULL,
                email            TEXT DEFAULT '',
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (provider, provider_user_id)
            )
        """)
        conn.commit()
    finally:
        conn.close()


# ── Discovery: lets the frontend decide whether to render the button ────────

@router.get("/config")
def linkedin_config():
    return {"enabled": is_enabled(), "provider": "linkedin"}


# ── Step 1: hand the browser a LinkedIn authorize URL ───────────────────────

@router.get("/start")
def linkedin_start(response: Response):
    if not is_enabled():
        raise HTTPException(status_code=503, detail="LinkedIn sign-in is not configured.")
    c = _cfg()
    params = {
        "response_type": "code",
        "client_id": c["client_id"],
        "redirect_uri": c["redirect_uri"],
        "scope": SCOPE,
        "state": issue_state("li_oauth", "linkedin", response),
    }
    return {"authorize_url": f"{AUTHORIZE_URL}?{urlencode(params)}"}


# ── Step 2: LinkedIn redirects back here with ?code&state ───────────────────

@router.get("/callback")
def linkedin_callback(code: str = Query(None), state: str = Query(None), error: str = Query(None),
                      nonce: str = Cookie(None, alias=cookie_name("linkedin"))):
    c = _cfg()
    frontend = c["frontend"]

    def _bounce(**qs):
        # Fragment, not query (audit L2): the 30-day JWT must not land in proxy access logs or Referer
        # headers; browsers never send the #fragment to a server.
        return clear_nonce("linkedin", RedirectResponse(url=f"{frontend}/login#{urlencode(qs)}"))

    if not is_enabled():
        raise HTTPException(status_code=503, detail="LinkedIn sign-in is not configured.")
    if error:
        return _bounce(li_error="LinkedIn sign-in was cancelled.")
    # The state must come back to the browser that started sign-in (login CSRF, review M2).
    if not code or not state_matches(state, "li_oauth", nonce):
        return _bounce(li_error="Invalid or expired sign-in attempt. Please try again.")

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
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=12,
        )
        tok.raise_for_status()
        access_token = tok.json().get("access_token")
        if not access_token:
            return _bounce(li_error="LinkedIn did not return an access token.")
    except Exception:
        return _bounce(li_error="Could not complete LinkedIn sign-in. Please try again.")

    # Fetch the OpenID userinfo.
    try:
        ui = requests.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=12
        )
        ui.raise_for_status()
        info = ui.json()
    except Exception:
        return _bounce(li_error="Could not read your LinkedIn profile. Please try again.")

    sub = info.get("sub")
    email = (info.get("email") or "").strip().lower()
    name = info.get("name") or (info.get("given_name", "") + " " + info.get("family_name", "")).strip() or "LinkedIn User"
    picture = info.get("picture") or ""
    if not sub:
        return _bounce(li_error="LinkedIn profile was missing an identifier.")

    ensure_oauth_tables()
    user_id, is_new, username, onboarding = _upsert_linkedin_user(sub, email, name, picture)
    if _is_blocked(user_id):
        return _bounce(li_error="This account has been suspended. Contact support.")

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

    return _bounce(li_token=token, li_new=("1" if is_new else "0"),
                   onboarding=("1" if onboarding else "0"))


def _upsert_linkedin_user(sub: str, email: str, name: str, picture: str):
    """Find-or-create a user for this LinkedIn identity. Links by provider id
    first, then by verified email, otherwise creates a fresh learner account."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        # 1) Already linked?
        row = cur.execute(
            "SELECT user_id FROM oauth_identities WHERE provider='linkedin' AND provider_user_id=?",
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
                "SELECT id, username, COALESCE(onboarding_completed,0) FROM users WHERE LOWER(email)=? "
                "AND COALESCE(email_verified,0)=1",  # only link to a PROVEN address (audit M4)
                [email],
            ).fetchone()
            if u:
                cur.execute(
                    "INSERT OR IGNORE INTO oauth_identities (provider, provider_user_id, user_id, email) "
                    "VALUES ('linkedin', ?, ?, ?)",
                    [sub, u[0], email],
                )
                conn.commit()
                return u[0], False, u[1], bool(u[2])

        # 3) Create a new learner.
        uid = str(uuid.uuid4())
        base = (email.split("@")[0] if email else "linkedin") or "member"
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
            "VALUES ('linkedin', ?, ?, ?)",
            [sub, uid, email],
        )
        conn.commit()
        if email:
            # The provider verified this address, so the new account's email is proven (audit M4); this
            # also applies any approved student grant waiting for it.
            try:
                from routes.email_verify import mark_verified
                mark_verified(conn, uid)
            except Exception as e:
                print(f"[oauth] verify mark failed: {e!r}")
        return uid, True, username, False
    finally:
        conn.close()
