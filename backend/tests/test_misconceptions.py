"""Misconception radar (2026-11-02)."""
import sqlite3

import pytest

import routes.misconceptions as mc

TB = 'Traceback (most recent call last):\n  File "/tmp/x/main.py", line 2, in <module>\n{}'


@pytest.fixture()
def db(tmp_path, monkeypatch):
    path = tmp_path / "m.db"
    conn = sqlite3.connect(path)
    conn.execute("""CREATE TABLE learning_signals (id TEXT PRIMARY KEY, user_id TEXT, signal_type TEXT, topic TEXT,
                    value TEXT, session_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.commit()
    conn.close()
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.mark.parametrize("text,expected", [
    (TB.format("ZeroDivisionError: division by zero"), "ZeroDivisionError"),
    (TB.format("KeyError: 'x'"), "KeyError"),
    ("Execution timed out after 10 seconds.", "Timeout"),
    ("", None), ("just some output", None),
])
def test_error_type(text, expected):
    assert mc.error_type(text) == expected


def test_aggregates_callers_errors_with_advice(db):
    for _ in range(3):
        mc.record_run_error("u1", TB.format("IndexError: list index out of range"))
    mc.record_run_error("u1", TB.format("NameError: name 'x' is not defined"), lesson_id="lists")
    mc.record_run_error("u1", "no error here")
    mc.record_run_error("u2", TB.format("KeyError: 'a'"))
    r = mc.my_misconceptions(caller="u1")
    assert r["total"] == 4
    assert [i["type"] for i in r["items"]] == ["IndexError", "NameError"]
    assert r["items"][0]["count"] == 3 and r["items"][0]["lesson"] == "lists" and r["items"][0]["tip"]


def test_bad_lesson_id_is_not_stored(db):
    mc.record_run_error("u1", TB.format("KeyError: 'a'"), lesson_id="../../etc")
    topic = sqlite3.connect(db).execute("SELECT topic FROM learning_signals").fetchone()[0]
    assert topic == "playground"


def test_old_errors_drop_out(db):
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO learning_signals VALUES ('a','u1','run_error','playground','{\"type\": \"KeyError\"}',NULL,'2025-01-01 00:00:00')")
    conn.commit()
    conn.close()
    assert mc.my_misconceptions(caller="u1")["items"] == []
