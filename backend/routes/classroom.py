"""
classroom.py — FastAPI APIRouter for the AI classroom experience.

Prefix: /api/classroom
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vaathiyaar.engine import call_vaathiyaar, evaluate_code, get_ollama_client, OLLAMA_MODEL
from vaathiyaar.modelfile import build_system_prompt
from vaathiyaar.profiler import get_student_profile, record_signal, update_mastery
from vaathiyaar.training_data import record_training_pair
from modules.trigger_engine import check_triggers

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
    username: Optional[str] = None


class EvaluateRequest(BaseModel):
    user_id: str
    code: str
    expected_output: Optional[str] = ""
    lesson_id: Optional[str] = None
    topic: Optional[str] = None


class DiagnosticRequest(BaseModel):
    user_id: str
    code: str
    challenge_id: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _load_lesson_from_dir(lesson_id: str, lessons_dir: str = None) -> dict | None:
    """Load a lesson by ID, searching across all track subdirectories."""
    base = Path(lessons_dir) if lessons_dir else LESSONS_DIR
    # Search track subdirectories
    for track_dir in sorted(base.iterdir()):
        if track_dir.is_dir():
            lesson_file = track_dir / f"{lesson_id}.json"
            if lesson_file.exists():
                with open(lesson_file, "r", encoding="utf-8") as f:
                    return json.load(f)
    # Fallback: check root directory (backward compat)
    root_file = base / f"{lesson_id}.json"
    if root_file.exists():
        with open(root_file, "r", encoding="utf-8") as f:
            return json.load(f)

    # Check generated lessons in database
    try:
        conn = sqlite3.connect(_get_db_path())
        row = conn.execute(
            "SELECT lesson_data FROM generated_lessons WHERE id = ?", [lesson_id]
        ).fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception:
        pass
    return None


def _list_all_lessons(lessons_dir: str = None, user_id: int = None) -> list[dict]:
    """List all lessons across all track subdirectories."""
    base = Path(lessons_dir) if lessons_dir else LESSONS_DIR
    lessons = []
    for track_dir in sorted(base.iterdir()):
        if track_dir.is_dir() and track_dir.name != "__pycache__":
            for lesson_file in sorted(track_dir.glob("*.json")):
                if lesson_file.name == "schema.json":
                    continue
                with open(lesson_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    lessons.append({
                        "id": data.get("id", lesson_file.stem),
                        "title": data.get("title", {}),
                        "description": data.get("description", {}),
                        "xp_reward": data.get("xp_reward"),
                        "topic": data.get("topic"),
                        "track": data.get("track"),
                        "module": data.get("module"),
                        "order": data.get("order", 0),
                    })

    # Generated lessons from database
    if user_id:
        try:
            conn = sqlite3.connect(_get_db_path())
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT lesson_data FROM generated_lessons WHERE user_id = ?", [user_id]
            ).fetchall()
            conn.close()
            for row in rows:
                data = json.loads(row["lesson_data"])
                lessons.append({
                    "id": data.get("id"),
                    "title": data.get("title", {}),
                    "description": data.get("description", {}),
                    "xp_reward": data.get("xp_reward", 50),
                    "topic": data.get("topic"),
                    "track": "generated",
                    "module": data.get("module"),
                    "order": 0,
                    "generated": True,
                })
        except Exception:
            pass

    return lessons


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
    if request.username and profile is not None:
        profile["username"] = request.username

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

    # Record interaction for future fine-tuning
    try:
        record_training_pair(
            db_path=db_path,
            user_message=request.message,
            vaathiyaar_response=response,
            student_profile=profile,
            lesson_context=lesson_context,
        )
    except Exception:
        pass  # Best-effort; don't fail the request

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


@router.post("/chat/stream")
def chat_stream(request: ChatRequest):
    """Stream Vaathiyaar's response token by token using SSE."""
    db_path = _get_db_path()
    profile = get_student_profile(db_path, request.user_id)
    if request.username and profile is not None:
        profile["username"] = request.username

    lesson_context = request.lesson_context or {}
    if request.phase:
        lesson_context["phase"] = request.phase
    if request.language:
        lesson_context["language"] = request.language

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

            # Parse the full response — extract just the message field
            # Vaathiyaar returns JSON with message, phase, animation, etc.
            clean_message = full_response
            parsed_response = None
            try:
                # Strip markdown code fences if present
                cleaned = full_response.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

                parsed_response = json.loads(cleaned)
                if isinstance(parsed_response, dict) and "message" in parsed_response:
                    clean_message = parsed_response["message"]
            except (json.JSONDecodeError, KeyError):
                # If not valid JSON, use the raw text as the message
                clean_message = full_response

            yield f"data: {json.dumps({'done': True, 'message': clean_message, 'phase': parsed_response.get('phase') if parsed_response else 'chat', 'full_response': full_response})}\n\n"

            # Record training data (best effort)
            try:
                record_training_pair(
                    db_path=db_path,
                    user_message=request.message,
                    vaathiyaar_response=parsed_response or {"message": full_response},
                    student_profile=profile,
                    lesson_context=lesson_context,
                )
            except Exception:
                pass
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/lessons")
async def list_lessons(user_id: int = None):
    """
    List all available lessons (metadata only: id, title, description, xp_reward, topic, track, module, order).
    Returns an empty list if the lessons directory doesn't exist yet.
    If user_id is provided, also includes generated lessons from the database.
    """
    if not LESSONS_DIR.exists():
        return {"lessons": []}

    try:
        lessons = _list_all_lessons(user_id=user_id)
        return {"lessons": lessons}
    except Exception:
        return {"lessons": []}


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
    lesson = _load_lesson_from_dir(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")

    if not user_id:
        return lesson

    db_path = _get_db_path()
    profile = get_student_profile(db_path, user_id)

    if not profile:
        return lesson

    preferred_lang = profile.get("preferred_language") or "en"
    skill_level = profile.get("skill_level") or "beginner"
    mastery_map = profile.get("mastery", {})

    # Swap story_variants to preferred language
    story_variants = lesson.get("story_variants", {})
    if story_variants and preferred_lang in story_variants:
        lesson["active_story"] = story_variants[preferred_lang]
    elif story_variants and "en" in story_variants:
        lesson["active_story"] = story_variants["en"]

    # Set active_title if title is a dict of variants
    title = lesson.get("title", "")
    if isinstance(title, dict):
        lesson["active_title"] = title.get(preferred_lang, title.get("en", ""))
    else:
        lesson["active_title"] = title

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

    # Award XP when student completes a challenge successfully
    if result["success"] and request.topic:
        lesson = _load_lesson_from_dir(request.lesson_id) if request.lesson_id else None
        xp_reward = lesson.get("xp_reward", 25) if lesson else 25

        # Use lesson_id for deduplication; fall back to topic when no lesson_id
        lesson_id_for_completion = request.lesson_id or request.topic

        try:
            conn = sqlite3.connect(db_path)

            # Check if already completed — only award XP once per lesson
            existing = conn.execute(
                "SELECT 1 FROM lesson_completions WHERE user_id = ? AND lesson_id = ?",
                [request.user_id, lesson_id_for_completion],
            ).fetchone()

            if not existing:
                conn.execute("UPDATE users SET points = points + ? WHERE id = ?", [xp_reward, request.user_id])
                conn.execute(
                    "INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, ?)",
                    [request.user_id, lesson_id_for_completion, xp_reward],
                )
                xp_earned = xp_reward
            else:
                xp_earned = 0

            conn.commit()
            conn.close()
        except Exception:
            xp_earned = 0

        result["xp_earned"] = xp_earned

    # Update mastery based on success
    mastery_delta = 0.1 if result["success"] else -0.05
    try:
        existing_mastery = profile.get("mastery", {}).get(request.topic, 0.0) if profile else 0.0
        new_mastery = max(0.0, min(1.0, existing_mastery + mastery_delta))
        update_mastery(db_path, request.user_id, request.topic, new_mastery)
    except Exception:
        pass

    # Check triggers for AI-inferred module generation
    try:
        check_triggers(
            user_id=request.user_id,
            signal_type="code_evaluation",
            topic=request.topic,
            value={"success": result.get("success", False)},
        )
    except Exception:
        pass  # Trigger check should never block evaluation

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
