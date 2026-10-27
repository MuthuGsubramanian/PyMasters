"""XP awards are deduplicated per (user, source, ref) and summed per day."""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import progress  # noqa: E402


def _db(tmp_path):
    p = str(tmp_path / "t.db")
    conn = sqlite3.connect(p)
    conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, points INTEGER DEFAULT 0)")
    conn.execute("INSERT INTO users (id, points) VALUES ('u1', 0)")
    conn.commit()
    conn.close()
    progress.ensure_tables(p)
    return p


def _points(p):
    conn = sqlite3.connect(p)
    try:
        return conn.execute("SELECT points FROM users WHERE id = 'u1'").fetchone()[0]
    finally:
        conn.close()


def test_award_once_adds_points(tmp_path):
    p = _db(tmp_path)
    conn = sqlite3.connect(p)
    assert progress.award_xp(conn, "u1", 20, "game", "round-1") == 20
    conn.commit(); conn.close()
    assert _points(p) == 20


def test_duplicate_ref_awards_zero(tmp_path):
    p = _db(tmp_path)
    conn = sqlite3.connect(p)
    progress.award_xp(conn, "u1", 20, "game", "round-1")
    assert progress.award_xp(conn, "u1", 20, "game", "round-1") == 0
    assert progress.award_xp(conn, "u1", 0, "game", "round-2") == 0
    conn.commit(); conn.close()
    assert _points(p) == 20


def test_today_xp_sums_by_source(tmp_path):
    p = _db(tmp_path)
    conn = sqlite3.connect(p)
    progress.award_xp(conn, "u1", 15, "game", "r1")
    progress.award_xp(conn, "u1", 10, "game", "r2")
    progress.award_xp(conn, "u1", 70, "lesson", "variables_intro")
    conn.commit()
    assert progress.today_xp(conn, "u1", source="game") == 25
    assert progress.today_xp(conn, "u1") == 95
    conn.close()
