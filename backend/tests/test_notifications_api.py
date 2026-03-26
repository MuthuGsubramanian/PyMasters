import pytest
import sys
import os
import sqlite3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def client(tmp_path):
    os.environ["DB_PATH"] = str(tmp_path / "test.db")
    import importlib
    import backend.main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    # Seed a test user
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES (1, 'test', 'hash', 'Test')")
    conn.execute("INSERT INTO notifications (user_id, type, title, message, link) VALUES (1, 'module_ready', 'Lesson Ready', 'Your Decorators lesson is ready', '/classroom')")
    conn.execute("INSERT INTO notifications (user_id, type, title, message, link) VALUES (1, 'ai_recommendation', 'Try This', 'Vaathiyaar recommends Closures', '/classroom')")
    conn.commit()
    conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def test_get_notifications(client):
    resp = client.get("/api/notifications?user_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["notifications"]) == 2
    assert data["unread_count"] == 2


def test_mark_notification_read(client):
    resp = client.put("/api/notifications/1/read?user_id=1")
    assert resp.status_code == 200
    resp2 = client.get("/api/notifications?user_id=1")
    assert resp2.json()["unread_count"] == 1


def test_mark_all_read(client):
    resp = client.patch("/api/notifications/read-all?user_id=1")
    assert resp.status_code == 200
    resp2 = client.get("/api/notifications?user_id=1")
    assert resp2.json()["unread_count"] == 0


def test_get_preferences(client):
    resp = client.get("/api/notifications/preferences?user_id=1")
    assert resp.status_code == 200
    assert "preferences" in resp.json()


def test_update_preferences(client):
    resp = client.put("/api/notifications/preferences", json={
        "user_id": 1,
        "channel": "email",
        "type": "module_ready",
        "enabled": False
    })
    assert resp.status_code == 200
