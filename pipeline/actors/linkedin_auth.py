"""LinkedIn token management — keep a valid access token without manual rotation.

LinkedIn access tokens expire (~60 days) but approved apps also get a refresh
token (~365 days) that can be exchanged for a fresh access token. This module
caches tokens in pipeline/.linkedin_tokens.json (gitignored) and auto-refreshes
before they expire, so the daily poster never silently dies on an expired token.

Required env (one-time, see LINKEDIN_SETUP.md):
  LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET   — your LinkedIn app credentials
  LINKEDIN_REFRESH_TOKEN                        — initial refresh token (seeds the store)
  LINKEDIN_ACCESS_TOKEN                         — initial access token (optional; seeds the store)

If no refresh token / client creds are available, falls back to the raw
LINKEDIN_ACCESS_TOKEN (which will then expire ~60 days out — refresh is preferred).
"""

import os
import json
import time
import urllib.parse
import urllib.request
import urllib.error

from pipeline.utils.logger import get_logger

log = get_logger("actor.linkedin.auth")

TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
STORE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".linkedin_tokens.json")
REFRESH_SKEW = 3 * 24 * 3600  # refresh when <3 days of access-token life remain


def _load_store() -> dict:
    try:
        with open(STORE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_store(store: dict) -> None:
    try:
        with open(STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2)
    except OSError as e:
        log.error(f"Could not write token store: {e}")


def _seed_from_env(store: dict) -> dict:
    """Seed the store from env on first run (or pick up a freshly-pasted token)."""
    changed = False
    env_access = os.getenv("LINKEDIN_ACCESS_TOKEN")
    env_refresh = os.getenv("LINKEDIN_REFRESH_TOKEN")
    if env_refresh and store.get("refresh_token") != env_refresh:
        store["refresh_token"] = env_refresh
        changed = True
    if env_access and not store.get("access_token"):
        store["access_token"] = env_access
        store.setdefault("expires_at", time.time() + 50 * 24 * 3600)  # assume ~50d if unknown
        changed = True
    if changed:
        _save_store(store)
    return store


def _refresh(refresh_token: str, client_id: str, client_secret: str) -> dict | None:
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body
    except urllib.error.HTTPError as e:
        log.error(f"Token refresh failed: HTTP {e.code} {e.read().decode('utf-8','ignore')[:200]}")
    except Exception as e:
        log.error(f"Token refresh failed: {e}")
    return None


def get_access_token(force_refresh: bool = False) -> str | None:
    """Return a currently-valid access token, refreshing if needed/possible."""
    store = _seed_from_env(_load_store())
    now = time.time()

    if not force_refresh and store.get("access_token") and store.get("expires_at", 0) > now + REFRESH_SKEW:
        return store["access_token"]

    refresh_token = store.get("refresh_token") or os.getenv("LINKEDIN_REFRESH_TOKEN")
    client_id = os.getenv("LINKEDIN_CLIENT_ID")
    client_secret = os.getenv("LINKEDIN_CLIENT_SECRET")

    if refresh_token and client_id and client_secret:
        body = _refresh(refresh_token, client_id, client_secret)
        if body and body.get("access_token"):
            store["access_token"] = body["access_token"]
            store["expires_at"] = now + int(body.get("expires_in", 60 * 24 * 3600))
            if body.get("refresh_token"):  # LinkedIn rotates refresh tokens
                store["refresh_token"] = body["refresh_token"]
            _save_store(store)
            log.info("Refreshed LinkedIn access token.")
            return store["access_token"]
        log.error("Refresh attempted but no token returned.")

    # Last resort: whatever we have (raw env token or a still-cached one).
    return store.get("access_token") or os.getenv("LINKEDIN_ACCESS_TOKEN")
