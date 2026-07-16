"""
playground.py — FastAPI APIRouter for the XP-based Playground chat.

Prefix: /api/playground
"""

import json
import os
import re
import sqlite3
import uuid
from typing import Optional, List

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter
from vaathiyaar.engine import (
    call_vaathiyaar, get_ollama_client, OLLAMA_MODEL,
    stream as vaathiyaar_stream, VaathiyaarUnavailable, FRIENDLY_UNAVAILABLE,
)
from vaathiyaar.modelfile import build_system_prompt
from vaathiyaar.profiler import get_student_profile, record_signal

router = APIRouter(prefix="/api/playground", tags=["playground"])


def _maybe_record_playground_signal(db_path: str, user_id: str, response) -> None:
    """Capture what a learner explores in the free-form Playground.

    The Playground is a rich, previously-discarded pattern source: a curious
    or stuck learner's questions reveal their interests and gaps. When
    Vaathiyaar identifies the topic (profile_update.topic_practiced), record a
    'playground_question' learning signal so the knowledge model and
    recommendations benefit — same mechanism as classroom chat. Best-effort:
    never fail the chat request over analytics (2026-07-08)."""
    try:
        if not isinstance(response, dict):
            return
        profile_update = response.get("profile_update") or {}
        topic = profile_update.get("topic_practiced")
        if not topic:
            return
        record_signal(
            db_path,
            user_id=user_id,
            signal_type="playground_question",
            topic=topic,
            value=profile_update,
        )
    except Exception:
        pass  # analytics is best-effort; the chat reply must still return

# Per-user throttles. Single Cloud Run instance → in-memory state is fine.
# Code execution is cheap but abusable as free compute; package installs mutate
# the shared interpreter, so they're far more tightly bounded.
_execute_limiter = SlidingWindowRateLimiter(max_calls=30, window_seconds=60)
_install_limiter = SlidingWindowRateLimiter(max_calls=5, window_seconds=300)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PlaygroundChatRequest(BaseModel):
    user_id: str
    message: str
    language: Optional[str] = "en"
    conversation_id: Optional[str] = None
    # Optional display name/username so Vaathiyaar can address the learner by
    # name. Mirrors the Classroom chat request; when absent the engine falls
    # back to the profile name and ultimately to "the student".
    username: Optional[str] = None
    # Client-supplied part-of-day ("morning"/"afternoon"/"evening") computed from
    # the learner's LOCAL clock. The server runs in UTC on Cloud Run, so it can't
    # infer this reliably; without it the model guesses and may open with
    # "Good morning" in the afternoon. Optional → when omitted, behaviour is
    # unchanged from before.
    time_of_day: Optional[str] = None
    # Which page/module of the app the learner is on (e.g. "Challenges —
    # weekly coding battles"). Sent by the global Vaathiyaar side panel so
    # answers can reference what the learner is currently looking at.
    # Optional → omitted by the full Playground page, behaviour unchanged.
    page_context: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _require_self(user_id: str, caller: str) -> None:
    """IDOR guard: playground credits, conversation lists, and chat history are
    private per-user data, and /chat + /chat/stream MUTATE state (burn the
    user's prompt credits, insert rows into their conversation history).

    The user_id (path param or request body) is client-supplied; without this
    check any caller could read another learner's Vaathiyaar chat transcripts
    or spend their credits. Derive the acting user from the verified JWT and
    refuse cross-user access. Mirrors routes/graph.py and routes/paths.py.
    """
    if caller != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")


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


def _get_or_create_conversation(db_path: str, user_id: str, conversation_id: Optional[str] = None) -> str:
    """Get existing conversation or create a new one. Returns conversation_id."""
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        if conversation_id:
            cursor.execute(
                "SELECT id FROM playground_conversations WHERE id = ? AND user_id = ?",
                [conversation_id, user_id],
            )
            if cursor.fetchone():
                return conversation_id

        # Create new conversation
        new_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO playground_conversations (id, user_id) VALUES (?, ?)",
            [new_id, user_id],
        )
        conn.commit()
        return new_id
    finally:
        conn.close()


