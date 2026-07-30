"""Regression for the super-admin trend-generation endpoints (admin.py):
  GET  /api/admin/trending-topics
  POST /api/admin/generate-trending   -> spawns jobs into the review pool
  GET  /api/admin/generation-jobs

Auth must key on is_super_admin (403 for normal users). Generation is
monkeypatched to a no-op so the test checks the endpoint + job rows without
invoking the real LLM pipeline.
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
    import routes.admin as admin_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    # Neutralise real generation: patch the pipeline the endpoint spawns.
    import modules.pipeline as pipe
    monkeypatch.setattr(pipe, "run_pipeline", lambda *a, **k: None)
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _insert_user(user_id, username, is_super=0):
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, email, is_super_admin) "
        "VALUES (?, ?, 'hash', ?, '', ?)",
        [user_id, username, username, is_super],
    )
    conn.commit()
    conn.close()


def test_trending_topics_requires_super_admin(client):
    _insert_user("u_norm", "norm", is_super=0)
    _insert_user("u_sa", "sa", is_super=1)
    assert client.get("/api/admin/trending-topics").status_code == 401  # anon
    assert client.get("/api/admin/trending-topics", headers=_headers("u_norm")).status_code == 403
    r = client.get("/api/admin/trending-topics", headers=_headers("u_sa"))
    assert r.status_code == 200
    assert len(r.json()["topics"]) > 0


def test_generate_trending_spawns_jobs_for_super_admin(client):
    _insert_user("u_norm", "norm", is_super=0)
    _insert_user("u_sa", "sa", is_super=1)

    # normal user is refused
    assert client.post("/api/admin/generate-trending", json={"topics": ["x"]},
                       headers=_headers("u_norm")).status_code == 403

    # super-admin: explicit topics -> jobs created
    r = client.post("/api/admin/generate-trending",
                    json={"topics": ["MCP for agents", "Speculative decoding"]},
                    headers=_headers("u_sa"))
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert {j["topic"] for j in body["generated"]} == {"MCP for agents", "Speculative decoding"}

    # jobs are listed as admin_trending
    jobs = client.get("/api/admin/generation-jobs", headers=_headers("u_sa")).json()["jobs"]
    topics = {j["topic"] for j in jobs}
    assert {"MCP for agents", "Speculative decoding"} <= topics
    assert all(j["trigger"] == "admin_trending" for j in jobs)


def test_generate_trending_falls_back_to_seed_topics(client):
    _insert_user("u_sa", "sa", is_super=1)
    r = client.post("/api/admin/generate-trending", json={"count": 3}, headers=_headers("u_sa"))
    assert r.status_code == 200
    assert r.json()["count"] == 3  # picked from the default seed list


def test_generate_trending_caps_at_ten(client):
    _insert_user("u_sa", "sa", is_super=1)
    r = client.post("/api/admin/generate-trending",
                    json={"topics": [f"topic {i}" for i in range(25)]},
                    headers=_headers("u_sa"))
    assert r.status_code == 200
    assert r.json()["count"] == 10  # hard cap per click
