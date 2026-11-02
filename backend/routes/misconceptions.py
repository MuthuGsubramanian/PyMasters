"""Misconception radar (2026-11-02): which Python errors a learner keeps hitting, with a tip and a lesson.

Failed runs from the Playground and lesson code blocks are recorded server-side as `run_error`
learning signals (the error type is parsed from the sandbox's own stderr, so the client cannot
fake it). GET /api/misconceptions aggregates the caller's last 60 days into a short
"watch out for" list. Free: no LLM, one small SQLite query.
"""
import json
import os
import re
import sqlite3

from fastapi import APIRouter, Depends

from auth import get_current_user_id
from vaathiyaar.profiler import record_signal

router = APIRouter(prefix="/api/misconceptions", tags=["misconceptions"])

WINDOW_DAYS = 60
_ERR_RE = re.compile(r"^(\w+(?:Error|Exception))\b")
_LESSON_RE = re.compile(r"[A-Za-z0-9_\-]{1,120}")

# error type -> (plain-English pattern, tip, lesson id to practise)
ADVICE = {
    "SyntaxError": ("Code Python can't read", "Check colons after if/for/def and that every bracket and quote is closed.", "conditionals"),
    "IndentationError": ("Indentation", "Indent every line of a block by the same 4 spaces; the line after ':' must be indented.", "conditionals"),
    "TabError": ("Mixed tabs and spaces", "Use spaces only, 4 per level.", "conditionals"),
    "NameError": ("Names used before they exist", "Assign the variable (or import the module) before the line that uses it; watch spelling and capitals.", "variables_intro"),
    "TypeError": ("Mixing incompatible types", "Convert first: str(n) for text, int(s)/float(s) for numbers; check what a function returns.", "variables_conversion"),
    "ValueError": ("Values a function can't accept", "Check input before converting it, or wrap int()/float() in try/except ValueError.", "variables_conversion"),
    "IndexError": ("Off-by-one with list positions", "Indexes run 0..len-1; prefer 'for item in items' over counting positions.", "lists"),
    "KeyError": ("Missing dictionary keys", "Test with 'if key in d' or use d.get(key, default).", "ds_dicts"),
    "AttributeError": ("Methods on the wrong kind of value", "print(type(x)) to see what you really have; a function without return gives None.", "functions_basics"),
    "ZeroDivisionError": ("Dividing by zero", "Guard the divisor: if count: avg = total / count.", "errors_handling"),
    "RecursionError": ("Recursion without a stopping case", "Every recursive function needs a base case that returns without calling itself.", "recursion_fundamentals"),
    "FileNotFoundError": ("Opening files that aren't there", "Check the file name and path; open with 'w' to create a file.", "fileio_reading"),
    "UnboundLocalError": ("Local vs global variables", "Assigning inside a function makes the name local; pass values in as parameters.", "functions_scope"),
    "ModuleNotFoundError": ("Imports", "Check the module name; only installed packages can be imported.", "pkg_imports"),
    "Timeout": ("Loops that never end", "Make sure the loop variable changes each time round, or add a break.", "while_loops"),
}


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def error_type(error_text: str) -> str | None:
    """Exception name from the last error line of a traceback, 'Timeout' for a timeout, else None."""
    text = (error_text or "").strip()
    if not text:
        return None
    if text.startswith("Execution timed out"):
        return "Timeout"
    for line in reversed(text.splitlines()):
        m = _ERR_RE.match(line.strip())
        if m:
            return m.group(1)
    return None


def record_run_error(user_id: str, error_text: str, lesson_id=None) -> None:
    """Best effort: never let bookkeeping break a code run."""
    etype = error_type(error_text)
    if not etype:
        return
    topic = lesson_id if isinstance(lesson_id, str) and _LESSON_RE.fullmatch(lesson_id) else "playground"
    try:
        record_signal(_db_path(), user_id=user_id, signal_type="run_error", topic=topic, value={"type": etype})
    except sqlite3.Error:
        pass


@router.get("")
def my_misconceptions(caller: str = Depends(get_current_user_id)):
    conn = sqlite3.connect(_db_path())
    try:
        rows = conn.execute(
            """SELECT value, created_at FROM learning_signals
               WHERE user_id = ? AND signal_type = 'run_error'
                 AND created_at >= datetime('now', ?)""",
            [caller, f"-{WINDOW_DAYS} days"],
        ).fetchall()
    except sqlite3.Error:
        rows = []
    finally:
        conn.close()
    counts, last = {}, {}
    for value, created in rows:
        try:
            etype = json.loads(value).get("type")
        except (ValueError, AttributeError):
            continue
        if etype:
            counts[etype] = counts.get(etype, 0) + 1
            last[etype] = max(last.get(etype, ""), created or "")
    items = []
    for etype, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        label, tip, lesson = ADVICE.get(etype, (etype, "Read the last line of the error and check the line it points to.", None))
        items.append({"type": etype, "label": label, "count": n, "last_seen": last[etype], "tip": tip, "lesson": lesson})
    return {"window_days": WINDOW_DAYS, "total": sum(counts.values()), "items": items[:5]}
