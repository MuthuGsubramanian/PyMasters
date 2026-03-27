"""
engine.py — Vaathiyaar Engine: Ollama Cloud API integration, response parsing,
and safe code evaluation.
"""

import json
import os
from typing import Optional

from ollama import Client as OllamaClient

from vaathiyaar.modelfile import build_system_prompt

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5")

# Initialize Ollama client using the official SDK
_ollama_client = None

def get_ollama_client():
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OllamaClient(
            host="https://ollama.com",
            headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"}
        )
    return _ollama_client

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def call_vaathiyaar(
    user_message: str,
    student_profile: Optional[dict] = None,
    lesson_context: Optional[dict] = None,
    temperature: float = 0.7,
    max_tokens: int = 1500,
) -> dict:
    """
    Build a dynamic system prompt, call the Ollama Cloud API (native /api/chat
    endpoint), and return a parsed Vaathiyaar response dict.

    Parameters
    ----------
    user_message : str
        The student's latest message or code submission.
    student_profile : dict, optional
        Profile data from DuckDB (see modelfile.build_system_prompt).
    lesson_context : dict, optional
        Current lesson/session context (see modelfile.build_system_prompt).
    temperature : float
        Sampling temperature passed to the model (default 0.7).
    max_tokens : int
        Maximum tokens to generate (default 1500).

    Returns
    -------
    dict
        Parsed Vaathiyaar response with keys:
        message, phase, animation, practice_challenge, profile_update.

    Raises
    ------
    requests.HTTPError
        If the Ollama Cloud API returns a non-2xx status.
    ValueError
        If the API response structure is unexpected.
    """
    system_prompt = build_system_prompt(student_profile, lesson_context)

    client = get_ollama_client()

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    response = client.chat(
        model=OLLAMA_MODEL,
        messages=messages,
        stream=False,
    )

    raw_content = response["message"]["content"]
    return parse_vaathiyaar_response(raw_content)


def parse_vaathiyaar_response(raw: str) -> dict:
    """
    Parse the raw string returned by the AI model into a structured dict.

    Handles three cases:
    1. Clean JSON string — parsed directly.
    2. JSON wrapped in markdown code fences (```json ... ```) — fences stripped first.
    3. Plain text fallback — wrapped in a standard dict with sensible defaults.

    Parameters
    ----------
    raw : str
        The raw text content from the model's response.

    Returns
    -------
    dict
        A dict with keys: message, phase, animation, practice_challenge,
        profile_update. All keys are guaranteed to be present.
    """
    _DEFAULTS = {
        "phase": "feedback",
        "animation": None,
        "practice_challenge": None,
        "profile_update": {
            "topic_practiced": None,
            "struggle_detected": False,
            "mastery_delta": None,
            "emotion_signal": "neutral",
        },
    }

    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        # Remove opening fence (e.g. ```json or ```)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        # Remove closing fence
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()

    # Attempt JSON parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            # Ensure all required keys exist with defaults
            for key, default_val in _DEFAULTS.items():
                parsed.setdefault(key, default_val)
            if "message" not in parsed:
                parsed["message"] = raw  # last resort
            return parsed
    except json.JSONDecodeError:
        pass

    # Plain-text fallback: wrap in standard structure
    return {
        "message": raw,
        **_DEFAULTS,
    }


def evaluate_code(
    student_code: str,
    expected_output: str,
    student_profile: Optional[dict] = None,
    lesson_context: Optional[dict] = None,
) -> dict:
    """
    Safely execute student-submitted code, compare output with expected, then
    call Vaathiyaar for animated feedback.

    Security: a simple forbidden-keyword check blocks the most dangerous
    operations. In production, replace with a proper container sandbox.

    Parameters
    ----------
    student_code : str
        The Python source code submitted by the student.
    expected_output : str
        The expected stdout output (stripped) for correctness comparison.
    student_profile : dict, optional
        Forwarded to call_vaathiyaar for personalised feedback.
    lesson_context : dict, optional
        Forwarded to call_vaathiyaar.

    Returns
    -------
    dict
        Keys:
        - success (bool): True if actual output matches expected_output.
        - output (str): Captured stdout.
        - error (str): Captured stderr / exception message, or "".
        - feedback (dict): Parsed Vaathiyaar response dict.
    """
    from vaathiyaar.execution import run_code_subprocess, check_code_safety

    blocked = check_code_safety(student_code)
    if blocked:
        feedback_context = {
            "code_evaluation": {
                "success": False,
                "actual_output": "",
                "expected_output": expected_output,
                "error": f"Security Error: forbidden operation '{blocked}' detected.",
            }
        }
        if lesson_context:
            feedback_context.update(lesson_context)

        try:
            feedback = call_vaathiyaar(
                f"Student used forbidden keyword '{blocked}' in their code. "
                f"Explain why this is not allowed and guide them.",
                student_profile=student_profile,
                lesson_context=feedback_context,
            )
        except Exception:
            feedback = {
                "message": f"**Security Error:** `{blocked}` is not allowed in this environment. "
                           "Try solving the problem without system-level operations.",
                "phase": "feedback",
            }

        return {
            "success": False,
            "output": "",
            "error": f"Forbidden: '{blocked}'",
            "feedback": feedback.get("message", ""),
            "phase": feedback.get("phase", "feedback"),
            "animation": feedback.get("animation"),
        }

    # Execute code via subprocess
    result = run_code_subprocess(student_code)
    actual_output = result["output"]
    stderr_output = result["error"]
    exec_error = stderr_output if result["exit_code"] != 0 else ""
    error_msg = exec_error or stderr_output

    success = actual_output.strip() == expected_output.strip()

    # Build a feedback message for Vaathiyaar
    if success:
        feedback_prompt = (
            f"The student's code ran successfully and produced the correct output:\n"
            f"```\n{actual_output}\n```\n"
            "Please give encouraging, animated feedback and suggest what to explore next."
        )
    else:
        feedback_prompt = (
            f"The student submitted this code:\n```python\n{student_code}\n```\n"
            f"Expected output: {expected_output!r}\n"
            f"Actual output:   {actual_output!r}\n"
            f"Error (if any):  {error_msg!r}\n"
            "Please provide a hint — do NOT reveal the full solution yet. "
            "Use the Story→Visual→Code arc to guide them."
        )

    # Add feedback context to lesson_context
    feedback_context = dict(lesson_context or {})
    feedback_context["code_evaluation"] = {
        "success": success,
        "actual_output": actual_output,
        "expected_output": expected_output,
        "error": error_msg,
    }

    try:
        feedback = call_vaathiyaar(
            user_message=feedback_prompt,
            student_profile=student_profile,
            lesson_context=feedback_context,
        )
    except Exception as exc:
        # If API is unreachable, return a graceful fallback
        feedback = parse_vaathiyaar_response(
            json.dumps({
                "message": (
                    "I couldn't reach the AI server right now, but I noticed your code "
                    f"{'ran correctly!' if success else f'needs a small fix. Error: {error_msg}'}"
                ),
                "phase": "feedback",
                "animation": None,
                "practice_challenge": None,
                "profile_update": {
                    "topic_practiced": None,
                    "struggle_detected": not success,
                    "mastery_delta": 0.05 if success else None,
                    "emotion_signal": "excited" if success else "confused",
                },
            })
        )

    return {
        "success": success,
        "output": actual_output,
        "error": error_msg,
        "feedback": feedback,
    }
