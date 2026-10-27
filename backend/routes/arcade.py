"""Arcade API: real games unlocked by learning progress.

Catalog evaluates unlocks (idempotent) and reports pools; sessions deal only questions from
topics the learner has completed, grade each answer server-side the moment a pig is hit / a
ladder is climbed / a food is eaten, and finish idempotently with XP from correct answers under
the shared daily cap (never from the game score).
"""
import json
import os
import sqlite3
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from access import assert_learning_access
from arcade import unlocks
from arcade.pools import pick, pool_count
from auth import get_current_user_id
from games import engine
from progress import award_xp, today_xp
from streaks import touch_streak
from vaathiyaar.profiler import nudge_mastery, record_signal

router = APIRouter(prefix="/api/arcade", tags=["arcade"])

GAME_META = {
    "snakes_ladders": {"title": "Snakes & Ladders: Python Quest", "n": 12, "kinds": None,
                       "blurb": "Race Bugsy to square 100. Ladders ask a question: right climbs, wrong turns the ladder into a snake."},
    "linked_snake": {"title": "Linked Snake", "n": 20, "kinds": {"choice"},
                     "blurb": "Your snake is a linked list. Eat the right answer to append a node; the wrong one pops your tail."},
    "code_slingshot": {"title": "Code Slingshot", "n": 20, "kinds": {"choice"},
                       "blurb": "Pigs hold the answers. Pull back, aim, and knock out the one that matches the expression."},
    "loop_runner": {"title": "Loop Runner", "n": 20, "kinds": {"choice"}, "prefer_prefix": "ex_",
                    "blurb": "Run the neon city. Jump or slide through the gate that holds the expression's real value."},
    "bug_invaders": {"title": "Bug Invaders", "n": 12, "kinds": {"line_then_choice"},
                     "blurb": "The program descends line by line. Shoot the guilty line, then the fix that makes the test pass."},
    "dict_dash": {"title": "Dict Dash", "n": 20, "kinds": {"choice"},
                  "blurb": "A maze of pellets, four power pellets with answers. Eat the right one and the error ghosts turn blue."},
    "big_o_grand_prix": {"title": "Big-O Grand Prix", "n": 16, "kinds": {"choice"},
                         "topics_bias": ["big_o_complexity", "sorting_basics", "searching", "hash_tables", "recursion_fundamentals"],
                         "blurb": "Three laps against three karts. Pick the right lane at every fork for a boost; wrong lanes are oil."},
}
MIN_POOL = 12
MASTERY_PER_CORRECT = 0.02
MASTERY_PER_WRONG = -0.01
MASTERY_BOUND = 0.08


class StartBody(BaseModel):
    game_id: str
    board: Optional[str] = None


class QuestionsBody(BaseModel):
    session_id: str


class AnswerBody(BaseModel):
    session_id: str
    item_id: str
    response: object = None
    ms: Optional[float] = None


