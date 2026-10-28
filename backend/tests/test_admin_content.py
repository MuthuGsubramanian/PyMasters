"""Admin visibility into the content job's queue and the platform "Fresh
lessons" track, plus unpublishing (routes/admin.py)."""
import importlib
import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402


def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    # routes.admin freezes DB_PATH at import time; reload it (and auth) before main
    # so this test's tmp_path db is what the admin endpoints actually hit.
    import routes.admin as admin_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) VALUES ('owner','muthu','h','M','muthu@pymasters.net', CURRENT_TIMESTAMP, 0)")
    conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('plain','p','h','P', CURRENT_TIMESTAMP)")
    conn.execute(
        "INSERT INTO generated_lessons (id, user_id, topic, lesson_data, published_to, created_at) "
        "VALUES ('gen_fresh_1', 'plain', 'topic', ?, 'platform', CURRENT_TIMESTAMP)",
        [json.dumps({"id": "gen_fresh_1", "title": {"en": "X"}})],
    )
    conn.commit(); conn.close()
    main_mod.init_db()  # resolve super admins on existing rows
    from fastapi.testclient import TestClient
    return main_mod, TestClient(main_mod.app)


def _db():
    c = sqlite3.connect(os.environ["DB_PATH"])
    c.row_factory = sqlite3.Row
    return c


def test_content_queue_requires_super_admin(app):
    _, client = app
    r = client.get("/api/admin/content/queue", headers=_headers("plain"))
    assert r.status_code == 403


def test_content_queue_lists_seeded_topics_for_super_admin(app):
    _, client = app
    from jobs.content_job import seed_queue
    seed_queue(_db())
    r = client.get("/api/admin/content/queue", headers=_headers("owner"))
    assert r.status_code == 200
    assert len(r.json()["queue"]) > 0


def test_fresh_lessons_lists_platform_published_lesson(app):
    _, client = app
    r = client.get("/api/admin/content/fresh-lessons", headers=_headers("owner"))
    assert r.status_code == 200
    ids = [l["id"] for l in r.json()["lessons"]]
    assert "gen_fresh_1" in ids


def test_unpublish_removes_lesson_from_fresh_track(app):
    _, client = app
    r = client.post("/api/admin/content/fresh-lessons/gen_fresh_1/unpublish", headers=_headers("owner"))
    assert r.status_code == 200
    row = _db().execute("SELECT published_to FROM generated_lessons WHERE id = 'gen_fresh_1'").fetchone()
    assert row["published_to"] is None

    r2 = client.get("/api/admin/content/fresh-lessons", headers=_headers("owner"))
    ids = [l["id"] for l in r2.json()["lessons"]]
    assert "gen_fresh_1" not in ids


def test_unpublish_unknown_lesson_404s(app):
    _, client = app
    r = client.post("/api/admin/content/fresh-lessons/does-not-exist/unpublish", headers=_headers("owner"))
    assert r.status_code == 404
