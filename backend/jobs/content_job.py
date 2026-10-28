"""Nightly content job (founder directive 2026-10-28, 05:45 IST): "the content
generation should run as a job in the backend and generate contents
automatically."

Pulls the next topic from ``content_queue`` (seeded here with ~40 gap topics
from the content playbook), runs the lesson through the existing five-stage
pipeline (``modules.pipeline.run_pipeline``) as a dedicated system author, and
only publishes to the platform-wide "Fresh lessons" track
(``generated_lessons.published_to = 'platform'``) if it passes the QA gate
below. A failing topic is re-queued with backoff, never silently dropped.

Ruling (ops spec deviation, 2026-10-28): the ops design doc modelled the QA
gate on the content playbook's hand-authored "Procedure C" — execute a
reference solution, diff its stdout against ``expected_output``. The pipeline
(``modules.pipeline.stage_4_challenges``) does not produce a reference
solution: its own prompt asks for ``test_code`` as "starter code or None", a
stub for the learner, not a working solution. There is nothing to diff
against ``expected_output``. The gate below instead requires every structural
field used by graders/i18n, rejects mojibake, and — where ``test_code`` is
actually present — executes it in the real sandbox and requires it not to
raise, which still catches hallucinated/broken code. This is a deliberate
narrowing of the original spec line to what the pipeline's real fields make
checkable; a true solution-vs-output diff would need a new "solution" field
added to stage_4 (left as a deferred enhancement).
"""
import json
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from modules.pipeline import run_pipeline
from vaathiyaar.execution import run_code_subprocess

SYSTEM_AUTHOR_USERNAME = "pymasters_content"
SYSTEM_AUTHOR_EMAIL = "content@pymasters.net"
MIN_NARRATIVE_CHARS = 600
MAX_ATTEMPTS = 5
BACKOFF_HOURS = (1, 4, 12, 24, 72)  # indexed by attempt number (1-based), clamped to the last

# ~40 gap topics the content playbook (2026-08-13) flagged as missing or thin
# coverage, spanning the tracks already live. The queue table is the source of
# truth once seeded; re-seeding never duplicates (UNIQUE topic) and this list
# can be edited/extended freely without touching any other code.
GAP_TOPICS = [
    ("Context managers and the with statement", "python_fundamentals"),
    ("itertools for memory-efficient loops", "python_intermediate"),
    ("Dataclasses vs NamedTuple vs TypedDict", "python_intermediate"),
    ("Python's garbage collector and reference counting", "python_internals"),
    ("Structural pattern matching with match/case", "python_modern"),
    ("Async generators and async comprehensions", "async_concurrency"),
    ("Protocols and structural typing with typing.Protocol", "python_modern"),
    ("Property-based testing with Hypothesis", "testing_devops"),
    ("Memoization with functools.lru_cache and cache", "performance_optimization"),
    ("Profiling Python with cProfile and line_profiler", "performance_optimization"),
    ("Custom context managers with contextlib", "python_intermediate"),
    ("Descriptors and how properties really work", "python_internals"),
    ("Metaclasses: when and why", "python_internals"),
    ("Regex lookahead and lookbehind", "regex_mastery"),
    ("Named capture groups and re.VERBOSE", "regex_mastery"),
    ("Binary search variants with the bisect module", "dsa"),
    ("Union-Find (disjoint set) for connectivity problems", "dsa"),
    ("Topological sort for dependency graphs", "dsa"),
    ("Dynamic programming: from recursion to tabulation", "dsa"),
    ("Trie data structure for prefix search", "dsa"),
    ("Sliding window technique for subarray problems", "dsa"),
    ("Heaps and priority queues with heapq", "dsa"),
    ("Graph traversal: BFS vs DFS trade-offs", "dsa"),
    ("Gradient descent intuition from first principles", "machine_learning"),
    ("Train/validation/test splits and data leakage", "machine_learning"),
    ("Regularization: L1 vs L2 vs dropout", "machine_learning"),
    ("Confusion matrix, precision, recall, and F1", "machine_learning"),
    ("Cross-validation strategies for small datasets", "machine_learning"),
    ("Feature scaling: standardization vs normalization", "machine_learning"),
    ("Attention mechanism intuition before transformers", "deep_learning"),
    ("Batch normalization and why it helps training", "deep_learning"),
    ("Tokenization: BPE vs WordPiece vs SentencePiece", "ai_fundamentals"),
    ("Prompt engineering: few-shot vs chain-of-thought", "ai_fundamentals"),
    ("Retrieval-augmented generation (RAG) basics", "ai_ml_foundations"),
    ("Vector embeddings and cosine similarity", "ai_ml_foundations"),
    ("Fine-tuning vs prompting: when to use each", "ai_ml_foundations"),
    ("Evaluating LLM outputs: automatic vs human eval", "ai_ml_foundations"),
    ("Building a CLI tool with argparse and click", "fun_automation"),
    ("Web scraping etiquette: robots.txt and rate limits", "fun_automation"),
    ("Scheduling tasks with cron and Python schedulers", "fun_automation"),
    ("Logging best practices: levels, handlers, structured logs", "testing_devops"),
]

_MOJIBAKE_RE = re.compile("â€")


def _conn(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS content_queue ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL UNIQUE, track TEXT,"
        " status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,"
        " lesson_id TEXT, last_error TEXT, next_attempt_at TEXT,"
        " created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT)"
    )
    conn.commit()


def seed_queue(conn: sqlite3.Connection) -> int:
    """Insert every gap topic not already present. Idempotent: a second call
    (or a second boot) inserts zero new rows, because topic is UNIQUE."""
    ensure_tables(conn)
    added = 0
    for topic, track in GAP_TOPICS:
        cur = conn.execute(
            "INSERT OR IGNORE INTO content_queue (topic, track, status) VALUES (?, ?, 'queued')",
            [topic, track],
        )
        added += cur.rowcount
    conn.commit()
    return added


