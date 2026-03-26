"""
Collects student-Vaathiyaar interactions for future model fine-tuning.
Stores conversations in JSONL format compatible with Ollama/OpenAI fine-tuning.
"""

import json
import uuid
from datetime import datetime

import duckdb

from vaathiyaar.modelfile import build_system_prompt


def record_training_pair(
    db_path: str,
    user_message: str,
    vaathiyaar_response: dict,
    student_profile: dict = None,
    lesson_context: dict = None,
    quality_score: float = None,
) -> str:
    """
    Save a training example to the training_data table.

    Parameters
    ----------
    db_path : str
        Path to the DuckDB database file.
    user_message : str
        The student's input message.
    vaathiyaar_response : dict
        The full JSON response from Vaathiyaar.
    student_profile : dict, optional
        The student's profile at the time of interaction.
    lesson_context : dict, optional
        The lesson context at the time of interaction.
    quality_score : float, optional
        Optional quality rating (0.0 to 1.0) for filtering during export.

    Returns
    -------
    str
        The ID of the saved training pair.
    """
    pair_id = str(uuid.uuid4())
    output_text = json.dumps(vaathiyaar_response, ensure_ascii=False)
    profile_json = json.dumps(student_profile or {}, ensure_ascii=False)
    context_json = json.dumps(lesson_context or {}, ensure_ascii=False)

    conn = duckdb.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO training_data
                (id, input_text, output_text, profile_json, context_json, quality_score)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [pair_id, user_message, output_text, profile_json, context_json, quality_score],
        )
    finally:
        conn.close()

    return pair_id


def export_training_data(
    db_path: str,
    output_path: str,
    min_quality: float = None,
) -> int:
    """
    Export training pairs to a JSONL file for fine-tuning.

    Each line is a JSON object with the chat-completion messages format:
    {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}

    Parameters
    ----------
    db_path : str
        Path to the DuckDB database file.
    output_path : str
        Path to the output JSONL file.
    min_quality : float, optional
        If set, only export rows with quality_score >= this value.

    Returns
    -------
    int
        Number of training examples exported.
    """
    conn = duckdb.connect(db_path)
    try:
        if min_quality is not None:
            rows = conn.execute(
                "SELECT input_text, output_text, profile_json, context_json "
                "FROM training_data WHERE quality_score >= ? ORDER BY created_at",
                [min_quality],
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT input_text, output_text, profile_json, context_json "
                "FROM training_data ORDER BY created_at"
            ).fetchall()
    finally:
        conn.close()

    count = 0
    with open(output_path, "w", encoding="utf-8") as f:
        for input_text, output_text, profile_json, context_json in rows:
            profile = json.loads(profile_json) if profile_json else {}
            context = json.loads(context_json) if context_json else {}
            system_prompt = build_system_prompt(
                student_profile=profile, lesson_context=context
            )

            record = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": input_text},
                    {"role": "assistant", "content": output_text},
                ]
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1

    return count


def get_training_stats(db_path: str) -> dict:
    """
    Return statistics about the collected training data.

    Returns
    -------
    dict
        Keys: total_pairs, avg_quality_score, min_date, max_date.
    """
    conn = duckdb.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT
                count(*) AS total_pairs,
                avg(quality_score) AS avg_quality,
                min(created_at) AS min_date,
                max(created_at) AS max_date
            FROM training_data
            """
        ).fetchone()
    finally:
        conn.close()

    return {
        "total_pairs": row[0],
        "avg_quality_score": round(row[1], 3) if row[1] is not None else None,
        "min_date": str(row[2]) if row[2] else None,
        "max_date": str(row[3]) if row[3] else None,
    }
