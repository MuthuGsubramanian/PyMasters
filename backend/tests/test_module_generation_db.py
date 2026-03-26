import pytest
import sqlite3
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    os.environ["DB_PATH"] = path
    import importlib
    import backend.main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return path


def test_generation_jobs_table_exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='module_generation_jobs'")
    assert cursor.fetchone() is not None
    conn.close()


def test_generated_lessons_table_exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='generated_lessons'")
    assert cursor.fetchone() is not None
    conn.close()


def test_insert_generation_job(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("""
        INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority)
        VALUES ('job-1', 1, 'decorators', 'user_request', 'user asked about decorators', 'queued', 1)
    """)
    conn.commit()
    row = conn.execute("SELECT * FROM module_generation_jobs WHERE id = 'job-1'").fetchone()
    assert row is not None
    conn.close()
