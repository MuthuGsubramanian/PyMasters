"""
playground.py — FastAPI APIRouter for the XP-based Playground chat.

Prefix: /api/playground
"""

import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from vaathiyaar.engine import call_vaathiyaar
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
