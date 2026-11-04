"""
The Knowledge Map counts completed lessons (live audit 2026-11-04).

On pymasters.net an account that had completed all 524 lessons saw "13 mastered" and "Data Types — Not started":
the graph's mastery overlay read only user_mastery, which rises 0.1 per passed challenge, and ignored
lesson_completions. The review queue already treats a completion as learned (review.COMPLETED_MASTERY); the
knowledge map now does the same.
"""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from graph.queries import get_user_mastery_map  # noqa: E402

LEARNED = 0.8


@pytest.fixture()
def db(tmp_path):
    path = str(tmp_path / "km.db")
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE concepts (id TEXT PRIMARY KEY, name TEXT, category TEXT, difficulty TEXT, description TEXT);
        CREATE TABLE lesson_concepts (lesson_id TEXT, concept_id TEXT, role TEXT DEFAULT 'teaches', depth TEXT,
                                      PRIMARY KEY (lesson_id, concept_id, role));
        CREATE TABLE user_mastery (user_id TEXT, topic TEXT, mastery_level REAL, attempts INTEGER, avg_time_seconds REAL,
                                   last_practiced TEXT, struggle_count INTEGER, PRIMARY KEY (user_id, topic));
        CREATE TABLE lesson_completions (user_id TEXT, lesson_id TEXT, completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                         xp_awarded INTEGER DEFAULT 0, PRIMARY KEY (user_id, lesson_id));
        INSERT INTO concepts (id, name, category, difficulty) VALUES
            ('data_types', 'Data Types', 'python_core', 'beginner'),
            ('tuples', 'Tuples', 'python_core', 'beginner'),
            ('loops', 'Loops', 'python_core', 'beginner'),
            ('variables', 'Variables', 'python_core', 'beginner');
        INSERT INTO lesson_concepts (lesson_id, concept_id, role) VALUES
            ('data_types_toolbox', 'data_types', 'teaches'),
            ('data_types_toolbox', 'tuples', 'uses'),
            ('loops_lesson', 'loops', 'teaches');
    """)
    c.commit()
    c.close()
    return path


def _complete(db, user, lesson):
    c = sqlite3.connect(db)
    c.execute("INSERT INTO lesson_completions (user_id, lesson_id) VALUES (?, ?)", [user, lesson])
    c.commit()
    c.close()


def _mastery(db, user, topic, level):
    c = sqlite3.connect(db)
    c.execute("INSERT INTO user_mastery (user_id, topic, mastery_level) VALUES (?, ?, ?)", [user, topic, level])
    c.commit()
    c.close()


def test_a_completed_lesson_marks_the_concept_it_teaches_as_learned(db):
    _mastery(db, "u1", "data_types_toolbox", 0.1)        # one pass = +0.1, far below "mastered"
    _complete(db, "u1", "data_types_toolbox")
    m = get_user_mastery_map(db, "u1")
    assert m["data_types"] >= LEARNED
    assert m["tuples"] == 0.0                              # only concepts the lesson TEACHES, not ones it uses
    assert m["loops"] == 0.0                               # untouched concept stays not started


def test_a_lesson_whose_id_is_the_concept_counts_too(db):
    _complete(db, "u1", "variables")                       # many lessons are keyed by their concept id
    assert get_user_mastery_map(db, "u1")["variables"] >= LEARNED


def test_higher_mastery_is_kept_and_other_users_are_unaffected(db):
    _mastery(db, "u1", "loops_lesson", 0.95)
    _complete(db, "u1", "loops_lesson")
    _complete(db, "u2", "data_types_toolbox")
    assert get_user_mastery_map(db, "u1")["loops"] == pytest.approx(0.95)
    assert get_user_mastery_map(db, "u1")["data_types"] == 0.0


def test_no_completions_table_still_works(tmp_path):
    path = str(tmp_path / "old.db")
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE concepts (id TEXT PRIMARY KEY, name TEXT, category TEXT, difficulty TEXT, description TEXT);
        CREATE TABLE lesson_concepts (lesson_id TEXT, concept_id TEXT, role TEXT, depth TEXT);
        CREATE TABLE user_mastery (user_id TEXT, topic TEXT, mastery_level REAL);
        INSERT INTO concepts (id, name, category, difficulty) VALUES ('loops', 'Loops', 'python_core', 'beginner');
    """)
    c.commit()
    c.close()
    assert get_user_mastery_map(path, "u1") == {"loops": 0.0}
