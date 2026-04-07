from fastapi import APIRouter, HTTPException
import sqlite3
import uuid
import json
import os
import threading
from modules.models import ModuleRequest, JobStatus
from modules.pipeline import run_pipeline

router = APIRouter(prefix="/api/modules", tags=["modules"])


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


@router.post("/request")
async def request_module(data: ModuleRequest):
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
    progress_map = {"queued": 0, "stage_1": 20, "stage_2": 40, "stage_3": 60, "stage_4": 80, "stage_5": 90, "completed": 100, "failed": 0}

    return {
        "job_id": row["id"],
        "status": status,
        "current_stage": status if status.startswith("stage_") else None,
        "progress_pct": progress_map.get(status, 0),
        "result_lesson_id": row["result_lesson_id"],
        "error_message": row["error_message"],
    }


@router.get("/generated/{user_id}")
async def list_generated_modules(user_id: str):
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, topic, trigger, trigger_detail, created_at FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC",
        [user_id],
    ).fetchall()
    conn.close()
    return {"modules": [dict(r) for r in rows]}
