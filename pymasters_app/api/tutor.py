"""AI Tutor API endpoints."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

import requests as http_requests

from pymasters_app.utils.activity import log_activity
from pymasters_app.utils.tutor_parser import parse_tutor_response
from config.settings import settings
from pymasters_app.utils.secrets import get_secret

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

HF_API_BASE = "https://api-inference.huggingface.co/models"

SYSTEM_PROMPT = (
    "You are PyMasters, a friendly senior Python tutor. "
    "Explain step-by-step, show minimal runnable examples, and suggest tests. "
    "Prefer standard library solutions. When code is unsafe, warn clearly.\n\n"
    "FORMAT your responses using these markers for rich visual rendering:\n"
    "- Use ```python ... ``` for code examples\n"
    "- Use :::concept TERM | EXPLANATION ::: for key definitions\n"
    "- Use :::steps STEP1 | STEP2 | STEP3 ::: for step-by-step breakdowns\n"
    "- Use :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 ::: for comparison tables\n"
    "Keep explanations concise and visual."
)


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    temperature: float = 0.4
    max_tokens: int = 512


class NoteRequest(BaseModel):
    content: str
    snippet_preview: Optional[str] = None


def _hf_headers():
    token = settings.huggingfacehub_api_token or get_secret("HUGGINGFACEHUB_API_TOKEN")
    if not token:
        raise RuntimeError("Missing HUGGINGFACEHUB_API_TOKEN")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    db = request.app.state.db
    user = request.state.user

    # Build prompt
    text_prompt = "\n\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in body.messages if m["role"] != "system"
    )
    full_prompt = SYSTEM_PROMPT + "\n\n" + text_prompt + "\n\nASSISTANT:"

    payload = {
        "inputs": full_prompt,
        "parameters": {
            "temperature": body.temperature,
            "max_new_tokens": body.max_tokens,
            "return_full_text": False,
        },
    }

    try:
        resp = http_requests.post(
            f"{HF_API_BASE}/{body.model}", headers=_hf_headers(), json=payload, timeout=120
        )
        if resp.status_code == 503:
            reply = "The model is warming up. Please try again in a few seconds."
        elif resp.status_code >= 400:
            reply = f"Model error: {resp.status_code}"
        else:
            data = resp.json()
            if isinstance(data, list) and data and "generated_text" in data[0]:
                reply = data[0]["generated_text"]
            elif isinstance(data, dict) and "generated_text" in data:
                reply = data["generated_text"]
            else:
                reply = str(data)
    except Exception as e:
        reply = f"Sorry, I ran into a problem: {e}"

    # Parse for rich HTML
    reply_html = parse_tutor_response(reply)

    # Persist session
    db["tutor_sessions"].insert_one({
        "user_id": user.get("id"),
        "model": body.model,
        "temperature": body.temperature,
        "max_new_tokens": body.max_tokens,
        "messages": body.messages[-4:],
        "created_at": datetime.utcnow(),
    })

    # Log activity
    last_user_msg = next((m["content"] for m in reversed(body.messages) if m["role"] == "user"), "")
    log_activity(db, user["id"], "tutor_session", last_user_msg[:60])

    return {"reply": reply, "reply_html": reply_html}


@router.get("/sessions")
async def get_sessions(request: Request):
    db = request.app.state.db
    rows = list(
        db["tutor_sessions"].find({}, {"model": 1, "created_at": 1}).sort("created_at", -1).limit(10)
    )
    sessions = []
    for row in rows:
        ts = row.get("created_at")
        sessions.append({
            "model": row.get("model", "unknown"),
            "created_at": ts.isoformat() if ts else None,
        })
    return {"sessions": sessions}


@router.post("/notes")
async def save_note(body: NoteRequest, request: Request):
    db = request.app.state.db
    user = request.state.user
    db["notes"].insert_one({
        "user_id": user["id"],
        "source": "tutor",
        "content": body.content,
        "snippet_preview": (body.snippet_preview or body.content[:200]),
        "created_at": datetime.utcnow(),
    })
    return {"ok": True}


@router.get("/notes")
async def get_notes(request: Request):
    db = request.app.state.db
    user = request.state.user
    rows = list(
        db["notes"].find({"user_id": user["id"], "source": "tutor"}).sort("created_at", -1).limit(20)
    )
    notes = []
    for row in rows:
        ts = row.get("created_at")
        notes.append({
            "snippet_preview": row.get("snippet_preview", "")[:100],
            "created_at": ts.isoformat() if ts else None,
        })
    return {"notes": notes}
