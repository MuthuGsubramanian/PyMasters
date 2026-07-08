"""
classroom.py — FastAPI APIRouter for the AI classroom experience.

Prefix: /api/classroom
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user_id

from vaathiyaar.engine import (
    call_vaathiyaar, evaluate_code, get_ollama_client, OLLAMA_MODEL,
    stream as vaathiyaar_stream, VaathiyaarUnavailable, FRIENDLY_UNAVAILABLE,
)
from vaathiyaar.modelfile import build_system_prompt
from vaathiyaar.profiler import get_student_profile, record_signal, update_mastery
from vaathiyaar.training_data import (
    record_training_pair, set_training_quality, build_training_jsonl, get_training_stats,
)
from modules.trigger_engine import check_triggers
from paths.adapter import adapt_path

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
    history: Optional[list] = None
    voice: Optional[bool] = False  # spoken conversation → reply concisely, no markdown/code
    # Client-supplied part-of-day from the learner's LOCAL clock. The server runs
    # in UTC, so it can't reliably infer this; passing it makes the opening
    # greeting match the learner's real time of day. Optional → omitted is a no-op.
    time_of_day: Optional[str] = None


class EvaluateRequest(BaseModel):
    user_id: str
    code: str
    expected_output: Optional[str] = ""
    lesson_id: Optional[str] = None
    topic: Optional[str] = None
    attempt_count: Optional[int] = 0


class DiagnosticRequest(BaseModel):
    user_id: str
    code: str
    challenge_id: str


class FeedbackRequest(BaseModel):
    pair_id: str
    helpful: bool  # 👍 = True, 👎 = False


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _require_self(user_id: str, caller: str) -> None:
    """Refuse cross-user access: the acting user is derived from the verified JWT
    (`caller`), never from the client-supplied body `user_id`. Mirrors the guard
    already applied to routes/classroom.py::evaluate and every routes/playground.py
    chat handler. str-normalized compare because legacy `users.id` rows are INTEGER
    while the JWT `sub` is a string. 403 on mismatch (401 for absent/invalid token
    comes from the get_current_user_id dependency)."""
    if str(user_id) != str(caller):
        raise HTTPException(status_code=403, detail="Forbidden")


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


# Canonical module sequence per track. Lesson `order` is only unique WITHIN a
# module, so sorting by order alone interleaved modules — live QA (2026-07-02)
# found "Decorators" (advanced, order 1) shown as lesson #1 of Python
# Fundamentals. Tracks not listed fall back to the foundations-first heuristic.
_MODULE_ORDER = {
    "python_fundamentals": [
        "variables_and_types", "control_flow", "data_structures", "functions",
        "oop", "file_io", "error_handling", "testing", "packaging", "advanced",
    ],
    "ai_agents": ["foundations", "frameworks", "protocols", "orchestration", "advanced"],
    "deep_learning": ["nn_basics", "backpropagation", "pytorch", "cnn", "rnn", "transformers"],
    "machine_learning": [
        "ml_foundations", "data_preparation", "supervised_learning",
        "unsupervised_learning", "evaluation", "neural_networks", "production",
    ],
    "web_development": [
        "web_foundations", "frontend_foundations", "flask_framework",
        "fastapi_framework", "django_framework", "advanced_web", "devops_foundations",
    ],
    # Enterprise cloud curriculum (org/enterprise-gated; see access.ENTERPRISE_TRACKS)
    "azure_enterprise": [
        "foundations", "compute_storage", "networking_security", "data_ai", "enterprise_patterns",
    ],
    "azure_ai_foundry": [
        "foundations", "development", "evaluation_safety", "integration", "production",
    ],
    "aws_enterprise": [
        "foundations", "serverless_containers", "networking_security", "data_ai", "enterprise_patterns",
    ],
    "gcp_vertex_ai": [
        "foundations", "serverless_data", "vertex_ai", "mlops", "enterprise_patterns",
    ],
    "cross_cloud_architecture": [
        "strategy", "architecture", "operations", "security_compliance", "ai_workloads",
    ],
    "frontier_ai_platforms": [
        "landscape", "claude", "openai_chatgpt", "gemini", "enterprise_adoption",
    ],
}

_FIRST_MODULES = ("foundations", "basics")
_LAST_MODULES = ("advanced", "mastery", "production", "deployment", "practice")


def _module_rank(track: str, module: str) -> tuple:
    """Sortable rank for a module inside its track."""
    module = module or ""
    explicit = _MODULE_ORDER.get(track or "")
    if explicit and module in explicit:
        return (0, explicit.index(module), "")
    # Heuristic: foundations-style modules first, advanced-style last,
    # everything else alphabetical in between.
    low = module.lower()
    if any(k in low for k in _FIRST_MODULES):
        return (1, 0, low)
    if any(k in low for k in _LAST_MODULES):
        return (3, 0, low)
    return (2, 0, low)


def _list_all_lessons(lessons_dir: str = None, user_id: str = None) -> list[dict]:
    """List all lessons across all track subdirectories."""
    base = Path(lessons_dir) if lessons_dir else LESSONS_DIR
    lessons = []
    for track_dir in sorted(base.iterdir()):
        if track_dir.is_dir() and track_dir.name != "__pycache__":
            track_lessons = []
            for lesson_file in sorted(track_dir.glob("*.json")):
                if lesson_file.name == "schema.json":
                    continue
                try:
                    with open(lesson_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        track_lessons.append({
                            "id": data.get("id", lesson_file.stem),
                            "title": data.get("title", {}),
                            "description": data.get("description", {}),
                            "xp_reward": data.get("xp_reward"),
                            "topic": data.get("topic"),
                            "track": data.get("track"),
                            "module": data.get("module"),
                            "order": data.get("order", 9999),
                        })
                except Exception as e:
                    print(f"Warning: Failed to load lesson {lesson_file}: {e}")
                    continue
            # Order lessons pedagogically: module sequence first (order is only
            # unique within a module), then curriculum 'order', then id.
            track_lessons.sort(key=lambda L: (
                _module_rank(L.get("track") or track_dir.name, L.get("module") or ""),
                L.get("order", 9999),
                L.get("id") or "",
            ))
            lessons.extend(track_lessons)

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

def _ai_unavailable_payload(friendly: str = FRIENDLY_UNAVAILABLE) -> dict:
    """A Vaathiyaar-shaped response carrying a calm, learner-facing message so the
    UI degrades gracefully when every AI provider is down (e.g. Ollama weekly cap)."""
    return {
        "message": friendly,
        "phase": "chat",
        "animation": None,
        "practice_challenge": None,
        "profile_update": {
            "topic_practiced": None,
            "struggle_detected": False,
            "mastery_delta": None,
            "emotion_signal": "neutral",
        },
        "ai_unavailable": True,
    }


@router.post("/chat")
def chat(request: ChatRequest, caller: str = Depends(get_current_user_id)):
    """
    Send a message to Vaathiyaar within a lesson context.
    Auto-records profile_update signal if the AI response includes one.
    """
    # IDOR / paywall-bypass guard (2026-07-03, same class as evaluate above and
    # every playground.py chat handler): this endpoint checks the paywall
    # (assert_learning_access) AND writes learning signals / training pairs for
    # the body-supplied user_id. Unauthenticated, an attacker could forge an
    # entitled user's id to (a) get free Vaathiyaar AI chat by bypassing their
    # own paywall and (b) pollute the victim's mastery signals / training data.
    # Derive the acting user from the verified JWT and refuse cross-user calls.
    # The real client (Classroom.jsx handleChat via /chat/stream, VoiceTutor.jsx
    # via classroomChat) always sends the session user's own id with a Bearer
    # token, so legitimate traffic is unaffected.
    _require_self(request.user_id, caller)
    db_path = _get_db_path()
    from access import assert_learning_access
    assert_learning_access(db_path, request.user_id)  # 402 when trial lapsed
    profile = get_student_profile(db_path, request.user_id)
    if request.username and profile is not None:
        profile["username"] = request.username

    lesson_context = request.lesson_context or {}
    if request.phase:
        lesson_context["phase"] = request.phase
    if request.language:
        lesson_context["language"] = request.language

    history_context = ""
    if request.history:
        recent = request.history[-5:]
        history_context = "\n".join(
            f"{'Student' if m.get('role') == 'user' else 'Vaathiyaar'}: {m.get('content', '')}"
            for m in recent
        ) + "\n\n"

    # Voice mode: spoken answers must be short and natural (no markdown/code/lists).
    voice_directive = ""
    if request.voice:
        lesson_context["voice"] = True
        voice_directive = (
            "[Voice conversation: reply in a warm, spoken, conversational tone — "
            "2 to 4 short sentences. No markdown, no code blocks, no bullet lists. "
            "If code is essential, describe it in words and offer to show it on screen.]\n\n"
        )

    try:
        response = call_vaathiyaar(
            user_message=voice_directive + history_context + request.message,
            student_profile=profile,
            lesson_context=lesson_context,
        )
    except VaathiyaarUnavailable as exc:
        print(f"[classroom.chat] AI unavailable: {str(exc.detail)[:200]}")
        return _ai_unavailable_payload(exc.friendly)
    except Exception as exc:
        # Never leak a raw vendor error to a learner — degrade gracefully.
        print(f"[classroom.chat] unexpected AI error: {str(exc)[:200]}")
        return _ai_unavailable_payload()

    # Record interaction for future fine-tuning; expose pair_id so the client
    # can attach a 👍/👎 quality signal to this exact response.
    try:
        pair_id = record_training_pair(
            db_path=db_path,
            user_message=request.message,
            vaathiyaar_response=response,
            student_profile=profile,
            lesson_context=lesson_context,
        )
        response["_pair_id"] = pair_id
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
def chat_stream(request: ChatRequest, caller: str = Depends(get_current_user_id)):
    """Stream Vaathiyaar's response token by token using SSE."""
    # Same IDOR / paywall-bypass guard as /chat (this is the primary UI chat
    # path). Fail closed before the paywall check or any per-user write.
    _require_self(request.user_id, caller)
    db_path = _get_db_path()
    from access import assert_learning_access
    assert_learning_access(db_path, request.user_id)  # 402 when trial lapsed
    profile = get_student_profile(db_path, request.user_id)
    if request.username and profile is not None:
        profile["username"] = request.username

    lesson_context = request.lesson_context or {}
    if request.phase:
        lesson_context["phase"] = request.phase
    if request.language:
        lesson_context["language"] = request.language

    system_prompt = build_system_prompt(profile, lesson_context, time_of_day=request.time_of_day)

    def generate():
        full_response = ""
        try:
            msgs = [
                {"role": "system", "content": system_prompt},
                *([{"role": m.get("role", "user"), "content": m.get("content", "")} for m in (request.history or [])[-5:]]),
                {"role": "user", "content": request.message},
            ]
            opts = {"temperature": 0.7, "num_predict": 1500}
            # Route through the provider fallback chain; raises VaathiyaarUnavailable
            # if every provider is down so we can emit a calm `done` (never `error`).
            for token in vaathiyaar_stream(msgs, opts):
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

            # Envelope-leak guard (same class as the playground.py fix,
            # 2026-07-02): when the response is NOT a single clean JSON
            # envelope (parse above failed), the model may have emitted
            # prose followed by a re-emitted/truncated {"message": ...}
            # envelope — previously that raw JSON leaked into the chat
            # bubble and history. Reuse the shared extractor from
            # playground.py; it returns shape-1/2 inputs unchanged, so
            # every previously-working path is identical. Guarded so any
            # import/runtime failure falls back to today's behavior.
            if parsed_response is None:
                try:
                    from routes.playground import _extract_clean_message
                    clean_message = _extract_clean_message(full_response)
                except Exception:
                    pass

            # Record training data (best effort) BEFORE the done event so the
            # client gets a pair_id to attach 👍/👎 feedback to this response.
            pair_id = None
            try:
                pair_id = record_training_pair(
                    db_path=db_path,
                    user_message=request.message,
                    vaathiyaar_response=parsed_response or {"message": full_response},
                    student_profile=profile,
                    lesson_context=lesson_context,
                )
            except Exception:
                pass

            yield f"data: {json.dumps({'done': True, 'message': clean_message, 'phase': parsed_response.get('phase') if parsed_response else 'chat', 'full_response': full_response, 'pair_id': pair_id})}\n\n"
        except VaathiyaarUnavailable as exc:
            print(f"[classroom.chat_stream] AI unavailable: {str(exc.detail)[:200]}")
            yield f"data: {json.dumps({'done': True, 'message': exc.friendly, 'phase': 'chat', 'ai_unavailable': True})}\n\n"
        except Exception as exc:
            # Degrade gracefully — emit a calm `done`, never a raw `error` to a learner.
            print(f"[classroom.chat_stream] unexpected AI error: {str(exc)[:200]}")
            yield f"data: {json.dumps({'done': True, 'message': FRIENDLY_UNAVAILABLE, 'phase': 'chat', 'ai_unavailable': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/lessons")
