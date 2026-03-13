"""Module and progress API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from pymasters_app.utils import helpers
from pymasters_app.utils.activity import log_activity

router = APIRouter(prefix="/api", tags=["modules"])


class ProgressUpdate(BaseModel):
    module_id: str
    status: str  # "in_progress", "completed", "not_started"


@router.get("/modules")
async def get_modules(request: Request):
    db = request.app.state.db
    user = request.state.user
    helpers.seed_learning_modules(db["learning_modules"])
    modules = helpers.get_learning_modules(db["learning_modules"])
    progress_map = helpers.get_progress_by_user(db["progress"], user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)
    return {"modules": modules, "progress": progress_map, "summary": summary}


@router.post("/progress")
async def update_progress(body: ProgressUpdate, request: Request):
    db = request.app.state.db
    user = request.state.user
    helpers.upsert_progress(db["progress"], user_id=user["id"], module_id=body.module_id, status=body.status)

    action_map = {"in_progress": "started_module", "completed": "completed_module", "not_started": "reset_module"}
    action = action_map.get(body.status, body.status)
    log_activity(db, user["id"], action, body.module_id)

    return {"ok": True}
