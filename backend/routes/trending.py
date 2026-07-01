"""
trending.py — FastAPI router for AI & Python trending topics.
Prefix: /api/trending
"""

import os
from datetime import date, datetime
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

# Import the trends engine
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from content.trends import (
    get_daily_trending, get_trending_for_profile, get_topic_by_id,
    get_topics_by_category, search_trends, get_all_categories
)
from content.daily_content import (
    generate_daily_tip, generate_daily_challenge, generate_daily_quiz, get_greeting
)
from vaathiyaar.profiler import get_student_profile

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/trending", tags=["trending"])


def _today() -> str:
    return str(date.today())


_VALID_TIMES_OF_DAY = ("morning", "afternoon", "evening", "night")


def _time_of_day() -> str:
    """Server-side fallback bucket for the current hour.

    Note: the server runs in UTC, so this can be off for the user's real
    local time. The bundle endpoint therefore prefers a client-supplied
    ``time_of_day`` when one is provided (mirroring the classroom/playground
    endpoints), falling back to this only when the client sends nothing.

    Includes a ``night`` bucket (21:00–04:59) so the curated night greetings
    in ``daily_content._GREETINGS['night']`` — previously unreachable because
    this helper never returned "night" — can actually surface.
    """
    h = datetime.now().hour
    if 5 <= h < 12:
        return "morning"
    elif 12 <= h < 17:
        return "afternoon"
    elif 17 <= h < 21:
        return "evening"
    return "night"


# ── 1. Today's trending topics ───────────────────────────────────────────────
@router.get("")
def trending_today(
    count: int = Query(10, ge=1, le=50),
    category: Optional[str] = Query(None),
):
    """Return today's trending AI & Python topics."""
    if category:
        topics = get_topics_by_category(category)[:count]
    else:
        topics = get_daily_trending(date_str=_today(), count=count)
    return {"date": _today(), "count": len(topics), "topics": topics}


# ── 2. Personalized trending for a user ───────────────────────────────────────
@router.get("/personalized/{user_id}")
def trending_personalized(user_id: str):
    """Return trending topics matched to the user's profile."""
    profile = get_student_profile(DB_PATH, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    topics = get_trending_for_profile(profile, date_str=_today())
    return {"user_id": user_id, "date": _today(), "topics": topics}


# ── 3. All available categories ───────────────────────────────────────────────
@router.get("/categories")
def trending_categories():
    """Return every category that has trending content."""
    return {"categories": get_all_categories()}


# ── 4. Search trending topics ─────────────────────────────────────────────────
@router.get("/search")
def trending_search(q: str = Query(..., min_length=1)):
    """Full-text search across trending topics."""
    results = search_trends(q)
    return {"query": q, "count": len(results), "results": results}


# ── 5. Single topic detail ────────────────────────────────────────────────────
@router.get("/topic/{topic_id}")
def trending_topic_detail(topic_id: str):
    """Return full detail for a single trending topic."""
    topic = get_topic_by_id(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


# ── 6. Daily personalized content bundle ──────────────────────────────────────
@router.get("/daily/{user_id}")
def daily_content_bundle(
    user_id: str,
    time_of_day: Optional[str] = Query(
        None,
        description=(
            "Optional client-computed time bucket "
            "('morning'|'afternoon'|'evening'|'night'). When omitted or "
            "invalid, the server computes it from its own (UTC) clock, "
            "preserving the original behaviour."
        ),
    ),
):
    """
    One-stop endpoint: greeting, tip-of-the-day, challenge,
    quiz question, and personalised trending topics.
    """
    profile = get_student_profile(DB_PATH, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    today = _today()
    username = profile.get("username", profile.get("name", "Learner"))
    # Prefer a valid client-supplied bucket (the client knows the user's real
    # local time; the server only knows UTC). Fall back to the server guess
    # when the param is absent or not one of the recognised buckets — so the
    # response is byte-identical to the pre-change behaviour for every existing
    # caller, which sends no such param.
    tod = time_of_day if time_of_day in _VALID_TIMES_OF_DAY else _time_of_day()

    return {
        "user_id": user_id,
        "date": today,
        "greeting": get_greeting(username, tod),
        "tip": generate_daily_tip(profile, today),
        "challenge": generate_daily_challenge(profile, today),
        "quiz": generate_daily_quiz(profile, today),
        "trending": get_trending_for_profile(profile, today),
    }
