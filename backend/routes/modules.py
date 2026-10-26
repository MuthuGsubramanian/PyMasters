from fastapi import APIRouter, HTTPException, Depends
import sqlite3
import uuid
import json
import os
import threading
from modules.models import ModuleRequest, JobStatus
from modules.pipeline import run_pipeline
from auth import get_current_user_id

router = APIRouter(prefix="/api/modules", tags=["modules"])


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


@router.post("/request")
async def request_module(data: ModuleRequest, caller: str = Depends(get_current_user_id)):
    # Generation is expensive (LLM pipeline) and was callable anonymously with
    # any user_id (audit 2026-10-23 P0). Require a verified JWT and bind the job
    # to the caller regardless of the body's user_id.
    if data.user_id and data.user_id != caller:
        raise HTTPException(status_code=403, detail="Cannot request modules for another user")
    data.user_id = caller
    job_id = str(uuid.uuid4())
    conn = sqlite3.connect(_get_db_path())
    conn.execute(
        """INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority)
           VALUES (?, ?, ?, 'user_request', ?, 'queued', 1)""",
        [job_id, data.user_id, data.topic, f"User requested: {data.topic}"],
    )
    conn.commit()
    conn.close()

    # Run pipeline in background thread
    thread = threading.Thread(
        target=run_pipeline,
        args=(job_id, data.user_id, data.topic),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "queued", "topic": data.topic}


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM module_generation_jobs WHERE id = ?", [job_id]
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    status = row["status"]
    progress_map = {
        "queued": 5,
        "stage_1_outline": 15, "stage_1_complete": 25,
        "stage_2_narrative": 35, "stage_2_complete": 45,
        "stage_3_animation": 55, "stage_3_complete": 65,
        "stage_4_challenges": 75, "stage_4_complete": 85,
        "stage_5_assembly": 92,
        "completed": 100, "failed": 0,
    }

    return {
        "job_id": row["id"],
        "status": status,
        "current_stage": status if status.startswith("stage_") else None,
        "progress_pct": progress_map.get(status, 0),
        "result_lesson_id": row["result_lesson_id"],
        "error_message": row["error_message"],
    }


@router.get("/generated/{user_id}")
async def list_generated_modules(user_id: str, caller: str = Depends(get_current_user_id)):
    if user_id != caller:
        raise HTTPException(status_code=403, detail="Forbidden")
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, topic, trigger, trigger_detail, created_at FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC",
        [user_id],
    ).fetchall()
    conn.close()
    return {"modules": [dict(r) for r in rows]}
