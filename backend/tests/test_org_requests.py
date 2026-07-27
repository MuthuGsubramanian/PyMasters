"""
Org capability request workflow: an org super_admin requests a plan; only the
platform super admin can approve; approval grants the org plan so access.py
entitles its members. Covers authz, dup guard, reject, and the entitlement flip.
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
    import routes.org_requests as req_mod
    import routes.platform_settings as settings_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(org_mod)
    importlib.reload(settings_mod)
    importlib.reload(req_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client, account_type="individual", org_name=None):
    username = f"u{uuid.uuid4().hex[:10]}"
    body = {"username": username, "password": "pw123456", "name": "T",
            "email": f"{username}@example.com", "account_type": account_type}
    if org_name:
        body["organization_name"] = org_name
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _make_super_admin(user_id):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [user_id])
    conn.commit()
    conn.close()


def _auth(u):
    return {"Authorization": f"Bearer {u['token']}"}


def _new_org(client):
    """Create a fresh (non-grandfathered) org via the API; return (owner, org_id)."""
    owner = _register(client)
    r = client.post("/api/org", json={"name": "Springfield High", "type": "school",
                                       "user_id": owner["id"]}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    return owner, r.json()["org_id"]


def test_request_requires_org_super_admin(client):
    owner, org_id = _new_org(client)
    outsider = _register(client)
    # Outsider (not a member) cannot file a request
    assert client.post(f"/api/org/{org_id}/requests", json={"kind": "plan", "plan": "pro"},
                       headers=_auth(outsider)).status_code == 403
    # Unauthenticated -> 401
    assert client.post(f"/api/org/{org_id}/requests", json={"kind": "plan", "plan": "pro"}).status_code == 401


def test_plan_request_approve_grants_and_entitles(client):
    owner, org_id = _new_org(client)
    # A freshly created org is NOT grandfathered → owner is on individual trial,
    # not enterprise. (Trial because the account was just created.)
    import access
    st = access.get_access_status(os.environ["DB_PATH"], owner["id"])
    # Fresh, non-grandfathered org with no plan → owner is NOT org-entitled
    # (they're on the individual trial) and has no enterprise tracks.
    assert st.get("reason") not in ("organization_grandfathered", "organization_plan")
    assert access.has_enterprise_access(os.environ["DB_PATH"], owner["id"]) is False

    r = client.post(f"/api/org/{org_id}/requests",
                    json={"kind": "enterprise", "message": "Pilot for our CS dept"},
                    headers=_auth(owner))
    assert r.status_code == 200 and r.json()["status"] == "pending"

    # Duplicate pending -> 409
    assert client.post(f"/api/org/{org_id}/requests", json={"kind": "enterprise"},
                       headers=_auth(owner)).status_code == 409

    admin = _register(client)
    _make_super_admin(admin["id"])
    reqs = client.get("/api/admin/org-requests", params={"status": "pending"},
                      headers=_auth(admin)).json()["requests"]
    assert len(reqs) == 1 and reqs[0]["org_name"] == "Springfield High"
    rid = reqs[0]["id"]

    ap = client.post(f"/api/admin/org-requests/{rid}/approve",
                     json={"note": "Approved 90-day pilot"}, headers=_auth(admin))
    assert ap.status_code == 200 and ap.json()["granted"]["plan"] == "enterprise"

    # Org plan set → owner (a member) is now entitled + has enterprise tracks.
    st2 = access.get_access_status(os.environ["DB_PATH"], owner["id"])
    assert st2["status"] == "active" and st2["reason"] == "organization_plan" and st2["plan"] == "enterprise"
    assert access.has_enterprise_access(os.environ["DB_PATH"], owner["id"]) is True

    # Re-approve -> 409
    assert client.post(f"/api/admin/org-requests/{rid}/approve", headers=_auth(admin)).status_code == 409


def test_reject_request(client):
    owner, org_id = _new_org(client)
    client.post(f"/api/org/{org_id}/requests", json={"kind": "plan", "plan": "pro"}, headers=_auth(owner))
    admin = _register(client)
    _make_super_admin(admin["id"])
    rid = client.get("/api/admin/org-requests", headers=_auth(admin)).json()["requests"][0]["id"]
    rj = client.post(f"/api/admin/org-requests/{rid}/reject", json={"note": "Need a .edu domain"},
                     headers=_auth(admin))
    assert rj.status_code == 200 and rj.json()["status"] == "rejected"
    # Org plan unchanged (still free)
    conn = sqlite3.connect(os.environ["DB_PATH"])
    plan = conn.execute("SELECT plan FROM organizations WHERE id = ?", [org_id]).fetchone()[0]
    conn.close()
    assert plan in (None, "free")


def test_admin_endpoints_require_super_admin(client):
    owner, org_id = _new_org(client)
    assert client.get("/api/admin/org-requests", headers=_auth(owner)).status_code == 403


def test_dismiss_handled_request(client):
    owner, org_id = _new_org(client)
    client.post(f"/api/org/{org_id}/requests", json={"kind": "plan", "plan": "pro"}, headers=_auth(owner))
    admin = _register(client)
    _make_super_admin(admin["id"])
    rid = client.get("/api/admin/org-requests", headers=_auth(admin)).json()["requests"][0]["id"]
    # Can't dismiss while pending
    assert client.delete(f"/api/admin/org-requests/{rid}", headers=_auth(admin)).status_code == 409
    # Non-admin can't dismiss
    assert client.delete(f"/api/admin/org-requests/{rid}", headers=_auth(owner)).status_code == 403
    # Reject, then dismiss removes it from the queue
    client.post(f"/api/admin/org-requests/{rid}/reject", headers=_auth(admin))
    d = client.delete(f"/api/admin/org-requests/{rid}", headers=_auth(admin))
    assert d.status_code == 200 and d.json()["dismissed"] == rid
    assert client.get("/api/admin/org-requests", headers=_auth(admin)).json()["total"] == 0
    # Dismissing a missing row -> 404
    assert client.delete(f"/api/admin/org-requests/{rid}", headers=_auth(admin)).status_code == 404


def test_invalid_kind_and_plan_rejected(client):
    owner, org_id = _new_org(client)
    assert client.post(f"/api/org/{org_id}/requests", json={"kind": "nonsense"},
                       headers=_auth(owner)).status_code == 422
    assert client.post(f"/api/org/{org_id}/requests", json={"kind": "plan", "plan": "student"},
                       headers=_auth(owner)).status_code == 422
