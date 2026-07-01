"""
graph/seed_links.py — idempotent startup seeding of the lesson_concepts table.

Why this exists: the knowledge graph's mastery overlay joins user_mastery
through lesson_concepts; until 2026-07-02 that table was only populated by
running `python -m graph.lesson_tagger` manually (which nobody did, and whose
curated map only covers ~4 of the 25+ lesson tracks). Result: the whole
adaptive layer — frontier recommendations, gap detection, the Knowledge Map —
computed on an empty join and reported 0.0 mastery for every user.

Called from main.py init_db() on every boot. Safe: INSERT OR IGNORE only,
never mutates lesson JSON files.

Mapping priority per lesson:
  1. Curated LESSON_CONCEPT_MAP entry from graph.lesson_tagger (teaches +
     requires), when importable and present.
  2. Deterministic fallback: normalized lesson `id`, then `topic`, matched
     exactly against normalized concept ids. No fuzzy guessing at boot.
"""

import json
import sqlite3
from pathlib import Path

LESSONS_DIR = Path(__file__).resolve().parent.parent / "lessons"

try:
    from graph.lesson_tagger import LESSON_CONCEPT_MAP
except Exception:  # pragma: no cover — tagger unavailable: fallback-only mode
    LESSON_CONCEPT_MAP = {}


def _norm(s: str) -> str:
    """Normalize an id/topic for concept matching: lowercase, non-alnum -> _."""
    return "".join(ch if ch.isalnum() else "_" for ch in (s or "").strip().lower()).strip("_")


def seed_lesson_concepts(db_path: str) -> int:
    """Populate lesson_concepts idempotently; returns number of links added."""
    conn = sqlite3.connect(db_path)
    inserted = 0
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS lesson_concepts (
                lesson_id TEXT NOT NULL,
                concept_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'teaches',
                depth TEXT DEFAULT 'moderate',
                PRIMARY KEY (lesson_id, concept_id, role)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson ON lesson_concepts(lesson_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_concept ON lesson_concepts(concept_id)")

        concept_ids = {r[0] for r in conn.execute("SELECT id FROM concepts").fetchall()}
        norm_to_concept = {_norm(cid): cid for cid in concept_ids}

        before = conn.execute("SELECT COUNT(*) FROM lesson_concepts").fetchone()[0]
        cursor = conn.cursor()

        for track_dir in sorted(LESSONS_DIR.iterdir()) if LESSONS_DIR.exists() else []:
            if not track_dir.is_dir():
                continue
            for filepath in sorted(track_dir.glob("*.json")):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    continue
                lesson_id = data.get("id") or filepath.stem

                mapping = LESSON_CONCEPT_MAP.get(lesson_id)
                if mapping:
                    for concept_id in mapping.get("teaches", []):
                        if concept_id in concept_ids:
                            cursor.execute(
                                "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) "
                                "VALUES (?, ?, 'teaches', 'moderate')", (lesson_id, concept_id))
                    for concept_id in mapping.get("requires", []):
                        if concept_id in concept_ids:
                            cursor.execute(
                                "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) "
                                "VALUES (?, ?, 'requires', 'moderate')", (lesson_id, concept_id))
                    continue

                # Deterministic fallback: exact normalized id/topic -> concept id
                for candidate in (lesson_id, data.get("topic", "")):
                    concept_id = norm_to_concept.get(_norm(candidate))
                    if concept_id:
                        cursor.execute(
                            "INSERT OR IGNORE INTO lesson_concepts (lesson_id, concept_id, role, depth) "
                            "VALUES (?, ?, 'teaches', 'moderate')", (lesson_id, concept_id))
                        break

        conn.commit()
        inserted = conn.execute("SELECT COUNT(*) FROM lesson_concepts").fetchone()[0] - before
    finally:
        conn.close()
    return inserted
