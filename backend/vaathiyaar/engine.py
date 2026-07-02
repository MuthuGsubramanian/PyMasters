"""
engine.py — Vaathiyaar Engine: Ollama Cloud API integration, response parsing,
and safe code evaluation.
"""

import json
import os
import re
import time
from typing import Optional

from ollama import Client as OllamaClient

from vaathiyaar.modelfile import build_system_prompt

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5")

# Vertex AI Gemini fallback provider. Auths via the Cloud Run runtime service
# account (ADC) — no API key. Activated by adding "gemini" to VAATHIYAAR_PROVIDERS.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GEMINI_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Initialize Ollama client using the official SDK
_ollama_client = None

def get_ollama_client():
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OllamaClient(
            host="https://ollama.com",
            headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
            timeout=90,  # bound each call so a stalled model can't hang a job forever
        )
    return _ollama_client


# ---------------------------------------------------------------------------
# Provider abstraction + graceful degradation
#
# Vaathiyaar talks to an ORDERED list of LLM providers (env VAATHIYAAR_PROVIDERS,
# default "ollama"). The first provider that succeeds wins; if one fails we try
# the next; if ALL fail we raise VaathiyaarUnavailable so callers can degrade to
# a calm, learner-facing message instead of leaking a raw vendor 502.
#
# Adding a fallback provider later is config-only:
#   1. implement `_<name>_complete(messages, options) -> str` (+ optional stream)
#   2. register it in _PROVIDER_COMPLETE / _PROVIDER_STREAM
#   3. set VAATHIYAAR_PROVIDERS="ollama,<name>"
# ---------------------------------------------------------------------------

FRIENDLY_UNAVAILABLE = (
    "Vaathiyaar is taking a quick breather — a lot of learners are practising "
    "right now. Please try again in a moment. 🙏"
)


class VaathiyaarUnavailable(RuntimeError):
    """Raised when every configured provider fails. `.friendly` is safe to show
    a learner; `.detail` is the operator-facing reason (for logs)."""

    def __init__(self, detail: str = "", friendly: str = FRIENDLY_UNAVAILABLE):
        super().__init__(detail or friendly)
        self.detail = detail
        self.friendly = friendly


def _active_providers() -> list:
    # Split on ANY separator (comma/space/+/|) so the value survives gcloud
    # --set-env-vars (which is itself comma-delimited) — prod uses "ollama+gemini".
    raw = os.getenv("VAATHIYAAR_PROVIDERS", "ollama")
    return [p for p in re.split(r"[^A-Za-z0-9_]+", raw) if p]


def _ollama_complete(messages: list, options: dict) -> str:
    """Non-streaming Ollama Cloud call → raw assistant content string."""
    client = get_ollama_client()
    try:
        response = client.chat(
            model=OLLAMA_MODEL, messages=messages, stream=False,
            think=False, options=options,
        )
    except TypeError:
        response = client.chat(
            model=OLLAMA_MODEL, messages=messages, stream=False, options=options,
        )
    return response["message"]["content"]


def _ollama_stream(messages: list, options: dict):
    """Streaming Ollama Cloud call → yields content tokens."""
    client = get_ollama_client()
    try:
        stream_iter = client.chat(
            model=OLLAMA_MODEL, messages=messages, stream=True,
            think=False, options=options,
        )
    except TypeError:
        stream_iter = client.chat(
            model=OLLAMA_MODEL, messages=messages, stream=True, options=options,
        )
    for chunk in stream_iter:
        token = chunk.get("message", {}).get("content", "")
        if token:
            yield token


def _split_messages_for_gemini(messages: list):
    """Map OpenAI-style messages → Gemini's (system_instruction, contents).
    'system' turns are concatenated into the system instruction; 'assistant' →
    'model'; everything else → 'user'."""
    system_parts = []
    contents = []
    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role == "system":
            system_parts.append(content)
        else:
            g_role = "model" if role == "assistant" else "user"
            contents.append({"role": g_role, "parts": [{"text": content}]})
    return "\n\n".join(system_parts), contents


_gemini_client_obj = None


def _gemini_client():
    """Lazily build a Vertex AI Gemini client (ADC via the runtime SA). The SDK
    import is deferred so the module loads fine when Gemini isn't installed/used."""
    global _gemini_client_obj
    if _gemini_client_obj is None:
        from google import genai
        _gemini_client_obj = genai.Client(
            vertexai=True, project=GEMINI_PROJECT or None, location=GEMINI_LOCATION,
        )
    return _gemini_client_obj


def _gemini_complete(messages: list, options: dict) -> str:
    from google.genai import types
    client = _gemini_client()
    system, contents = _split_messages_for_gemini(messages)
    cfg = types.GenerateContentConfig(
        system_instruction=system or None,
        temperature=options.get("temperature", 0.7),
        max_output_tokens=options.get("num_predict", 1500),
    )
    resp = client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=cfg)
    return resp.text or ""


