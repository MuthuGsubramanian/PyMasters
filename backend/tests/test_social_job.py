"""LinkedIn posting job: cadence/material selection and queuing into the
existing Social Studio job table (jobs/social_job.py)."""
import importlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

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


def test_monday_picks_the_newest_fresh_lesson(db):
    from jobs import social_job
    conn = _conn(db)
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('sysauth', 'sa', 'h', 'S', CURRENT_TIMESTAMP)"
    )
    lesson = {"id": "gen_x", "title": {"en": "Context Managers"}, "description": {"en": "Learn with."}}
    conn.execute(
        "INSERT INTO generated_lessons (id, user_id, topic, lesson_data, published_to, created_at) "
        "VALUES (?, 'sysauth', 'context_managers', ?, 'platform', CURRENT_TIMESTAMP)",
        [lesson["id"], json.dumps(lesson)],
    )
    conn.commit()
    monday = datetime(2026, 11, 2, 4, 0, tzinfo=timezone.utc)  # a Monday
    topic, style = social_job.pick_material(conn, monday)
    assert "Context Managers" in topic
    assert "Fresh lesson spotlight" in topic
    assert "Learn with." in style
    conn.close()


def test_monday_falls_back_to_an_insight_when_no_fresh_lesson_exists(db):
    from jobs import social_job
    conn = _conn(db)
    monday = datetime(2026, 11, 2, 4, 0, tzinfo=timezone.utc)
    topic, style = social_job.pick_material(conn, monday)
    assert "Python insight" in topic
    conn.close()


def test_wednesday_picks_an_arcade_spotlight(db):
    from jobs import social_job
    conn = _conn(db)
    wednesday = datetime(2026, 11, 4, 4, 0, tzinfo=timezone.utc)
    topic, style = social_job.pick_material(conn, wednesday)
    assert topic.startswith("Arcade spotlight:")
    conn.close()


def test_friday_picks_a_learner_insight(db):
    from jobs import social_job
    conn = _conn(db)
    friday = datetime(2026, 11, 6, 4, 0, tzinfo=timezone.utc)
    topic, style = social_job.pick_material(conn, friday)
    assert topic.startswith("Python insight:")
    conn.close()


def test_run_linkedin_queues_a_social_job_with_linkedin_channel(db):
    from jobs import social_job
    result = social_job.run_linkedin(db)
    assert result["queued"] is True
    conn = _conn(db)
    row = conn.execute("SELECT * FROM social_jobs WHERE id = ?", [result["job_id"]]).fetchone()
    assert row is not None
    assert json.loads(row["channels"]) == ["linkedin"]
    assert row["requested_by"] == "system:content-manager"
    assert row["status"] == "pending"
    conn.close()


def test_run_linkedin_does_not_queue_a_duplicate_topic_within_six_days(db):
    from jobs import social_job
    first = social_job.run_linkedin(db)
    second = social_job.run_linkedin(db)
    assert first["queued"] is True
    assert second["queued"] is False
    conn = _conn(db)
    count = conn.execute("SELECT COUNT(*) FROM social_jobs").fetchone()[0]
    assert count == 1
    conn.close()
