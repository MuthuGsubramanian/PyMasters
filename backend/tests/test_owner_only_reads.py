"""Security review 2026-11-03, L8: reads by id must check who is asking (2026-11-05).

GET /api/classroom/explain/{id} returned any learner's generated essay to any signed-in user, and
GET /api/modules/status/{job_id} needed no sign-in at all (it returns the job's topic outcome and error text).
Now only the owner (or a super admin) can read them; anyone else gets 404, so ids can't be probed.
"""
import importlib
import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import auth as auth_module  # noqa: E402


def _headers(user_id):
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    importlib.reload(auth_module)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    for uid, admin in (("owner", 0), ("other", 0), ("boss", 1)):
        conn.execute("INSERT INTO users (id, username, password_hash, name, email, is_super_admin) "
                     "VALUES (?, ?, 'hash', ?, '', ?)", [uid, uid, uid, admin])
    conn.execute("INSERT INTO generated_explains (id, user_id, lesson_id, focus, title, data) VALUES (?,?,?,?,?,?)",
                 ["exp123", "owner", "lists", "", "T", json.dumps({"title": "T", "steps": []})])
    conn.execute("INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority) "
                 "VALUES ('job123', 'owner', 'graphs', 'user_request', 'x', 'queued', 1)")
    conn.commit()
    conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


@pytest.mark.parametrize("url", ["/api/classroom/explain/exp123", "/api/modules/status/job123"])
def test_the_owner_can_read_it(client, url):
    assert client.get(url, headers=_headers("owner")).status_code == 200


@pytest.mark.parametrize("url", ["/api/classroom/explain/exp123", "/api/modules/status/job123"])
def test_another_learner_gets_404(client, url):
    assert client.get(url, headers=_headers("other")).status_code == 404


@pytest.mark.parametrize("url", ["/api/classroom/explain/exp123", "/api/modules/status/job123"])
def test_a_super_admin_can_read_it(client, url):
    assert client.get(url, headers=_headers("boss")).status_code == 200


def test_module_status_requires_sign_in(client):
    assert client.get("/api/modules/status/job123").status_code == 401
