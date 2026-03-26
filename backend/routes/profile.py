"""
profile.py — FastAPI APIRouter for student profile management.

Prefix: /api/profile
"""

import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from vaathiyaar.profiler import save_onboarding, get_student_profile, record_signal

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/profile", tags=["profile"])

BLOCKED_LANGUAGES = {"hi"}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class OnboardingData(BaseModel):
    user_id: str
    motivation: str
    prior_experience: str
    known_languages: List[str]
    learning_style: str
    goal: str
    time_commitment: str
    preferred_language: str


class SignalData(BaseModel):
    user_id: str
    signal_type: str
    topic: str
    value: dict
    session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/onboarding")
def onboarding(data: OnboardingData):
    """
    Save onboarding questionnaire for a user.
    Blocks 'hi' as preferred_language.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    payload = {
        "motivation": data.motivation,
        "prior_experience": data.prior_experience,
        "known_languages": ", ".join(data.known_languages),
        "learning_style": data.learning_style,
        "goal": data.goal,
        "time_commitment": data.time_commitment,
        "preferred_language": data.preferred_language,
    }

    result = save_onboarding(db_path, data.user_id, payload)
    return result


@router.get("/{user_id}")
def get_profile(user_id: str):
    """
    Retrieve the student profile for a given user_id.
    Returns {profile, onboarding_completed}.
    """
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
    profile = get_student_profile(db_path, user_id)

    if profile is None:
        return {"profile": None, "onboarding_completed": False}

    return {
        "profile": profile,
        "onboarding_completed": profile.get("onboarding_completed", False),
    }


@router.post("/signal")
def post_signal(data: SignalData):
    """
    Record a learning signal for a user.
    """
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    record_signal(
        db_path,
        user_id=data.user_id,
        signal_type=data.signal_type,
        topic=data.topic,
        value=data.value,
        session_id=data.session_id,
    )

    return {"recorded": True}
