"""
paths.py — FastAPI APIRouter for learning paths.

Prefix: /api/paths
"""

import json
import os
import sqlite3
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user_id
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


def _require_self(user_id: str, caller: str) -> None:
    """IDOR guard: per-user path state (progress, recommendations, active paths)
    is private, and start/switch MUTATE a user's learning state.

    The user_id param is client-supplied; without this check any caller could
    read another user's progress or pause/switch their active paths. Derive the
    acting user from the verified JWT and refuse cross-user access. Mirrors the
    pattern in routes/graph.py and routes/profile.py.
    """
    if caller != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")


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


# Lazy index of lesson_id -> lesson JSON file path, built once per process.
_LESSONS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lessons"
)
_lesson_index = None


def _build_lesson_index():
    """Map every lesson id -> its JSON file path (cached after first scan)."""
    global _lesson_index
    if _lesson_index is not None:
        return _lesson_index
    index = {}
    if os.path.isdir(_LESSONS_DIR):
        for root, _dirs, files in os.walk(_LESSONS_DIR):
            for fn in files:
                if fn.endswith(".json") and fn != "schema.json":
                    index.setdefault(fn[:-5], os.path.join(root, fn))
    _lesson_index = index
    return index


def _resolve_text(value, lang="en"):
    """Lesson title/description may be a localized dict ({en, ta}); return a string."""
    if isinstance(value, dict):
        return value.get(lang) or value.get("en") or next(iter(value.values()), "")
    return value or ""


def _hydrate_lessons(sequence, lang="en"):
    """Turn a list of lesson ids into objects with title/description/xp for the UI.

    The path-detail UI renders lesson objects (title, description, xp_reward); the
    DB only stores an ordered list of lesson ids. Without this hydration the detail
    page showed "0 lessons" and an empty timeline.
    """
    index = _build_lesson_index()
    lessons = []
    for lid in sequence:
        if not isinstance(lid, str):
            continue
        lesson = {"id": lid}
        fp = index.get(lid)
        if fp:
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                lesson["title"] = _resolve_text(data.get("title"), lang) or lid
                lesson["description"] = _resolve_text(data.get("description"), lang)
                if data.get("xp_reward") is not None:
                    lesson["xp_reward"] = data.get("xp_reward")
            except (OSError, json.JSONDecodeError):
                pass
        lessons.append(lesson)
    return lessons


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
def get_active_paths(user_id: str = Query(...), caller: str = Depends(get_current_user_id)):
    """Get user's active path(s)."""
    _require_self(user_id, caller)
    conn = _get_conn()
    rows = conn.execute(
        """SELECT ulp.*, lp.name, lp.description, lp.icon, lp.lesson_sequence, lp.estimated_hours
           FROM user_learning_paths ulp
           JOIN learning_paths lp ON ulp.path_id = lp.id
           WHERE ulp.user_id = ? AND ulp.status = 'active'
           ORDER BY ulp.last_activity DESC""",
        [user_id],
    ).fetchall()

    active = []
    for row in rows:
        d = _row_to_dict(row)
        sequence = d.get("adapted_sequence") or d.get("lesson_sequence", [])
        if isinstance(sequence, str):
            try:
                sequence = json.loads(sequence)
            except (json.JSONDecodeError, TypeError):
                sequence = []
        if not isinstance(sequence, list):
            sequence = []
        d["total_lessons"] = len(sequence)
        # Additive progress enrichment (NEW optional fields; existing fields untouched).
        # Mirrors GET /{path_id}/progress so the Paths list page's Active-Path banner can
        # render a real completed count / percentage without a second round-trip.
        seq_ids = [lid for lid in sequence if isinstance(lid, str)]
        completed_count = 0
        if seq_ids:
            placeholders = ",".join("?" * len(seq_ids))
            completed_count = len(
                conn.execute(
                    f"SELECT lesson_id FROM lesson_completions WHERE user_id = ? AND lesson_id IN ({placeholders})",
                    [user_id] + seq_ids,
                ).fetchall()
            )
        d["completed_count"] = completed_count
        d["progress_pct"] = round(completed_count / len(seq_ids) * 100, 1) if seq_ids else 0
        active.append(d)
    conn.close()
    return {"active_paths": active}


@router.get("/recommend")
def recommend(user_id: str = Query(...), caller: str = Depends(get_current_user_id)):
    """Get recommended path for user based on onboarding profile."""
    _require_self(user_id, caller)
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
def get_path_detail(path_id: str, lang: str = Query("en")):
    """Get full path detail with the lesson sequence hydrated into lesson objects."""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Path '{path_id}' not found.")

    result = _row_to_dict(row)
    sequence = result.get("lesson_sequence") or []
    if isinstance(sequence, str):
        try:
            sequence = json.loads(sequence)
        except (json.JSONDecodeError, TypeError):
            sequence = []
    # UI reads path.lessons (objects with title/description/xp); DB only stores ids.
    result["lessons"] = _hydrate_lessons(sequence, lang)
    result["lesson_count"] = len(result["lessons"])
    return result


@router.post("/{path_id}/start")
def start_path(path_id: str, body: StartPathRequest, caller: str = Depends(get_current_user_id)):
    """Start a learning path for a user. Creates a user_learning_paths row."""
    _require_self(body.user_id, caller)
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
def get_progress(path_id: str, user_id: str = Query(...), caller: str = Depends(get_current_user_id)):
    """Get user's progress on a path — position, adapted sequence, completed lessons."""
    _require_self(user_id, caller)
    conn = _get_conn()

    ulp = conn.execute(
        "SELECT * FROM user_learning_paths WHERE user_id = ? AND path_id = ?",
        [user_id, path_id],
    ).fetchone()

    if not ulp:
        conn.close()
        raise HTTPException(status_code=404, detail="User has not started this path.")

    ulp_dict = _row_to_dict(ulp)

    # Get the effective sequence (harden parse — mirror get_active_paths so a
    # NULL/empty/corrupt lesson_sequence or an unparsed adapted_sequence string
    # can never crash this endpoint).
    path = conn.execute("SELECT lesson_sequence FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    original_sequence = path["lesson_sequence"] if path else []
    if isinstance(original_sequence, str):
        try:
            original_sequence = json.loads(original_sequence)
        except (json.JSONDecodeError, TypeError):
            original_sequence = []
    effective_sequence = ulp_dict.get("adapted_sequence") or original_sequence
    # adapted_sequence is normally parsed to a list by _row_to_dict, but a corrupt
    # stored value would remain a raw string — coerce defensively before use.
    if isinstance(effective_sequence, str):
        try:
            effective_sequence = json.loads(effective_sequence)
        except (json.JSONDecodeError, TypeError):
            effective_sequence = []
    if not isinstance(effective_sequence, list):
        effective_sequence = []

    # Get completed lessons that are in this path (bind only string ids, like /active)
    seq_ids = [lid for lid in effective_sequence if isinstance(lid, str)]
    if seq_ids:
        placeholders = ",".join("?" * len(seq_ids))
        completed_rows = conn.execute(
            f"SELECT lesson_id FROM lesson_completions WHERE user_id = ? AND lesson_id IN ({placeholders})",
            [user_id] + seq_ids,
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
def switch_path(path_id: str, body: SwitchPathRequest, caller: str = Depends(get_current_user_id)):
    """Switch to a new path — pauses current active path, starts the new one."""
    _require_self(body.user_id, caller)
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
