"""Arcade unlock ladder.

Games unlock by the number of *drill-backed* lessons a learner has completed (lessons whose
topic has questions in the verified banks, so a freshly unlocked game always has material).
Boards in Snakes & Ladders unlock when any lesson of the board's topics is completed and the
board's question pool is big enough. Every unlock is recorded once in `arcade_unlocks` and
announced with an in-app notification (one summary for a learner's first batch).
"""
import glob
import json
import os
from functools import lru_cache
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
LESSONS_DIR = BACKEND / "lessons"
BANKS_DIR = BACKEND / "games" / "banks"

GAMES = ["snakes_ladders", "linked_snake", "loop_runner"]
GAME_TITLES = {"snakes_ladders": "Snakes & Ladders", "linked_snake": "Linked Snake", "loop_runner": "Loop Runner"}
LADDER = {"snakes_ladders": 1, "linked_snake": 3, "loop_runner": 6}
BOARD_MIN_POOL = 24
CHOICE_KINDS = {"choice", "line_then_choice", "bin"}
NOTIFICATION_TYPE = "game_unlocked"
ARCADE_LINK = "/dashboard/play#arcade"

_BOARD_TOPICS = {
    "variables": ("Variables", ["variables"]),
    "lists": ("Lists", ["lists"]),
    "dicts": ("Dicts", ["ds_dicts"]),
    "loops": ("Loops", ["for_loops", "while_loops"]),
    "conditionals": ("Conditionals", ["conditionals"]),
    "functions": ("Functions", ["functions_basics", "functions_args", "functions_scope"]),
    "containers": ("Containers", ["ds_sets", "ds_tuples", "queues", "hash_tables", "stacks"]),
    "big_o": ("Big-O & Sorting", ["big_o_complexity", "sorting_basics", "searching", "recursion_fundamentals"]),
}


@lru_cache(maxsize=None)
def lesson_topics() -> dict:
    """lesson_id -> topic for every lesson on disk."""
    out = {}
    for path in glob.glob(str(LESSONS_DIR / "*" / "*.json")):
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        if d.get("id") and d.get("topic"):
            out[d["id"]] = d["topic"]
    return out


def _lessons_for(topics) -> list:
    wanted = set(topics)
    return sorted(lid for lid, t in lesson_topics().items() if t in wanted)


BOARDS = {key: {"title": title, "topics": list(topics), "lessons": _lessons_for(topics)}
          for key, (title, topics) in _BOARD_TOPICS.items()}


@lru_cache(maxsize=None)
def _bank_items() -> list:
    items = []
    for path in sorted(BANKS_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                items.extend(json.load(fh))
        except Exception:
            continue
    return items


@lru_cache(maxsize=None)
def drill_backed_topics() -> frozenset:
    return frozenset(i["topic"] for i in _bank_items() if i.get("topic"))


@lru_cache(maxsize=None)
def pool_size(board_key: str) -> int:
    topics = set(BOARDS.get(board_key, {}).get("topics", []))
    return sum(1 for i in _bank_items() if i.get("topic") in topics and i.get("kind") in CHOICE_KINDS)


def completed_lessons(conn, user_id: str) -> set:
    rows = conn.execute("SELECT lesson_id FROM lesson_completions WHERE user_id = ?", [str(user_id)]).fetchall()
    return {r[0] for r in rows}


def completed_topics(conn, user_id: str) -> set:
    topics = lesson_topics()
    return {topics[lid] for lid in completed_lessons(conn, user_id) if lid in topics}


def drill_backed_count(conn, user_id: str) -> int:
    topics, backed = lesson_topics(), drill_backed_topics()
    return sum(1 for lid in completed_lessons(conn, user_id) if topics.get(lid) in backed)


def ensure_tables(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS arcade_unlocks (user_id TEXT NOT NULL, key TEXT NOT NULL,"
                 " unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, key))")


def unlocked_keys(conn, user_id: str) -> set:
    ensure_tables(conn)
    return {r[0] for r in conn.execute("SELECT key FROM arcade_unlocks WHERE user_id = ?", [str(user_id)]).fetchall()}


def due_keys(conn, user_id: str) -> list:
    """Every key the learner has earned, whether or not it is recorded yet."""
    n = drill_backed_count(conn, user_id)
    keys = [f"game:{g}" for g in GAMES if n >= LADDER[g]]
    done = completed_lessons(conn, user_id)
    for key, board in BOARDS.items():
        if done.intersection(board["lessons"]) and pool_size(key) >= BOARD_MIN_POOL:
            keys.append(f"board:{key}")
    return keys


def _label(key: str) -> tuple:
    kind, _, ident = key.partition(":")
    if kind == "game":
        return "game", GAME_TITLES.get(ident, ident)
    return "board", BOARDS.get(ident, {}).get("title", ident)


def evaluate(conn, user_id: str, *, notify: bool = True) -> list:
    """Record newly earned unlocks for `user_id`; returns the new keys (in ladder order)."""
    user_id = str(user_id)
    ensure_tables(conn)
    have = unlocked_keys(conn, user_id)
    new = [k for k in due_keys(conn, user_id) if k not in have]
    if not new:
        return []
    conn.executemany("INSERT OR IGNORE INTO arcade_unlocks (user_id, key) VALUES (?, ?)", [(user_id, k) for k in new])
    conn.commit()
    if notify:
        try:
            _notify(conn, user_id, new, first_batch=not have)
        except Exception as exc:  # never fail a completion over a notification
            print(f"[arcade] unlock notification failed: {exc}")
    return new


def _notify(conn, user_id: str, new: list, *, first_batch: bool) -> None:
    from notifications.dispatcher import _create_notification
    if first_batch and len(new) > 1:
        games = sum(1 for k in new if k.startswith("game:"))
        boards = sum(1 for k in new if k.startswith("board:"))
        parts = []
        if games:
            parts.append(f"{games} game{'s' if games != 1 else ''}")
        if boards:
            parts.append(f"{boards} board{'s' if boards != 1 else ''}")
        _create_notification(conn, user_id, NOTIFICATION_TYPE, "Arcade unlocked",
                             f"{' and '.join(parts)} are waiting for you", ARCADE_LINK, {"keys": new}, channels=["in_app"])
    else:
        for key in new:
            kind, title = _label(key)
            _create_notification(conn, user_id, NOTIFICATION_TYPE, f"New {kind} unlocked: {title}",
                                 f"Keep learning to unlock more. Play {title} now.", ARCADE_LINK, {"keys": [key]},
                                 channels=["in_app"])
    conn.commit()


def evaluate_path(db_path: str, user_id: str) -> list:
    """Convenience for callers that only hold a path; swallows errors (bookkeeping only)."""
    import sqlite3
    try:
        conn = sqlite3.connect(db_path)
        try:
            return evaluate(conn, user_id)
        finally:
            conn.close()
    except Exception as exc:
        print(f"[arcade] unlock evaluation failed: {exc}")
        return []
