"""
Collects student-Vaathiyaar interactions for future model fine-tuning.
Stores conversations in JSONL format compatible with Ollama/OpenAI fine-tuning.
"""

import json
import os
import uuid
from datetime import datetime

import sqlite3

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
        Path to the SQLite database file.
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

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO training_data
                (id, input_text, output_text, profile_json, context_json, quality_score)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [pair_id, user_message, output_text, profile_json, context_json, quality_score],
        )
        conn.commit()
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
        Path to the SQLite database file.
    output_path : str
        Path to the output JSONL file.
    min_quality : float, optional
        If set, only export rows with quality_score >= this value.

    Returns
    -------
    int
        Number of training examples exported.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        if min_quality is not None:
            cursor.execute(
                "SELECT input_text, output_text, profile_json, context_json "
                "FROM training_data WHERE quality_score >= ? ORDER BY created_at",
                [min_quality],
            )
        else:
            cursor.execute(
                "SELECT input_text, output_text, profile_json, context_json "
                "FROM training_data ORDER BY created_at"
            )
        rows = cursor.fetchall()
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
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                count(*) AS total_pairs,
                avg(quality_score) AS avg_quality,
                min(created_at) AS min_date,
                max(created_at) AS max_date
            FROM training_data
            """
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    return {
        "total_pairs": row[0],
        "avg_quality_score": round(row[1], 3) if row[1] is not None else None,
        "min_date": str(row[2]) if row[2] else None,
        "max_date": str(row[3]) if row[3] else None,
    }


def export_training_data(output_path: str = "training_export.jsonl", min_quality: float = 0.5) -> int:
    """Export training data as JSONL for fine-tuning. Returns count."""
    db_path = os.environ.get("DB_PATH", "pymasters.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT * FROM training_data WHERE quality_score >= ? ORDER BY created_at ASC",
        [min_quality],
    ).fetchall()

    count = 0
    with open(output_path, "w", encoding="utf-8") as f:
        for row in rows:
            profile = json.loads(row["profile_json"]) if row["profile_json"] else {}
            context = json.loads(row["context_json"]) if row["context_json"] else {}

            from backend.vaathiyaar.modelfile import build_system_prompt
            system_prompt = build_system_prompt(profile, context)

            output = row["output_text"]
            try:
                json.loads(output)
            except (json.JSONDecodeError, TypeError):
                output = json.dumps({"message": output})

            entry = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": row["input_text"]},
                    {"role": "assistant", "content": output},
                ]
            }
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            count += 1

    conn.close()
    return count


def export_curriculum_as_training(lessons_dir: str, output_path: str = "curriculum_training.jsonl") -> int:
    """Convert pre-built lessons into training data format for fine-tuning."""
    from pathlib import Path
    from backend.vaathiyaar.modelfile import build_system_prompt

    base = Path(lessons_dir)
    count = 0

    with open(output_path, "w", encoding="utf-8") as f:
        for track_dir in sorted(base.iterdir()):
            if not track_dir.is_dir() or track_dir.name == "__pycache__":
                continue
            for lesson_file in sorted(track_dir.glob("*.json")):
                if lesson_file.name == "schema.json":
                    continue
                with open(lesson_file, "r", encoding="utf-8") as lf:
                    lesson = json.load(lf)

                system = build_system_prompt({}, {"topic": lesson.get("topic", "")})

                story_en = lesson.get("story_variants", {}).get("en", "")
                if story_en:
                    entry = {
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": f"Teach me about {lesson.get('topic', '')}. Start with a story."},
                            {"role": "assistant", "content": json.dumps({
                                "message": story_en,
                                "phase": "story",
                                "animation": {"sequence": lesson.get("animation_sequence", [])},
                            }, ensure_ascii=False)},
                        ]
                    }
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                    count += 1

    return count
