"""
Path recommendation based on user's onboarding profile.
"""
import os
import sqlite3

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

MOTIVATION_TO_PATH = {
    "hobby": "fun_projects_path",
    "ai_ml": "ai_ml_dl_complete_journey",
    "data_science": "data_scientist_path",
    "career_switch": "python_zero_to_hero",
    "work": "python_for_programmers",
    "student": "python_zero_to_hero",
}

GOAL_TO_PATH = {
    "web": "web_developer_path",
    "automation": "automation_engineer_path",
    "ai_ml": "ml_engineer_path",
    "data_science": "data_scientist_path",
    "games": "fun_projects_path",
}


def recommend_path(user_id: str) -> dict | None:
    """Recommend a learning path based on user's onboarding profile."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    profile = conn.execute(
        "SELECT motivation, goal, prior_experience, skill_level FROM user_profiles WHERE user_id = ?",
        [user_id],
    ).fetchone()

    if not profile:
        conn.close()
        return None

    motivation = profile["motivation"] or ""
    goal = profile["goal"] or ""
    experience = profile["prior_experience"] or "none"

    motivations = set(m.strip() for m in motivation.split(",") if m.strip())
    goals = set(g.strip() for g in goal.split(",") if g.strip())

    # Priority: goal > motivation
    path_id = None
    for g in goals:
        if g in GOAL_TO_PATH:
            path_id = GOAL_TO_PATH[g]
            break

    if not path_id:
        for m in motivations:
            if m in MOTIVATION_TO_PATH:
                path_id = MOTIVATION_TO_PATH[m]
                break

    if not path_id:
        path_id = "python_zero_to_hero"

    # Beginners always start with fundamentals
    if experience == "none" and path_id not in ("python_zero_to_hero", "fun_projects_path"):
        path_id = "python_zero_to_hero"

    # Fetch the path details
    path = conn.execute("SELECT * FROM learning_paths WHERE id = ?", [path_id]).fetchone()
    conn.close()

    if path:
        return dict(path)
    return None
