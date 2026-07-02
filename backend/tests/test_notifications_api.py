import pytest
import sys
import os
import sqlite3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


def _headers(user_id: str) -> dict:
    """Auth headers for a user. As of 2026-07-02 the notifications and messages
    routers derive the acting user from the verified JWT (IDOR guard, same
    pattern as routes/graph.py + routes/paths.py); unauthenticated calls 401."""
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def client(tmp_path):
    os.environ["DB_PATH"] = str(tmp_path / "test.db")
    import importlib
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    # Seed two test users (the second is the "victim" in IDOR tests)
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES (1, 'test', 'hash', 'Test')")
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES (2, 'victim', 'hash', 'Victim')")
    conn.execute("INSERT INTO notifications (user_id, type, title, message, link) VALUES (1, 'module_ready', 'Lesson Ready', 'Your Decorators lesson is ready', '/classroom')")
    conn.execute("INSERT INTO notifications (user_id, type, title, message, link) VALUES (1, 'ai_recommendation', 'Try This', 'Vaathiyaar recommends Closures', '/classroom')")
    conn.execute("INSERT INTO notifications (user_id, type, title, message, link) VALUES (2, 'module_ready', 'Private', 'Victim-only notification', '/classroom')")
    conn.commit()
    conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def test_get_notifications(client):
    resp = client.get("/api/notifications?user_id=1", headers=_headers("1"))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["notifications"]) == 2
    assert data["unread_count"] == 2


def test_mark_notification_read(client):
    resp = client.put("/api/notifications/1/read?user_id=1", headers=_headers("1"))
    assert resp.status_code == 200
    resp2 = client.get("/api/notifications?user_id=1", headers=_headers("1"))
    assert resp2.json()["unread_count"] == 1


def test_mark_all_read(client):
    resp = client.patch("/api/notifications/read-all?user_id=1", headers=_headers("1"))
    assert resp.status_code == 200
    resp2 = client.get("/api/notifications?user_id=1", headers=_headers("1"))
    assert resp2.json()["unread_count"] == 0


def test_get_preferences(client):
    resp = client.get("/api/notifications/preferences?user_id=1", headers=_headers("1"))
    assert resp.status_code == 200
    assert "preferences" in resp.json()


def test_update_preferences(client):
    resp = client.put("/api/notifications/preferences", json={
        "user_id": "1",
        "channel": "email",
        "type": "module_ready",
        "enabled": False
    }, headers=_headers("1"))
    assert resp.status_code == 200


# --- IDOR regression tests (2026-07-02): notifications router ---

@pytest.mark.parametrize("method,url", [
    ("get", "/api/notifications?user_id=2"),
    ("put", "/api/notifications/3/read?user_id=2"),
    ("patch", "/api/notifications/read-all?user_id=2"),
    ("get", "/api/notifications/preferences?user_id=2"),
])
def test_notifications_reject_anonymous(client, method, url):
    assert getattr(client, method)(url).status_code == 401


@pytest.mark.parametrize("method,url", [
    ("get", "/api/notifications?user_id=2"),
    ("put", "/api/notifications/3/read?user_id=2"),
    ("patch", "/api/notifications/read-all?user_id=2"),
    ("get", "/api/notifications/preferences?user_id=2"),
])
def test_notifications_reject_cross_user(client, method, url):
    assert getattr(client, method)(url, headers=_headers("1")).status_code == 403


def test_update_preferences_rejects_forged_body(client):
    resp = client.put("/api/notifications/preferences", json={
        "user_id": "2", "channel": "email", "type": "module_ready", "enabled": False
    }, headers=_headers("1"))
    assert resp.status_code == 403


def test_cross_user_read_all_does_not_mutate_victim(client):
    client.patch("/api/notifications/read-all?user_id=2", headers=_headers("1"))
    resp = client.get("/api/notifications?user_id=2", headers=_headers("2"))
    assert resp.json()["unread_count"] == 1  # victim's notification untouched


# --- IDOR regression tests (2026-07-02): Vaathiyaar messages router ---

@pytest.fixture
def msg_client(client, tmp_path):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute(
        "INSERT INTO pending_vaathiyaar_messages (id, user_id, message, message_type)"
        " VALUES (10, 2, 'Victim-only proactive message', 'nudge')"
    )
    conn.commit()
    conn.close()
    return client


def test_pending_messages_reject_anonymous(msg_client):
    assert msg_client.get("/api/messages/pending/2").status_code == 401


def test_pending_messages_reject_cross_user_and_do_not_mark_delivered(msg_client):
    resp = msg_client.get("/api/messages/pending/2", headers=_headers("1"))
    assert resp.status_code == 403
    # Destructive-read protection: the victim still receives the message
    own = msg_client.get("/api/messages/pending/2", headers=_headers("2"))
    assert own.status_code == 200
    assert len(own.json()["messages"]) == 1


def test_dismiss_rejects_non_owner(msg_client):
    assert msg_client.post("/api/messages/10/dismiss").status_code == 401
    assert msg_client.post("/api/messages/10/dismiss", headers=_headers("1")).status_code == 403
    assert msg_client.post("/api/messages/10/dismiss", headers=_headers("2")).status_code == 200


def test_action_rejects_non_owner(msg_client):
    body = {"action": "start_now"}
    assert msg_client.post("/api/messages/10/action", json=body).status_code == 401
    assert msg_client.post("/api/messages/10/action", json=body, headers=_headers("1")).status_code == 403
    assert msg_client.post("/api/messages/10/action", json=body, headers=_headers("2")).status_code == 200


def test_dismiss_missing_message_still_404s_for_owner(msg_client):
    assert msg_client.post("/api/messages/999/dismiss", headers=_headers("1")).status_code == 404