class FinishBody(BaseModel):
    session_id: str
    score: int = Field(0, ge=0, le=10_000_000)
    stats: Optional[dict] = None


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_tables(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS arcade_sessions ("
            " id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_id TEXT NOT NULL, board TEXT, seed INTEGER NOT NULL,"
            " questions_json TEXT NOT NULL, responses_json TEXT, reveals_json TEXT, item_ms_json TEXT,"
            " score INTEGER, correct INTEGER, answered INTEGER, xp INTEGER, result_json TEXT,"
            " started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_arcade_sessions_user_game ON arcade_sessions(user_id, game_id, started_at)")
        unlocks.ensure_tables(conn)
        conn.commit()
    finally:
        conn.close()


def _guard(user_id: str) -> str:
    if os.getenv("ARCADE_ENABLED", "1") == "0":
        raise HTTPException(status_code=503, detail="Arcade is paused")
    assert_learning_access(_db_path(), user_id)
    ensure_tables(_db_path())
    return _db_path()


def _conn(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _topics_for(conn, user_id: str, game_id: str, board: Optional[str]) -> set:
    learned = unlocks.completed_topics(conn, user_id)
    if game_id == "snakes_ladders" and board:
        return learned.intersection(unlocks.BOARDS.get(board, {}).get("topics", []))
    return learned


def _next_lesson(conn, user_id: str) -> Optional[str]:
    """The lowest-order drill-backed lesson the learner has not completed (python fundamentals first)."""
    done = unlocks.completed_lessons(conn, user_id)
    backed = unlocks.drill_backed_topics()
    best = None
    import glob
    for path in glob.glob(str(unlocks.LESSONS_DIR / "*" / "*.json")):
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        if d.get("topic") not in backed or d.get("id") in done:
            continue
        rank = (0 if d.get("track") == "python_fundamentals" else 1 if d.get("track") == "dsa" else 2, d.get("order") or 99, d.get("id"))
        if best is None or rank < best[0]:
            best = (rank, d["id"])
    return best[1] if best else None


def _bests(conn, user_id: str) -> dict:
    rows = conn.execute("SELECT game_id, board, MAX(score) AS best, COUNT(*) AS plays FROM arcade_sessions "
                        "WHERE user_id = ? AND finished_at IS NOT NULL GROUP BY game_id, board", [user_id]).fetchall()
    out = {}
    for r in rows:
        g = out.setdefault(r["game_id"], {"best": 0, "plays": 0, "boards": {}})
        g["best"] = max(g["best"], r["best"] or 0)
        g["plays"] += r["plays"]
        if r["board"]:
            g["boards"][r["board"]] = {"best": r["best"] or 0, "plays": r["plays"]}
    return out


@router.get("/catalog")
def arcade_catalog(user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        newly = unlocks.evaluate(conn, user_id)
        have = unlocks.unlocked_keys(conn, user_id)
        learned = unlocks.completed_topics(conn, user_id)
        completed = unlocks.drill_backed_count(conn, user_id)
        bests = _bests(conn, user_id)
        next_lesson = _next_lesson(conn, user_id)
        games = []
        for gid in unlocks.GAMES:
            meta = GAME_META[gid]
            need = unlocks.LADDER[gid]
            is_unlocked = f"game:{gid}" in have
            expressions_only = gid == "code_slingshot" and completed < 10
            pool = pool_count(learned, expressions_only=expressions_only, kinds=meta["kinds"]) if is_unlocked else 0
            entry = {"id": gid, "title": meta["title"], "blurb": meta["blurb"], "unlocked": is_unlocked,
                     "milestone": ("Unlocked" if is_unlocked else
                                   f"Complete {need - completed} more lesson{'s' if need - completed != 1 else ''} to unlock"),
                     "pool": pool, "needs_content": bool(is_unlocked and pool < MIN_POOL),
                     "next_lesson": next_lesson if (not is_unlocked or pool < MIN_POOL) else None,
                     "best": bests.get(gid)}
            if gid == "snakes_ladders":
                entry["boards"] = [{"key": key, "title": b["title"], "unlocked": f"board:{key}" in have,
                                    "pool": pool_count(learned.intersection(b["topics"])),
                                    "best": (bests.get(gid) or {}).get("boards", {}).get(key)}
                                   for key, b in unlocks.BOARDS.items()]
            games.append(entry)
        nxt = next(((g, unlocks.LADDER[g] - completed) for g in unlocks.GAMES if f"game:{g}" not in have), None)
        return {"enabled": True, "games": games, "newly_unlocked": newly,
                "stage": {"completed": completed, "next": {"game": nxt[0], "needed": max(0, nxt[1])} if nxt else None},
                "today_xp": today_xp(conn, user_id, "game"), "xp_cap": engine.XP_DAILY_CAP}
    finally:
        conn.close()


SUBSET_GAMES = {"loop_runner": 1, "big_o_grand_prix": 2, "dict_dash": 3}      # game -> number of distractors shown


def _subset_variant(item: dict, ds: tuple) -> Optional[dict]:
    """Variant of a choice item showing the truth plus the distractors in `ds` (indexes into the
    original choices), shuffled deterministically. Ids carry the distractors so grading can
    rebuild the same variant: `<base id>~v<d1>-<d2>`."""
    choices = item.get("choices") or []
    ans = item.get("answer")
    if item.get("kind") != "choice" or not isinstance(ans, int) or ans >= len(choices):
        return None
    ds = tuple(int(d) for d in ds)
    if any(d == ans or d < 0 or d >= len(choices) for d in ds) or len(set(ds)) != len(ds):
        return None
    truth = choices[ans]
    wrongs = [choices[d] for d in ds]
    if truth in wrongs or len(set(wrongs)) != len(wrongs):
        return None
    vid = f"{item['id']}~v{'-'.join(str(d) for d in ds)}"
    pool = [truth] + wrongs
    import random as _random
    _random.Random(vid).shuffle(pool)
    return {**item, "id": vid, "choices": pool, "answer": pool.index(truth), "source_id": item["id"]}


def _base_of(item_id: str) -> str:
    return item_id.rsplit("~v", 1)[0] if "~v" in item_id else item_id


def _deal_subsets(topics: set, seed: int, n: int, exclude: set, k: int, prefer_topics=None, prefer_prefix=None) -> list:
    """Deal variants of base questions not yet dealt in this session; a base repeats (with other
    distractors) only once the fresh bases are exhausted, and such repeats earn nothing (see answer)."""
    import itertools
    import random as _random
    dealt_bases = {_base_of(i) for i in exclude}
    bases = pick(topics, seed, 10_000, set(), kinds={"choice"}, prefer_topics=prefer_topics)
    rng = _random.Random(seed)
    fresh, repeats = [], []
    for it in bases:
        ans = it.get("answer")
        others = [d for d in range(len(it.get("choices") or [])) if d != ans]
        subsets = list(itertools.combinations(others, k))
        if not subsets:
            continue
        rng.shuffle(subsets)
        v = next((_subset_variant(it, ds) for ds in subsets if _subset_variant(it, ds) and _subset_variant(it, ds)["id"] not in exclude), None)
        if not v:
            continue
        (repeats if it["id"] in dealt_bases else fresh).append(v)
    rng.shuffle(fresh)
    rng.shuffle(repeats)
    def rank(i):
        return (0 if (prefer_prefix and i["id"].startswith(prefer_prefix)) else 1,
                0 if (prefer_topics and i.get("topic") in set(prefer_topics)) else 1)
    fresh.sort(key=rank)
    out = fresh[:n]
    if len(out) < n:
        out += repeats[: n - len(out)]
    out.sort(key=lambda i: (int(i.get("level") or 1), rng.random()))
    return out


def _deal(conn, user_id: str, game_id: str, board: Optional[str], seed: int, n: int, exclude: set) -> list:
    topics = _topics_for(conn, user_id, game_id, board)
    if game_id in SUBSET_GAMES:
        return _deal_subsets(topics, seed, n, exclude, SUBSET_GAMES[game_id], GAME_META[game_id].get("topics_bias"),
                             GAME_META[game_id].get("prefer_prefix"))
    expressions_only = game_id == "code_slingshot" and unlocks.drill_backed_count(conn, user_id) < 10
    return pick(topics, seed, n, exclude, expressions_only=expressions_only, kinds=GAME_META[game_id]["kinds"],
                prefer_topics=GAME_META[game_id].get("topics_bias"))


@router.post("/session/start")
def start_session(body: StartBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    if body.game_id not in GAME_META:
        raise HTTPException(status_code=404, detail="Unknown game")
    conn = _conn(db)
    try:
        unlocks.evaluate(conn, user_id)
        have = unlocks.unlocked_keys(conn, user_id)
        if f"game:{body.game_id}" not in have:
            raise HTTPException(status_code=403, detail="Game is locked. Keep learning to unlock it.")
        board = body.board if body.game_id == "snakes_ladders" else None
        if body.game_id == "snakes_ladders":
            if board not in unlocks.BOARDS:
                raise HTTPException(status_code=400, detail="Pick a board")
            if f"board:{board}" not in have:
                raise HTTPException(status_code=403, detail="Board is locked")
        n = GAME_META[body.game_id]["n"]
        seed = int(time.time() * 1000) & 0xFFFFFFFF
        items = _deal(conn, user_id, body.game_id, board, seed, n, set())
        if body.game_id in SUBSET_GAMES:
            distinct = len({i["source_id"] for i in items})
            if distinct < MIN_POOL:
                items = []
        if len(items) < MIN_POOL:
            raise HTTPException(status_code=409, detail={"code": "needs_content", "message": "Not enough questions for what you have learned yet.",
                                                         "next_lesson": _next_lesson(conn, user_id)})
        sid = uuid.uuid4().hex
        conn.execute("INSERT INTO arcade_sessions (id, user_id, game_id, board, seed, questions_json) VALUES (?, ?, ?, ?, ?, ?)",
                     [sid, user_id, body.game_id, board, seed, json.dumps([i["id"] for i in items])])
        conn.commit()
        return {"session_id": sid, "game_id": body.game_id, "board": board, "seed": seed,
                "items": [engine.public_item(i) for i in items]}
    finally:
        conn.close()


def _session_or_error(conn, session_id: str, user_id: str):
    row = conn.execute("SELECT * FROM arcade_sessions WHERE id = ?", [session_id]).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown session")
    if row["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return row


def _item_index(ids: list) -> dict:
    from arcade.pools import _choice_items
    wanted = set(ids)
    bases = {}
    for vid in wanted:
        if "~v" in vid:
            bases.setdefault(vid.rsplit("~v", 1)[0], []).append(vid)
    out = {}
    for i in _choice_items():
        if i["id"] in wanted:
            out[i["id"]] = i
        for vid in bases.get(i["id"], []):
            try:
                ds = tuple(int(x) for x in vid.rsplit("~v", 1)[1].split("-"))
            except ValueError:
                continue
            v = _subset_variant(i, ds)
            if v:
                out[vid] = v
    return out


@router.post("/session/questions")
def more_questions(body: QuestionsBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        row = _session_or_error(conn, body.session_id, user_id)
        if row["finished_at"]:
            raise HTTPException(status_code=409, detail="Session already finished")
        dealt = json.loads(row["questions_json"])
        n = GAME_META[row["game_id"]]["n"]
        items = _deal(conn, user_id, row["game_id"], row["board"], row["seed"] + len(dealt), n, set(dealt))
        conn.execute("UPDATE arcade_sessions SET questions_json = ? WHERE id = ?", [json.dumps(dealt + [i["id"] for i in items]), row["id"]])
        conn.commit()
        return {"items": [engine.public_item(i) for i in items]}
    finally:
        conn.close()


@router.post("/session/answer")
def answer_item(body: AnswerBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        row = _session_or_error(conn, body.session_id, user_id)
        if row["finished_at"]:
            raise HTTPException(status_code=409, detail="Session already finished")
        dealt = json.loads(row["questions_json"])
        if body.item_id not in dealt:
            raise HTTPException(status_code=404, detail="Item is not part of this session")
        conn.execute("BEGIN IMMEDIATE")      # serialize the read-modify-write of the session's JSON columns
        row = conn.execute("SELECT * FROM arcade_sessions WHERE id = ?", [row["id"]]).fetchone()
        reveals = json.loads(row["reveals_json"] or "{}")
        if body.item_id in reveals:
            conn.commit()
            return reveals[body.item_id]
        item = _item_index([body.item_id]).get(body.item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item is not part of this session")
        score, max_score = engine.score_item(item, body.response)
        base = _base_of(item["id"])
        repeat = item.get("source_id") is not None and any(_base_of(k) == base for k in reveals)
        if repeat:
            score, max_score = 0, 0          # the answer was already revealed once this session
        entry = {"id": item["id"], "topic": item["topic"], "correct": max_score > 0 and score == max_score, "score": score, "max": max_score,
                 "answer": item.get("answer"), "why": item.get("why", ""), "lesson_id": item.get("lesson_id", ""),
                 "misconception": None if score == max_score else item.get("misconception"), "repeat": repeat}
        responses = json.loads(row["responses_json"] or "{}")
        item_ms = json.loads(row["item_ms_json"] or "{}")
        responses[body.item_id] = body.response
        item_ms[body.item_id] = float(body.ms) if body.ms is not None else 0.0   # no timing → below the human floor
        reveals[body.item_id] = entry
        conn.execute("UPDATE arcade_sessions SET responses_json = ?, item_ms_json = ?, reveals_json = ? WHERE id = ?",
                     [json.dumps(responses), json.dumps(item_ms), json.dumps(reveals), row["id"]])
        conn.commit()
        return entry
    finally:
        conn.close()


@router.post("/session/finish")
def finish_session(body: FinishBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        row = _session_or_error(conn, body.session_id, user_id)
        if row["result_json"]:
            return json.loads(row["result_json"])
        claimed = conn.execute("UPDATE arcade_sessions SET finished_at = CURRENT_TIMESTAMP WHERE id = ? AND finished_at IS NULL", [row["id"]])
        conn.commit()
        if claimed.rowcount == 0:
            for _ in range(50):
                time.sleep(0.1)
                done = conn.execute("SELECT result_json FROM arcade_sessions WHERE id = ?", [row["id"]]).fetchone()
                if done and done["result_json"]:
                    return json.loads(done["result_json"])
            raise HTTPException(status_code=409, detail="Session is still being scored, try again")
        try:
            reveals = json.loads(row["reveals_json"] or "{}")
            item_ms = json.loads(row["item_ms_json"] or "{}")
            answered = sum(1 for r in reveals.values() if r.get("max", 1) > 0)
            correct = sum(1 for r in reveals.values() if r["correct"])
            points = sum(r["score"] for r in reveals.values())
            max_points = sum(r["max"] for r in reveals.values())
            accuracy = (points / max_points) if max_points else 0.0
            conn.execute("BEGIN IMMEDIATE")    # cap read + award in one transaction
            prior_cap = today_xp(conn, user_id, "game")
            dealt = GAME_META[row["game_id"]]["n"]
            raw = engine.xp_for(points, max_points, engine.median_ms(item_ms), prior_cap) if answered else 0
            # XP scales with how much of a session was really played: one lucky answer is a sliver, not 25 XP.
            xp = int(round(raw * min(1.0, answered / dealt))) if raw else 0
            if raw and xp == 0:
                xp = 1
            xp_capped = bool(answered and accuracy >= engine.XP_MIN_ACCURACY and prior_cap + xp >= engine.XP_DAILY_CAP)
            prev_best = conn.execute("SELECT MAX(score) FROM arcade_sessions WHERE user_id = ? AND game_id = ? AND finished_at IS NOT NULL AND id != ?",
                                     [user_id, row["game_id"], row["id"]]).fetchone()[0] or 0
            score = max(0, int(body.score or 0))
            by_topic = {}
            for r in reveals.values():
                by_topic[r["topic"]] = by_topic.get(r["topic"], 0.0) + (MASTERY_PER_CORRECT if r["correct"] else MASTERY_PER_WRONG)
            result = {"session_id": row["id"], "game_id": row["game_id"], "board": row["board"], "score": score,
                      "answered": answered, "correct": correct, "accuracy": round(accuracy, 3),
                      "xp": 0, "xp_capped": xp_capped, "best": score > prev_best and answered > 0,
                      "reveal": [reveals[k] for k in json.loads(row["questions_json"]) if k in reveals],
                      "topics": {"strengthened": sorted(t for t, d in by_topic.items() if d > 0),
                                 "revisit": sorted(t for t, d in by_topic.items() if d <= 0)}}
            awarded = award_xp(conn, user_id, xp, "game", row["id"]) if xp else 0
            result["xp"] = awarded
            if answered and accuracy >= engine.XP_MIN_ACCURACY:
                touch_streak(conn, user_id)
            conn.execute("UPDATE arcade_sessions SET score = ?, correct = ?, answered = ?, xp = ?, result_json = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
                         [score, correct, answered, awarded, json.dumps(result), row["id"]])
            conn.commit()
        except Exception:
            # release the claim so a retry can finish the session instead of waiting on a result that never comes
            try:
                conn.rollback()
            except Exception:
                pass
            conn.execute("UPDATE arcade_sessions SET finished_at = NULL WHERE id = ? AND result_json IS NULL", [row["id"]])
            conn.commit()
            raise
    finally:
        conn.close()
    try:
        record_signal(db, user_id=user_id, signal_type="arcade_session", topic=row["game_id"],
                      value={"board": row["board"], "score": score, "answered": answered, "correct": correct,
                             "items": [{"id": r["id"], "topic": r["topic"], "correct": r["correct"], "misconception": r["misconception"],
                                        "ms": item_ms.get(r["id"])} for r in reveals.values()],
                             "stats": body.stats or {}})
        for topic, delta in by_topic.items():
            nudge_mastery(db, user_id, topic, max(-MASTERY_BOUND, min(MASTERY_BOUND, delta)))
    except Exception as exc:  # never fail the learner's result over bookkeeping
        print(f"[arcade] post-session bookkeeping failed: {exc}")
    return result
