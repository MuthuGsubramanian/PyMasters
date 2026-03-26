"""
Vaathiyaar Profiler Service

Handles student profiling: onboarding data persistence, learning signal
recording, mastery tracking, and profile retrieval.
"""

import json
import uuid
import sqlite3


def save_onboarding(db_path: str, user_id: str, data: dict) -> dict:
    """
    Save onboarding questionnaire answers for a user.

    Upserts into user_profiles using INSERT ... ON CONFLICT UPDATE.
    Also updates users.preferred_language and users.onboarding_completed.

    Returns {"onboarding_completed": True, "user_id": user_id}.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        preferred_language = data.get("preferred_language", "en")
        motivation = data.get("motivation")
        prior_experience = data.get("prior_experience")
        known_languages = data.get("known_languages")
        learning_style = data.get("learning_style")
        goal = data.get("goal")
        time_commitment = data.get("time_commitment")
        skill_level = data.get("skill_level") or "beginner"
        diagnostic_score = data.get("diagnostic_score")

        cursor.execute("""
            INSERT INTO user_profiles
                (user_id, motivation, prior_experience, known_languages,
                 learning_style, goal, time_commitment, preferred_language,
                 skill_level, diagnostic_score, onboarding_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                motivation = excluded.motivation,
                prior_experience = excluded.prior_experience,
                known_languages = excluded.known_languages,
                learning_style = excluded.learning_style,
                goal = excluded.goal,
                time_commitment = excluded.time_commitment,
                preferred_language = excluded.preferred_language,
                skill_level = excluded.skill_level,
                diagnostic_score = excluded.diagnostic_score,
                onboarding_completed = 1
        """, [
            user_id, motivation, prior_experience, known_languages,
            learning_style, goal, time_commitment, preferred_language,
            skill_level, diagnostic_score
        ])

        cursor.execute("""
            UPDATE users
            SET preferred_language = ?,
                onboarding_completed = 1
            WHERE id = ?
        """, [preferred_language, user_id])

        # Save email and whatsapp to users table
        email = data.get("email", "")
        whatsapp = data.get("whatsapp", "")
        if email or whatsapp:
            cursor.execute(
                "UPDATE users SET email = ?, whatsapp = ? WHERE id = ?",
                [email, whatsapp, user_id]
            )

        conn.commit()

    finally:
        conn.close()

    return {"onboarding_completed": True, "user_id": user_id}


def record_signal(
    db_path: str,
    user_id: str,
    signal_type: str,
    topic: str,
    value: dict,
    session_id: str = None
):
    """
    Insert a learning signal row into the learning_signals table.

    value is serialised via json.dumps before storage.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        signal_id = str(uuid.uuid4())
        value_json = json.dumps(value)
        cursor.execute("""
            INSERT INTO learning_signals
                (id, user_id, signal_type, topic, value, session_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, [signal_id, user_id, signal_type, topic, value_json, session_id])
        conn.commit()
    finally:
        conn.close()


def update_mastery(
    db_path: str,
    user_id: str,
    topic: str,
    level: float,
    time_seconds: float = None
):
    """
    Upsert mastery data for a (user_id, topic) pair.

    If a row already exists: increments attempts, recalculates avg_time_seconds,
    increments struggle_count when level < 0.4.
    If no row exists: inserts with attempts=1.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT attempts, avg_time_seconds, struggle_count
            FROM user_mastery
            WHERE user_id = ? AND topic = ?
        """, [user_id, topic])
        existing = cursor.fetchone()

        if existing:
            old_attempts, old_avg_time, old_struggle = existing
            new_attempts = old_attempts + 1

            # Recalculate running average for avg_time_seconds
            if time_seconds is not None and old_avg_time is not None:
                new_avg_time = ((old_avg_time * old_attempts) + time_seconds) / new_attempts
            elif time_seconds is not None:
                new_avg_time = time_seconds
            else:
                new_avg_time = old_avg_time

            new_struggle = old_struggle + (1 if level < 0.4 else 0)

            cursor.execute("""
                UPDATE user_mastery
                SET mastery_level = ?,
                    attempts = ?,
                    avg_time_seconds = ?,
                    struggle_count = ?,
                    last_practiced = CURRENT_TIMESTAMP
                WHERE user_id = ? AND topic = ?
            """, [level, new_attempts, new_avg_time, new_struggle, user_id, topic])
        else:
            cursor.execute("""
                INSERT INTO user_mastery
                    (user_id, topic, mastery_level, attempts, avg_time_seconds,
                     last_practiced, struggle_count)
                VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?)
            """, [
                user_id, topic, level, time_seconds,
                1 if level < 0.4 else 0
            ])
        conn.commit()
    finally:
        conn.close()


def get_mastery_map(db_path: str, user_id: str) -> dict:
    """
    Return {topic: mastery_level} dict for the given user from user_mastery.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT topic, mastery_level
            FROM user_mastery
            WHERE user_id = ?
        """, [user_id])
        rows = cursor.fetchall()
        return {row[0]: row[1] for row in rows}
    finally:
        conn.close()


def get_student_profile(db_path: str, user_id: str) -> dict:
    """
    Return the full student profile for a user, including their mastery map.

    Returns None if no profile exists for user_id.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id, motivation, prior_experience, known_languages,
                   learning_style, goal, time_commitment, preferred_language,
                   skill_level, diagnostic_score, onboarding_completed, created_at
            FROM user_profiles
            WHERE user_id = ?
        """, [user_id])
        row = cursor.fetchone()

        if row is None:
            return None

        profile = {
            "user_id": row[0],
            "motivation": row[1],
            "prior_experience": row[2],
            "known_languages": row[3],
            "learning_style": row[4],
            "goal": row[5],
            "time_commitment": row[6],
            "preferred_language": row[7],
            "skill_level": row[8],
            "diagnostic_score": row[9],
            "onboarding_completed": row[10],
            "created_at": row[11],
        }
        profile["skill_level"] = profile.get("skill_level") or "beginner"
    finally:
        conn.close()

    profile["mastery"] = get_mastery_map(db_path, user_id)

    # Add recent learning signals
    conn = sqlite3.connect(db_path)
    try:
        signals = conn.execute(
            "SELECT signal_type, topic, created_at FROM learning_signals WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
            [user_id],
        ).fetchall()
        profile["recent_signals"] = [
            {"signal_type": s[0], "topic": s[1], "created_at": s[2]} for s in signals
        ]
    finally:
        conn.close()

    return profile
