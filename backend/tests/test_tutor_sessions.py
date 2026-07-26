"""
Live tutor sessions: authenticated request -> pending; learner can list/cancel
own sessions only; super admin confirms/cancels/completes (which emails the
learner best-effort).
"""
import importlib
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


def _future_iso(days=3):
    return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M")


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import routes.admin as admin_mod
    import routes.tutor_sessions as tutor_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(tutor_mod)        # fresh per-test rate limiter
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client, email=None):
    username = f"u{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={
        "username": username, "password": "pw123456", "name": "Learner",
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


def _request_session(client, user, **overrides):
    payload = {
        "topic": "Decorators deep dive",
        "preferred_at": _future_iso(),
        "timezone": "Asia/Kolkata",
        "duration_minutes": 30,
        "notes": "Struggling with closures",
    }
    payload.update(overrides)
    return client.post("/api/tutor-sessions", json=payload, headers=_auth(user))


def test_create_list_cancel(client):
    user = _register(client)
    r = _request_session(client, user)
    assert r.status_code == 200, r.text
    session = r.json()["session"]
    assert session["status"] == "pending"
    assert session["email"].endswith("@example.com")

    mine = client.get("/api/tutor-sessions/mine", headers=_auth(user)).json()["sessions"]
    assert len(mine) == 1 and mine[0]["id"] == session["id"]

    # Another user can neither see nor cancel it
    other = _register(client)
    assert client.get("/api/tutor-sessions/mine", headers=_auth(other)).json()["sessions"] == []
    assert client.post(f"/api/tutor-sessions/{session['id']}/cancel",
                       headers=_auth(other)).status_code == 404

    c = client.post(f"/api/tutor-sessions/{session['id']}/cancel", headers=_auth(user))
    assert c.status_code == 200 and c.json()["status"] == "cancelled"
    # Cancelling again -> 409
    assert client.post(f"/api/tutor-sessions/{session['id']}/cancel",
                       headers=_auth(user)).status_code == 409


def test_validation(client):
    user = _register(client)
    assert _request_session(client, user, topic="ab").status_code == 422
    assert _request_session(client, user, duration_minutes=17).status_code == 422
    assert _request_session(client, user, preferred_at="not-a-date").status_code == 422
    past = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
    assert _request_session(client, user, preferred_at=past).status_code == 422
    # No auth -> 401
    assert client.post("/api/tutor-sessions", json={"topic": "x", "preferred_at": _future_iso()}).status_code == 401


def test_admin_status_flow(client):
    user = _register(client)
    session = _request_session(client, user).json()["session"]

    # Plain users can't touch admin endpoints
    assert client.get("/api/tutor-sessions/admin/list", headers=_auth(user)).status_code == 403
    assert client.post(f"/api/tutor-sessions/admin/{session['id']}/status",
                       json={"status": "confirmed"}, headers=_auth(user)).status_code == 403

    admin = _register(client)
    _make_super_admin(admin["id"])
    lst = client.get("/api/tutor-sessions/admin/list", headers=_auth(admin)).json()["sessions"]
    assert len(lst) == 1

    ok = client.post(f"/api/tutor-sessions/admin/{session['id']}/status",
                     json={"status": "confirmed", "note": "Meet link: …"}, headers=_auth(admin))
    assert ok.status_code == 200
    mine = client.get("/api/tutor-sessions/mine", headers=_auth(user)).json()["sessions"]
    assert mine[0]["status"] == "confirmed" and mine[0]["admin_note"]

    assert client.post(f"/api/tutor-sessions/admin/{session['id']}/status",
                       json={"status": "nonsense"}, headers=_auth(admin)).status_code == 422
    done = client.post(f"/api/tutor-sessions/admin/{session['id']}/status",
                       json={"status": "completed"}, headers=_auth(admin))
    assert done.status_code == 200


def test_request_rate_limit(client):
    user = _register(client)
    for _ in range(5):
        assert _request_session(client, user).status_code == 200
    assert _request_session(client, user).status_code == 429
