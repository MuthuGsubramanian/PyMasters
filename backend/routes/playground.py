"""
playground.py — FastAPI APIRouter for the XP-based Playground chat.

Prefix: /api/playground
"""

import json
import os
import sqlite3
import uuid
from typing import Optional, List

from fastapi import APIRouter, Body, HTTPException
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
    conversation_id: Optional[str] = None


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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/credits/{user_id}")
def get_credits(user_id: str):
    """Return the user's XP-based prompt credit balance."""
    db_path = _get_db_path()
    return _get_user_credits(db_path, user_id)


@router.get("/conversations/{user_id}")
def get_conversations(user_id: str):
    """Return the user's playground conversation list."""
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
def get_conversation_messages(user_id: str, conversation_id: str):
    """Return all messages for a conversation."""
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

    system_prompt = build_system_prompt(profile, lesson_context)
    client = get_ollama_client()

    # Build messages with conversation history
    ollama_messages = [{"role": "system", "content": system_prompt}]
    ollama_messages.extend(history)

    def generate():
        full_response = ""
        try:
            for chunk in client.chat(
                model=OLLAMA_MODEL,
                messages=ollama_messages,
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
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/execute")
def execute_code(request: dict = Body(...)):
    """
    Execute Python code in a subprocess with real Python 3.12.
    Used by the Playground live terminal.
    More permissive than classroom evaluate — allows imports, file ops, etc.
    """
    from vaathiyaar.execution import run_code_subprocess

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
def install_package(request: dict = Body(...)):
    """
    Install a Python package via pip for the playground.
    """
    import subprocess
    import os

    package = request.get("package", "").strip()
    user_id = request.get("user_id", "")

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
