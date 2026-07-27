"""
Org audit trail (Layer 1) + platform last-super_admin guard (Layer 2).

Mutating org actions write org_audit rows readable by the org super_admin and
the platform console. The platform-side role setter cannot demote an org's only
super_admin.
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
    import routes.admin as admin_mod
    import routes.organizations as org_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(org_mod)
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
        "username": username, "password": "pw123456", "name": username,
        "email": f"{username}@example.com"})
    assert r.status_code == 200, r.text
    return r.json()


def _make_super_admin(user_id):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [user_id])
    conn.commit()
    conn.close()


def _auth(u):
    return {"Authorization": f"Bearer {u['token']}"}


def _new_org(client, owner):
    r = client.post("/api/org", json={"name": "Acme School", "type": "school",
                                      "user_id": owner["id"]}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    return r.json()["org_id"]


def test_org_actions_are_audited(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    # An invite is a mutating action → audited
    client.post(f"/api/org/{org_id}/invite", json={"email": "new@student.edu", "role": "member",
                                                    "user_id": owner["id"]}, headers=_auth(owner))
    audit = client.get(f"/api/org/{org_id}/audit", headers=_auth(owner))
    assert audit.status_code == 200
    actions = [a["action"] for a in audit.json()["audit"]]
    assert "org.create" in actions
    assert "member.invite" in actions


def test_org_audit_read_requires_super_admin(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    # Invite + join a plain member, then confirm they can't read the audit log.
    inv = client.post(f"/api/org/{org_id}/invite", json={"email": "m@x.edu", "role": "member",
                                                         "user_id": owner["id"]}, headers=_auth(owner)).json()
    member = _register(client)
    client.post(f"/api/org/join/{inv['token']}", json={"user_id": member["id"]}, headers=_auth(member))
    assert client.get(f"/api/org/{org_id}/audit", headers=_auth(member)).status_code == 403


def test_platform_cannot_demote_last_super_admin(client):
    owner = _register(client)      # org super_admin (only one)
    org_id = _new_org(client, owner)
    admin = _register(client)
    _make_super_admin(admin["id"])
    # Platform admin tries to demote the org's only super_admin -> 400
    r = client.post(f"/api/admin/users/{owner['id']}/role",
                    json={"user_id": admin["id"], "org_id": org_id, "role": "member"},
                    headers=_auth(admin))
    assert r.status_code == 400
    # Still super_admin
    conn = sqlite3.connect(os.environ["DB_PATH"])
    role = conn.execute("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
                        [org_id, owner["id"]]).fetchone()[0]
    conn.close()
    assert role == "super_admin"


def test_platform_org_audit_endpoint(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    admin = _register(client)
    _make_super_admin(admin["id"])
    r = client.get(f"/api/admin/orgs/{org_id}/audit", headers=_auth(admin))
    assert r.status_code == 200
    assert any(a["action"] == "org.create" for a in r.json()["audit"])
    # Non-admin denied
    assert client.get(f"/api/admin/orgs/{org_id}/audit", headers=_auth(owner)).status_code == 403
