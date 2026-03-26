"""
engine.py — Vaathiyaar Engine: Ollama Cloud API integration, response parsing,
and safe code evaluation.
"""

import io
import json
import os
import contextlib
from typing import Optional

import requests

from vaathiyaar.modelfile import build_system_prompt

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "https://api.ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5")

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

    headers = {
        "Content-Type": "application/json",
    }
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
    }

    response = requests.post(
        f"{OLLAMA_API_URL}/api/chat",
        headers=headers,
        json=payload,
        timeout=60,
    )
    response.raise_for_status()

    data = response.json()

    try:
        raw_content = data["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected API response structure: {data}") from exc

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
    FORBIDDEN_KEYWORDS = [
        "import os",
        "import sys",
        "subprocess",
        "open(",
        "exec(",
        "eval(",
        "__import__",
        "shutil",
        "pathlib",
    ]

    # Security gate
    for kw in FORBIDDEN_KEYWORDS:
        if kw in student_code:
            return {
                "success": False,
                "output": "",
                "error": f"Security Error: forbidden keyword '{kw}' detected.",
                "feedback": parse_vaathiyaar_response(
                    json.dumps({
                        "message": (
                            f"Ayyo! '{kw}' is not allowed in the sandbox. "
                            "Try solving the challenge without file I/O or system imports."
                        ),
                        "phase": "feedback",
                        "animation": None,
                        "practice_challenge": None,
                        "profile_update": {
                            "topic_practiced": None,
                            "struggle_detected": True,
                            "mastery_delta": None,
                            "emotion_signal": "confused",
                        },
                    })
                ),
            }

    # Execute the code
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    exec_error = ""

    try:
        with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
            exec(student_code, {"__builtins__": __builtins__}, {})  # noqa: S102
    except Exception as exc:
        exec_error = str(exc)

    actual_output = stdout_buf.getvalue()
    stderr_output = stderr_buf.getvalue()
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
