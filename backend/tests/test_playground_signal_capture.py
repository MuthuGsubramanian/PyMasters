"""
Pattern-capture regression (2026-07-08): the Playground free-form chat is where
curious learners reveal what they're exploring or stuck on, but it recorded NO
learning signal — unlike classroom chat/evaluate/diagnostic. Those questions are
a rich, previously-discarded signal for the knowledge model. The Playground now
records a 'playground_question' signal whenever Vaathiyaar identifies the topic.
"""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.playground import _maybe_record_playground_signal


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "s.db")
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE learning_signals (
            id TEXT PRIMARY KEY, user_id TEXT, signal_type TEXT, topic TEXT,
            value TEXT, session_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    return path


def _signals(db):
    conn = sqlite3.connect(db)
    rows = conn.execute(
        "SELECT signal_type, topic FROM learning_signals WHERE user_id = 'u1'"
    ).fetchall()
    conn.close()
    return rows


def test_records_signal_when_topic_identified(db):
    resp = {"response": "...", "profile_update": {"topic_practiced": "decorators"}}
    _maybe_record_playground_signal(db, "u1", resp)
    rows = _signals(db)
    assert len(rows) == 1
    assert rows[0][0] == "playground_question"
    assert rows[0][1] == "decorators"


def test_no_signal_when_no_topic(db):
    _maybe_record_playground_signal(db, "u1", {"response": "hi"})
    assert _signals(db) == []
    _maybe_record_playground_signal(db, "u1", {"profile_update": {}})
    assert _signals(db) == []


def test_string_response_is_safe(db):
    # call_vaathiyaar can return a bare string; must not raise.
    _maybe_record_playground_signal(db, "u1", "just a string reply")
    assert _signals(db) == []


def test_capture_never_raises_on_bad_db():
    # Best-effort: a broken db path must not bubble up and fail the chat request.
    _maybe_record_playground_signal("/nonexistent/dir/x.db", "u1",
                                    {"profile_update": {"topic_practiced": "loops"}})
