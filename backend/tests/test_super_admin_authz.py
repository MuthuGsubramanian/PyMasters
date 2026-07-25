"""
Phase 1 regression: super-admin privilege escalation.

Two exploits must be closed:
  1. Register with username "muthu@pymasters.net" and reach /api/admin/users.
  2. Register normally, then PUT an owner email into your own profile settings to
     flip a 403 into a 200.

Authorization must key ONLY off the users.is_super_admin column. The email/username
string-match "break glass" fallback is removed. SUPER_ADMIN_EMAILS is resolved into
the column at startup (email match only), which also keeps the real owner working.
"""
import importlib
import os
import sqlite3
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module

OWNER_EMAIL = "muthu@pymasters.net"


def _headers(user_id):
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    # routes.admin / routes.profile freeze DB_PATH at import time; reload them
    # (and auth) before main so the app's routers bind to this test's temp DB.
    import routes.admin as admin_mod
    import routes.profile as profile_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(profile_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _insert_user(user_id, username, email="", is_super=0):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, email, is_super_admin) "
        "VALUES (?, ?, 'hash', ?, ?, ?)",
        [user_id, username, username, email, is_super],
    )
    conn.commit()
    conn.close()


# --- Exploit 1: username that looks like the owner email -------------------------

def test_exploit1_registering_owner_username_is_rejected(m):
    """A username containing '@' (so it can never resemble an email) is refused,
    and a reserved identifier is refused regardless. Either way: 4xx, no account."""
    with pytest.raises(HTTPException) as exc:
        m.register(m.UserRegister(username=OWNER_EMAIL, password="hunter22pw"))
    assert 400 <= exc.value.status_code < 500


def test_username_with_at_sign_is_rejected(m):
    with pytest.raises(HTTPException) as exc:
        m.register(m.UserRegister(username="a@b.com", password="hunter22pw"))
    assert exc.value.status_code == 422


# --- Exploit 2: flip own profile email to the owner address ----------------------

def test_exploit2_profile_email_change_to_owner_is_rejected(m, client):
    """Setting your own email to a reserved super-admin address must be refused."""
    r = m.register(m.UserRegister(username="mallory", password="hunter22pw"))
    uid = r["id"]
    resp = client.put(
        f"/api/profile/{uid}/settings",
        json={"email": OWNER_EMAIL},
        headers=_headers(uid),
    )
    assert resp.status_code == 400
    # And the email was NOT written.
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute("SELECT email, COALESCE(is_super_admin,0) FROM users WHERE id=?", [uid]).fetchone()
    conn.close()
    assert row[0] != OWNER_EMAIL
    assert row[1] == 0


def test_email_string_match_does_not_grant_admin(client):
    """Even if a row carries the owner email but is_super_admin=0 (the old
    break-glass path), admin endpoints must return 403 — column is the only truth."""
    _insert_user("imposter", "imposter", email=OWNER_EMAIL, is_super=0)
    resp = client.get("/api/admin/users", headers=_headers("imposter"))
    assert resp.status_code == 403


# --- Owner still works -----------------------------------------------------------

def test_owner_with_column_set_is_authorized(client):
    _insert_user("owner", "owner", email=OWNER_EMAIL, is_super=1)
    resp = client.get("/api/admin/users", headers=_headers("owner"))
    assert resp.status_code == 200


def test_startup_resolver_sets_owner_column(m):
    """A pre-existing owner row with is_super_admin=0 must be promoted to 1 by the
    startup resolver — this is what prevents lockout on deploy after break-glass
    removal (Phase 0 safety mechanism)."""
    _insert_user("preexisting-owner", "preowner", email=OWNER_EMAIL, is_super=0)
    m.init_db()  # re-run startup; resolver must promote the row
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute(
        "SELECT COALESCE(is_super_admin,0) FROM users WHERE id=?", ["preexisting-owner"]
    ).fetchone()
    conn.close()
    assert row[0] == 1


def test_resolver_matches_email_not_username(m):
    """A user whose USERNAME equals an owner email string must NOT be promoted —
    only the email column is matched (usernames can no longer contain '@' anyway)."""
    _insert_user("uname-owner", "someusername", email="", is_super=0)
    # Directly set a username equal to an owner email to simulate a legacy row.
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET username=? WHERE id=?", [OWNER_EMAIL, "uname-owner"])
    conn.commit()
    conn.close()
    m.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute(
        "SELECT COALESCE(is_super_admin,0) FROM users WHERE id=?", ["uname-owner"]
    ).fetchone()
    conn.close()
    assert row[0] == 0


# --- Admin edit path also rejects reserved email ---------------------------------

def test_admin_edit_user_cannot_set_reserved_email(client):
    _insert_user("owner2", "owner2", email=OWNER_EMAIL, is_super=1)
    _insert_user("victim", "victim", email="", is_super=0)
    resp = client.patch(
        "/api/admin/users/victim",
        json={"email": OWNER_EMAIL},
        headers=_headers("owner2"),
    )
    assert resp.status_code == 400


# --- Protective guards for reserved (env-managed) owner accounts -----------------

def test_reserved_owner_cannot_be_deleted(client):
    _insert_user("boss", "boss", email="muthu.g.subramanian@gmail.com", is_super=1)
    _insert_user("target-owner", "targetowner", email=OWNER_EMAIL, is_super=1)
    resp = client.delete("/api/admin/users/target-owner", headers=_headers("boss"))
    assert resp.status_code == 400


def test_reserved_owner_super_admin_not_toggleable_via_console(client):
    _insert_user("boss2", "boss2", email="muthu.g.subramanian@gmail.com", is_super=1)
    _insert_user("target-owner2", "targetowner2", email=OWNER_EMAIL, is_super=1)
    resp = client.post(
        "/api/admin/users/target-owner2/super-admin",
        json={"value": False},
        headers=_headers("boss2"),
    )
    assert resp.status_code == 400
