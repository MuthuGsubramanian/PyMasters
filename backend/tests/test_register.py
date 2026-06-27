"""Regression tests for /api/auth/register.

Locks in the fix for the production 500: every signup must succeed (or return a
clean 4xx) without depending on passlib's broken bcrypt 4.x version detection,
and organization signups must persist the org row + super_admin membership in
the same transaction as the user row.
"""
import os
import sys
import json
import sqlite3
import tempfile
import importlib

import pytest


@pytest.fixture()
def app_module(monkeypatch):
    """Boot a fresh import of `main` against a temp SQLite DB so each test
    starts from a clean slate. Returns the imported module."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)
    os.remove(db_path)

    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    if "main" in sys.modules:
        m = importlib.reload(sys.modules["main"])
    else:
        import main as m  # noqa: WPS433
    m.init_db()
    yield m

    try:
        os.remove(db_path)
    except OSError:
        pass


def test_minimal_register_returns_user_and_token(app_module):
    m = app_module
    r = m.register(m.UserRegister(username="alice", password="hunter22pw"))
    assert r["username"] == "alice"
    assert r["account_type"] == "individual"
    assert r["token"], "must return a session token"
    assert r["organization"] is None


def test_password_is_bcrypt_not_sha256(app_module):
    """The whole point of the fix: NEW passwords must land as bcrypt hashes
    even in environments where passlib's bcrypt backend can't initialize."""
    m = app_module
    m.register(m.UserRegister(username="bob", password="hunter22pw"))
    conn = sqlite3.connect(os.environ["DB_PATH"])
    try:
        row = conn.execute("SELECT password_hash FROM users WHERE username = ?", ["bob"]).fetchone()
    finally:
        conn.close()
    assert row is not None
    assert row[0].startswith("$2"), f"expected bcrypt hash, got: {row[0][:8]}..."


def test_duplicate_username_returns_4xx_not_500(app_module):
    """The reported bug: duplicates also 500'd because the insert never reached.
    Post-fix: clean 409 on duplicate."""
    m = app_module
    from fastapi import HTTPException

    m.register(m.UserRegister(username="carol", password="hunter22pw"))
    with pytest.raises(HTTPException) as exc:
        m.register(m.UserRegister(username="carol", password="hunter22pw"))
    assert 400 <= exc.value.status_code < 500
    assert "already" in (exc.value.detail or "").lower()


def test_organization_signup_persists_org_and_membership(app_module):
    """Org details must round-trip through register() into organizations +
    org_members in one shot — no orphan accounts on partial failure."""
    m = app_module
    r = m.register(m.UserRegister(
        username="dana", password="hunter22pw",
        name="Dana Admin", email="dana@acme.test",
        account_type="organization",
        organization_name="Acme Corp",
        organization_type="enterprise",
        organization_domain="acme.test",
    ))
    assert r["account_type"] == "organization"
    assert r["organization"] is not None
    assert r["organization"]["name"] == "Acme Corp"
    assert r["organization"]["type"] == "enterprise"
    assert r["organization"]["domain"] == "acme.test"
    assert r["organization"]["role"] == "super_admin"

    conn = sqlite3.connect(os.environ["DB_PATH"])
    try:
        org = conn.execute(
            "SELECT name, type, domain FROM organizations WHERE id = ?",
            [r["organization"]["id"]],
        ).fetchone()
        member = conn.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [r["organization"]["id"], r["id"]],
        ).fetchone()
    finally:
        conn.close()
    assert org == ("Acme Corp", "enterprise", "acme.test")
    assert member == ("super_admin",)


def test_organization_signup_without_org_name_is_4xx(app_module):
    """If the client picks 'organization' but doesn't send a name, we'd rather
    surface a clear 4xx than silently downgrade to individual."""
    m = app_module
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        m.register(m.UserRegister(
            username="erin", password="hunter22pw",
            account_type="organization",
            organization_name="   ",  # whitespace-only
        ))
    assert exc.value.status_code == 400
    assert "organization" in (exc.value.detail or "").lower()


def test_register_then_login_roundtrip(app_module):
    """End-to-end: a freshly registered user must be able to log in."""
    m = app_module
    m.register(m.UserRegister(username="frank", password="hunter22pw"))
    login_resp = m.login(m.UserLogin(username="frank", password="hunter22pw"))
    assert login_resp["id"]
    assert login_resp["token"]