def _save_message(db_path: str, conversation_id: str, role: str, content: str):
    """Save a message to the conversation history."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO playground_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            [conversation_id, role, content],
        )
        conn.execute(
            "UPDATE playground_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [conversation_id],
        )
        conn.commit()
    finally:
        conn.close()


def _update_conversation_title(db_path: str, conversation_id: str, first_message: str):
    """Set conversation title from first user message (truncated)."""
    title = first_message[:80].strip()
    if len(first_message) > 80:
        title += "..."
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE playground_conversations SET title = ? WHERE id = ? AND title = 'New conversation'",
            [title, conversation_id],
        )
        conn.commit()
    finally:
        conn.close()


def _get_conversation_history(db_path: str, conversation_id: str, limit: int = 20) -> list:
    """Get recent messages from a conversation for context."""
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content FROM playground_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
            [conversation_id, limit],
        )
        rows = cursor.fetchall()
        return [{"role": r[0], "content": r[1]} for r in reversed(rows)]
    finally:
        conn.close()


_ENVELOPE_RE = re.compile(r'\{\s*"message"\s*:\s*"')
_PARTIAL_MSG_RE = re.compile(r'"message"\s*:\s*"((?:[^"\\]|\\.)*)', re.DOTALL)


def _normalize_ws(s: str) -> str:
    return " ".join(s.split())


def _is_json_only_tail(s: str) -> bool:
    """
    True when `s` (the text after a captured "message" value) contains only
    JSON syntax — closing quote, other envelope keys/values, braces, fences —
    and no free prose. Distinguishes a leaked response envelope at the END of
    the output from a `{"message": …}` code EXAMPLE the model is showing
    mid-answer (which has prose after it and must not be touched).
    """
    if s and s[0] == '"':
        s = s[1:]                                   # closing quote of the message value
    s = re.sub(r'"(?:[^"\\]|\\.)*"', ' ', s)        # complete quoted strings
    s = re.sub(r'"(?:[^"\\]|\\.)*\\?$', ' ', s)     # trailing unclosed quoted fragment
    s = re.sub(r'\b(?:null|true|false)\b', ' ', s)  # bare JSON literals
    s = re.sub(r'-?\d+(?:\.\d+)?', ' ', s)          # numbers
    s = s.replace('```', ' ')
    return not set(s) - set('{}[],:\n\r\t "\\ ')


def _extract_clean_message(full_response: str) -> str:
    """
    Extract the human-readable message from a raw Vaathiyaar response.

    The system prompt asks the model to answer as a JSON envelope
    {"message": ...}. Three shapes actually occur in the wild:
      1. The whole response is that JSON object (optionally in a ``` fence).
      2. Plain prose with no envelope at all.
      3. Prose followed by a re-emitted envelope (often cut off mid-string by
         the num_predict token cap) — observed live 2026-07-02: the raw,
         truncated JSON rendered as a code block in the chat and was saved
         to conversation history.

    This helper handles all three without changing behavior for 1 and 2.
    """
    clean_message = full_response

    # --- Shape 1: entire response is the JSON envelope (existing behavior) ---
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
            return str(parsed["message"])
    except (json.JSONDecodeError, KeyError, TypeError):
        pass

    # --- Shape 3: prose followed by a leaked (possibly truncated) envelope ---
    m = None
    for m in _ENVELOPE_RE.finditer(full_response):
        pass  # keep the LAST envelope start
    if m is None:
        return clean_message  # Shape 2: plain prose — unchanged

    prose = full_response[: m.start()]
    tail = full_response[m.start():]

    # Drop a code-fence opener the model put right before the envelope
    # (e.g. "```json\n" / "```\n") so it doesn't dangle in the prose.
    prose = re.sub(r'```(?:json)?\s*$', '', prose).rstrip()

    # Recover the envelope's message text: full parse first, else the
    # partial string value (truncated envelopes never close their quotes).
    envelope_msg = None
    try:
        t = tail.strip()
        if t.endswith("```"):
            t = t[:-3].strip()
        parsed = json.loads(t)
        if isinstance(parsed, dict) and "message" in parsed:
            envelope_msg = str(parsed["message"])
    except (json.JSONDecodeError, TypeError):
        # Truncated-envelope recovery. Only applies when the envelope runs to
        # the END of the response (num_predict cut it off) — a `{"message": …}`
        # that appears mid-text with prose AFTER it is a code example the
        # model is showing the learner, not a leak, and must stay untouched.
        pm = _PARTIAL_MSG_RE.search(tail)
        if pm:
            remainder = tail[pm.end(1):]
            if not _is_json_only_tail(remainder):
                return clean_message  # mid-prose JSON example — leave as-is
            raw = pm.group(1)
            try:
                envelope_msg = json.loads('"' + raw + '"')
            except json.JSONDecodeError:
                envelope_msg = raw.replace('\\n', '\n').replace('\\"', '"')

    if envelope_msg is None:
        # Envelope start with no recoverable message text: keep the prose,
        # drop the unreadable JSON fragment (never show raw JSON to a learner).
        return prose if _normalize_ws(prose) else clean_message

    if not _normalize_ws(prose):
        # Model answered only inside the envelope (possibly truncated).
        return envelope_msg

    # Duplicate re-emission: the envelope restates the prose → keep the prose,
    # which is complete, and drop the duplicate.
    probe = _normalize_ws(envelope_msg)[:60]
    if probe and probe in _normalize_ws(prose):
        return prose

    # Distinct content: keep both, but as readable text, never raw JSON.
    return prose + "\n\n" + envelope_msg


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/credits/{user_id}")
def get_credits(user_id: str, caller: str = Depends(get_current_user_id)):
    """Return the user's XP-based prompt credit balance."""
    _require_self(user_id, caller)
    db_path = _get_db_path()
    return _get_user_credits(db_path, user_id)


@router.get("/conversations/{user_id}")
def get_conversations(user_id: str, caller: str = Depends(get_current_user_id)):
    """Return the user's playground conversation list."""
    _require_self(user_id, caller)
    db_path = _get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, title, created_at, updated_at FROM playground_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50",
            [user_id],
        )
        rows = cursor.fetchall()
        return [
            {"id": r[0], "title": r[1], "created_at": r[2], "updated_at": r[3]}
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/conversations/{user_id}/{conversation_id}")
def get_conversation_messages(user_id: str, conversation_id: str, caller: str = Depends(get_current_user_id)):
    """Return all messages for a conversation."""
    _require_self(user_id, caller)
    db_path = _get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        # Verify ownership
        cursor.execute(
            "SELECT id FROM playground_conversations WHERE id = ? AND user_id = ?",
            [conversation_id, user_id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Conversation not found")

        cursor.execute(
            "SELECT role, content, created_at FROM playground_messages WHERE conversation_id = ? ORDER BY created_at",
            [conversation_id],
        )
        rows = cursor.fetchall()
        return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in rows]
    finally:
        conn.close()


@router.post("/chat")
def playground_chat(request: PlaygroundChatRequest, caller: str = Depends(get_current_user_id)):
    """
    Send a free-form message to Vaathiyaar in the Playground.
    Checks XP-based prompt allowance before responding.
    Each prompt costs 1 credit (1 XP = 100 credits).
    """
    _require_self(request.user_id, caller)
    db_path = _get_db_path()
    from access import assert_learning_access
    assert_learning_access(db_path, request.user_id)  # 402 when trial lapsed

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
    except (VaathiyaarUnavailable, Exception) as exc:
        # Degrade gracefully and DON'T charge a prompt for a failed call.
        friendly = getattr(exc, "friendly", FRIENDLY_UNAVAILABLE)
        print(f"[playground.chat] AI unavailable: {str(exc)[:200]}")
        return {
            "response": friendly,
            "credits": _get_user_credits(db_path, request.user_id),
            "ai_unavailable": True,
        }

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

    # Capture the learner's exploration pattern (best-effort, never blocks).
    _maybe_record_playground_signal(db_path, request.user_id, response)

    return {
        "response": reply,
        "credits": updated_credits,
    }


@router.post("/chat/stream")
def playground_chat_stream(request: PlaygroundChatRequest, caller: str = Depends(get_current_user_id)):
    """Stream a free-form Vaathiyaar response token by token using SSE."""
    _require_self(request.user_id, caller)
    db_path = _get_db_path()
    from access import assert_learning_access
    assert_learning_access(db_path, request.user_id)  # 402 when trial lapsed

    # Check credits
    credits = _get_user_credits(db_path, request.user_id)
    if credits["remaining_prompts"] <= 0:
        raise HTTPException(
            status_code=403,
            detail="You've used all your prompts! Complete more lessons to earn XP and unlock more.",
        )

    # Get or create conversation
    conversation_id = _get_or_create_conversation(db_path, request.user_id, request.conversation_id)

    # Save user message
    _save_message(db_path, conversation_id, "user", request.message)
    _update_conversation_title(db_path, conversation_id, request.message)

    # Load conversation history for context
    history = _get_conversation_history(db_path, conversation_id)

    profile = get_student_profile(db_path, request.user_id)
    lesson_context = {
        "mode": "playground",
        "language": request.language or "en",
    }
    if request.page_context:
        lesson_context["page_context"] = request.page_context[:200]

    # Pass the username explicitly so the greeting/empathy tokens use the
    # learner's name rather than the generic "the student" fallback when the
    # stored profile.name is empty. username= takes priority in build_system_prompt.
    system_prompt = build_system_prompt(
        profile, lesson_context, username=request.username, time_of_day=request.time_of_day
    )

    # Build messages with conversation history
    ollama_messages = [{"role": "system", "content": system_prompt}]
    ollama_messages.extend(history)

    def generate():
        full_response = ""
        try:
            for token in vaathiyaar_stream(ollama_messages, {"temperature": 0.7, "num_predict": 1500}):
                if token:
                    full_response += token
                    yield f"data: {json.dumps({'token': token})}\n\n"

            # Parse response and extract clean message. Handles whole-JSON
            # envelopes (previous behavior), plain prose, and the observed
            # prose + leaked/truncated envelope re-emission (2026-07-02).
            clean_message = _extract_clean_message(full_response)

            # Save assistant response to conversation
            try:
                _save_message(db_path, conversation_id, "assistant", clean_message)
            except Exception:
                pass

            yield f"data: {json.dumps({'done': True, 'message': clean_message, 'full_response': full_response, 'conversation_id': conversation_id})}\n\n"

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
        except VaathiyaarUnavailable as exc:
            print(f"[playground.chat_stream] AI unavailable: {str(exc.detail)[:200]}")
            yield f"data: {json.dumps({'done': True, 'message': exc.friendly, 'conversation_id': conversation_id, 'ai_unavailable': True})}\n\n"
        except Exception as exc:
            print(f"[playground.chat_stream] unexpected AI error: {str(exc)[:200]}")
            yield f"data: {json.dumps({'done': True, 'message': FRIENDLY_UNAVAILABLE, 'conversation_id': conversation_id, 'ai_unavailable': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/execute")
def execute_code(request: dict = Body(...), user_id: str = Depends(get_current_user_id)):
    """
    Execute Python code in a hardened subprocess. Authenticated + rate-limited.
    Used by the Playground live terminal.
    More permissive than classroom evaluate — allows imports, file ops, etc.
    """
    from vaathiyaar.execution import run_code_subprocess
    from access import assert_learning_access
    assert_learning_access(_get_db_path(), user_id)  # 402 when trial lapsed

    if not _execute_limiter.allow(user_id):
        wait = _execute_limiter.retry_after(user_id)
        return {"output": "", "error": f"Rate limit reached. Try again in {wait}s.", "exit_code": 1}

    code = request.get("code", "")
    if not code.strip():
        return {"output": "", "error": "No code provided.", "exit_code": 1}

    result = run_code_subprocess(code)

    output = result["output"]
    error = result["error"]

    # Combine output for terminal display
    combined = output
    if error:
        combined += ("\n" if combined else "") + error

    return {
        "output": combined.strip() if combined else "(No output)",
        "error": error,
        "exit_code": result["exit_code"],
    }


@router.post("/install-package")
def install_package(request: dict = Body(...), user_id: str = Depends(get_current_user_id)):
    """
    Install an allowlisted Python package via pip. Authenticated + tightly
    rate-limited (installs mutate the shared interpreter).
    """
    import subprocess
    import os

    if not _install_limiter.allow(user_id):
        wait = _install_limiter.retry_after(user_id)
        return {"success": False, "error": f"Install rate limit reached. Try again in {wait}s."}

    package = request.get("package", "").strip()

    if not package:
        return {"success": False, "error": "No package name provided"}

    # Whitelist common safe packages
    ALLOWED_PACKAGES = {
        "numpy", "pandas", "matplotlib", "seaborn", "scipy", "scikit-learn",
        "requests", "beautifulsoup4", "flask", "fastapi", "django",
        "pillow", "opencv-python", "torch", "tensorflow", "transformers",
        "langchain", "openai", "anthropic", "chromadb", "faiss-cpu",
        "pytest", "black", "isort", "rich", "typer", "click",
        "pydantic", "sqlalchemy", "aiohttp", "httpx", "boto3",
        "redis", "celery", "PyPDF2", "openpyxl", "python-dotenv",
        "tiktoken", "nltk", "spacy", "networkx", "sympy",
    }

    # Normalize package name
    pkg_normalized = package.lower().replace("-", "_").replace(".", "_")
    allowed_normalized = {p.lower().replace("-", "_").replace(".", "_") for p in ALLOWED_PACKAGES}

    if pkg_normalized not in allowed_normalized:
        return {
            "success": False,
            "error": f"Package '{package}' is not in the allowed list. Contact support to request it.",
            "allowed": sorted(ALLOWED_PACKAGES),
        }

    python_cmd = "python3" if os.name != "nt" else "python"

    try:
        result = subprocess.run(
            [python_cmd, "-m", "pip", "install", package],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode == 0:
            return {"success": True, "output": result.stdout}
        else:
            return {"success": False, "error": result.stderr}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Installation timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}
