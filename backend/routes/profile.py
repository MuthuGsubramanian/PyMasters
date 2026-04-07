"""
profile.py — FastAPI APIRouter for student profile management.

Prefix: /api/profile
"""

import os
import sqlite3
import random
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from vaathiyaar.profiler import save_onboarding, get_student_profile, record_signal

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/profile", tags=["profile"])

BLOCKED_LANGUAGES = {"hi"}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class OnboardingData(BaseModel):
    user_id: str
    motivation: str
    prior_experience: str
    known_languages: List[str]
    learning_style: str
    goal: str
    time_commitment: str
    preferred_language: str
    user_type: Optional[str] = ""
    email: Optional[str] = ""
    whatsapp: Optional[str] = ""


class OrgOnboardingData(BaseModel):
    user_id: str
    preferred_language: str
    org_size: str
    learner_profile: str
    skill_level: str
    learning_focus: str
    structure_preference: str


class SignalData(BaseModel):
    user_id: str
    signal_type: str
    topic: str
    value: dict
    session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/onboarding")
def onboarding(data: OnboardingData):
    """
    Save onboarding questionnaire for a user.
    Blocks 'hi' as preferred_language.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    payload = {
        "motivation": data.motivation,
        "prior_experience": data.prior_experience,
        "known_languages": ", ".join(data.known_languages),
        "learning_style": data.learning_style,
        "goal": data.goal,
        "time_commitment": data.time_commitment,
        "preferred_language": data.preferred_language,
        "user_type": data.user_type or "",
        "email": data.email or "",
        "whatsapp": data.whatsapp or "",
    }

    result = save_onboarding(db_path, data.user_id, payload)
    return result


@router.post("/onboarding/org")
def org_onboarding(data: OrgOnboardingData):
    """
    Save org-focused onboarding for an organization admin.
    Stores org profile data and marks the admin's onboarding as complete.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Find the user's org
        cursor.execute(
            "SELECT org_id FROM org_members WHERE user_id = ? AND role IN ('super_admin', 'admin') LIMIT 1",
            [data.user_id]
        )
        org_row = cursor.fetchone()
        if not org_row:
            raise HTTPException(status_code=400, detail="User is not an org admin")

        org_id = org_row["org_id"]

        # Upsert org_profiles
        cursor.execute("""
            INSERT INTO org_profiles (org_id, org_size, learner_profile, skill_level, learning_focus, structure_preference)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (org_id) DO UPDATE SET
                org_size = excluded.org_size,
                learner_profile = excluded.learner_profile,
                skill_level = excluded.skill_level,
                learning_focus = excluded.learning_focus,
                structure_preference = excluded.structure_preference
        """, [org_id, data.org_size, data.learner_profile, data.skill_level, data.learning_focus, data.structure_preference])

        # Update user's preferred_language and mark onboarding complete
        cursor.execute(
            "UPDATE users SET preferred_language = ?, onboarding_completed = 1 WHERE id = ?",
            [data.preferred_language, data.user_id]
        )

        # Also create/update user_profiles entry to mark onboarding_completed
        cursor.execute("""
            INSERT INTO user_profiles (user_id, preferred_language, onboarding_completed)
            VALUES (?, ?, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                preferred_language = excluded.preferred_language,
                onboarding_completed = 1
        """, [data.user_id, data.preferred_language])

        conn.commit()
        return {"onboarding_completed": True, "user_id": data.user_id}
    finally:
        conn.close()


@router.get("/{user_id}")
def get_profile(user_id: str):
    """
    Retrieve the student profile for a given user_id.
    Returns {profile, onboarding_completed}.
    """
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))
    profile = get_student_profile(db_path, user_id)

    if profile is None:
        return {"profile": None, "onboarding_completed": False}

    return {
        "profile": profile,
        "onboarding_completed": profile.get("onboarding_completed", False),
    }


