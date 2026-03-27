"""
graph/edges.py — Edge management and prerequisite queries.
"""

import sqlite3


def get_prerequisites(db_path: str, concept_id: str) -> list[dict]:
    """Get all prerequisite concepts for a given concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.category, c.difficulty, ce.relationship, ce.weight
        FROM concept_edges ce
        JOIN concepts c ON c.id = ce.from_concept
        WHERE ce.to_concept = ?
        ORDER BY ce.weight DESC
        """,
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_dependents(db_path: str, concept_id: str) -> list[dict]:
    """Get all concepts that depend on a given concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.category, c.difficulty, ce.relationship, ce.weight
        FROM concept_edges ce
        JOIN concepts c ON c.id = ce.to_concept
        WHERE ce.from_concept = ?
        ORDER BY ce.weight DESC
        """,
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_lessons_for_concept(db_path: str, concept_id: str) -> list[dict]:
    """Get all lessons that teach, require, or reinforce a concept."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT lesson_id, role, depth FROM lesson_concepts WHERE concept_id = ?",
        [concept_id],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
