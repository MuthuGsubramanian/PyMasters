"""Trigger engine for AI-inferred module generation.

Analyzes learning signals to detect:
- Struggle patterns (2+ failures on same topic)
- Interest signals (3+ chat questions about a topic)
"""

import sqlite3
import json
import uuid
import os
import threading


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


def _run_pipeline_safe(job_id: str, user_id: int, topic: str):
    """Run pipeline if available, otherwise no-op."""
    try:
        from modules.pipeline import run_pipeline
        run_pipeline(job_id, user_id, topic)
    except ImportError:
        pass  # Pipeline not yet implemented; job remains queued


def check_triggers(user_id: int, signal_type: str, topic: str, value: dict) -> dict:
    """Check if a learning signal should trigger module generation."""
    conn = sqlite3.connect(_get_db_path())

    # Check for existing job
    existing = conn.execute(
        "SELECT id FROM module_generation_jobs WHERE user_id = ? AND topic = ? AND status != 'failed'",
        [user_id, topic],
    ).fetchone()
    if existing:
        conn.close()
        return {"triggered": False, "job_id": None, "reason": None}

    triggered = False
    reason = None

    # Struggle detection: 2+ failures on same topic
    if signal_type == "code_evaluation" and not value.get("success", True):
        failure_count = conn.execute(
            "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND topic = ? AND signal_type = 'code_evaluation' AND value LIKE '%false%'",
            [user_id, topic],
        ).fetchone()[0]
        if failure_count >= 2:
            triggered = True
            reason = f"Struggle detected: {failure_count} failures on {topic}"

    # Interest detection: 3+ chat questions
    if signal_type == "chat_question":
        question_count = conn.execute(
            "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND topic = ? AND signal_type = 'chat_question'",
            [user_id, topic],
        ).fetchone()[0]
        if question_count >= 3:
            triggered = True
            reason = f"Interest detected: {question_count} questions about {topic}"

    if triggered:
        job_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority)
               VALUES (?, ?, ?, 'ai_recommended', ?, 'queued', 2)""",
            [job_id, user_id, topic, reason],
        )
        conn.commit()
        conn.close()

        # Run pipeline in background
        thread = threading.Thread(target=_run_pipeline_safe, args=(job_id, user_id, topic), daemon=True)
        thread.start()

        return {"triggered": True, "job_id": job_id, "reason": reason}

    conn.close()
    return {"triggered": False, "job_id": None, "reason": None}
