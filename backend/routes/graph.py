"""
graph.py — FastAPI APIRouter for knowledge graph endpoints.
Prefix: /api/graph
"""

import os
import sqlite3
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/graph", tags=["graph"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


@router.get("/concepts")
def list_concepts():
    """List all concepts with category and difficulty."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, name, category, difficulty, description FROM concepts ORDER BY category, difficulty").fetchall()
    conn.close()
    return {"concepts": [dict(r) for r in rows]}


@router.get("/concepts/{concept_id}")
def get_concept(concept_id: str):
    """Get a concept with its edges and related lessons."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    concept = conn.execute("SELECT * FROM concepts WHERE id = ?", [concept_id]).fetchone()
    conn.close()

    if not concept:
        raise HTTPException(status_code=404, detail=f"Concept '{concept_id}' not found")

    from graph.edges import get_prerequisites, get_dependents, get_lessons_for_concept
    return {
        "concept": dict(concept),
        "prerequisites": get_prerequisites(DB_PATH, concept_id),
        "dependents": get_dependents(DB_PATH, concept_id),
        "lessons": get_lessons_for_concept(DB_PATH, concept_id),
    }


@router.get("/user-map/{user_id}")
def user_knowledge_map(user_id: str):
    """Get the full knowledge map with user mastery overlay."""
    from graph.queries import get_full_knowledge_map
    return get_full_knowledge_map(DB_PATH, user_id)


@router.get("/recommendations/{user_id}")
def recommendations(user_id: str, limit: int = 5):
    """Get top recommended concepts based on current mastery."""
    from graph.queries import get_learning_frontier
    return {"recommendations": get_learning_frontier(DB_PATH, user_id, limit)}


@router.get("/gaps/{user_id}/{target_concept}")
def knowledge_gaps(user_id: str, target_concept: str):
    """Find prerequisite gaps for a target concept."""
    from graph.queries import detect_knowledge_gaps
    return {"gaps": detect_knowledge_gaps(DB_PATH, user_id, target_concept)}
