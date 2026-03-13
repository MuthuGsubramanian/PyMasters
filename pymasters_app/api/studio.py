"""Generative Studio API endpoints."""
from __future__ import annotations

import time
import base64
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

from pymasters_app.utils.activity import log_activity
from services.huggingface_service import HuggingFaceError, generate_image, generate_video

router = APIRouter(prefix="/api/studio", tags=["studio"])

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)


class GenerateRequest(BaseModel):
    prompt: str
    task: str = "image"  # "image" or "video"
    model: str = "black-forest-labs/FLUX.1-dev"


@router.post("/generate")
async def generate(body: GenerateRequest, request: Request):
    db = request.app.state.db
    user = request.state.user

    try:
        if body.task.lower() == "image":
            result = generate_image(prompt=body.prompt, model=body.model)
            suffix = ".png"
        else:
            result = generate_video(prompt=body.prompt, model=body.model)
            suffix = ".mp4"

        ts = int(time.time())
        file_path = GENERATED_DIR / f"gen_{ts}{suffix}"
        file_path.write_bytes(result.bytes)

        db["generations"].insert_one({
            "user_id": user["id"],
            "task": body.task.lower(),
            "model": body.model,
            "prompt": body.prompt,
            "mime_type": result.mime_type,
            "file_path": str(file_path),
            "created_at": datetime.utcnow(),
        })

        log_activity(db, user["id"], "generation", f"{body.task}: {body.prompt[:60]}")

        data_b64 = base64.b64encode(result.bytes).decode()
        return {"ok": True, "data": data_b64, "mime_type": result.mime_type}
    except HuggingFaceError as e:
        return {"ok": False, "error": str(e)}


@router.get("/history")
async def history(request: Request):
    db = request.app.state.db
    rows = list(
        db["generations"].find({}, {"prompt": 1, "task": 1, "model": 1, "created_at": 1})
        .sort("created_at", -1).limit(10)
    )
    items = []
    for row in rows:
        ts = row.get("created_at")
        items.append({
            "task": row.get("task", "image"),
            "prompt": (row.get("prompt") or "")[:70],
            "model": row.get("model", ""),
            "created_at": ts.isoformat() if ts else None,
        })
    return {"history": items}