@router.get("/{user_id}/export")
def export_user_data(user_id: str):
    """
    Export all user data as JSON (GDPR-style data export).
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        export = {"user": dict(user_row)}

        # Remove sensitive fields
        export["user"].pop("password_hash", None)

        tables_to_export = [
            ("profile", "SELECT * FROM user_profiles WHERE user_id = ?"),
            ("settings", "SELECT * FROM user_settings WHERE user_id = ?"),
            ("mastery", "SELECT * FROM user_mastery WHERE user_id = ?"),
            ("lesson_completions", "SELECT * FROM lesson_completions WHERE user_id = ?"),
            ("learning_signals", "SELECT * FROM learning_signals WHERE user_id = ?"),
            ("streaks", "SELECT * FROM user_streaks WHERE user_id = ?"),
            ("notifications", "SELECT * FROM notifications WHERE user_id = ?"),
            ("org_memberships", "SELECT * FROM org_members WHERE user_id = ?"),
            ("learning_paths", "SELECT * FROM user_learning_paths WHERE user_id = ?"),
            ("challenge_submissions", "SELECT * FROM challenge_submissions WHERE user_id = ?"),
        ]

        for key, query in tables_to_export:
            try:
                cursor.execute(query, [user_id])
                rows = cursor.fetchall()
                export[key] = [dict(r) for r in rows]
            except Exception:
                export[key] = []

        return export
    finally:
        conn.close()


@router.post("/{user_id}/reset")
def reset_progress(user_id: str):
    """
    Reset all learning progress for a user while keeping the account.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Reset XP
        cursor.execute("UPDATE users SET points = 0 WHERE id = ?", [user_id])

        # Clear progress tables
        progress_tables = [
            ("user_mastery", "user_id"),
            ("lesson_completions", "user_id"),
            ("learning_signals", "user_id"),
            ("user_streaks", "user_id"),
            ("challenge_submissions", "user_id"),
            ("path_adaptation_log", "user_id"),
        ]
        for table, column in progress_tables:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", [user_id])
            except Exception:
                pass

        # Reset learning path progress
        try:
            cursor.execute(
                "UPDATE user_learning_paths SET status = 'not_started', current_step = 0, progress_pct = 0 WHERE user_id = ?",
                [user_id]
            )
        except Exception:
            pass

        conn.commit()
        return {"reset": True, "user_id": user_id}
    finally:
        conn.close()


