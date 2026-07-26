"""
F5: the lesson endpoint must tell the client when a non-English learner is being
shown English because their language isn't available yet — no silent fallback.
"""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module

EN_ONLY_LESSON = "all_minilm_l6_v2_local_semantic_search"  # has en story, no ta
HAS_TA_LESSON = "agent_fundamentals"                        # has en + ta story


def _headers(user_id):
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    # Kill on-demand translation so an uncovered lesson deterministically falls back
    # to English (no LLM call) — exactly the "silent fallback" F5 must surface.
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "0")
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    # Organization accounts so enterprise-track lessons are reachable.
    conn.execute("INSERT INTO users (id, username, password_hash, name, account_type) "
                 "VALUES ('ta-user','talearner','h','Ta','organization')")
    conn.execute("INSERT INTO users (id, username, password_hash, name, account_type) "
                 "VALUES ('en-user','enlearner','h','En','organization')")
    # get_student_profile reads preferred_language from user_profiles, not users.
    conn.execute("INSERT INTO user_profiles (user_id, preferred_language, skill_level) "
                 "VALUES ('ta-user','ta','beginner')")
    conn.execute("INSERT INTO user_profiles (user_id, preferred_language, skill_level) "
                 "VALUES ('en-user','en','beginner')")
    conn.commit(); conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _lesson(client, lesson_id, uid):
    r = client.get(f"/api/classroom/lesson/{lesson_id}?user_id={uid}", headers=_headers(uid))
    assert r.status_code == 200, (lesson_id, r.status_code, r.text[:200])
    return r.json().get("lesson", r.json())


def test_uncovered_language_is_flagged_as_fallback(client):
    d = _lesson(client, EN_ONLY_LESSON, "ta-user")
    assert d["requested_language"] == "ta"
    assert d["story_language"] == "en"
    assert d["story_is_fallback"] is True


def test_covered_language_is_not_flagged(client):
    d = _lesson(client, HAS_TA_LESSON, "ta-user")
    assert d["story_language"] == "ta"
    assert d["story_is_fallback"] is False


def test_english_user_never_sees_fallback(client):
    d = _lesson(client, EN_ONLY_LESSON, "en-user")
    assert d["story_is_fallback"] is False
