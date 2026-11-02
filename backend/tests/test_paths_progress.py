"""GET /api/paths/{id}/progress for a path the learner hasn't started (found by the 2026-11-03 page-health suite).

It returned 404, which the Paths page treated as "not started" but which logged a red console error for every
learner browsing a path. Not having started a path is a normal state: 200 with a null body.
"""
import importlib

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "paths.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as m
    importlib.reload(m)
    m.init_db()
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _user(client):
    r = client.post("/api/auth/register", json={"username": "pathy", "email": "pathy@example.com",
                                                 "password": "LongEnough123!"})
    assert r.status_code == 200, r.text
    return r.json()["id"], {"Authorization": f"Bearer {r.json()['token']}"}


def test_progress_on_unstarted_path_is_null_not_404(client):
    uid, h = _user(client)
    r = client.get(f"/api/paths/python_zero_to_hero/progress?user_id={uid}", headers=h)
    assert r.status_code == 200
    assert r.json() is None


def test_progress_after_start_is_returned(client):
    uid, h = _user(client)
    assert client.post("/api/paths/python_zero_to_hero/start", json={"user_id": uid}, headers=h).status_code == 200
    r = client.get(f"/api/paths/python_zero_to_hero/progress?user_id={uid}", headers=h)
    assert r.status_code == 200 and r.json() is not None
