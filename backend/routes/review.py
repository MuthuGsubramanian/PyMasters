"""
review.py — Recall-driven spaced-repetition review queue.

Surfaces lessons whose estimated recall has decayed, so learners reinforce what
they're about to forget rather than chasing a fixed daily streak. Built entirely
on the existing `user_mastery` table (mastery_level + last_practiced are already
updated on every classroom evaluation), so a "review" is just re-doing the
lesson through the normal evaluate flow — no separate review-state table.

Model: a half-life forgetting curve. half_life grows with mastery & practice
count and shrinks with past struggle; estimated recall = mastery * 0.5^(days/half_life).
A lesson is "due" once recall drops below the review threshold. This is the
simple, shippable form of the recall-scheduling result (Duolingo HLR / PNAS
MEMORIZE); the half-life function can later be replaced by a trained model.
"""

import os
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter

from routes.classroom import _load_lesson_from_dir

router = APIRouter(prefix="/api/review", tags=["review"])

# Tunables
LEARNED_THRESHOLD = 0.5   # only review lessons the learner actually got to
REVIEW_THRESHOLD = 0.65   # surface for review once estimated recall drops below this
HALF_LIFE_MIN = 0.5
HALF_LIFE_MAX = 120.0


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _days_since(ts, now: datetime) -> float:
    """Fractional days since a SQLite timestamp ('YYYY-MM-DD HH:MM:SS', UTC)."""
    if not ts:
        return 0.0
    for parse in (
        lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M:%S"),
        lambda s: datetime.fromisoformat(s),
    ):
        try:
            dt = parse(str(ts)).replace(tzinfo=timezone.utc)
            return max(0.0, (now - dt).total_seconds() / 86400.0)
        except (ValueError, TypeError):
            continue
    return 0.0


def _half_life_days(mastery: float, attempts: int, struggle: int) -> float:
    """Stronger, more-practiced memories decay slower; struggle shortens half-life."""
    hl = 0.5 + 4.0 * mastery + 0.6 * max(0, attempts - 1) - 0.6 * struggle
    return max(HALF_LIFE_MIN, min(HALF_LIFE_MAX, hl))


def _estimated_recall(mastery: float, attempts: int, struggle: int, elapsed_days: float) -> float:
    hl = _half_life_days(mastery, attempts, struggle)
    return mastery * (0.5 ** (elapsed_days / hl))


def _title(lesson: dict | None, topic: str) -> str:
    if not lesson:
        return topic
    t = lesson.get("title")
    if isinstance(t, dict):
        return t.get("en") or next(iter(t.values()), topic)
    return t or topic


@router.get("/due")
def due_reviews(user_id: str, limit: int = 20):
    """Lessons due for spaced-repetition review, most-urgent (lowest recall) first."""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """SELECT topic, mastery_level, attempts, struggle_count, last_practiced
               FROM user_mastery WHERE user_id = ?""",
            [user_id],
        ).fetchall()
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    due = []
    tracked = 0
    for r in rows:
        mastery = r["mastery_level"] or 0.0
        if mastery < LEARNED_THRESHOLD:
            continue
        tracked += 1
        elapsed = _days_since(r["last_practiced"], now)
        recall = _estimated_recall(mastery, r["attempts"] or 1, r["struggle_count"] or 0, elapsed)
        if recall >= REVIEW_THRESHOLD:
            continue
        lesson = _load_lesson_from_dir(r["topic"])
        due.append({
            "topic": r["topic"],
            "title": _title(lesson, r["topic"]),
            "track": (lesson or {}).get("track"),
            "recall": round(recall, 2),
            "mastery": round(mastery, 2),
            "days_since": round(elapsed, 1),
        })

    due.sort(key=lambda x: x["recall"])
    return {"due": due[:limit], "total_due": len(due), "tracked": tracked}