async def list_lessons(user_id: str = None, authorization: str = Header(None)):
    """
    List all available lessons, personalized to the user's onboarding profile.

    Routing logic based on motivation & goal:
    - hobby / automation / games  → fun_automation track first, then python_fundamentals
    - ai_ml / data_science        → ai_ml_foundations + deep_learning tracks prioritized
    - career_switch / work        → python_fundamentals first (solid foundation)
    - student                     → python_fundamentals first, all tracks visible

    Skill level further refines visibility:
    - beginner    → only beginner-friendly tracks shown as recommended
    - intermediate → most tracks visible
    - advanced    → everything visible
    """
    if not LESSONS_DIR.exists():
        return {"lessons": []}

    try:
        lessons = _list_all_lessons(user_id=user_id)

        # Enterprise-only tracks (Azure/AWS/GCP/Foundry/cross-cloud) are hidden
        # from individual accounts — org members, org accounts, enterprise-plan
        # users and super admins see them. Fails closed for anonymous callers.
        #
        # IDOR guard (2026-07-08): the enterprise gate MUST key off the JWT-verified
        # identity, never the client-supplied user_id query param. The param is fine
        # for non-sensitive personalization (track ordering below), but trusting it
        # for access control let an anonymous caller pass ?user_id=<any org user's id>
        # and receive the full paid B2B catalog. Derive the acting user from the
        # token (optional_user_id → None when absent/invalid, which fails closed).
        from auth import optional_user_id
        from access import ENTERPRISE_TRACKS, has_enterprise_access
        verified_user_id = optional_user_id(authorization)
        if not has_enterprise_access(_get_db_path(), verified_user_id):
            lessons = [l for l in lessons if l.get("track") not in ENTERPRISE_TRACKS]

        if user_id:
            try:
                conn = sqlite3.connect(_get_db_path())
                conn.row_factory = sqlite3.Row
                profile = conn.execute(
                    "SELECT skill_level, goal, motivation FROM user_profiles WHERE user_id = ?",
                    [user_id],
                ).fetchone()
                conn.close()

                if profile:
                    skill_level = profile["skill_level"] or "beginner"
                    goal = profile["goal"] or ""
                    motivation = profile["motivation"] or ""

                    # Parse comma-separated multi-select values
                    goals = set(g.strip() for g in goal.split(",") if g.strip())
                    motivations = set(m.strip() for m in motivation.split(",") if m.strip())

                    # ── Determine primary track order based on motivation + goal ──

                    # Check if user is hobby/fun/automation oriented
                    is_hobby = bool(
                        motivations & {"hobby"}
                        or goals & {"automation", "games"}
                    )
                    # Check if user is AI/ML/Data Science oriented
                    is_ai_ml = bool(
                        motivations & {"ai_ml", "data_science"}
                        or goals & {"ai_ml", "data_science"}
                    )
                    # Check if user is career/work oriented
                    is_career = bool(
                        motivations & {"career_switch", "work"}
                        or goals & {"web"}
                    )

                    # Build prioritized track list based on profile
                    if is_hobby:
                        # Fun/automation users see fun_automation first, then fundamentals
                        primary_tracks = ["fun_automation", "python_fundamentals", "vibe_coding", "python_modern"]
                        secondary_tracks = ["python_intermediate", "ai_ml_foundations", "deep_learning",
                                            "web_development", "dsa", "ai_fundamentals",
                                            "machine_learning", "deep_learning_complete", "testing_devops",
                                            "ai_agents", "ai_engineering"]
                    elif is_ai_ml:
                        # AI/ML users see fundamentals → AI Agents → AI Engineering → Deep Learning
                        primary_tracks = ["python_fundamentals", "vibe_coding", "ai_agents", "ai_engineering",
                                          "ai_ml_foundations", "ai_fundamentals",
                                          "machine_learning", "deep_learning", "deep_learning_complete"]
                        secondary_tracks = ["python_intermediate", "python_modern", "fun_automation",
                                            "web_development", "dsa", "testing_devops"]
                    elif is_career:
                        # Career-focused: solid fundamentals first, then modern Python + AI
                        primary_tracks = ["python_fundamentals", "python_intermediate",
                                          "vibe_coding", "python_modern", "web_development"]
                        secondary_tracks = ["ai_agents", "ai_engineering", "fun_automation",
                                            "ai_ml_foundations", "deep_learning",
                                            "dsa", "ai_fundamentals", "machine_learning",
                                            "deep_learning_complete", "testing_devops"]
                    else:
                        # Student / unknown: balanced view — fundamentals first, new tracks visible
                        primary_tracks = ["python_fundamentals", "vibe_coding", "python_intermediate",
                                          "python_modern", "fun_automation"]
                        secondary_tracks = ["ai_agents", "ai_engineering", "ai_ml_foundations",
                                            "deep_learning", "web_development",
                                            "dsa", "ai_fundamentals", "machine_learning",
                                            "deep_learning_complete", "testing_devops"]

                    # ── Apply skill level visibility filter ──

                    skill_visible = {
                        "beginner": {"python_fundamentals", "fun_automation", "vibe_coding"},
                        "intermediate": {"python_fundamentals", "fun_automation", "python_intermediate",
                                         "ai_ml_foundations", "web_development", "dsa", "testing_devops",
                                         "python_modern", "vibe_coding", "python_internals", "async_concurrency",
                                         "performance_optimization", "debugging_mastery", "regex_mastery", "error_handling", "functional_python", "working_with_data"},
                        "advanced": {"python_fundamentals", "fun_automation", "python_intermediate",
                                     "ai_ml_foundations", "deep_learning", "web_development", "dsa",
                                     "ai_fundamentals", "machine_learning", "deep_learning_complete",
                                     "testing_devops", "ai_agents", "python_modern", "ai_engineering",
                                     "vibe_coding", "python_internals", "transformers_scratch", "async_concurrency",
                                     "performance_optimization", "debugging_mastery", "regex_mastery", "error_handling", "functional_python", "working_with_data"},
                    }
                    visible_tracks = skill_visible.get(skill_level, {"python_fundamentals", "fun_automation"})

                    # Always add primary tracks to visible (so hobby beginners see fun_automation)
                    for t in primary_tracks:
                        visible_tracks.add(t)

                    # ── Mark recommended / locked ──

                    for lesson in lessons:
                        track = lesson.get("track", "")
                        if track in visible_tracks or track == "generated":
                            lesson["recommended"] = True
                        else:
                            lesson["recommended"] = False

                    # Guarantee at least 3 recommended lessons
                    MIN_RECOMMENDED = 3
                    recommended_count = sum(1 for l in lessons if l.get("recommended"))
                    if recommended_count < MIN_RECOMMENDED:
                        all_tracks_fallback = primary_tracks + secondary_tracks
                        for fallback_track in all_tracks_fallback:
                            if recommended_count >= MIN_RECOMMENDED:
                                break
                            for lesson in lessons:
                                if recommended_count >= MIN_RECOMMENDED:
                                    break
                                if lesson.get("track") == fallback_track and not lesson.get("recommended"):
                                    lesson["recommended"] = True
                                    recommended_count += 1

                    # ── Sort: recommended first, primary tracks first, then order ──

                    all_ordered_tracks = primary_tracks + secondary_tracks + ["generated"]
                    track_priority = {t: i for i, t in enumerate(all_ordered_tracks)}

                    lessons.sort(key=lambda l: (
                        0 if l.get("recommended") else 1,
                        track_priority.get(l.get("track", ""), 99),
                        l.get("order", 0),
                    ))

                    # ── Add profile_hint for frontend personalization ──
                    profile_hint = "general"
                    if is_hobby:
                        profile_hint = "hobby"
                    elif is_ai_ml:
                        profile_hint = "ai_ml"
                    elif is_career:
                        profile_hint = "career"

                    # ── Fetch active learning path info ──
                    path_info = {}
                    try:
                        path_conn = sqlite3.connect(_get_db_path())
                        path_conn.row_factory = sqlite3.Row
                        active_path_row = path_conn.execute(
                            """SELECT ulp.path_id, ulp.current_position, ulp.adapted_sequence,
                                      lp.lesson_sequence, lp.name as path_name
                               FROM user_learning_paths ulp
                               JOIN learning_paths lp ON ulp.path_id = lp.id
                               WHERE ulp.user_id = ? AND ulp.status = 'active'
                               ORDER BY ulp.last_activity DESC LIMIT 1""",
                            [user_id],
                        ).fetchone()
                        if active_path_row:
                            seq = json.loads(active_path_row["adapted_sequence"]) if active_path_row["adapted_sequence"] else json.loads(active_path_row["lesson_sequence"])
                            pos = active_path_row["current_position"] or 0
                            next_lesson = seq[pos] if pos < len(seq) else None
                            # Count completed lessons in path
                            if seq:
                                placeholders = ",".join("?" * len(seq))
                                done_count = path_conn.execute(
                                    f"SELECT COUNT(*) as cnt FROM lesson_completions WHERE user_id = ? AND lesson_id IN ({placeholders})",
                                    [user_id] + seq,
                                ).fetchone()["cnt"]
                            else:
                                done_count = 0
                            path_info = {
                                "active_path": active_path_row["path_id"],
                                "active_path_name": active_path_row["path_name"],
                                "next_in_path": next_lesson,
                                "path_progress": {
                                    "current_position": pos,
                                    "total": len(seq),
                                    "completed": done_count,
                                    "pct": round(done_count / len(seq) * 100, 1) if seq else 0,
                                },
                            }
                        path_conn.close()
                    except Exception:
                        pass

                    return {
                        "lessons": lessons,
                        "profile_hint": profile_hint,
                        "primary_tracks": primary_tracks,
                        **path_info,
                    }
            except Exception as e:
                print(f"Profile lookup failed: {e}")

        return {"lessons": lessons}
    except Exception:
        return {"lessons": []}


