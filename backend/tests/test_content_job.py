"""Nightly content job: topic queue, system author, QA gate, platform publish,
and that a published lesson is visible to every learner (jobs/content_job.py)."""
import importlib
import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return os.environ["DB_PATH"]


def _conn(db_path):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    return c


def _good_lesson(lesson_id="gen_topic_abc12345"):
    return {
        "id": lesson_id,
        "title": {"en": "Context Managers", "ta": ""},
        "description": {"en": "Learn the with statement", "ta": ""},
        "story_variants": {"en": "x" * 650},
        "practice_challenges": [
            {"instruction": {"en": "Write a context manager."}, "expected_output": "done",
             "hints": ["Use __enter__/__exit__"], "test_code": "assert 1 == 1"},
        ],
        "track": "python_fundamentals",
        "module": "context_managers",
    }


def test_seed_queue_is_idempotent(db):
    from jobs import content_job
    conn = _conn(db)
    first = content_job.seed_queue(conn)
    second = content_job.seed_queue(conn)
    assert first == len(content_job.GAP_TOPICS)
    assert second == 0
    count = conn.execute("SELECT COUNT(*) FROM content_queue").fetchone()[0]
    assert count == len(content_job.GAP_TOPICS)


def test_system_author_is_reused_not_duplicated(db):
    from jobs import content_job
    conn = _conn(db)
    first = content_job.get_system_author(conn)
    second = content_job.get_system_author(conn)
    assert first == second
    count = conn.execute(
        "SELECT COUNT(*) FROM users WHERE username = ?", [content_job.SYSTEM_AUTHOR_USERNAME]
    ).fetchone()[0]
    assert count == 1


def test_qa_gate_rejects_short_narrative(db):
    from jobs import content_job
    lesson = _good_lesson()
    lesson["story_variants"]["en"] = "too short"
    ok, reason = content_job.qa_check(lesson)
    assert ok is False
    assert "narrative too short" in reason


def test_qa_gate_rejects_mojibake(db):
    from jobs import content_job
    lesson = _good_lesson()
    lesson["description"]["en"] = "Broken â€\" dash"
    ok, reason = content_job.qa_check(lesson)
    assert ok is False
    assert "mojibake" in reason


def test_qa_gate_rejects_failing_test_code(db):
    from jobs import content_job
    lesson = _good_lesson()
    lesson["practice_challenges"][0]["test_code"] = "assert 1 == 2"
    ok, reason = content_job.qa_check(lesson)
    assert ok is False
    assert "test_code failed" in reason


def test_qa_gate_accepts_well_formed_lesson(db):
    from jobs import content_job
    ok, reason = content_job.qa_check(_good_lesson())
    assert ok is True
    assert reason is None


def test_run_publishes_a_passing_lesson_to_the_platform_track(db, monkeypatch):
    from jobs import content_job

    def fake_run_pipeline(job_id, user_id, topic):
        lesson = _good_lesson("gen_fake_pass_0001")
        conn = _conn(db)
        conn.execute(
            "INSERT INTO generated_lessons (id, user_id, job_id, topic, track, lesson_data, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [lesson["id"], user_id, job_id, topic, lesson["track"], json.dumps(lesson)],
        )
        conn.commit()
        conn.close()
        return lesson["id"]

    monkeypatch.setattr(content_job, "run_pipeline", fake_run_pipeline)
    result = content_job.run(db)
    assert result["ran"] is True
    assert result["published"] is True
    lesson_id = result["lesson_id"]

    conn = _conn(db)
    row = conn.execute("SELECT published_to FROM generated_lessons WHERE id = ?", [lesson_id]).fetchone()
    assert row["published_to"] == "platform"
    queue_row = conn.execute("SELECT status FROM content_queue WHERE lesson_id = ?", [lesson_id]).fetchone()
    assert queue_row["status"] == "done"


def test_run_requeues_a_failing_lesson_with_backoff(db, monkeypatch):
    from jobs import content_job

    def fake_run_pipeline(job_id, user_id, topic):
        lesson = _good_lesson("gen_fake_fail_0001")
        lesson["story_variants"]["en"] = "too short"  # fails QA
        conn = _conn(db)
        conn.execute(
            "INSERT INTO generated_lessons (id, user_id, job_id, topic, track, lesson_data, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [lesson["id"], user_id, job_id, topic, lesson["track"], json.dumps(lesson)],
        )
        conn.commit()
        conn.close()
        return lesson["id"]

    monkeypatch.setattr(content_job, "run_pipeline", fake_run_pipeline)
    result = content_job.run(db)
    assert result["ran"] is True
    assert result["published"] is False
    assert result["attempts"] == 1
    assert result["requeue_status"] == "queued"

    conn = _conn(db)
    row = conn.execute(
        "SELECT status, attempts, next_attempt_at FROM content_queue WHERE topic = ?", [result["topic"]]
    ).fetchone()
    assert row["status"] == "queued"
    assert row["attempts"] == 1
    assert row["next_attempt_at"] is not None

    lesson_row = conn.execute(
        "SELECT published_to FROM generated_lessons WHERE id = ?", [result["lesson_id"]]
    ).fetchone()
    assert lesson_row["published_to"] is None


def test_published_lesson_is_visible_to_every_learner(db, monkeypatch):
    from jobs import content_job
    from routes.classroom import _list_all_lessons

    def fake_run_pipeline(job_id, user_id, topic):
        lesson = _good_lesson("gen_visible_0001")
        conn = _conn(db)
        conn.execute(
            "INSERT INTO generated_lessons (id, user_id, job_id, topic, track, lesson_data, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [lesson["id"], user_id, job_id, topic, lesson["track"], json.dumps(lesson)],
        )
        conn.commit()
        conn.close()
        return lesson["id"]

    monkeypatch.setattr(content_job, "run_pipeline", fake_run_pipeline)
    result = content_job.run(db)
    assert result["published"] is True

    conn = _conn(db)
    conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('learner1', 'l1', 'h', 'L', CURRENT_TIMESTAMP)")
    conn.commit()
    conn.close()

    lessons = _list_all_lessons(user_id="learner1")
    fresh = [l for l in lessons if l["id"] == result["lesson_id"]]
    assert len(fresh) == 1
    assert fresh[0]["track"] == "fresh"
