"""nudge_mastery moves mastery_level only — never attempts/struggle_count."""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar.profiler import nudge_mastery, update_mastery  # noqa: E402


def _db(tmp_path):
    p = str(tmp_path / "m.db")
    conn = sqlite3.connect(p)
    conn.execute(
        "CREATE TABLE user_mastery (user_id TEXT, topic TEXT, mastery_level REAL DEFAULT 0,"
        " attempts INTEGER DEFAULT 0, avg_time_seconds REAL, last_practiced TIMESTAMP,"
        " struggle_count INTEGER DEFAULT 0, PRIMARY KEY (user_id, topic))"
    )
    conn.commit(); conn.close()
    return p


def _row(p, topic):
    conn = sqlite3.connect(p)
    try:
        return conn.execute("SELECT mastery_level, attempts, struggle_count, last_practiced FROM user_mastery "
                            "WHERE user_id = 'u' AND topic = ?", [topic]).fetchone()
    finally:
        conn.close()


def test_nudge_creates_row_with_zero_attempts(tmp_path):
    p = _db(tmp_path)
    assert nudge_mastery(p, "u", "lists", 0.03) == pytest.approx(0.03)
    level, attempts, struggle, last = _row(p, "lists")
    assert level == pytest.approx(0.03) and attempts == 0 and struggle == 0 and last is not None


def test_nudge_clamps_and_keeps_attempts(tmp_path):
    p = _db(tmp_path)
    for _ in range(4):
        update_mastery(p, "u", "lists", 0.99)
    assert nudge_mastery(p, "u", "lists", 0.03) == pytest.approx(1.0)
    level, attempts, struggle, _ = _row(p, "lists")
    assert level == pytest.approx(1.0) and attempts == 4 and struggle == 0


def test_negative_nudge_floor_zero(tmp_path):
    p = _db(tmp_path)
    update_mastery(p, "u", "lists", 0.01)
    assert nudge_mastery(p, "u", "lists", -0.05) == pytest.approx(0.0)
    level, attempts, struggle, _ = _row(p, "lists")
    assert level == 0.0 and attempts == 1 and struggle == 1  # struggle from update_mastery(<0.4), untouched by nudge