@router.get("/lesson/{lesson_id}")
def get_lesson(
    lesson_id: str,
    user_id: Optional[str] = Query(default=None),
    authorization: str = Header(None),
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

    # Enterprise-only tracks: same gate as the catalog listing. 403 (not 404)
    # so org admins debugging a member's access see an explicit signal.
    #
    # IDOR guard (2026-07-08): key the gate off the JWT-verified identity, not the
    # client-supplied user_id query param — trusting the param let an anonymous
    # caller pass ?user_id=<org user's id> and open any paid enterprise lesson.
    from auth import optional_user_id
    from access import ENTERPRISE_TRACKS, has_enterprise_access
    verified_user_id = optional_user_id(authorization)
    if lesson.get("track") in ENTERPRISE_TRACKS and not has_enterprise_access(_get_db_path(), verified_user_id):
        raise HTTPException(
            status_code=403,
            detail="This lesson is part of the enterprise curriculum, available on organization plans.",
        )

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
def evaluate(request: EvaluateRequest, caller: str = Depends(get_current_user_id)):
    """
    Evaluate student code against expected output.
    Records a learning signal and updates mastery.
    """
    # IDOR/write guard (2026-07-02, same class as the routes/paths.py fix): this
    # endpoint AWARDS XP, advances the daily streak, and writes mastery/signals
    # for the body-supplied user_id. Without auth, an anonymous caller could
    # forge {"user_id": "<victim>"} to inflate any user's XP and fabricate
    # streaks — directly corrupting the leaderboard. Derive the acting user from
    # the verified JWT and refuse cross-user writes. The real client (api.js
    # axios interceptor / Classroom.jsx handleRun) always sends the session
    # user's own id with a Bearer token, so legitimate traffic is unaffected.
    if request.user_id != caller:
        raise HTTPException(status_code=403, detail="Forbidden")
    db_path = _get_db_path()
    from access import assert_learning_access
    assert_learning_access(db_path, request.user_id)  # 402 when trial lapsed
    profile = get_student_profile(db_path, request.user_id)

    lesson_context = {"lesson_id": request.lesson_id, "topic": request.topic}

    # Load the lesson once (reused below for xp_reward). Some lessons — e.g. the
    # numpy/pandas/sklearn set in ai_ml_foundations — carry NO usable
    # expected_output and instead ship a `test_code` assertion harness that grades
    # by inspecting the student's variables. For those the server passes the
    # (trusted, server-authoritative) harness to the grader; we deliberately load
    # it from the lesson JSON and NEVER trust a client-supplied harness. Gated on
    # an EMPTY expected_output so the 397 stdout-graded lessons are unaffected.
    lesson_obj = _load_lesson_from_dir(request.lesson_id) if request.lesson_id else None
    test_code = None
    sandbox_files = None
    if lesson_obj:
        _pc = (lesson_obj.get("practice_challenges") or [{}])[0]
        _tc = _pc.get("test_code")
        if isinstance(_tc, str) and _tc.strip():
            # Always forward the server-authored harness. When expected_output
            # is empty it is the primary grader (unchanged); when expected_output
            # exists the engine uses it only as a RESCUE on a clean-run stdout
            # mismatch (2026-07-02), so exact-match passes are unaffected.
            test_code = _tc
        # sandbox_files (2026-07-02): optional, server-authored fixture files a
        # file-I/O lesson seeds into the sandbox cwd; their names double as the
        # whitelist of literal filenames the student may open(). Loaded ONLY from
        # the lesson JSON on disk — never from the client. Absent (all other
        # lessons) → grading behaviour is byte-identical to before.
        _sf = lesson_obj.get("sandbox_files")
        if isinstance(_sf, dict):
            _clean = {
                k: v for k, v in _sf.items()
                if isinstance(k, str) and isinstance(v, str)
                and os.path.basename(k) == k and k != "main.py" and len(v) <= 65536
            }
            sandbox_files = _clean or None

    result = evaluate_code(
        student_code=request.code,
        expected_output=request.expected_output,
        student_profile=profile,
        lesson_context=lesson_context,
        attempt_count=request.attempt_count or 0,
        test_code=test_code,
        sandbox_files=sandbox_files,
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

    # Record Vaathiyaar's feedback as a training pair, scored by the real outcome
    # (did the student's code pass?) — an implicit quality signal for fine-tuning.
    try:
        fb = result.get("feedback")
        fb_resp = fb if isinstance(fb, dict) else {"message": str(fb)}
        record_training_pair(
            db_path=db_path,
            user_message=(
                f"My code for '{request.topic}':\n```python\n{request.code}\n```\n"
                f"Output: {result.get('output', '')}\n"
                f"Did it pass? {'yes' if result.get('success') else 'no'}"
            ),
            vaathiyaar_response=fb_resp,
            student_profile=profile,
            lesson_context=lesson_context,
            quality_score=0.85 if result.get("success") else 0.4,
        )
    except Exception:
        pass

    # Award XP when student completes a challenge successfully
    if result["success"] and request.topic:
        lesson = lesson_obj  # already loaded above (avoids a second disk read)
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

            # Passing a challenge is daily learning activity — advance the streak
            # (idempotent per day; counts retakes too). Never breaks XP/commit.
            from streaks import touch_streak
            touch_streak(conn, request.user_id)

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

    # Adapt learning path after lesson completion
    lesson_id_for_adapt = request.lesson_id or request.topic
    if lesson_id_for_adapt:
        try:
            adaptation = adapt_path(request.user_id, lesson_id_for_adapt)
            if adaptation and adaptation.get("changes"):
                result["path_adaptation"] = adaptation
        except Exception:
            pass  # Path adaptation should never block evaluation

    return result


# ---------------------------------------------------------------------------
# Vaathiyaar self-improvement: feedback signal + training-data export
# ---------------------------------------------------------------------------

@router.post("/feedback")
def vaathiyaar_feedback(request: FeedbackRequest):
    """Student rates a Vaathiyaar response (👍/👎). Sets the pair's quality score
    so good answers become high-quality fine-tuning data and bad ones are dropped."""
    score = 1.0 if request.helpful else 0.0
    updated = set_training_quality(_get_db_path(), request.pair_id, score)
    return {"ok": updated, "quality_score": score}


EXPORT_TOKEN = os.getenv("EXPORT_TOKEN", "")


def _require_export_access(x_export_token: str = Header(None), authorization: str = Header(None)):
    """Allow training-data export only via the export token OR a super-admin session."""
    if EXPORT_TOKEN and x_export_token == EXPORT_TOKEN:
        return True
    from auth import optional_user_id
    uid = optional_user_id(authorization)
    if uid:
        try:
            from routes.admin import require_super_admin
            require_super_admin(uid)
            return True
        except HTTPException:
            pass
    raise HTTPException(status_code=401, detail="Export requires a valid export token or super-admin session.")


@router.get("/training/stats")
def training_stats():
    """Aggregate counts only (no raw data) — used to monitor the loop / decide when to fine-tune."""
    return get_training_stats(_get_db_path())


@router.get("/training/export")
def training_export(min_quality: float = Query(0.7, ge=0.0, le=1.0), _auth=Depends(_require_export_access)):
    """Export high-quality interaction pairs as fine-tuning JSONL (chat format).
    Gated: requires the export token (X-Export-Token) or a super-admin session.
    Defaults to quality >= 0.7 so only 👍'd chats and successful-feedback pairs ship."""
    jsonl, count = build_training_jsonl(_get_db_path(), min_quality=min_quality)
    headers = {
        "Content-Disposition": 'attachment; filename="vaathiyaar_training.jsonl"',
        "X-Pair-Count": str(count),
    }
    return StreamingResponse(iter([jsonl]), media_type="application/x-ndjson", headers=headers)


@router.post("/diagnostic")
def diagnostic(request: DiagnosticRequest, caller: str = Depends(get_current_user_id)):
    """
    Run a pre-built diagnostic challenge.
    Evaluates code and records the result as a learning signal.
    """
    # Same IDOR guard: /diagnostic writes a learning signal keyed on the
    # body-supplied user_id. Derive the acting user from the JWT and refuse
    # cross-user writes (no anonymous signal forgery).
    _require_self(request.user_id, caller)
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
