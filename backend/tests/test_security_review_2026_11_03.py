"""Fixes from the 2026-11-03 security review.

- Blocked accounts: every authenticated request is refused (OAuth-minted sessions included).
- Founder accounts can't be re-addressed, reset, blocked or deleted by another admin (takeover chain).
- /api/admin/service-login is rate limited and issues short-lived (2 h) tokens.
- User-controlled text is HTML-escaped in outgoing emails.
"""
import importlib
import os
import sqlite3
import sys

import jwt
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FOUNDER_ID = "d0a0ee52-b490-4912-b0b2-3103f559a2a6"


@pytest.fixture
def env(tmp_path, monkeypatch):
    db = str(tmp_path / "sec.db")
    monkeypatch.setenv("DB_PATH", db)
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "ops-token-abc")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import auth as auth_module
    import routes.admin as admin_mod
    import routes.ops_auth as ops_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(ops_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return TestClient(main_mod.app), db


def _ops_token(client):
    r = client.post("/api/admin/service-login", json={"token": "ops-token-abc"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_blocked_user_session_is_refused(env):
    client, db = env
    r = client.post("/api/auth/register", json={"username": "blockme", "email": "blockme@example.com",
                                                 "password": "LongEnough123!"})
    assert r.status_code == 200, r.text
    tok, uid = r.json()["token"], r.json()["id"]
    # The shared auth dependency every protected route uses (some routers cache their DB path at import,
    # so assert on the dependency itself rather than one router's endpoint).
    import auth
    from fastapi import HTTPException
    assert auth.get_current_user_id(f"Bearer {tok}") == uid
    conn = sqlite3.connect(db)
    conn.execute("UPDATE users SET is_blocked = 1 WHERE id = ?", [uid])
    conn.commit()
    conn.close()
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user_id(f"Bearer {tok}")
    assert exc.value.status_code == 403


@pytest.mark.parametrize("call", [
    lambda c, h: c.patch(f"/api/admin/users/{FOUNDER_ID}", json={"email": "attacker@evil.example"}, headers=h),
    lambda c, h: c.post(f"/api/admin/users/{FOUNDER_ID}/reset-password", headers=h),
    lambda c, h: c.delete(f"/api/admin/users/{FOUNDER_ID}", headers=h),
    lambda c, h: c.post(f"/api/admin/users/{FOUNDER_ID}/block", json={"blocked": True}, headers=h),
])
def test_other_admins_cannot_take_over_founder_accounts(env, call):
    client, _ = env
    h = {"Authorization": f"Bearer {_ops_token(client)}"}
    assert call(client, h).status_code == 403


def test_service_token_is_short_lived(env):
    client, _ = env
    payload = jwt.decode(_ops_token(client), options={"verify_signature": False})
    assert payload["exp"] - payload["iat"] == 2 * 3600


def test_service_login_is_rate_limited(env):
    client, _ = env
    import routes.ops_auth as ops_mod
    ops_mod.SERVICE_LOGIN_PER_IP.reset("testclient")
    codes = [client.post("/api/admin/service-login", json={"token": "ops-token-abc"}).status_code
             for _ in range(12)]
    assert codes[:10] == [200] * 10 and 429 in codes[10:], codes


def test_email_html_escapes_user_text():
    from notifications.email_sender import build_reset_email, build_support_notification_email
    _, html = build_reset_email('<a href="https://evil.example">Secure your account</a>', "https://pymasters.net/r/x")
    assert '<a href="https://evil.example">' not in html and "&lt;a href=" in html
    _, html = build_support_notification_email("issue", "<b>x</b>", "a@b.co", "<script>alert(1)</script>")
    assert "<script>" not in html and "&lt;script&gt;" in html and "&lt;a@b.co&gt;" in html