def _gemini_stream(messages: list, options: dict):
    from google.genai import types
    client = _gemini_client()
    system, contents = _split_messages_for_gemini(messages)
    cfg = types.GenerateContentConfig(
        system_instruction=system or None,
        temperature=options.get("temperature", 0.7),
        max_output_tokens=options.get("num_predict", 1500),
    )
    for chunk in client.models.generate_content_stream(model=GEMINI_MODEL, contents=contents, config=cfg):
        txt = getattr(chunk, "text", None)
        if txt:
            yield txt


# Registries: provider name → callable. Extend to add fallback providers.
_PROVIDER_COMPLETE = {"ollama": _ollama_complete, "gemini": _gemini_complete}
_PROVIDER_STREAM = {"ollama": _ollama_stream, "gemini": _gemini_stream}


def complete(messages: list, options: Optional[dict] = None) -> str:
    """Try each active provider in order; return the first success. Raise
    VaathiyaarUnavailable if all fail (or none are configured)."""
    options = options or {}
    errors = []
    for name in _active_providers():
        fn = _PROVIDER_COMPLETE.get(name)
        if fn is None:
            continue  # unknown/unimplemented provider name → skip
        try:
            return fn(messages, options)
        except Exception as exc:  # noqa: BLE001 — any provider error → fail over
            errors.append(f"{name}: {exc}")
            print(f"[vaathiyaar] provider '{name}' failed: {str(exc)[:200]}")
    raise VaathiyaarUnavailable(detail="; ".join(errors) or "no providers configured")


def stream(messages: list, options: Optional[dict] = None):
    """Yield response tokens from the first working provider. A provider that
    fails BEFORE yielding falls through to the next (streaming if available,
    else its non-streaming completion yielded as one block). Raises
    VaathiyaarUnavailable if all fail."""
    options = options or {}
    errors = []
    for name in _active_providers():
        sfn = _PROVIDER_STREAM.get(name)
        if sfn is not None:
            try:
                yielded = False
                for token in sfn(messages, options):
                    yielded = True
                    yield token
                if yielded:
                    return
                errors.append(f"{name}: empty stream")
                continue
            except Exception as exc:  # noqa: BLE001
                if yielded:
                    raise  # already streamed partial output — cannot fail over
                errors.append(f"{name}: {exc}")
                print(f"[vaathiyaar] stream provider '{name}' failed: {str(exc)[:200]}")
                continue
        cfn = _PROVIDER_COMPLETE.get(name)
        if cfn is not None:
            try:
                yield cfn(messages, options)
                return
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{name}: {exc}")
                continue
    raise VaathiyaarUnavailable(detail="; ".join(errors) or "no providers configured")


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

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    # Bound the generation: cap output tokens + set temperature (previously ignored,
    # which let the model run unbounded). `complete()` routes through the provider
    # fallback chain and raises VaathiyaarUnavailable if every provider fails, so
    # callers can degrade gracefully instead of leaking a raw vendor error.
    options = {"temperature": temperature, "num_predict": max_tokens}
    _t = time.time()
    raw_content = complete(messages, options)
    print(f"[vaathiyaar] chat took {time.time() - _t:.1f}s (max_tokens={max_tokens})")

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
                parsed["message"] = _salvage_message(text) or raw
            return parsed
    except json.JSONDecodeError:
        pass

    # JSON was malformed/truncated (e.g. the reply hit the token cap mid-value).
    # Salvage the human message rather than ever showing the student raw JSON.
    salvaged = _salvage_message(text)
    if salvaged is not None:
        return {"message": salvaged, **_DEFAULTS}

    # Looks like JSON but no recoverable message → friendly fallback, no braces.
    if text.lstrip().startswith("{"):
        return {
            "message": "Sorry — I had a hiccup forming that reply. Could you ask again?",
            **_DEFAULTS,
        }

    # Genuine plain text → use it directly.
    return {"message": raw, **_DEFAULTS}


# JSON string-escape sequences we decode when salvaging a partial message.
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f"}


def _salvage_message(text: str) -> Optional[str]:
    """
    Extract the value of a JSON "message" field from a possibly-truncated or
    malformed string, decoding escape sequences and tolerating a missing closing
    quote (the reply was cut off at the token limit). Returns None if no
    "message" field is present.
    """
    import re

    m = re.search(r'"message"\s*:\s*"', text)
    if not m:
        return None
    i = m.end()
    out = []
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            if i + 1 < n:
                out.append(_ESCAPES.get(text[i + 1], text[i + 1]))
                i += 2
                continue
            break  # trailing backslash from truncation
        if c == '"':
            break  # closing quote of the message value
        out.append(c)
        i += 1
    return "".join(out)


STRUGGLE_THRESHOLD = 3


def is_struggling(success: bool, attempt_count: int, threshold: int = STRUGGLE_THRESHOLD) -> bool:
    """True when a student keeps failing the same challenge and needs more scaffolding."""
    if success:
        return False
    return attempt_count >= threshold


