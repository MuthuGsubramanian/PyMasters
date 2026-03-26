"""
playground.py — FastAPI APIRouter for the XP-based Playground chat.

Prefix: /api/playground
"""

import json
import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vaathiyaar.engine import call_vaathiyaar, get_ollama_client, OLLAMA_MODEL
from vaathiyaar.modelfile import build_system_prompt
from vaathiyaar.profiler import get_student_profile

router = APIRouter(prefix="/api/playground", tags=["playground"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PlaygroundChatRequest(BaseModel):
    user_id: str
    message: str
    language: Optional[str] = "en"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _get_user_credits(db_path: str, user_id: str) -> dict:
    """Return XP, total prompts, used prompts, remaining prompts for a user."""
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT points, playground_prompts_used FROM users WHERE id = ?",
            [user_id],
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        xp = row[0] or 0
        used = row[1] or 0
        total = xp * 100
        remaining = max(0, total - used)

        return {
            "xp": xp,
            "total_prompts": total,
            "used_prompts": used,
            "remaining_prompts": remaining,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/credits/{user_id}")
def get_credits(user_id: str):
    """Return the user's XP-based prompt credit balance."""
    db_path = _get_db_path()
    return _get_user_credits(db_path, user_id)


@router.post("/chat")
def playground_chat(request: PlaygroundChatRequest):
    """
    Send a free-form message to Vaathiyaar in the Playground.
    Checks XP-based prompt allowance before responding.
    Each prompt costs 1 credit (1 XP = 100 credits).
    """
    db_path = _get_db_path()

    # Check credits
    credits = _get_user_credits(db_path, request.user_id)
    if credits["remaining_prompts"] <= 0:
        raise HTTPException(
            status_code=403,
            detail="You've used all your prompts! Complete more lessons to earn XP and unlock more.",
        )

    # Get student profile for personalisation
    profile = get_student_profile(db_path, request.user_id)

    # Call Vaathiyaar without lesson context (free-form playground)
    lesson_context = {
        "mode": "playground",
        "language": request.language or "en",
    }

    try:
        response = call_vaathiyaar(
            user_message=request.message,
            student_profile=profile,
            lesson_context=lesson_context,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vaathiyaar AI error: {exc}")

    # Increment prompts used
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE users SET playground_prompts_used = playground_prompts_used + 1 WHERE id = ?",
            [request.user_id],
        )
        conn.commit()
    finally:
        conn.close()

    # Return response with updated credits
    updated_credits = _get_user_credits(db_path, request.user_id)

    # Handle both dict and string responses from call_vaathiyaar
    if isinstance(response, dict):
        reply = response.get("response", response.get("message", str(response)))
    else:
        reply = str(response)

    return {
        "response": reply,
        "credits": updated_credits,
    }


@router.post("/chat/stream")
def playground_chat_stream(request: PlaygroundChatRequest):
    """Stream a free-form Vaathiyaar response token by token using SSE."""
    db_path = _get_db_path()

    # Check credits
    credits = _get_user_credits(db_path, request.user_id)
    if credits["remaining_prompts"] <= 0:
        raise HTTPException(
            status_code=403,
            detail="You've used all your prompts! Complete more lessons to earn XP and unlock more.",
        )

    profile = get_student_profile(db_path, request.user_id)
    lesson_context = {
        "mode": "playground",
        "language": request.language or "en",
    }

    system_prompt = build_system_prompt(profile, lesson_context)
    client = get_ollama_client()

    def generate():
        full_response = ""
        try:
            for chunk in client.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.message},
                ],
                stream=True,
            ):
                token = chunk.get("message", {}).get("content", "")
                if token:
                    full_response += token
                    yield f"data: {json.dumps({'token': token})}\n\n"

            # Parse response and extract clean message
            clean_message = full_response
            try:
                cleaned = full_response.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict) and "message" in parsed:
                    clean_message = parsed["message"]
            except (json.JSONDecodeError, KeyError):
                pass

            yield f"data: {json.dumps({'done': True, 'message': clean_message, 'full_response': full_response})}\n\n"

            # Increment prompts used (best effort)
            try:
                conn = sqlite3.connect(db_path)
                conn.execute(
                    "UPDATE users SET playground_prompts_used = playground_prompts_used + 1 WHERE id = ?",
                    [request.user_id],
                )
                conn.commit()
                conn.close()
            except Exception:
                pass
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
