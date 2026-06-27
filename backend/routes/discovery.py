"""
discovery.py -- Topic search + on-demand Vaathiyaar generation.

Lets a learner search for any topic. If the catalogue (and their generated
lessons) already cover it, we return matches. If nothing exists, the client can
ask Vaathiyaar to generate a brand-new session for that topic after gathering a
couple of details (level + focus) — reusing the existing module-generation
pipeline so generated lessons land in the same place as everything else.

Prefix: /api
"""

import os
import uuid
import sqlite3
import threading
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from routes.classroom import _list_all_lessons

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
router = APIRouter(prefix="/api", tags=["discovery"])


def _txt(v, lang="en"):
    if isinstance(v, dict):
        return v.get(lang) or v.get("en") or (next(iter(v.values()), "") if v else "")
    return v or ""


@router.get("/classroom/search")
def search_topics(q: str = Query(..., min_length=1, max_length=120),
                  user_id: Optional[str] = None, lang: str = "en"):
    """Search existing + generated lessons. `can_generate` is True when nothing
    matched, signalling the client to offer Vaathiyaar generation."""
    ql = q.strip().lower()
    out = []
    try:
        lessons = _list_all_lessons(user_id=user_id)
    except Exception:
        lessons = []
    for L in lessons:
        title = _txt(L.get("title"), lang)
        desc = _txt(L.get("description"), lang)
        hay = f"{title} {desc} {L.get('id','')} {L.get('topic','')} {L.get('track','')}".lower()
        if ql in hay:
            out.append({
                "id": L.get("id"),
                "title": title or L.get("id"),
                "description": desc,
                "track": L.get("track"),
                "topic": L.get("topic"),
                "xp_reward": L.get("xp_reward"),
                "generated": bool(L.get("generated", False)),
            })
    out.sort(key=lambda r: (0 if (r["title"] or "").lower().startswith(ql) else 1, (r["title"] or "").lower()))
    return {"query": q, "results": out[:25], "count": len(out), "can_generate": len(out) == 0}


class GenerateRequest(BaseModel):
    topic: str
    level: str = "beginner"      # beginner | intermediate | advanced
    focus: str = ""              # optional free-text emphasis
    user_id: str


@router.post("/classroom/generate")
def generate_topic(req: GenerateRequest):
    """Queue a Vaathiyaar-generated session for a topic, enriched with the
    details the learner provided. Returns a job_id to poll /api/modules/status."""
    topic = req.topic.strip()
    detail = f"{topic} (level: {req.level}" + (f"; focus: {req.focus.strip()}" if req.focus.strip() else "") + ")"
    job_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority) "
            "VALUES (?, ?, ?, 'user_request', ?, 'queued', 1)",
            [job_id, req.user_id, topic, detail],
        )
        conn.commit()
    finally:
        conn.close()
    try:
        from modules.pipeline import run_pipeline
        threading.Thread(target=run_pipeline, args=(job_id, req.user_id, detail), daemon=True).start()
    except Exception as e:
        print(f"[discovery] pipeline start failed: {e}")
    return {"job_id": job_id, "status": "queued", "topic": topic}