@router.delete("/{user_id}")
def delete_account(user_id: str):
    """
    Permanently delete a user account and all associated data.
    This action is irreversible.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Guard: don't allow deletion if user is sole super_admin of any org
        cursor.execute("""
            SELECT om.org_id, o.name
            FROM org_members om
            JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = ? AND om.role = 'super_admin'
        """, [user_id])
        admin_orgs = cursor.fetchall()

        for org in admin_orgs:
            cursor.execute(
                "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND role = 'super_admin' AND user_id != ?",
                [org["org_id"], user_id]
            )
            other_admins = cursor.fetchone()[0]
            if other_admins == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"You are the only super admin of '{org['name']}'. Transfer ownership or delete the organization first."
                )

        # Delete from all related tables (order doesn't matter with no FK constraints)
        related_tables = [
            ("user_profiles", "user_id"),
            ("user_settings", "user_id"),
            ("user_streaks", "user_id"),
            ("user_mastery", "user_id"),
            ("learning_signals", "user_id"),
            ("lesson_completions", "user_id"),
            ("notifications", "user_id"),
            ("notification_deliveries", "user_id"),
            ("notification_preferences", "user_id"),
            ("module_generation_jobs", "user_id"),
            ("generated_lessons", "user_id"),
            ("playground_conversations", "user_id"),
            ("user_learning_paths", "user_id"),
            ("pending_vaathiyaar_messages", "user_id"),
            ("challenge_submissions", "user_id"),
            ("path_adaptation_log", "user_id"),
            ("org_members", "user_id"),
            ("org_invites", "invited_by"),
            ("training_data", "user_id"),
        ]

        for table, column in related_tables:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", [user_id])
            except Exception:
                pass  # Table may not exist in all environments

        # Delete playground messages (linked via conversation)
        try:
            cursor.execute(
                "DELETE FROM playground_messages WHERE conversation_id IN "
                "(SELECT id FROM playground_conversations WHERE user_id = ?)",
                [user_id]
            )
        except Exception:
            pass

        # Finally delete the user record
        cursor.execute("DELETE FROM users WHERE id = ?", [user_id])
        conn.commit()

        return {"deleted": True, "user_id": user_id}
    finally:
        conn.close()


@router.post("/signal")
def post_signal(data: SignalData):
    """
    Record a learning signal for a user.
    """
    db_path = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

    record_signal(
        db_path,
        user_id=data.user_id,
        signal_type=data.signal_type,
        topic=data.topic,
        value=data.value,
        session_id=data.session_id,
    )

    return {"recorded": True}


# ---------------------------------------------------------------------------
# New Pydantic models for profile management
# ---------------------------------------------------------------------------

class UserSettingsUpdate(BaseModel):
    name: str = ""
    email: str = ""
    whatsapp: str = ""
    bio: str = ""
    preferred_language: str = "en"
    learning_style: str = ""
    daily_goal: str = "30min"
    difficulty_preference: str = "intermediate"
    voice_enabled: bool = False
    voice_speed: float = 1.0
    voice_name: str = ""
    auto_play_animations: bool = True
    hint_level: int = 2
    linkedin_url: Optional[str] = ""
    github_url: Optional[str] = ""
    twitter_url: Optional[str] = ""
    website_url: Optional[str] = ""


# ---------------------------------------------------------------------------
# Helper: get a sqlite3 connection with row_factory
# ---------------------------------------------------------------------------

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# PUT /api/profile/{user_id}/settings
# ---------------------------------------------------------------------------

@router.put("/{user_id}/settings")
def update_user_settings(user_id: str, data: UserSettingsUpdate):
    """
    Update user settings across users, user_profiles, and user_settings tables.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", [user_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # 1. Update users table (name, email, whatsapp, social links)
        cursor.execute(
            """UPDATE users SET name = ?, email = ?, whatsapp = ?,
               linkedin_url = ?, github_url = ?, twitter_url = ?, website_url = ?
               WHERE id = ?""",
            [data.name, data.email, data.whatsapp,
             data.linkedin_url or "", data.github_url or "",
             data.twitter_url or "", data.website_url or "", user_id],
        )

        # 2. Update user_profiles table (learning preferences)
        cursor.execute("SELECT user_id FROM user_profiles WHERE user_id = ?", [user_id])
        if cursor.fetchone():
            cursor.execute(
                """UPDATE user_profiles
                   SET preferred_language = ?, learning_style = ?
                   WHERE user_id = ?""",
                [data.preferred_language, data.learning_style, user_id],
            )
        else:
            cursor.execute(
                """INSERT INTO user_profiles (user_id, preferred_language, learning_style, onboarding_completed)
                   VALUES (?, ?, ?, 1)""",
                [user_id, data.preferred_language, data.learning_style],
            )

        # 3. Upsert user_settings table (voice/animation/misc preferences)
        cursor.execute("SELECT user_id FROM user_settings WHERE user_id = ?", [user_id])
        if cursor.fetchone():
            cursor.execute(
                """UPDATE user_settings
                   SET bio = ?, voice_enabled = ?, voice_speed = ?, voice_name = ?,
                       auto_play_animations = ?, hint_level = ?, daily_goal = ?,
                       difficulty_preference = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE user_id = ?""",
                [
                    data.bio, int(data.voice_enabled), data.voice_speed, data.voice_name,
                    int(data.auto_play_animations), data.hint_level, data.daily_goal,
                    data.difficulty_preference, user_id,
                ],
            )
        else:
            cursor.execute(
                """INSERT INTO user_settings
                   (user_id, bio, voice_enabled, voice_speed, voice_name,
                    auto_play_animations, hint_level, daily_goal, difficulty_preference, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                [
                    user_id, data.bio, int(data.voice_enabled), data.voice_speed,
                    data.voice_name, int(data.auto_play_animations), data.hint_level,
                    data.daily_goal, data.difficulty_preference,
                ],
            )

        conn.commit()
        return {"updated": True}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/stats
# ---------------------------------------------------------------------------

@router.get("/{user_id}/stats")
def get_user_stats(user_id: str):
    """
    Return aggregated statistics for a user.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists and get XP
        cursor.execute("SELECT id, points FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        total_xp = user_row["points"] or 0

        # Modules completed (distinct topics with mastery_level >= 0.5)
        cursor.execute(
            "SELECT COUNT(DISTINCT topic) FROM user_mastery WHERE user_id = ? AND mastery_level >= 0.5",
            [user_id],
        )
        modules_completed = cursor.fetchone()[0] or 0

        # Lessons completed
        cursor.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        lessons_completed = cursor.fetchone()[0] or 0

        # Current streak from user_streaks table
        current_streak = 0
        cursor.execute(
            "SELECT current_streak FROM user_streaks WHERE user_id = ?",
            [user_id],
        )
        streak_row = cursor.fetchone()
        if streak_row:
            current_streak = streak_row["current_streak"] or 0

        # Total time from learning_signals (sum of time_spent signals)
        total_time_minutes = 0
        cursor.execute(
            "SELECT value FROM learning_signals WHERE user_id = ? AND signal_type = 'time_spent'",
            [user_id],
        )
        for row in cursor.fetchall():
            try:
                import json
                val = json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
                if isinstance(val, dict):
                    total_time_minutes += val.get("seconds", 0) / 60
                elif isinstance(val, (int, float)):
                    total_time_minutes += val / 60
            except Exception:
                pass

        total_time_minutes = round(total_time_minutes)

        # Rank based on XP
        if total_xp >= 1000:
            rank = "Code Architect"
        elif total_xp >= 500:
            rank = "Python Warrior"
        elif total_xp >= 100:
            rank = "Rising Star"
        elif total_xp >= 50:
            rank = "Apprentice"
        else:
            rank = "Beginner"

        return {
            "total_xp": total_xp,
            "modules_completed": modules_completed,
            "current_streak": current_streak,
            "total_time_minutes": total_time_minutes,
            "lessons_completed": lessons_completed,
            "rank": rank,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/achievements
# ---------------------------------------------------------------------------

ACHIEVEMENT_DEFINITIONS = [
    {
        "id": "first_login",
        "name": "First Steps",
        "description": "Welcome to PyMasters! You took the first step.",
        "icon": "footprints",
    },
    {
        "id": "first_module",
        "name": "Knowledge Seeker",
        "description": "Completed your first module.",
        "icon": "book-open",
    },
    {
        "id": "streak_7",
        "name": "Consistent Learner",
        "description": "Maintained a 7-day learning streak.",
        "icon": "flame",
    },
    {
        "id": "xp_100",
        "name": "Rising Star",
        "description": "Earned 100 or more XP.",
        "icon": "star",
    },
    {
        "id": "xp_500",
        "name": "Python Warrior",
        "description": "Earned 500 or more XP.",
        "icon": "sword",
    },
    {
        "id": "xp_1000",
        "name": "Code Architect",
        "description": "Earned 1000 or more XP. True mastery!",
        "icon": "trophy",
    },
]


@router.get("/{user_id}/achievements")
def get_user_achievements(user_id: str):
    """
    Return achievement list with earned status for a user.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify user exists
        cursor.execute("SELECT id, points, created_at FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        total_xp = user_row["points"] or 0
        user_created = user_row["created_at"]

        # Lessons completed count
        cursor.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        lessons_done = cursor.fetchone()[0] or 0

        # First lesson completion date
        cursor.execute(
            "SELECT MIN(completed_at) FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        first_completion_row = cursor.fetchone()
        first_completion_at = first_completion_row[0] if first_completion_row else None

        # Current streak
        current_streak = 0
        cursor.execute(
            "SELECT current_streak FROM user_streaks WHERE user_id = ?",
            [user_id],
        )
        streak_row = cursor.fetchone()
        if streak_row:
            current_streak = streak_row["current_streak"] or 0

        # Build achievements
        results = []
        for defn in ACHIEVEMENT_DEFINITIONS:
            earned = False
            earned_at = None

            if defn["id"] == "first_login":
                earned = True
                earned_at = user_created

            elif defn["id"] == "first_module":
                if lessons_done > 0:
                    earned = True
                    earned_at = first_completion_at

            elif defn["id"] == "streak_7":
                if current_streak >= 7:
                    earned = True
                    earned_at = None  # no exact timestamp available

            elif defn["id"] == "xp_100":
                earned = total_xp >= 100
            elif defn["id"] == "xp_500":
                earned = total_xp >= 500
            elif defn["id"] == "xp_1000":
                earned = total_xp >= 1000

            results.append({
                "id": defn["id"],
                "name": defn["name"],
                "description": defn["description"],
                "icon": defn["icon"],
                "earned": earned,
                "earned_at": earned_at,
            })

        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/profile/{user_id}/daily-recommendation
# ---------------------------------------------------------------------------

DAILY_TIPS = [
    "Use f-strings for cleaner string formatting: f'Hello {name}'",
    "List comprehensions are faster and more Pythonic than manual loops.",
    "Use 'enumerate()' instead of range(len()) when you need both index and value.",
    "The 'zip()' function pairs elements from multiple iterables elegantly.",
    "Dictionary .get(key, default) avoids KeyError exceptions.",
    "Use 'with' statements for file handling to ensure proper cleanup.",
    "The 'collections' module has powerful data structures like Counter and defaultdict.",
    "Type hints make your code self-documenting: def greet(name: str) -> str",
    "Virtual environments keep your project dependencies isolated.",
    "Write docstrings for your functions — your future self will thank you.",
]

TRENDING_TOPICS = [
    "Pattern Matching (match/case) in Python 3.10+",
    "Building REST APIs with FastAPI",
    "Data Analysis with pandas",
    "Async programming with asyncio",
    "Type hints and mypy for safer code",
    "Web scraping with BeautifulSoup",
    "Testing with pytest",
    "Working with JSON and APIs",
]


@router.get("/{user_id}/daily-recommendation")
def get_daily_recommendation(user_id: str):
    """
    Return a personalized daily recommendation for the user.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Get user info
        cursor.execute("SELECT id, name, username, points FROM users WHERE id = ?", [user_id])
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        display_name = user_row["name"] or user_row["username"] or "Learner"
        total_xp = user_row["points"] or 0

        # Determine time-of-day greeting
        hour = datetime.now().hour
        if hour < 12:
            time_greeting = "Good morning"
        elif hour < 17:
            time_greeting = "Good afternoon"
        else:
            time_greeting = "Good evening"

        greeting = f"{time_greeting}, {display_name}!"

        # Find the next uncompleted lesson to recommend
        cursor.execute(
            "SELECT lesson_id FROM lesson_completions WHERE user_id = ?",
            [user_id],
        )
        completed_ids = {row["lesson_id"] for row in cursor.fetchall()}

        # Check generated lessons for the user
        recommended_lesson = None
        reason = "Keep building your Python skills!"

        cursor.execute(
            "SELECT id, topic FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
            [user_id],
        )
        gen_lessons = cursor.fetchall()
        for gl in gen_lessons:
            if gl["id"] not in completed_ids:
                recommended_lesson = gl["topic"]
                reason = "This lesson was crafted just for you based on your learning profile."
                break

        # Fallback to static modules
        if not recommended_lesson:
            module_order = ["module_1", "module_2", "module_3", "module_4"]
            for mid in module_order:
                if mid not in completed_ids:
                    recommended_lesson = mid
                    reason = "Continue your learning journey with the next module."
                    break

        if not recommended_lesson:
            recommended_lesson = "Explore the Playground"
            reason = "You have completed all available modules! Try the Playground to practice."

        # Seeded random for daily consistency
        today_seed = date.today().toordinal() + hash(user_id) % 10000
        rng = random.Random(today_seed)

        daily_tip = rng.choice(DAILY_TIPS)
        trending_topic = rng.choice(TRENDING_TOPICS)

        return {
            "greeting": greeting,
            "recommended_lesson": recommended_lesson,
            "reason": reason,
            "trending_topic": trending_topic,
            "daily_tip": daily_tip,
        }
    finally:
        conn.close()
