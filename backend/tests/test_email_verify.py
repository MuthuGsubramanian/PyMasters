"""Audit M4 (2026-11-02): unverified emails must not link OAuth sign-ins; changing email un-verifies."""
import importlib
import os
import sqlite3

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _register(client, username, email):
    r = client.post("/api/auth/register", json={"username": username, "password": "pw123456", "name": "T", "email": email})
    assert r.status_code == 200, r.text
    return r.json()


def _db():
    return sqlite3.connect(os.environ["DB_PATH"])


def test_verify_link_marks_email_verified(client):
    u = _register(client, "alice1", "alice@example.com")
    c = _db(); token = c.execute("SELECT token FROM email_verifications WHERE user_id=?", [u["id"]]).fetchone()[0]; c.close()
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    c = _db(); assert c.execute("SELECT email_verified FROM users WHERE id=?", [u["id"]]).fetchone()[0] == 1
    # changing the email un-verifies it (trigger covers every write path)
    c.execute("UPDATE users SET email='other@example.com' WHERE id=?", [u["id"]]); c.commit()
    assert c.execute("SELECT email_verified FROM users WHERE id=?", [u["id"]]).fetchone()[0] == 0
    c.close()
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 400   # single use


def test_oauth_does_not_link_to_unverified_account(client):
    attacker = _register(client, "attacker1", "victim@example.com")    # attacker pre-claims victim's email
    import routes.github_oauth as gh
    importlib.reload(gh)   # it caches DB_PATH at import; bind it to this test's database
    uid, is_new, *_ = gh._upsert_github_user("gh-123", "victim@example.com", "Victim", "", "victim")
    assert uid != attacker["id"] and is_new
