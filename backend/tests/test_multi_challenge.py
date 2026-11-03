"""Lessons with several practice challenges: /classroom/evaluate grades the one the learner is on.

149 lessons ship a second challenge, but the grader always used practice_challenges[0], so the later ones were
unreachable content (found 2026-11-03 by the scenario harness). The request now names a challenge_index.
"""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402

LESSON = "agent_budget_guardrails"   # two challenges with different expected outputs


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    c = sqlite3.connect(os.environ["DB_PATH"])
    c.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('u1', 'u1', 'h', 'U', CURRENT_TIMESTAMP)")
    c.commit()
    c.close()
    import routes.classroom as classroom
    calls = []
    monkeypatch.setattr(classroom, "evaluate_code", lambda **kw: calls.append(kw) or {"success": True, "output": "", "feedback": ""})
    from fastapi.testclient import TestClient
    tc = TestClient(main_mod.app)
    tc.calls = calls
    tc.lesson = classroom._load_lesson_from_dir(LESSON)
    return tc


def _post(client, **extra):
    headers = {"Authorization": f"Bearer {auth_module.create_access_token('u1')}"}
    body = {"user_id": "u1", "code": "print(1)", "lesson_id": LESSON, **extra}
    return client.post("/api/classroom/evaluate", json=body, headers=headers)


def test_default_is_the_first_challenge(client):
    assert _post(client).status_code == 200
    assert client.calls[-1]["expected_output"] == client.lesson["practice_challenges"][0]["expected_output"]


def test_second_challenge_is_graded_against_its_own_answer(client):
    second = client.lesson["practice_challenges"][1]
    assert _post(client, challenge_index=1).status_code == 200
    kw = client.calls[-1]
    assert kw["expected_output"] == second["expected_output"]
    assert kw["expected_output"] != client.lesson["practice_challenges"][0]["expected_output"]
    assert second["starter_code"].splitlines()[0] in kw["lesson_code"]


@pytest.mark.parametrize("idx", [2, 99, -1])
def test_out_of_range_challenge_is_rejected(client, idx):
    r = _post(client, challenge_index=idx)
    assert r.status_code == 422, r.text
    assert not client.calls
