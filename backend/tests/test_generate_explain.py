"""Regression for the on-demand 'Explain this visually' endpoint (classroom.py):
  POST /api/classroom/explain   -> generate a data-driven Explains essay (LLM)
  GET  /api/classroom/explain/{id}

The LLM is monkeypatched so the test is deterministic. Verifies auth, JSON
extraction/sanitization (text-only, capped), storage, and retrieval.
"""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import auth as auth_module


def _headers(user_id):
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import routes.classroom as classroom_mod
    importlib.reload(auth_module)
    importlib.reload(classroom_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    # Canned LLM reply wrapped in chatter + a code fence, to exercise extraction.
    canned = (
        'Sure! Here you go:\n```json\n'
        '{"title": "Test Explainer", "subtitle": "A one-liner.", '
        '"steps": [{"title": "One", "body": "First idea."}, {"title": "Two", "body": "Second idea."}], '
        '"takeaway": "That is the gist."}\n```\nHope that helps!'
    )
    monkeypatch.setattr(classroom_mod, "vaathiyaar_complete", lambda *a, **k: canned)
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _insert_user(user_id, username):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, email, is_super_admin) "
        "VALUES (?, ?, 'hash', ?, '', 0)",
        [user_id, username, username],
    )
    conn.commit()
    conn.close()


def test_explain_requires_auth(client):
    assert client.post("/api/classroom/explain", json={"user_id": "x"}).status_code == 401


def test_explain_generates_and_stores(client):
    _insert_user("u1", "learner1")
    r = client.post("/api/classroom/explain",
                    json={"user_id": "u1", "focus": "activation functions"},
                    headers=_headers("u1"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Test Explainer"
    assert len(body["steps"]) == 2
    assert body["steps"][0]["title"] == "One"
    assert body["takeaway"] == "That is the gist."
    # retrievable by id
    got = client.get(f"/api/classroom/explain/{body['id']}", headers=_headers("u1"))
    assert got.status_code == 200
    assert got.json()["title"] == "Test Explainer"


def test_explain_rejects_cross_user(client):
    _insert_user("u1", "learner1")
    _insert_user("u2", "learner2")
    # caller u2 cannot generate on behalf of u1
    r = client.post("/api/classroom/explain", json={"user_id": "u1"}, headers=_headers("u2"))
    assert r.status_code == 403


def test_explain_missing_returns_404(client):
    _insert_user("u1", "learner1")
    assert client.get("/api/classroom/explain/doesnotexist", headers=_headers("u1")).status_code == 404


def test_explain_sanitizes_malformed(client, m, monkeypatch):
    """A reply with too many/oversized steps is capped and coerced, never trusted verbatim."""
    import routes.classroom as classroom_mod
    big = {
        "title": "T" * 500,
        "steps": [{"title": f"s{i}", "body": "b" * 5000} for i in range(30)],
        "takeaway": "k" * 5000,
    }
    import json as _json
    monkeypatch.setattr(classroom_mod, "vaathiyaar_complete", lambda *a, **k: _json.dumps(big))
    _insert_user("u1", "learner1")
    r = client.post("/api/classroom/explain", json={"user_id": "u1"}, headers=_headers("u1"))
    assert r.status_code == 200
    body = r.json()
    assert len(body["title"]) <= 120
    assert len(body["steps"]) <= 8
    assert all(len(s["body"]) <= 900 for s in body["steps"])
    assert len(body["takeaway"]) <= 700
