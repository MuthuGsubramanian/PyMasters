"""
graph/queries.py — Graph traversal: learning frontier, gap detection, recommendations.
"""

import sqlite3


def get_user_mastery_map(db_path: str, user_id: str) -> dict[str, float]:
    """Return {concept_id: mastery_level} for a user, including 0.0 for untouched concepts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    all_concepts = conn.execute("SELECT id FROM concepts").fetchall()

    mastery_rows = conn.execute(
        """
        SELECT lc.concept_id, MAX(um.mastery_level) as mastery
        FROM lesson_concepts lc
        LEFT JOIN user_mastery um ON um.topic = lc.concept_id AND um.user_id = ?
        WHERE lc.role = 'teaches'
        GROUP BY lc.concept_id
        """,
        [user_id],
    ).fetchall()
    conn.close()

    mastery_map = {r["id"]: 0.0 for r in all_concepts}
    for row in mastery_rows:
        if row["mastery"] is not None:
            mastery_map[row["concept_id"]] = row["mastery"]

    return mastery_map


def get_learning_frontier(db_path: str, user_id: str, limit: int = 5) -> list[dict]:
    """
    Find the next concepts a user should learn — concepts where:
    1. All prerequisites have mastery >= 0.5 (or no prerequisites)
    2. The concept itself has mastery < 0.5
    Sorted by: number of dependents (most impactful first)
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)

    all_concepts = conn.execute(
        "SELECT id, name, category, difficulty, description FROM concepts"
    ).fetchall()

    frontier = []
    for concept in all_concepts:
        cid = concept["id"]
        if mastery_map.get(cid, 0.0) >= 0.5:
            continue

        prereqs = conn.execute(
            "SELECT from_concept, weight FROM concept_edges WHERE to_concept = ? AND relationship = 'requires'",
            [cid],
        ).fetchall()

        prereqs_met = all(
            mastery_map.get(p["from_concept"], 0.0) >= 0.5 or p["weight"] < 0.7
            for p in prereqs
        )

        if prereqs_met:
            dependent_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM concept_edges WHERE from_concept = ?", [cid]
            ).fetchone()["cnt"]

            frontier.append({
                **dict(concept),
                "mastery": mastery_map.get(cid, 0.0),
                "dependent_count": dependent_count,
            })

    conn.close()

    difficulty_order = {"beginner": 0, "intermediate": 1, "advanced": 2}
    frontier.sort(key=lambda c: (-c["dependent_count"], difficulty_order.get(c["difficulty"], 1)))

    return frontier[:limit]


def detect_knowledge_gaps(db_path: str, user_id: str, target_concept: str) -> list[dict]:
    """
    Find prerequisite concepts the user hasn't mastered yet for a target concept.
    Returns a list of gap concepts sorted by depth (deepest prereqs first).
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)
    gaps = []
    visited = set()

    def _find_gaps(concept_id, depth=0):
        if concept_id in visited:
            return
        visited.add(concept_id)

        prereqs = conn.execute(
            "SELECT from_concept, weight FROM concept_edges WHERE to_concept = ? AND relationship = 'requires' AND weight >= 0.7",
            [concept_id],
        ).fetchall()

        for prereq in prereqs:
            pid = prereq["from_concept"]
            mastery = mastery_map.get(pid, 0.0)
            if mastery < 0.5:
                concept_info = conn.execute(
                    "SELECT id, name, category, difficulty FROM concepts WHERE id = ?", [pid]
                ).fetchone()
                if concept_info:
                    gaps.append({**dict(concept_info), "mastery": mastery, "depth": depth})
            _find_gaps(pid, depth + 1)

    _find_gaps(target_concept)
    conn.close()

    gaps.sort(key=lambda g: -g["depth"])
    return gaps


def get_full_knowledge_map(db_path: str, user_id: str) -> dict:
    """
    Return the full knowledge graph with user mastery overlaid.
    Used for the frontend KnowledgeMap visualization.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    mastery_map = get_user_mastery_map(db_path, user_id)

    concepts = conn.execute("SELECT id, name, category, difficulty FROM concepts").fetchall()
    edges = conn.execute("SELECT from_concept, to_concept, relationship, weight FROM concept_edges").fetchall()
    conn.close()

    nodes = []
    for c in concepts:
        nodes.append({
            **dict(c),
            "mastery": mastery_map.get(c["id"], 0.0),
        })

    return {
        "nodes": nodes,
        "edges": [dict(e) for e in edges],
    }
