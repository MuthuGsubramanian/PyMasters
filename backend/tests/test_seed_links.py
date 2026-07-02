"""
Regression tests for graph/seed_links.py — the startup seeding of
lesson_concepts, and the mastery overlay that depends on it.

Background (2026-07-02): lesson_concepts had 0 rows in every environment, so
the adaptive layer (mastery map, frontier, gaps) computed on an empty join and
reported 0.0 mastery for all users. seed_lesson_concepts() now runs at boot.
"""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from graph.seed_links import seed_lesson_concepts, _norm
from graph.concepts import seed_concepts
from graph.queries import get_user_mastery_map, get_learning_frontier


@pytest.fixture()
def seeded_db(tmp_path):
    db = str(tmp_path / "t.db")
    conn = sqlite3.connect(db)
    conn.execute("""
        CREATE TABLE user_mastery (
            user_id TEXT, topic TEXT, mastery_level REAL,
            attempts INTEGER DEFAULT 1, avg_time_seconds REAL,
            last_practiced TEXT, struggle_count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, topic)
        )
    """)
    conn.execute("""
        CREATE TABLE concepts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE concept_edges (
            from_concept TEXT NOT NULL REFERENCES concepts(id),
            to_concept TEXT NOT NULL REFERENCES concepts(id),
            relationship TEXT NOT NULL DEFAULT 'requires',
            weight REAL DEFAULT 1.0,
            PRIMARY KEY (from_concept, to_concept)
        )
    """)
    conn.commit()
    conn.close()
    seed_concepts(db)
    return db


def test_norm():
    assert _norm("Agent Fundamentals!") == "agent_fundamentals"
    assert _norm("  RAG-Systems ") == "rag_systems"
    assert _norm("") == ""


def test_seed_populates_links(seeded_db):
    added = seed_lesson_concepts(seeded_db)
    assert added > 100, f"expected substantial lesson-to-concept coverage, got {added}"

    conn = sqlite3.connect(seeded_db)
    covered = conn.execute(
        "SELECT COUNT(DISTINCT concept_id) FROM lesson_concepts WHERE role='teaches'"
    ).fetchone()[0]
    conn.close()
    assert covered > 50


def test_seed_is_idempotent(seeded_db):
    first = seed_lesson_concepts(seeded_db)
    second = seed_lesson_concepts(seeded_db)
    assert first > 0
    assert second == 0, "re-running the seed must not add duplicate links"


def test_mastery_flows_to_map_and_frontier(seeded_db):
    seed_lesson_concepts(seeded_db)
    conn = sqlite3.connect(seeded_db)
    conn.execute(
        "INSERT INTO user_mastery (user_id, topic, mastery_level) VALUES ('u1','variables',0.8)"
    )
    conn.commit()
    conn.close()

    mastery = get_user_mastery_map(seeded_db, "u1")
    assert mastery.get("variables") == pytest.approx(0.8)

    frontier_ids = [c["id"] for c in get_learning_frontier(seeded_db, "u1", 10)]
    assert "variables" not in frontier_ids, "mastered concepts must not be recommended"
    assert len(frontier_ids) > 0


def test_unknown_topics_do_not_pollute_map(seeded_db):
    seed_lesson_concepts(seeded_db)
    conn = sqlite3.connect(seeded_db)
    conn.execute(
        "INSERT INTO user_mastery (user_id, topic, mastery_level) VALUES ('u2','totally_made_up_topic',0.9)"
    )
    conn.commit()
    conn.close()

    mastery = get_user_mastery_map(seeded_db, "u2")
    assert "totally_made_up_topic" not in mastery
    assert all(v == 0.0 for v in mastery.values())


def test_frontier_is_beginner_first_for_new_user(seeded_db):
    """Live-QA regression (2026-07-02): a brand-new user was recommended
    Docker/Git before Variables because the frontier sort only understood
    string difficulties while production stores numeric (1/2/3). The frontier
    must be sorted easiest-first."""
    seed_lesson_concepts(seeded_db)
    frontier = get_learning_frontier(seeded_db, "brand-new-user", 10)
    assert frontier, "frontier must not be empty for a new user"

    def rank(d):
        try:
            return float(d)
        except (TypeError, ValueError):
            return {"beginner": 0.0, "intermediate": 1.0, "advanced": 2.0}.get(str(d).lower(), 1.0)

    ranks = [rank(c["difficulty"]) for c in frontier]
    assert ranks == sorted(ranks), f"frontier not easiest-first: {[(c['id'], c['difficulty']) for c in frontier]}"
