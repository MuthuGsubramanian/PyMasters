"""
Platform settings: notification-recipient list defaults to the owner addresses,
is editable only by super admins, and is what support/tutor notifications read.
"""
import importlib
import os
import sqlite3
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("NOTIFY_EMAILS", raising=False)
    import routes.admin as admin_mod
    import routes.platform_settings as settings_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(settings_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client):
    username = f"u{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={
        "username": username, "password": "pw123456", "name": "T",
        "email": f"{username}@example.com",
    })
    assert r.status_code == 200
    return r.json()


def _make_super_admin(user_id):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [user_id])
    conn.commit()
    conn.close()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def test_defaults_to_owner_addresses(m):
    from routes.platform_settings import get_notification_emails
    emails = get_notification_emails()
    assert "muthu@pymasters.net" in emails
    assert "muthu.g.subramanian@gmail.com" in emails


def test_read_write_requires_super_admin(client):
    user = _register(client)
    assert client.get("/api/admin/settings/notification-emails",
                      headers=_auth(user)).status_code == 403
    assert client.put("/api/admin/settings/notification-emails",
                      json={"emails": ["x@y.dev"]}, headers=_auth(user)).status_code == 403
    # Unauthenticated -> 401
    assert client.get("/api/admin/settings/notification-emails").status_code == 401


def test_admin_can_update_and_helpers_read_it(client):
    admin = _register(client)
    _make_super_admin(admin["id"])

    r = client.get("/api/admin/settings/notification-emails", headers=_auth(admin))
    assert r.status_code == 200 and r.json()["customized"] is False

    up = client.put("/api/admin/settings/notification-emails",
                    json={"emails": ["ops@pymasters.net", "muthu@pymasters.net"]},
                    headers=_auth(admin))
    assert up.status_code == 200

    r2 = client.get("/api/admin/settings/notification-emails", headers=_auth(admin))
    assert r2.json()["emails"] == ["ops@pymasters.net", "muthu@pymasters.net"]
    assert r2.json()["customized"] is True

    from routes.platform_settings import get_notification_emails
    assert get_notification_emails() == ["ops@pymasters.net", "muthu@pymasters.net"]


def test_validation(client):
    admin = _register(client)
    _make_super_admin(admin["id"])
    url = "/api/admin/settings/notification-emails"
    assert client.put(url, json={"emails": []}, headers=_auth(admin)).status_code == 422
    assert client.put(url, json={"emails": ["not-an-email"]}, headers=_auth(admin)).status_code == 422
    assert client.put(url, json={"emails": [f"a{i}@b.co" for i in range(11)]},
                      headers=_auth(admin)).status_code == 422
