"""
F6: browsable challenge archive that flags challenges targeting the learner's WEAK
concepts (joins challenges → user_mastery → the concept graph).
"""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()  # seeds the concept graph
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES ('weak-u','weak','h','W')")
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES ('new-u','new','h','N')")
    # 'weak-u' is weak in dynamic_programming (a concept id the classroom evaluate
    # flow writes directly) → the "Dynamic Programming" challenge should flag it.
    conn.execute("INSERT INTO user_mastery (user_id, topic, mastery_level, attempts) "
                 "VALUES ('weak-u','dynamic_programming',0.3,2)")
    conn.commit(); conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _archive(client, uid, weak_only=False):
    r = client.get(f"/api/challenges/archive?weak_only={'true' if weak_only else 'false'}", headers=_headers(uid))
    assert r.status_code == 200, r.text
    return r.json()


def test_archive_lists_all_challenges(client):
    d = _archive(client, "new-u")
    assert d["total"] >= 12
    assert all("difficulty" in c and "category" in c for c in d["challenges"])


def test_weak_concept_challenge_is_flagged(client):
    d = _archive(client, "weak-u")
    dp = next(c for c in d["challenges"] if c["category"] == "Dynamic Programming")
    assert dp["targets_weak_concept"] is True
    assert dp["weak_concepts"], "should name the matched weak concept(s)"
    # Weak-targeting challenges sort to the front.
    assert d["challenges"][0]["targets_weak_concept"] is True


def test_weak_only_filters(client):
    full = _archive(client, "weak-u")
    only = _archive(client, "weak-u", weak_only=True)
    assert 0 < len(only["challenges"]) < len(full["challenges"])
    assert all(c["targets_weak_concept"] for c in only["challenges"])


def test_new_learner_has_no_weak_flags(client):
    d = _archive(client, "new-u")
    assert d["weak_concept_count"] == 0
    assert all(not c["targets_weak_concept"] for c in d["challenges"])
    assert _archive(client, "new-u", weak_only=True)["challenges"] == []
