"""Curated concept -> teaching-lesson links (graph/concept_links.json) reach the knowledge graph.

Live audit 2026-11-04: with every lesson completed, 90 of 277 Knowledge Map concepts still read "Not started"
(e.g. Recursion, Regex, JSON, Django, RAG) because no lesson's id matched the concept id, so lesson_concepts
had no 'teaches' link for them and completions could never count.
"""
import json
import os
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from graph.concepts import seed_concepts  # noqa: E402
from graph.seed_links import seed_lesson_concepts  # noqa: E402

LINKS = json.loads((Path(__file__).resolve().parents[1] / "graph" / "concept_links.json").read_text())
CURATED = {k: v for k, v in LINKS.items() if not k.startswith("_")}
LESSON_IDS = set()
for f in (Path(__file__).resolve().parents[1] / "lessons").rglob("*.json"):
    try:
        d = json.loads(f.read_text())
    except Exception:  # noqa: BLE001
        continue
    if isinstance(d, dict) and "practice_challenges" in d:
        LESSON_IDS.add(d.get("id") or f.stem)


@pytest.fixture()
def seeded(tmp_path):
    db = str(tmp_path / "t.db")
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE concepts (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, "
              "difficulty TEXT NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("CREATE TABLE concept_edges (from_concept TEXT, to_concept TEXT, relationship TEXT, weight REAL, "
              "PRIMARY KEY (from_concept, to_concept))")
    c.commit()
    c.close()
    seed_concepts(db)
    seed_lesson_concepts(db)
    return db


def test_curated_links_name_real_concepts_and_real_lessons(seeded):
    concepts = {r[0] for r in sqlite3.connect(seeded).execute("SELECT id FROM concepts")}
    assert not set(CURATED) - concepts, sorted(set(CURATED) - concepts)
    assert not set(LINKS["_gaps"]) - concepts, sorted(set(LINKS["_gaps"]) - concepts)
    missing = sorted({l for ls in CURATED.values() for l in ls} - LESSON_IDS)
    assert not missing, f"lesson ids that do not exist: {missing}"
    assert not set(CURATED) & set(LINKS["_gaps"])


def test_every_curated_concept_gets_a_teaching_lesson(seeded):
    taught = {r[0] for r in sqlite3.connect(seeded).execute(
        "SELECT DISTINCT concept_id FROM lesson_concepts WHERE role = 'teaches'")}
    assert not set(CURATED) - taught, sorted(set(CURATED) - taught)
    # Only the listed content gaps (no lesson teaches them yet) may remain unlinked.
    concepts = {r[0] for r in sqlite3.connect(seeded).execute("SELECT id FROM concepts")}
    unlinked = concepts - taught
    assert unlinked <= set(LINKS["_gaps"]), sorted(unlinked - set(LINKS["_gaps"]))