def build_feedback_prompt(
    success: bool,
    struggling: bool,
    student_code: str,
    expected_output: str,
    actual_output: str,
    error_msg: str,
) -> str:
    """Choose the tutoring prompt by outcome: celebrate success, hint on early
    failures, and escalate to concrete step-by-step help once the student is stuck."""
    if success:
        return (
            f"The student's code ran successfully and produced the correct output:\n"
            f"```\n{actual_output}\n```\n"
            "Please give encouraging, animated feedback and suggest what to explore next."
        )
    base = (
        f"The student submitted this code:\n```python\n{student_code}\n```\n"
        f"Expected output: {expected_output!r}\n"
        f"Actual output:   {actual_output!r}\n"
        f"Error (if any):  {error_msg!r}\n"
        "IMPORTANT: the automated check marked this attempt as NOT PASSED, and the "
        "student sees a red 'Not Quite Right' banner. Never tell them their solution "
        "is perfect, correct, or passed. If their logic looks right but the output "
        "text differs from the expected output, say exactly that: the grader compares "
        "output character-for-character, so they must match the expected output "
        "precisely (same function names, same printed text).\n"
    )
    if struggling:
        return base + (
            "The student has tried several times and is clearly struggling. Be extra "
            "supportive and patient — acknowledge their effort. Break the problem into the "
            "smallest possible next step and walk them through it concretely: explain the "
            "specific error in plain language, show a tiny worked example or pseudocode for "
            "just the stuck part (never the whole solution), and give one clear action to try next."
        )
    return base + (
        "Please provide a hint — do NOT reveal the full solution yet. "
        "Use the Story→Visual→Code arc to guide them."
    )


def evaluate_code(
    student_code: str,
    expected_output: str,
    student_profile: Optional[dict] = None,
    lesson_context: Optional[dict] = None,
    attempt_count: int = 0,
    test_code: Optional[str] = None,
    sandbox_files: Optional[dict] = None,
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

    # sandbox_files (2026-07-02): server-authored fixture files a file-I/O lesson
    # seeds into the sandbox cwd. Their names double as the whitelist of literal
    # filenames the student may open(); absent (all other lessons) → behaviour
    # is byte-identical to before.
    blocked = check_code_safety(
        student_code,
        allowed_open_files=set(sandbox_files) if sandbox_files else None,
    )
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

    # Execute code via subprocess. Two grading modes:
    #  • test_code present (server-authored, trusted assertion harness) → run the
    #    student's code followed by the harness in ONE program; success == a clean
    #    exit (no AssertionError/exception). This mirrors the proven Challenges
    #    grader and is how "test_code" lessons (e.g. numpy/pandas/sklearn, whose
    #    correctness is a property of the student's VARIABLES, not stdout) are meant
    #    to be graded. Callers pass test_code only when there is no usable
    #    expected_output, so the default path below is never altered for the
    #    stdout-graded lessons.
    #  • else (default, unchanged) → exact stdout match against expected_output.
    harness = test_code if (isinstance(test_code, str) and test_code.strip()) else None
    if harness:
        result = run_code_subprocess(student_code + "\n\n" + harness, seed_files=sandbox_files)
        actual_output = result["output"]
        stderr_output = result["error"]
        success = result["exit_code"] == 0
        # On failure, surface the assertion/exception (its message names the exact
        # unmet requirement, e.g. "matrix must be 3x3") so Vaathiyaar can coach.
        error_msg = "" if success else stderr_output
    else:
        result = run_code_subprocess(student_code, seed_files=sandbox_files)
        actual_output = result["output"]
        stderr_output = result["error"]
        exec_error = stderr_output if result["exit_code"] != 0 else ""
        error_msg = exec_error or stderr_output

        success = actual_output.strip() == expected_output.strip()

        # HARNESS RESCUE (2026-07-02): exact stdout matching fails semantically
        # correct solutions (live QA: a correct decorator printing "Hello,
        # PyMasters!" instead of the sample's "Hello!" was marked wrong while
        # Vaathiyaar praised it — contradictory verdicts). When the lesson ships
        # a server-authored test_code harness, use it as a second chance on a
        # CLEAN-RUN stdout mismatch: if the assertions pass, the solution is
        # correct. This can only rescue false negatives — passing solutions and
        # error cases are untouched.
        if not success and test_code and not exec_error:
            rescue = run_code_subprocess(student_code + "\n\n" + test_code, seed_files=sandbox_files)
            if rescue["exit_code"] == 0:
                success = True
                error_msg = ""
    struggling = is_struggling(success, attempt_count)

    # Build a feedback message for Vaathiyaar, escalating help if the student is stuck.
    feedback_prompt = build_feedback_prompt(
        success, struggling, student_code, expected_output, actual_output, error_msg
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
        "struggling": struggling,
        "feedback": feedback,
    }
