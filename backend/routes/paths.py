"""
paths.py — FastAPI APIRouter for learning paths.

Prefix: /api/paths
"""

import json
import os
import sqlite3
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from paths.recommender import recommend_path

router = APIRouter(prefix="/api/paths", tags=["paths"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class StartPathRequest(BaseModel):
    user_id: str


class SwitchPathRequest(BaseModel):
    user_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row):
    """Convert a sqlite3.Row to a dict, parsing JSON fields."""
    if row is None:
        return None
    d = dict(row)
    for key in ("lesson_sequence", "concepts_covered", "adapted_sequence", "skipped_lessons", "inserted_lessons"):
        if key in d and d[key] and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def list_paths():
    """List all 15 learning paths (lightweight metadata)."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, name, description, icon, difficulty_start, difficulty_end, category, estimated_hours, lesson_sequence, concepts_covered FROM learning_paths ORDER BY category, name"
    ).fetchall()
    conn.close()

    paths = []
    for row in rows:
        d = _row_to_dict(row)
        d["lesson_count"] = len(d.get("lesson_sequence", []))
        paths.append(d)
    return {"paths": paths}


@router.get("/active")
def get_active_paths(user_id: str = Query(...)):
    """Get user's active path(s)."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT ulp.*, lp.name, lp.description, lp.icon, lp.lesson_sequence, lp.estimated_hours
           FROM user_learning_paths ulp
           JOIN learning_paths lp ON ulp.path_id = lp.id
           WHERE ulp.user_id = ? AND ulp.status = 'active'
           ORDER BY ulp.last_activity DESC""",
        [user_id],
    ).fetchall()
    conn.close()

    active = []
    for row in rows:
        d = _row_to_dict(row)
        sequence = d.get("adapted_sequence") or d.get("lesson_sequence", [])
        if isinstance(sequence, str):
            sequence = json.loads(sequence)
        d["total_lessons"] = len(sequence)
        active.append(d)
    return {"active_paths": active}


@router.get("/recommend")
def recommend(user_id: str = Query(...)):
    """Get recommended path for user based on onboarding profile."""
    result = recommend_path(user_id)
    if not result:
        return {"recommended": None, "message": "No profile found. Complete onboarding first."}
    # Parse JSON fields
    for key in ("lesson_sequence", "concepts_covered"):
        if key in result and isinstance(result[key], str):
            try:
                result[key] = json.loads(result[key])
            except (json.JSONDecodeError, TypeError):
                pass
    result["lesson_count"] = len(result.get("lesson_sequence", []))
    return {"recommended": result}


@router.get("/{path_id}")
def get_path_detail(path_id: str):
    """Get full path detail with lesson sequence."""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Path '{path_id}' not found.")

    return _row_to_dict(row)


@router.post("/{path_id}/start")
def start_path(path_id: str, body: StartPathRequest):
    """Start a learning path for a user. Creates a user_learning_paths row."""
    conn = _get_conn()

    # Verify path exists
    path = conn.execute("SELECT id FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    if not path:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Path '{path_id}' not found.")

    # Check if already started
    existing = conn.execute(
        "SELECT status FROM user_learning_paths WHERE user_id = ? AND path_id = ?",
        [body.user_id, path_id],
    ).fetchone()

    if existing:
        if existing["status"] == "active":
            conn.close()
            return {"message": "Path already active.", "path_id": path_id, "status": "active"}
        elif existing["status"] == "paused":
            # Resume
            conn.execute(
                "UPDATE user_learning_paths SET status = 'active', last_activity = CURRENT_TIMESTAMP WHERE user_id = ? AND path_id = ?",
                [body.user_id, path_id],
            )
            conn.commit()
            conn.close()
            return {"message": "Path resumed.", "path_id": path_id, "status": "active"}

    # Create new entry
    conn.execute(
        """INSERT INTO user_learning_paths (user_id, path_id, status, current_position, last_activity)
           VALUES (?, ?, 'active', 0, CURRENT_TIMESTAMP)""",
        [body.user_id, path_id],
    )
    conn.commit()
    conn.close()
    return {"message": "Path started.", "path_id": path_id, "status": "active"}


@router.get("/{path_id}/progress")
def get_progress(path_id: str, user_id: str = Query(...)):
    """Get user's progress on a path — position, adapted sequence, completed lessons."""
    conn = _get_conn()

    ulp = conn.execute(
        "SELECT * FROM user_learning_paths WHERE user_id = ? AND path_id = ?",
        [user_id, path_id],
    ).fetchone()

    if not ulp:
        conn.close()
        raise HTTPException(status_code=404, detail="User has not started this path.")

    ulp_dict = _row_to_dict(ulp)

    # Get the effective sequence
    path = conn.execute("SELECT lesson_sequence FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    original_sequence = json.loads(path["lesson_sequence"]) if path else []
    effective_sequence = ulp_dict.get("adapted_sequence") or original_sequence

    # Get completed lessons that are in this path
    if effective_sequence:
        placeholders = ",".join("?" * len(effective_sequence))
        completed_rows = conn.execute(
            f"SELECT lesson_id FROM lesson_completions WHERE user_id = ? AND lesson_id IN ({placeholders})",
            [user_id] + effective_sequence,
        ).fetchall()
        completed = [r["lesson_id"] for r in completed_rows]
    else:
        completed = []

    conn.close()

    return {
        "path_id": path_id,
        "status": ulp_dict.get("status"),
        "current_position": ulp_dict.get("current_position", 0),
        "total_lessons": len(effective_sequence),
        "completed_lessons": completed,
        "completed_count": len(completed),
        "progress_pct": round(len(completed) / len(effective_sequence) * 100, 1) if effective_sequence else 0,
        "effective_sequence": effective_sequence,
        "started_at": ulp_dict.get("started_at"),
        "last_activity": ulp_dict.get("last_activity"),
    }


@router.post("/{path_id}/switch")
def switch_path(path_id: str, body: SwitchPathRequest):
    """Switch to a new path — pauses current active path, starts the new one."""
    conn = _get_conn()

    # Verify new path exists
    path = conn.execute("SELECT id FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    if not path:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Path '{path_id}' not found.")

    # Pause all currently active paths
    conn.execute(
        "UPDATE user_learning_paths SET status = 'paused' WHERE user_id = ? AND status = 'active'",
        [body.user_id],
    )

    # Check if user previously started this path
    existing = conn.execute(
        "SELECT status FROM user_learning_paths WHERE user_id = ? AND path_id = ?",
        [body.user_id, path_id],
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE user_learning_paths SET status = 'active', last_activity = CURRENT_TIMESTAMP WHERE user_id = ? AND path_id = ?",
            [body.user_id, path_id],
        )
    else:
        conn.execute(
            """INSERT INTO user_learning_paths (user_id, path_id, status, current_position, last_activity)
               VALUES (?, ?, 'active', 0, CURRENT_TIMESTAMP)""",
            [body.user_id, path_id],
        )

    conn.commit()
    conn.close()
    return {"message": "Switched path.", "path_id": path_id, "status": "active"}
