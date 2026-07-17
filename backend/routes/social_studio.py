"""
social_studio.py — Super-admin on-demand social publishing.  Prefix: /api

The super-admin console queues a "social job" (topic + style direction +
channels). Video rendering (ffmpeg/TTS) and the YouTube/LinkedIn credentials
live on the local ops machine, NOT on Cloud Run — so jobs are executed by
pipeline/social_worker.py, which polls the worker endpoints below on a
5-minute scheduled task, runs the generators, publishes, and reports back.

Auth model:
  * /admin/social/*  — super-admin JWT (same gate as the rest of the console).
  * /social-worker/* — machine-to-machine: header X-Worker-Token compared
    (constant-time) against env SOCIAL_WORKER_TOKEN. 503 when the env is
    unset, 403 on mismatch. The token is set via GitHub secret → deploy.yml.
"""

import hmac
import json
import os
import sqlite3
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from routes.admin import require_super_admin

router = APIRouter(prefix="/api", tags=["social-studio"])

VALID_CHANNELS = {"youtube", "linkedin"}


def _db():
    conn = sqlite3.connect(os.getenv("DB_PATH", os.path.abspath("pymasters.db")))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table(conn):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS social_jobs (
               id TEXT PRIMARY KEY,
               requested_by TEXT,
               topic TEXT NOT NULL,
               style_notes TEXT,
               channels TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'pending',
               result TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    conn.commit()


def _require_worker(x_worker_token: Optional[str]):
    expected = os.getenv("SOCIAL_WORKER_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Social worker not configured")
    if not x_worker_token or not hmac.compare_digest(x_worker_token, expected):
        raise HTTPException(status_code=403, detail="Forbidden")


def _row_to_job(r) -> dict:
    return {
        "id": r["id"],
        "requested_by": r["requested_by"],
        "topic": r["topic"],
        "style_notes": r["style_notes"],
        "channels": json.loads(r["channels"]),
        "status": r["status"],
        "result": json.loads(r["result"]) if r["result"] else None,
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


# ── Super-admin surface ──────────────────────────────────────────────────────

class SocialJobCreate(BaseModel):
    topic: str
    style_notes: Optional[str] = None
    channels: list[str] = ["youtube", "linkedin"]


@router.post("/admin/social/jobs")
def create_job(body: SocialJobCreate, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    topic = (body.topic or "").strip()
    if not 3 <= len(topic) <= 300:
        raise HTTPException(status_code=422, detail="Topic must be 3-300 characters")
    channels = [c for c in body.channels if c in VALID_CHANNELS]
    if not channels:
        raise HTTPException(status_code=422, detail="Pick at least one channel (youtube/linkedin)")
    style = (body.style_notes or "").strip()[:1000] or None
    conn = _db()
    try:
        _ensure_table(conn)
        job_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO social_jobs (id, requested_by, topic, style_notes, channels) VALUES (?,?,?,?,?)",
            [job_id, caller, topic, style, json.dumps(channels)],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM social_jobs WHERE id = ?", [job_id]).fetchone()
        return _row_to_job(row)
    finally:
        conn.close()


@router.get("/admin/social/jobs")
def list_jobs(limit: int = 20, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _db()
    try:
        _ensure_table(conn)
        rows = conn.execute(
            "SELECT * FROM social_jobs ORDER BY created_at DESC LIMIT ?",
            [max(1, min(int(limit), 100))],
        ).fetchall()
        return [_row_to_job(r) for r in rows]
    finally:
        conn.close()


# ── Worker surface (local ops machine) ───────────────────────────────────────

@router.post("/social-worker/claim")
def claim_job(x_worker_token: Optional[str] = Header(default=None)):
    """Atomically claim the oldest pending job (or 204-style empty dict)."""
    _require_worker(x_worker_token)
    conn = _db()
    try:
        _ensure_table(conn)
        row = conn.execute(
            "SELECT * FROM social_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if not row:
            return {"job": None}
        claimed = conn.execute(
            "UPDATE social_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND status = 'pending'",
            [row["id"]],
        ).rowcount
        conn.commit()
        if not claimed:  # raced by another worker run
            return {"job": None}
        return {"job": _row_to_job(conn.execute(
            "SELECT * FROM social_jobs WHERE id = ?", [row["id"]]).fetchone())}
    finally:
        conn.close()


class WorkerResult(BaseModel):
    status: str  # done | error
    result: Optional[dict] = None


@router.post("/social-worker/jobs/{job_id}/result")
def report_result(job_id: str, body: WorkerResult, x_worker_token: Optional[str] = Header(default=None)):
    _require_worker(x_worker_token)
    if body.status not in ("done", "error"):
        raise HTTPException(status_code=422, detail="status must be done|error")
    conn = _db()
    try:
        _ensure_table(conn)
        updated = conn.execute(
            "UPDATE social_jobs SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [body.status, json.dumps(body.result or {}), job_id],
        ).rowcount
        conn.commit()
        if not updated:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"ok": True}
    finally:
        conn.close()
