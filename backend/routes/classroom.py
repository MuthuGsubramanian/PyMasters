"""
classroom.py — FastAPI APIRouter for the AI classroom experience.

Prefix: /api/classroom
"""

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from vaathiyaar.engine import call_vaathiyaar, evaluate_code
from vaathiyaar.profiler import get_student_profile, record_signal, update_mastery

router = APIRouter(prefix="/api/classroom", tags=["classroom"])

# Directory where lesson JSON files live (created by Task 5)
LESSONS_DIR = Path(__file__).parent.parent / "lessons"

# Speed multiplier map keyed on skill_level
SPEED_MULTIPLIER = {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.7,
}

# Pre-built diagnostic challenges
DIAGNOSTIC_CHALLENGES = {
    "loops_beginner": {
        "id": "loops_beginner",
        "topic": "loops",
        "difficulty": "beginner",
        "description": "Print numbers 1 to 5 using a for loop.",
        "expected_output": "1\n2\n3\n4\n5",
    },
    "list_comprehension_intermediate": {
        "id": "list_comprehension_intermediate",
        "topic": "list_comprehension",
        "difficulty": "intermediate",
        "description": "Use a list comprehension to create a list of squares for numbers 1-5.",
        "expected_output": "[1, 4, 9, 16, 25]",
    },
    "recursion_advanced": {
        "id": "recursion_advanced",
        "topic": "recursion",
        "difficulty": "advanced",
        "description": "Write a recursive function to compute factorial(5) and print the result.",
        "expected_output": "120",
    },
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    user_id: str
    message: str
    lesson_context: Optional[dict] = None
    phase: Optional[str] = None
    language: Optional[str] = "en"


class EvaluateRequest(BaseModel):
    user_id: str
    code: str
    expected_output: str
    lesson_id: str
    topic: str


class DiagnosticRequest(BaseModel):
    user_id: str
    code: str
    challenge_id: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.duckdb"))


def _load_lesson(lesson_id: str) -> dict:
    """Load a lesson JSON file. Raises HTTPException 404 if not found."""
    if not LESSONS_DIR.exists():
        raise HTTPException(status_code=404, detail="Lessons directory not found.")

    lesson_file = LESSONS_DIR / f"{lesson_id}.json"
    if not lesson_file.exists():
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")

    with open(lesson_file, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/chat")
def chat(request: ChatRequest):
    """
    Send a message to Vaathiyaar within a lesson context.
    Auto-records profile_update signal if the AI response includes one.
    """
    db_path = _get_db_path()
    profile = get_student_profile(db_path, request.user_id)

    lesson_context = request.lesson_context or {}
    if request.phase:
        lesson_context["phase"] = request.phase
    if request.language:
        lesson_context["language"] = request.language

    try:
        response = call_vaathiyaar(
            user_message=request.message,
            student_profile=profile,
            lesson_context=lesson_context,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vaathiyaar AI error: {exc}")

    # Auto-record profile_update signal if present and non-trivial
    profile_update = response.get("profile_update")
    if profile_update and profile_update.get("topic_practiced"):
        try:
            record_signal(
                db_path,
                user_id=request.user_id,
                signal_type="profile_update",
                topic=profile_update["topic_practiced"],
                value=profile_update,
            )
        except Exception:
            pass  # Best-effort; don't fail the request

    return response


@router.get("/lessons")
def list_lessons():
    """
    List all available lessons (metadata only: id, title, description, xp_reward, topic).
    Returns an empty list if the lessons directory doesn't exist yet.
    """
    if not LESSONS_DIR.exists():
        return []

    lessons = []
    for lesson_file in sorted(LESSONS_DIR.glob("*.json")):
        try:
            with open(lesson_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            lessons.append({
                "id": data.get("id", lesson_file.stem),
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "xp_reward": data.get("xp_reward", 0),
                "topic": data.get("topic", ""),
            })
        except Exception:
            continue  # Skip malformed files gracefully

    return lessons


@router.get("/lesson/{lesson_id}")
def get_lesson(
    lesson_id: str,
    user_id: Optional[str] = Query(default=None),
):
    """
    Load a lesson by ID.
    If user_id is provided, adapt the lesson to the student's profile:
    - swap story_variants to preferred language
    - set active_title
    - set speed_multiplier based on skill level
    - check adaptation_points against mastery
    """
    lesson = _load_lesson(lesson_id)

    if not user_id:
        return lesson

    db_path = _get_db_path()
    profile = get_student_profile(db_path, user_id)

    if not profile:
        return lesson

    preferred_lang = profile.get("preferred_language", "en")
    skill_level = profile.get("skill_level", "intermediate")
    mastery_map = profile.get("mastery", {})

    # Swap story_variants to preferred language
    story_variants = lesson.get("story_variants", {})
    if story_variants and preferred_lang in story_variants:
        lesson["active_story"] = story_variants[preferred_lang]
    elif story_variants and "en" in story_variants:
        lesson["active_story"] = story_variants["en"]

    # Set active_title if variants exist
    title_variants = lesson.get("title_variants", {})
    if title_variants:
        lesson["active_title"] = title_variants.get(preferred_lang, lesson.get("title", ""))

    # Set speed_multiplier based on skill level
    lesson["speed_multiplier"] = SPEED_MULTIPLIER.get(skill_level, 1.0)

    # Check adaptation_points against mastery
    adaptation_points = lesson.get("adaptation_points", [])
    adapted = []
    for point in adaptation_points:
        topic = point.get("topic")
        threshold = point.get("mastery_threshold", 0.0)
        current_mastery = mastery_map.get(topic, 0.0)
        adapted.append({
            **point,
            "current_mastery": current_mastery,
            "unlocked": current_mastery >= threshold,
        })
    if adapted:
        lesson["adaptation_points"] = adapted

    return lesson


@router.post("/evaluate")
def evaluate(request: EvaluateRequest):
    """
    Evaluate student code against expected output.
    Records a learning signal and updates mastery.
    """
    db_path = _get_db_path()
    profile = get_student_profile(db_path, request.user_id)

    lesson_context = {"lesson_id": request.lesson_id, "topic": request.topic}

    result = evaluate_code(
        student_code=request.code,
        expected_output=request.expected_output,
        student_profile=profile,
        lesson_context=lesson_context,
    )

    # Record the evaluation as a learning signal
    try:
        record_signal(
            db_path,
            user_id=request.user_id,
            signal_type="code_evaluation",
            topic=request.topic,
            value={
                "success": result["success"],
                "lesson_id": request.lesson_id,
                "error": result.get("error", ""),
            },
        )
    except Exception:
        pass

    # Update mastery based on success
    mastery_delta = 0.1 if result["success"] else -0.05
    try:
        existing_mastery = profile.get("mastery", {}).get(request.topic, 0.0) if profile else 0.0
        new_mastery = max(0.0, min(1.0, existing_mastery + mastery_delta))
        update_mastery(db_path, request.user_id, request.topic, new_mastery)
    except Exception:
        pass

    return result


@router.post("/diagnostic")
def diagnostic(request: DiagnosticRequest):
    """
    Run a pre-built diagnostic challenge.
    Evaluates code and records the result as a learning signal.
    """
    challenge = DIAGNOSTIC_CHALLENGES.get(request.challenge_id)
    if not challenge:
        raise HTTPException(
            status_code=404,
            detail=f"Challenge '{request.challenge_id}' not found. "
                   f"Available: {list(DIAGNOSTIC_CHALLENGES.keys())}",
        )

    db_path = _get_db_path()
    profile = get_student_profile(db_path, request.user_id)

    lesson_context = {
        "challenge_id": request.challenge_id,
        "topic": challenge["topic"],
        "difficulty": challenge["difficulty"],
    }

    result = evaluate_code(
        student_code=request.code,
        expected_output=challenge["expected_output"],
        student_profile=profile,
        lesson_context=lesson_context,
    )

    # Record diagnostic signal
    try:
        record_signal(
            db_path,
            user_id=request.user_id,
            signal_type="diagnostic",
            topic=challenge["topic"],
            value={
                "challenge_id": request.challenge_id,
                "difficulty": challenge["difficulty"],
                "success": result["success"],
            },
        )
    except Exception:
        pass

    return {
        "challenge": challenge,
        "result": result,
    }
