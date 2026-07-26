"""
Support flow: public student-access requests (with student-ID upload) and issue
reports; super-admin review queue; 90-day student-plan grant on approval —
immediately for existing accounts, at registration for new ones.
"""
import importlib
import os
import sqlite3
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 400
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 400


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import routes.admin as admin_mod
    import routes.support as support_mod
    import routes.platform_settings as settings_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(support_mod)      # fresh per-test rate limiters
    importlib.reload(settings_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client, email=None, username=None):
    username = username or f"u{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={
        "username": username, "password": "pw123456", "name": "Test",
        "email": email or f"{username}@example.com",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _make_super_admin(user_id):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET is_super_admin = 1 WHERE id = ?", [user_id])
    conn.commit()
    conn.close()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _submit_access(client, email, data=JPEG, filename="id.jpg"):
    return client.post(
        "/api/support/access-request",
        data={"name": "Student S", "email": email, "message": "CS undergrad"},
        files={"student_id": (filename, data, "image/jpeg")},
    )


def test_access_request_upload_and_admin_grant(client):
    user = _register(client, email="stud1@uni.edu")
    r = _submit_access(client, "stud1@uni.edu")
    assert r.status_code == 200 and r.json()["ok"]

    # Duplicate while pending -> 409
    assert _submit_access(client, "stud1@uni.edu").status_code == 409

    # Non-admin cannot list or fetch attachments
    assert client.get("/api/support/admin/requests", headers=_auth(user)).status_code == 403

    admin = _register(client)
    _make_super_admin(admin["id"])
    lst = client.get("/api/support/admin/requests", params={"kind": "access"}, headers=_auth(admin))
    assert lst.status_code == 200
    reqs = lst.json()["requests"]
    assert len(reqs) == 1
    req = reqs[0]
    assert req["status"] == "new" and req["matched_username"] == user["username"]

    # Attachment: 403 for user, 200 + right content type for admin
    att_url = f"/api/support/admin/attachments/{req['attachment_id']}"
    assert client.get(att_url, headers=_auth(user)).status_code == 403
    att = client.get(att_url, headers=_auth(admin))
    assert att.status_code == 200
    assert att.headers["content-type"].startswith("image/jpeg")
    assert att.content == JPEG

    # Approve -> existing account granted student plan for ~90 days
    ap = client.post(f"/api/support/admin/requests/{req['id']}/approve",
                     json={"note": ""}, headers=_auth(admin))
    assert ap.status_code == 200 and ap.json()["granted"]
    conn = sqlite3.connect(os.environ["DB_PATH"])
    plan, expires = conn.execute(
        "SELECT plan, plan_expires_at FROM users WHERE id = ?", [user["id"]]).fetchone()
    conn.close()
    assert plan == "student" and expires

    import access
    status = access.get_access_status(os.environ["DB_PATH"], user["id"])
    assert status["status"] == "active" and status["plan"] == "student"

    # Re-approve is a 409, not a double grant
    assert client.post(f"/api/support/admin/requests/{req['id']}/approve",
                       headers=_auth(admin)).status_code == 409


def test_approval_before_signup_grants_on_register(client):
    email = "future@uni.edu"
    assert _submit_access(client, email, data=PNG, filename="id.png").status_code == 200
    admin = _register(client)
    _make_super_admin(admin["id"])
    req = client.get("/api/support/admin/requests", headers=_auth(admin)).json()["requests"][0]
    ap = client.post(f"/api/support/admin/requests/{req['id']}/approve", headers=_auth(admin))
    assert ap.status_code == 200 and ap.json()["granted"] is False
    assert ap.json()["status"] == "approved"

    newbie = _register(client, email=email)
    conn = sqlite3.connect(os.environ["DB_PATH"])
    plan, expires = conn.execute(
        "SELECT plan, plan_expires_at FROM users WHERE id = ?", [newbie["id"]]).fetchone()
    status = conn.execute(
        "SELECT status, granted_user_id FROM support_requests WHERE id = ?", [req["id"]]).fetchone()
    conn.close()
    assert plan == "student" and expires
    assert status[0] == "granted" and status[1] == newbie["id"]


def test_reject_access_request(client):
    assert _submit_access(client, "no@uni.edu").status_code == 200
    admin = _register(client)
    _make_super_admin(admin["id"])
    req = client.get("/api/support/admin/requests", headers=_auth(admin)).json()["requests"][0]
    rj = client.post(f"/api/support/admin/requests/{req['id']}/reject",
                     json={"note": "ID unreadable"}, headers=_auth(admin))
    assert rj.status_code == 200 and rj.json()["status"] == "rejected"
    # A rejected request no longer blocks a fresh submission
    assert _submit_access(client, "no@uni.edu").status_code == 200


def test_upload_validation(client, monkeypatch):
    import routes.support as support_mod
    # Wrong content (text pretending to be an image) -> 422
    r = _submit_access(client, "bad@uni.edu", data=b"not an image, just text" * 20)
    assert r.status_code == 422
    # Oversize -> 413 (cap patched down so the test stays fast)
    monkeypatch.setattr(support_mod, "MAX_UPLOAD_BYTES", 1024)
    r = _submit_access(client, "big@uni.edu", data=JPEG + b"\x00" * 2000)
    assert r.status_code == 413
    # Bad email -> 422
    monkeypatch.setattr(support_mod, "MAX_UPLOAD_BYTES", 5 * 1024 * 1024)
    assert _submit_access(client, "not-an-email").status_code == 422


def test_access_request_rate_limit(client):
    for i in range(5):
        assert _submit_access(client, f"s{i}@uni.edu").status_code == 200
    assert _submit_access(client, "s6@uni.edu").status_code == 429


def test_issue_report(client):
    r = client.post("/api/support/issue", json={
        "name": "R", "email": "r@example.com", "subject": "Lesson broken",
        "message": "The decorators lesson never loads on mobile.",
        "page_url": "https://pymasters.net/dashboard/classroom",
    })
    assert r.status_code == 200 and r.json()["ok"]
    # Too-short message -> 422
    assert client.post("/api/support/issue", json={
        "email": "r@example.com", "message": "bad"}).status_code == 422

    admin = _register(client)
    _make_super_admin(admin["id"])
    reqs = client.get("/api/support/admin/requests", params={"kind": "issue"},
                      headers=_auth(admin)).json()["requests"]
    assert len(reqs) == 1 and "[Lesson broken]" in reqs[0]["message"]
    rs = client.post(f"/api/support/admin/requests/{reqs[0]['id']}/resolve",
                     json={"note": "fixed"}, headers=_auth(admin))
    assert rs.status_code == 200 and rs.json()["status"] == "resolved"
