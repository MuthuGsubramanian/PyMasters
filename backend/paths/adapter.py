"""
Path adaptation engine — runs after lesson completion.
Decisions: SKIP, INSERT, REORDER, BRANCH, GENERATE
"""
import os
import sqlite3
import json

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def adapt_path(user_id: str, completed_lesson_id: str):
    """
    Run after a user completes a lesson. Checks if their active path
    needs adjustment based on mastery signals.

    Returns dict with any changes made.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Get active path
    path_row = conn.execute(
        "SELECT * FROM user_learning_paths WHERE user_id = ? AND status = 'active' ORDER BY last_activity DESC LIMIT 1",
        [user_id],
    ).fetchone()

    if not path_row:
        conn.close()
        return {"changes": []}

    path_id = path_row["path_id"]
    current_pos = path_row["current_position"]
    adapted = json.loads(path_row["adapted_sequence"]) if path_row["adapted_sequence"] else None

    # Get original sequence
    orig_path = conn.execute(
        "SELECT lesson_sequence FROM learning_paths WHERE id = ?", [path_id]
    ).fetchone()
    sequence = adapted or (json.loads(orig_path["lesson_sequence"]) if orig_path else [])

    changes = []

    # Advance position
    if completed_lesson_id in sequence:
        idx = sequence.index(completed_lesson_id)
        new_pos = idx + 1
        conn.execute(
            "UPDATE user_learning_paths SET current_position = ?, last_activity = CURRENT_TIMESTAMP WHERE user_id = ? AND path_id = ?",
            [new_pos, user_id, path_id],
        )
        changes.append({"action": "advance", "position": new_pos})

    # Check SKIP — if next lesson's concepts are already mastered (>0.8)
    if current_pos + 1 < len(sequence):
        next_lesson = sequence[current_pos + 1] if current_pos + 1 < len(sequence) else None
        if next_lesson:
            # Check concepts required by next lesson
            concepts_rows = conn.execute(
                "SELECT concept_id FROM lesson_concepts WHERE lesson_id = ? AND role = 'teaches'",
                [next_lesson],
            ).fetchall()
            if concepts_rows:
                all_mastered = True
                for cr in concepts_rows:
                    mastery = conn.execute(
                        "SELECT mastery_level FROM user_mastery WHERE user_id = ? AND topic = ?",
                        [user_id, cr["concept_id"]],
                    ).fetchone()
                    if not mastery or mastery["mastery_level"] < 0.8:
                        all_mastered = False
                        break
                if all_mastered:
                    changes.append(
                        {"action": "skip_available", "lesson": next_lesson, "reason": "already mastered"}
                    )

    # Check INSERT — if user struggled (2+ failures on a concept), insert remedial
    recent_struggles = conn.execute(
        """SELECT topic, COUNT(*) as cnt FROM learning_signals
        WHERE user_id = ? AND signal_type = 'code_evaluation'
        AND json_extract(value, '$.success') = 0
        AND created_at > datetime('now', '-1 hour')
        GROUP BY topic HAVING cnt >= 2""",
        [user_id],
    ).fetchall()

    for struggle in recent_struggles:
        topic = struggle["topic"]
        # Check if a remedial lesson exists for this topic
        remedial = conn.execute(
            "SELECT lesson_id FROM lesson_concepts WHERE concept_id = ? AND role = 'teaches' AND lesson_id NOT IN (SELECT lesson_id FROM lesson_completions WHERE user_id = ?)",
            [topic, user_id],
        ).fetchone()
        if remedial and remedial["lesson_id"] not in sequence:
            # Insert remedial before current position
            insert_pos = max(0, current_pos)
            sequence.insert(insert_pos, remedial["lesson_id"])
            conn.execute(
                "UPDATE user_learning_paths SET adapted_sequence = ? WHERE user_id = ? AND path_id = ?",
                [json.dumps(sequence), user_id, path_id],
            )
            # Log
            conn.execute(
                "INSERT INTO path_adaptation_log (user_id, path_id, action, details, lesson_affected, concept_trigger) VALUES (?, ?, 'insert', ?, ?, ?)",
                [
                    user_id,
                    path_id,
                    json.dumps({"reason": "struggle", "topic": topic}),
                    remedial["lesson_id"],
                    topic,
                ],
            )
            # Create Vaathiyaar message
            conn.execute(
                """INSERT INTO pending_vaathiyaar_messages (user_id, message, message_type, action_data)
                VALUES (?, ?, 'custom_lesson_struggle', ?)""",
                [
                    user_id,
                    f"I noticed you had a tough time with {topic}. I've added a review lesson to help strengthen this concept. Want to try it?",
                    json.dumps({"lesson_id": remedial["lesson_id"], "path_id": path_id}),
                ],
            )
            changes.append(
                {"action": "insert", "lesson": remedial["lesson_id"], "reason": "struggle", "concept": topic}
            )

    # Check completion
    completed_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM lesson_completions WHERE user_id = ? AND lesson_id IN ({})".format(
            ",".join("?" * len(sequence))
        ),
        [user_id] + sequence,
    ).fetchone()["cnt"]

    if completed_count >= len(sequence):
        conn.execute(
            "UPDATE user_learning_paths SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND path_id = ?",
            [user_id, path_id],
        )
        changes.append({"action": "path_completed"})

    conn.commit()
    conn.close()
    return {"changes": changes, "path_id": path_id}
