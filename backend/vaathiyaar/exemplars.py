"""
exemplars.py — "golden exemplars": continual improvement of Vaathiyaar without
a training run.

Learners rate tutor turns (👍 / successful feedback) and those land in the
``training_data`` table with a quality_score. Ollama Cloud cannot host a
custom fine-tuned model, so instead of a periodic fine-tune we close the loop
at request time: the top-rated past interactions that look most like the
current question are injected into the system prompt as short few-shot
examples. Every new high rating therefore improves the next answer, and the
set refreshes itself continuously (no operator action).

Design constraints
- Never slows or breaks a chat: one cheap SQLite read, cached in-process for a
  few minutes; any error → no block (empty string).
- Never recycles junk: rows whose output is the outage fallback text
  ("I couldn't reach the AI server…", the "breather" message) or malformed
  JSON are skipped, whatever their stored score (the 0.85 "code ran" score was
  being awarded to those rows — see routes/classroom.py).
- Bounded prompt cost: at most ``k`` examples, each trimmed.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time

EXEMPLARS_ENABLED = os.getenv("VAATHIYAAR_EXEMPLARS", "1").strip().lower() not in ("0", "false", "off", "")
MIN_QUALITY = float(os.getenv("VAATHIYAAR_EXEMPLAR_MIN_QUALITY", "0.7"))
POOL_SIZE = 300            # most recent high-quality rows considered per refresh
CACHE_TTL = 300            # seconds between SQLite reads
MAX_INPUT_CHARS = 350
MAX_OUTPUT_CHARS = 600

# Marker phrases of non-answers we must never teach from.
_JUNK_MARKERS = (
    "couldn't reach the ai server",
    "could not reach the ai server",
    "taking a quick breather",
    "try again in a moment",
    "ai server right now",
)

_lock = threading.Lock()
_cache = {"db": None, "at": 0.0, "rows": []}
_token_re = re.compile(r"[a-z_][a-z0-9_]{2,}")


def _tokens(text: str) -> set:
    return set(_token_re.findall((text or "").lower()))


def _clean_output(raw: str) -> str:
    """Return the learner-facing message from a stored tutor output (which is
    usually the Vaathiyaar JSON envelope), or '' if it is junk."""
    text = (raw or "").strip()
    if not text:
        return ""
    message = text
    if text.startswith("{"):
        try:
            obj = json.loads(text)
            message = str(obj.get("message") or obj.get("response") or obj.get("content") or "").strip()
        except (ValueError, AttributeError):
            return ""  # malformed envelope — not worth teaching from
    low = message.lower()
    if not message or any(m in low for m in _JUNK_MARKERS):
        return ""
    return message


def is_junk_output(raw: str) -> bool:
    """True when a tutor output is an outage/fallback non-answer."""
    return _clean_output(raw) == ""


def _load_rows(db_path: str) -> list:
    conn = sqlite3.connect(db_path, timeout=5)
    try:
        cur = conn.execute(
            "SELECT input_text, output_text, context_json, quality_score FROM training_data "
            "WHERE quality_score >= ? ORDER BY created_at DESC LIMIT ?",
            [MIN_QUALITY, POOL_SIZE],
        )
        rows = []
        for inp, out, ctx, q in cur.fetchall():
            msg = _clean_output(out)
            if not msg or not (inp or "").strip():
                continue
            lesson_id = ""
            try:
                lesson_id = (json.loads(ctx or "{}") or {}).get("lesson_id") or ""
            except ValueError:
                pass
            rows.append({
                "input": inp.strip(), "output": msg, "lesson_id": lesson_id,
                "quality": float(q or 0), "tokens": _tokens(inp),
            })
        return rows
    finally:
        conn.close()


def _pool(db_path: str) -> list:
    now = time.time()
    with _lock:
        if _cache["db"] == db_path and now - _cache["at"] < CACHE_TTL:
            return _cache["rows"]
    try:
        rows = _load_rows(db_path)
    except Exception:  # noqa: BLE001 — missing table / locked DB → no exemplars
        rows = []
    with _lock:
        _cache.update({"db": db_path, "at": now, "rows": rows})
    return rows


def invalidate_cache() -> None:
    with _lock:
        _cache.update({"db": None, "at": 0.0, "rows": []})


def select_exemplars(db_path: str, query: str, lesson_id: str = "", k: int = 3) -> list:
    """Top-k rated interactions most similar to ``query`` (token overlap, with a
    bonus for the same lesson and for higher ratings)."""
    rows = _pool(db_path)
    if not rows:
        return []
    q_tokens = _tokens(query)
    scored = []
    for r in rows:
        overlap = len(q_tokens & r["tokens"])
        score = overlap + (2.0 if lesson_id and r["lesson_id"] == lesson_id else 0.0) + r["quality"]
        if overlap == 0 and not (lesson_id and r["lesson_id"] == lesson_id):
            continue  # unrelated — better no example than a misleading one
        scored.append((score, r))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [r for _, r in scored[:k]]


def _trim(text: str, n: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def exemplar_block(db_path: str, query: str, lesson_id: str = "", k: int = 3) -> str:
    """Prompt block to append to the tutor system prompt, or '' when disabled /
    nothing relevant / any error."""
    if not EXEMPLARS_ENABLED or not db_path or not (query or "").strip():
        return ""
    try:
        picks = select_exemplars(db_path, query, lesson_id=lesson_id, k=k)
    except Exception:  # noqa: BLE001
        return ""
    if not picks:
        return ""
    lines = [
        "\n## Golden Examples (answers learners rated highly)",
        "Match the tone, depth and structure of these past replies. They are style "
        "guides, not facts to repeat — answer the student's actual question.",
    ]
    for i, r in enumerate(picks, 1):
        lines.append(f"\nExample {i} — student: {_trim(r['input'], MAX_INPUT_CHARS)}")
        lines.append(f"Vaathiyaar: {_trim(r['output'], MAX_OUTPUT_CHARS)}")
    return "\n".join(lines)


def enrich_messages(messages: list, db_path: str) -> list:
    """Append the exemplar block to the system message of a tutor chat.

    Applied centrally by engine.complete()/stream(). Only touches message lists
    that carry the Vaathiyaar tutor persona (marker heading from modelfile.py),
    so the lesson-generation pipeline and other LLM calls are left alone."""
    if not EXEMPLARS_ENABLED or not messages or not isinstance(messages[0], dict):
        return messages
    system = messages[0]
    if system.get("role") != "system" or "## Username Personalization" not in str(system.get("content", "")):
        return messages
    if "## Golden Examples" in str(system.get("content", "")):
        return messages
    query = ""
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "user":
            query = str(m.get("content", ""))
            break
    lesson_id = ""
    mo = re.search(r"Lesson ID:\s*([A-Za-z0-9_\-]+)", str(system.get("content", "")))
    if mo:
        lesson_id = mo.group(1)
    block = exemplar_block(db_path, query, lesson_id=lesson_id)
    if not block:
        return messages
    enriched = dict(system)
    enriched["content"] = str(system.get("content", "")) + "\n" + block
    return [enriched] + list(messages[1:])
