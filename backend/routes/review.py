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
import random
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from ratelimit import SlidingWindowRateLimiter, enforce

from routes.classroom import _load_lesson_from_dir
from auth import get_current_user_id

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


COMPLETED_MASTERY = 0.8  # a passed lesson counts as learned even before mastery climbs (+0.1 per pass)


def _learning_rows(conn, user_id: str) -> list[dict]:
    """The caller's practised lessons with an effective mastery.

    Mastery only grows 0.1 per passed challenge, so in production nobody reached
    LEARNED_THRESHOLD and both the review queue and the warm-up stayed empty even
    for learners who had completed lessons. A completion now counts as learned
    (mastery floor COMPLETED_MASTERY) and its clock starts at the later of the
    last practice and the completion."""
    rows = {}
    for r in conn.execute(
        """SELECT topic, mastery_level, attempts, struggle_count, last_practiced
           FROM user_mastery WHERE user_id = ?""", [user_id]).fetchall():
        rows[r[0]] = {"topic": r[0], "mastery": r[1] or 0.0, "attempts": r[2] or 1,
                      "struggle": r[3] or 0, "last_practiced": r[4]}
    try:
        completions = conn.execute(
            "SELECT lesson_id, completed_at FROM lesson_completions WHERE user_id = ?", [user_id]).fetchall()
    except sqlite3.OperationalError:  # table absent in minimal test DBs
        completions = []
    for lesson_id, completed_at in completions:
        r = rows.setdefault(lesson_id, {"topic": lesson_id, "mastery": 0.0, "attempts": 1,
                                        "struggle": 0, "last_practiced": None})
        r["mastery"] = max(r["mastery"], COMPLETED_MASTERY)
        r["last_practiced"] = max(filter(None, [r["last_practiced"], completed_at]), default=None)
    return list(rows.values())


@router.get("/due")
def due_reviews(user_id: str, limit: int = 20, caller: str = Depends(get_current_user_id)):
    """Lessons due for spaced-repetition review, most-urgent (lowest recall) first.

    Authorization: the review queue is per-user learning data (topics the learner
    has reached, their mastery levels, struggle counts and last-practiced
    timestamps). `user_id` is a client-supplied query param; without deriving the
    acting user from the verified JWT and refusing cross-user access, ANY party —
    including unauthenticated ones — could read another user's mastery data simply
    by supplying their id (classic IDOR / info-leak). This mirrors `_require_self`
    in profile.py and the identical `/profile/signal` hardening. The only caller
    (frontend ReviewQueue via the authenticated axios instance) already sends the
    JWT and its own user.id, so legitimate use is unchanged; anonymous callers now
    get 401 and cross-user callers 403.
    """
    if caller != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    conn = sqlite3.connect(_db_path())
    try:
        rows = _learning_rows(conn, user_id)
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    due = []
    tracked = 0
    for r in rows:
        mastery = r["mastery"]
        if mastery < LEARNED_THRESHOLD:
            continue
        tracked += 1
        elapsed = _days_since(r["last_practiced"], now)
        recall = _estimated_recall(mastery, r["attempts"], r["struggle"], elapsed)
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


# ── 5-minute warm-up (2026-11-02) ────────────────────────────────────────────
# Mixed retrieval practice: a handful of quiz questions from lessons the learner
# has learned, most-forgotten first (interleaving across topics). Answers are
# graded here so the correct option never ships to the client, and each answer
# feeds the same forgetting curve: right -> last_practiced resets, wrong -> the
# lesson's half-life shrinks so it resurfaces sooner.
WARMUP_SIZE = 5
_warmup_limiter = SlidingWindowRateLimiter(max_calls=60, window_seconds=600)


def _text(v, lang: str):
    if isinstance(v, dict):
        return v.get(lang) or v.get("en") or next(iter(v.values()), None)
    return v


def _quiz(lesson: dict | None) -> list:
    q = (lesson or {}).get("quiz")
    return q if isinstance(q, list) else []


def _learned_topics(conn, user_id: str) -> list[dict]:
    return [r for r in _learning_rows(conn, user_id) if r["mastery"] >= LEARNED_THRESHOLD]


@router.get("/warmup")
def warmup(lang: str = "en", caller: str = Depends(get_current_user_id)):
    conn = sqlite3.connect(_db_path())
    try:
        rows = _learned_topics(conn, caller)
    finally:
        conn.close()
    now = datetime.now(timezone.utc)
    ranked = sorted(rows, key=lambda r: _estimated_recall(
        r["mastery"], r["attempts"], r["struggle"], _days_since(r["last_practiced"], now)))

    pool = []  # (topic, title, index, item) - one question per lesson first, then seconds
    lessons = []
    for r in ranked:
        lesson = _load_lesson_from_dir(r["topic"])
        quiz = [(i, item) for i, item in enumerate(_quiz(lesson))
                if isinstance(item, dict) and _text(item.get("q"), lang) and isinstance(_text(item.get("options"), lang), list)]
        if quiz:
            random.shuffle(quiz)
            lessons.append((r["topic"], _title(lesson, r["topic"]), quiz))
        if len(lessons) >= WARMUP_SIZE:
            break
    for rnd in range(WARMUP_SIZE):
        for topic, title, quiz in lessons:
            if rnd < len(quiz) and len(pool) < WARMUP_SIZE:
                pool.append((topic, title) + quiz[rnd])
    random.shuffle(pool)
    return {"questions": [
        {"id": f"{topic}:{i}", "topic": topic, "title": title,
         "q": _text(item["q"], lang), "options": _text(item["options"], lang)}
        for topic, title, i, item in pool
    ]}


@router.post("/warmup/answer")
def warmup_answer(body: dict = Body(...), caller: str = Depends(get_current_user_id)):
    enforce(_warmup_limiter, caller, "warm-up answers")
    qid, choice = str(body.get("id") or ""), body.get("choice")
    topic, _, idx = qid.rpartition(":")
    if not topic or not idx.isdigit() or not isinstance(choice, int):
        raise HTTPException(status_code=400, detail="Invalid answer")
    quiz = _quiz(_load_lesson_from_dir(topic))
    if int(idx) >= len(quiz) or not isinstance(quiz[int(idx)], dict):
        raise HTTPException(status_code=404, detail="Question not found")
    correct_index = quiz[int(idx)].get("correct")
    correct = choice == correct_index
    conn = sqlite3.connect(_db_path())
    try:
        # Only lessons the learner has actually learned (or completed) are rescheduled.
        if any(r["topic"] == topic for r in _learned_topics(conn, caller)):
            if correct:
                conn.execute("UPDATE user_mastery SET last_practiced = CURRENT_TIMESTAMP WHERE user_id = ? AND topic = ?",
                             [caller, topic])
            else:
                conn.execute("""UPDATE user_mastery SET struggle_count = COALESCE(struggle_count, 0) + 1
                                WHERE user_id = ? AND topic = ?""", [caller, topic])
            conn.commit()
    finally:
        conn.close()
    return {"correct": correct, "correct_index": correct_index}