def get_system_author(conn: sqlite3.Connection) -> str:
    """Get-or-create the dedicated account every auto-generated lesson is
    owned by. It is never a super admin and never logs in (its password hash
    is an intentionally-unusable marker) — the platform-wide listing in
    routes/classroom.py keys off ``published_to``, not this user_id, so this
    account never shows up as "a learner" anywhere in the product."""
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", [SYSTEM_AUTHOR_USERNAME]
    ).fetchone()
    if row:
        return row["id"]
    user_id = f"system_{uuid.uuid4().hex[:12]}"
    unusable_hash = f"!unusable:{uuid.uuid4().hex}"
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) "
        "VALUES (?, ?, ?, 'PyMasters Content', ?, ?, 0)",
        [user_id, SYSTEM_AUTHOR_USERNAME, unusable_hash, SYSTEM_AUTHOR_EMAIL,
         datetime.now(timezone.utc).isoformat()],
    )
    conn.commit()
    return user_id


def qa_check(lesson_data: dict) -> tuple[bool, str | None]:
    """Return (passed, reason). See the module docstring for why this isn't a
    solution-vs-expected_output diff."""
    title_en = ((lesson_data.get("title") or {}).get("en", "") or "").strip()
    if not title_en:
        return False, "missing title"
    narrative = lesson_data.get("story_variants") or {}
    narrative_en = narrative.get("en", "") if isinstance(narrative, dict) else str(narrative)
    if len(narrative_en) < MIN_NARRATIVE_CHARS:
        return False, f"narrative too short ({len(narrative_en)} < {MIN_NARRATIVE_CHARS} chars)"
    challenges = lesson_data.get("practice_challenges") or []
    if not challenges:
        return False, "no practice challenges"
    blob = json.dumps(lesson_data, ensure_ascii=False)
    if _MOJIBAKE_RE.search(blob):
        return False, "mojibake detected (â€ sequence)"
    for i, c in enumerate(challenges):
        instr_field = c.get("instruction")
        instr = (instr_field.get("en", "") if isinstance(instr_field, dict) else str(instr_field or "")).strip()
        if not instr:
            return False, f"challenge {i}: missing instruction"
        if not str(c.get("expected_output") or "").strip():
            return False, f"challenge {i}: missing expected_output"
        if not c.get("hints"):
            return False, f"challenge {i}: missing hints"
        test_code = c.get("test_code")
        if isinstance(test_code, str) and test_code.strip() and test_code.strip().lower() != "none":
            result = run_code_subprocess(test_code, timeout=10)
            if result.get("exit_code") != 0:
                return False, f"challenge {i}: test_code failed in sandbox: {str(result.get('error', ''))[:200]}"
    return True, None


def _next_topic(conn: sqlite3.Connection):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return conn.execute(
        "SELECT * FROM content_queue WHERE status = 'queued' "
        "AND (next_attempt_at IS NULL OR next_attempt_at <= ?) "
        "ORDER BY attempts ASC, id ASC LIMIT 1",
        [now],
    ).fetchone()


def _requeue(conn: sqlite3.Connection, row: sqlite3.Row, reason: str, lesson_id: str | None = None) -> dict:
    attempts = row["attempts"] + 1
    hours = BACKOFF_HOURS[min(attempts, len(BACKOFF_HOURS)) - 1]
    next_attempt = (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    status = "failed" if attempts >= MAX_ATTEMPTS else "queued"
    conn.execute(
        "UPDATE content_queue SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ? "
        "WHERE id = ?",
        [status, attempts, str(reason)[:500], next_attempt, datetime.now(timezone.utc).isoformat(), row["id"]],
    )
    conn.commit()
    return {"ran": True, "topic": row["topic"], "published": False, "reason": reason,
            "lesson_id": lesson_id, "attempts": attempts, "requeue_status": status}


def run(db_path: str) -> dict:
    """Called once per window by jobs.scheduler. Generates at most one lesson."""
    conn = _conn(db_path)
    try:
        seeded = seed_queue(conn)
        row = _next_topic(conn)
        if not row:
            return {"seeded": seeded, "ran": False, "reason": "queue empty or every topic backed off"}

        author_id = get_system_author(conn)
        job_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority) "
            "VALUES (?, ?, ?, 'content_job', ?, 'queued', 3)",
            [job_id, author_id, row["topic"], f"Nightly content job: {row['topic']}"],
        )
        conn.commit()

        try:
            lesson_id = run_pipeline(job_id, author_id, row["topic"])
        except Exception as exc:  # noqa: BLE001 — a bad night must never crash the scheduler
            return {"seeded": seeded, **_requeue(conn, row, f"pipeline error: {str(exc)[:300]}")}

        lesson_row = conn.execute(
            "SELECT lesson_data FROM generated_lessons WHERE id = ?", [lesson_id]
        ).fetchone()
        lesson_data = json.loads(lesson_row["lesson_data"]) if lesson_row else {}
        ok, reason = qa_check(lesson_data)
        if not ok:
            return {"seeded": seeded, **_requeue(conn, row, reason, lesson_id=lesson_id)}

        conn.execute("UPDATE generated_lessons SET published_to = 'platform' WHERE id = ?", [lesson_id])
        conn.execute(
            "UPDATE content_queue SET status = 'done', lesson_id = ?, updated_at = ? WHERE id = ?",
            [lesson_id, datetime.now(timezone.utc).isoformat(), row["id"]],
        )
        conn.commit()
        return {"seeded": seeded, "ran": True, "topic": row["topic"], "lesson_id": lesson_id, "published": True}
    finally:
        conn.close()
