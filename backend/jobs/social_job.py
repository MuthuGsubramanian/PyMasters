"""LinkedIn posting job (founder directive 2026-10-28, 05:47 IST): "as linkedin
and youtube connections are live now ensure that periodical posts are made
effectively and in a professional way not just some basic content. consider
yourself as a manager of pymasters and regularly manage the page and the
socials."

Ruling (ops spec deviation, 2026-10-28): the ops design doc sketched a new
``social_posts`` table and porting LinkedIn drafting/posting into the backend.
Neither is needed: ``routes/social_studio.py`` already has a ``social_jobs``
queue, and ``pipeline/social_worker.py`` already polls it every 5 minutes on
the laptop (Task Scheduler job ``PyMasters-SocialWorker``, confirmed Ready and
enabled) — where the LinkedIn credentials, Pillow and the drafting prompt
(``pipeline/actors/social_content.py``) already live, because the backend's
Docker image does not ship the ``pipeline/`` package. Reusing that queue keeps
one system of record (the admin console at ``GET /api/admin/social/jobs``
already lists it) instead of two. This job's only job is picking real
material and a professional style direction, three times a week, and queuing
it the same way the Social Studio admin UI does.
"""
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

MIN_LEN = 900
MAX_LEN = 1300
BANNED_PHRASES = [
    "game changer", "game-changer", "unlock your potential", "10x your",
    "in today's fast-paced world", "let that sink in", "buckle up",
]

STYLE_GUIDE = (
    "You are writing a LinkedIn post for PyMasters, a platform that teaches Python and AI by "
    "building real, sandbox-graded projects. Write like a thoughtful engineer sharing something "
    "genuinely useful, not a marketer. Professional and confident, no clickbait, no emoji walls "
    "(at most one or two emoji total), exactly one clear idea with a concrete takeaway (a short "
    "3-6 line code snippet when the material has one), one reason for the reader to click through "
    "to pymasters.net, and exactly three relevant hashtags at the end. Length: 900-1300 characters. "
    "Never use any of these banned phrases: " + ", ".join(f'"{p}"' for p in BANNED_PHRASES) + "."
)


def _conn(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables(conn: sqlite3.Connection) -> None:
    # Same table routes/social_studio.py creates — one system of record.
    conn.execute(
        """CREATE TABLE IF NOT EXISTS social_jobs (
               id TEXT PRIMARY KEY,
               requested_by TEXT,
               topic TEXT NOT NULL,
               style_notes TEXT,
               channels TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'pending',
               result TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    conn.commit()


def latest_fresh_lesson(conn: sqlite3.Connection) -> dict | None:
    """The newest lesson the content job published to the platform track."""
    row = conn.execute(
        "SELECT id, lesson_data FROM generated_lessons WHERE published_to = 'platform' "
        "ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    data = json.loads(row["lesson_data"])
    return {
        "id": row["id"],
        "title": (data.get("title") or {}).get("en", "") or "",
        "description": (data.get("description") or {}).get("en", "") or "",
    }


def arcade_spotlight(now: datetime) -> dict:
    """Rotate deterministically through the live arcade games, reusing their
    real catalog copy (routes/arcade.py GAME_META) rather than inventing new
    blurbs that could drift from what the game actually does."""
    from arcade.unlocks import GAMES
    from routes.arcade import GAME_META
    gid = GAMES[now.toordinal() % len(GAMES)]
    meta = GAME_META[gid]
    return {"id": gid, "title": meta["title"], "blurb": meta["blurb"]}


def learner_insight(now: datetime) -> dict:
    """Rotate deterministically through the existing tip bank — real content
    already reviewed for the in-app "daily tip" feature."""
    from content.daily_content import TIPS
    tip = TIPS[now.toordinal() % len(TIPS)]
    return {"title": tip["title"], "content": tip["content"], "code": tip.get("code", "")}


def pick_material(conn: sqlite3.Connection, now: datetime) -> tuple[str, str]:
    """Return (topic, style_notes) for the given day. Mon → newest Fresh
    lesson (falls back to an insight if none exists yet); Wed → an arcade
    game spotlight; Fri → a Python/AI insight. ``weekday()``: Mon=0."""
    weekday = now.weekday()
    if weekday == 0:
        lesson = latest_fresh_lesson(conn)
        if lesson:
            topic = f"Fresh lesson spotlight: {lesson['title']}"
            style = (
                f"{STYLE_GUIDE} Material: a new PyMasters lesson titled '{lesson['title']}' — "
                f"{lesson['description']}. Give one concrete takeaway from it with a short code "
                f"example, and invite readers to try the full lesson on pymasters.net."
            )
            return topic, style
        weekday = 4  # no Fresh lesson yet — fall through to an insight post
    if weekday == 2:
        game = arcade_spotlight(now)
        topic = f"Arcade spotlight: {game['title']}"
        style = (
            f"{STYLE_GUIDE} Material: PyMasters' learning game '{game['title']}' — {game['blurb']}. "
            f"Explain what Python/CS concept it teaches and how the game teaches it, and invite "
            f"readers to play it after logging in at pymasters.net."
        )
        return topic, style
    insight = learner_insight(now)
    topic = f"Python insight: {insight['title']}"
    style = f"{STYLE_GUIDE} Material: {insight['content']} Example code:\n{insight['code']}"
    return topic, style


def run_linkedin(db_path: str) -> dict:
    """Called by jobs.scheduler on its Mon/Wed/Fri window. Queues one Social
    Studio job with channels=["linkedin"]; pipeline/social_worker.py (the
    laptop poller) drafts, validates style, generates the branded image, and
    posts it, then reports the result back into this same table."""
    now = datetime.now(timezone.utc)
    conn = _conn(db_path)
    try:
        ensure_tables(conn)
        topic, style = pick_material(conn, now)

        recent_cutoff = (now - timedelta(days=6)).strftime("%Y-%m-%d %H:%M:%S")
        dup = conn.execute(
            "SELECT id FROM social_jobs WHERE topic = ? AND created_at >= ?",
            [topic, recent_cutoff],
        ).fetchone()
        if dup:
            return {"queued": False, "reason": "duplicate topic within 6 days", "topic": topic}

        job_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO social_jobs (id, requested_by, topic, style_notes, channels) VALUES (?, ?, ?, ?, ?)",
            [job_id, "system:content-manager", topic, style, json.dumps(["linkedin"])],
        )
        conn.commit()
        return {"queued": True, "job_id": job_id, "topic": topic}
    finally:
        conn.close()
