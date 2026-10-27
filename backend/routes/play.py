"""Learn While You Play — round lifecycle, catalog, stats.

Scoring is server-side: bank answer keys never leave the server and simulation
games are re-simulated in Python. One `game_round` learning signal per round feeds
the adaptive tutor; mastery is nudged without counting an attempt; XP goes through
the deduplicated `progress.award_xp` so a retried /finish never double-pays.
"""
import json
import os
import sqlite3
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from access import assert_learning_access
from auth import get_current_user_id
from games import catalog, engine
from progress import award_xp, today_xp
from routes.review import LEARNED_THRESHOLD, REVIEW_THRESHOLD, _days_since, _estimated_recall
from streaks import touch_streak
from vaathiyaar.profiler import get_mastery_map, nudge_mastery, record_signal

router = APIRouter(prefix="/api/play", tags=["play"])

MASTERY_PER_CORRECT = 0.03
MASTERY_PER_WRONG = -0.02
MASTERY_ROUND_BOUND = 0.10
RECENT_ROUNDS_EXCLUDED = 3
MAX_RECOMMENDATIONS = 3


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_tables(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS game_rounds ("
            " id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'practice',"
            " level INTEGER NOT NULL, seed INTEGER NOT NULL, item_ids TEXT NOT NULL, items INTEGER NOT NULL,"
            " correct INTEGER, score INTEGER, max_score INTEGER, xp INTEGER, duration_s REAL,"
            " concepts_json TEXT, result_json TEXT,"
            " created_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT)"
        )
        for col in ("responses_json TEXT", "item_ms_json TEXT", "reveals_json TEXT"):
            try:
                conn.execute(f"ALTER TABLE game_rounds ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass  # already there
        conn.execute("CREATE INDEX IF NOT EXISTS idx_game_rounds_user_game ON game_rounds(user_id, game_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_game_rounds_user_day ON game_rounds(user_id, created_at)")
        conn.commit()
    finally:
        conn.close()


def _guard(user_id: str) -> str:
    if os.getenv("PLAY_ENABLED", "1") == "0":
        raise HTTPException(status_code=503, detail="Play is paused")
    assert_learning_access(_db_path(), user_id)
    return _db_path()


def _conn(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _game_or_404(game_id: str) -> dict:
    game = catalog.GAMES.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Unknown game")
    return game


def _items_for(game: dict, level: int, seed: int, exclude: set) -> list:
    if game["kind"] == "sim":
        from importlib import import_module
        return import_module(f"games.sims.{game['id']}").pick_items(level, seed, game["items_per_round"])
    return engine.pick_items(game["id"], level, seed, exclude, game["items_per_round"])


def _daily_done(conn, user_id: str, game_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM game_rounds WHERE user_id = ? AND game_id = ? AND mode = 'daily' "
        "AND finished_at IS NOT NULL AND date(created_at) = date('now') LIMIT 1", [user_id, game_id]).fetchone()
    return row is not None


class StartBody(BaseModel):
    game_id: str
    level: Optional[int] = None
    mode: Optional[str] = "practice"


class FinishBody(BaseModel):
    round_id: str
    responses: dict = {}
    item_ms: dict = {}
    sim: Optional[dict] = None


class AnswerBody(BaseModel):
    round_id: str
    item_id: str
    response: object = None
    ms: Optional[float] = None
    sim_hole: Optional[dict] = None   # {hole_id, swings, seed} for simulation games


@router.post("/round/start")
def start_round(body: StartBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    game = _game_or_404(body.game_id)
    mode = "daily" if body.mode == "daily" else "practice"
    conn = _conn(db)
    try:
        if mode == "daily":
            if _daily_done(conn, user_id, game["id"]):
                raise HTTPException(status_code=409, detail="Today's daily challenge is already done")
            level = min(3, max(1, int(body.level or 2)))
            seed = engine.daily_seed(game["id"], date.today())
            exclude = set()
        else:
            if body.level:
                level = min(game["levels"], max(1, int(body.level)))
            else:
                level = engine.start_level(get_mastery_map(db, user_id), game["topics"])
            seed = uuid.uuid4().int & 0x7FFFFFFF
            rows = conn.execute(
                "SELECT item_ids FROM game_rounds WHERE user_id = ? AND game_id = ? AND mode = 'practice' "
                "AND finished_at IS NOT NULL ORDER BY created_at DESC LIMIT ?",
                [user_id, game["id"], RECENT_ROUNDS_EXCLUDED]).fetchall()
            exclude = {i for r in rows for i in json.loads(r["item_ids"] or "[]")}
        items = _items_for(game, level, seed, exclude)
        if not items:
            raise HTTPException(status_code=503, detail="No content available for this game yet")
        round_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO game_rounds (id, user_id, game_id, mode, level, seed, item_ids, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [round_id, user_id, game["id"], mode, level, seed, json.dumps([i["id"] for i in items]), len(items)])
        conn.commit()
    finally:
        conn.close()
    return {"round_id": round_id, "game_id": game["id"], "mode": mode, "level": level, "seed": seed,
            "items": [engine.public_item(i) for i in items]}


def _load_items(game: dict, item_ids: list, level: int, seed: int) -> list:
    if game["kind"] == "sim":
        from importlib import import_module
        return import_module(f"games.sims.{game['id']}").items_by_id(item_ids, level, seed)
    bank = {i["id"]: i for i in engine.load_bank(game["id"])}
    return [bank[i] for i in item_ids if i in bank]


def _reveal_entry(item: dict, scored: dict) -> dict:
    return {"id": item["id"], "topic": item["topic"], "correct": scored["correct"], "score": scored["score"], "max": scored["max"],
            "answer": item.get("answer"), "why": item.get("why", ""), "lesson_id": item.get("lesson_id", ""),
            "misconception": scored.get("misconception")}


@router.post("/round/answer")
def answer_item(body: AnswerBody, user_id: str = Depends(get_current_user_id)):
    """Grade one item immediately so the learner sees the answer and the why right away.

    The response is stored server-side; /finish uses the stored responses, so a reveal
    can never be followed by a changed answer.
    """
    db = _guard(user_id)
    conn = _conn(db)
    try:
        row = conn.execute("SELECT * FROM game_rounds WHERE id = ?", [body.round_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Unknown round")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if row["finished_at"]:
            raise HTTPException(status_code=409, detail="Round already finished")
        item_ids = json.loads(row["item_ids"])
        if body.item_id not in item_ids:
            raise HTTPException(status_code=404, detail="Item is not part of this round")
        reveals = json.loads(row["reveals_json"] or "{}")
        if body.item_id in reveals:
            return reveals[body.item_id]
        game = _game_or_404(row["game_id"])
        items = _load_items(game, [body.item_id], row["level"], row["seed"])
        if not items:
            raise HTTPException(status_code=404, detail="Item is not part of this round")
        item = items[0]
        sim = {"holes": [body.sim_hole]} if (game["kind"] == "sim" and body.sim_hole) else None
        scored = engine.score_round([item], {body.item_id: body.response}, level=row["level"], sim=sim, game_id=game["id"])
        entry = _reveal_entry(item, scored["per_item"][0])
        responses = json.loads(row["responses_json"] or "{}")
        item_ms = json.loads(row["item_ms_json"] or "{}")
        responses[body.item_id] = body.sim_hole if sim else body.response
        if body.ms is not None:
            item_ms[body.item_id] = float(body.ms)
        reveals[body.item_id] = entry
        conn.execute("UPDATE game_rounds SET responses_json = ?, item_ms_json = ?, reveals_json = ? WHERE id = ?",
                     [json.dumps(responses), json.dumps(item_ms), json.dumps(reveals), row["id"]])
        conn.commit()
        return entry
    finally:
        conn.close()


@router.post("/round/finish")
def finish_round(body: FinishBody, user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        row = conn.execute("SELECT * FROM game_rounds WHERE id = ?", [body.round_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Unknown round")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if row["finished_at"] and row["result_json"]:
            return json.loads(row["result_json"])
        game = _game_or_404(row["game_id"])
        items = _load_items(game, json.loads(row["item_ids"]), row["level"], row["seed"])
        # Stored (already revealed) responses take precedence over whatever the client sends now.
        stored = json.loads(row["responses_json"] or "{}")
        stored_ms = json.loads(row["item_ms_json"] or "{}")
        if game["kind"] == "sim":
            holes = {h.get("hole_id"): h for h in ((body.sim or {}).get("holes") or []) if isinstance(h, dict)}
            holes.update({k: v for k, v in stored.items() if isinstance(v, dict)})
            sim_payload = {"holes": list(holes.values())}
            responses = {}
        else:
            sim_payload = None
            responses = {**(body.responses or {}), **stored}
        item_ms = {**(body.item_ms or {}), **stored_ms}
        scored = engine.score_round(items, responses, level=row["level"], sim=sim_payload, game_id=game["id"])
        accuracy = (scored["score"] / scored["max_score"]) if scored["max_score"] else 0.0
        med = engine.median_ms(item_ms)
        duration_s = sum(float(v) for v in item_ms.values() if isinstance(v, (int, float))) / 1000.0
        xp = 0 if game.get("score_only") else engine.xp_for(scored["score"], scored["max_score"], med, today_xp(conn, user_id, "game"))
        xp_capped = (not game.get("score_only")) and accuracy >= engine.XP_MIN_ACCURACY and (med is None or med >= engine.HUMAN_FLOOR_MS) \
            and xp < round(5 + 20 * accuracy)

        # ── side effects, once ──
        by_topic = {}
        for p in scored["per_item"]:
            by_topic[p["topic"]] = by_topic.get(p["topic"], 0.0) + (MASTERY_PER_CORRECT if p["correct"] else MASTERY_PER_WRONG)
        key_by_id = {i["id"]: i for i in items}
        reveal = []
        for p in scored["per_item"]:
            it = key_by_id.get(p["id"], {})
            reveal.append({"id": p["id"], "correct": p["correct"], "answer": it.get("answer"), "why": it.get("why", ""),
                           "lesson_id": it.get("lesson_id", ""), "misconception": p["misconception"], "topic": p["topic"]})
        result = {
            "round_id": row["id"], "game_id": game["id"], "mode": row["mode"], "level": row["level"],
            "score": scored["score"], "max_score": scored["max_score"], "correct": scored["correct"],
            "accuracy": round(accuracy, 3), "xp": xp, "xp_capped": bool(xp_capped),
            "next_level": engine.next_level(row["level"], accuracy), "reveal": reveal,
            "topics": {"strengthened": sorted(t for t, d in by_topic.items() if d > 0),
                       "revisit": sorted(t for t, d in by_topic.items() if d <= 0)},
        }
        awarded = award_xp(conn, user_id, xp, "game", row["id"])
        result["xp"] = awarded if xp else 0
        if accuracy >= engine.XP_MIN_ACCURACY:
            touch_streak(conn, user_id)
        conn.execute(
            "UPDATE game_rounds SET correct = ?, score = ?, max_score = ?, xp = ?, duration_s = ?, concepts_json = ?, "
            "result_json = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            [scored["correct"], scored["score"], scored["max_score"], result["xp"], duration_s,
             json.dumps(sorted(by_topic)), json.dumps(result), row["id"]])
        conn.commit()
    finally:
        conn.close()
    try:
        record_signal(db, user_id=user_id, signal_type="game_round", topic=game["id"],
                      value={"level": row["level"], "mode": row["mode"], "score": scored["score"], "max_score": scored["max_score"],
                             "items": [{"id": p["id"], "topic": p["topic"], "correct": p["correct"], "misconception": p["misconception"],
                                        "ms": item_ms.get(p["id"])} for p in scored["per_item"]]})
        for topic, delta in by_topic.items():
            nudge_mastery(db, user_id, topic, max(-MASTERY_ROUND_BOUND, min(MASTERY_ROUND_BOUND, delta)))
    except Exception as exc:  # never fail the learner's result over bookkeeping
        print(f"[play] post-round bookkeeping failed: {exc}")
    return result


def _recommendations(conn, user_id: str) -> list:
    recs, used_games = [], set()
    rows = conn.execute("SELECT topic, mastery_level, attempts, struggle_count, last_practiced FROM user_mastery WHERE user_id = ?",
                        [user_id]).fetchall()
    topic_to_game = {}
    for g in catalog.GAMES.values():
        for t in g["topics"]:
            topic_to_game.setdefault(t, g["id"])
    weak = sorted((r for r in rows if (r["mastery_level"] or 0) < 0.5 and (r["attempts"] or 0) >= 2),
                  key=lambda r: r["mastery_level"] or 0)
    for r in weak:
        gid = topic_to_game.get(r["topic"])
        if gid and gid not in used_games:
            recs.append({"game_id": gid, "level": 1, "topic": r["topic"], "reason": f"You struggled with {r['topic']} in Classroom"})
            used_games.add(gid)
        if len(recs) >= MAX_RECOMMENDATIONS:
            return recs
    now = datetime.now(timezone.utc)
    due = []
    for r in rows:
        m = r["mastery_level"] or 0.0
        if m < LEARNED_THRESHOLD:
            continue
        recall = _estimated_recall(m, r["attempts"] or 1, r["struggle_count"] or 0, _days_since(r["last_practiced"], now))
        if recall < REVIEW_THRESHOLD:
            due.append((recall, r["topic"]))
    for _, topic in sorted(due):
        gid = topic_to_game.get(topic)
        if gid and gid not in used_games:
            recs.append({"game_id": gid, "level": 2, "topic": topic, "reason": "Due for review"})
            used_games.add(gid)
        if len(recs) >= MAX_RECOMMENDATIONS:
            break
    return recs


@router.get("/catalog")
def play_catalog(user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        mastery = get_mastery_map(db, user_id)
        stats = {r["game_id"]: r for r in conn.execute(
            "SELECT game_id, MAX(score) AS best_score, MAX(level) AS best_level, COUNT(*) AS rounds, MAX(finished_at) AS last_played "
            "FROM game_rounds WHERE user_id = ? AND finished_at IS NOT NULL GROUP BY game_id", [user_id]).fetchall()}
        games = []
        for g in catalog.GAMES.values():
            s = stats.get(g["id"])
            games.append({**{k: v for k, v in g.items() if k != "bank"},
                          "best_score": s["best_score"] if s else None, "best_level": s["best_level"] if s else None,
                          "rounds": s["rounds"] if s else 0, "last_played": s["last_played"] if s else None,
                          "suggested_level": engine.start_level(mastery, g["topics"]),
                          "daily_done": _daily_done(conn, user_id, g["id"])})
        return {"enabled": True, "games": games, "recommendations": _recommendations(conn, user_id),
                "today_xp": today_xp(conn, user_id, "game"), "xp_cap": engine.XP_DAILY_CAP}
    finally:
        conn.close()


@router.get("/stats")
def play_stats(user_id: str = Depends(get_current_user_id)):
    db = _guard(user_id)
    conn = _conn(db)
    try:
        rows = conn.execute(
            "SELECT game_id, score, result_json, date(created_at) AS day FROM game_rounds WHERE user_id = ? "
            "AND finished_at IS NOT NULL AND created_at > datetime('now', '-30 days') ORDER BY created_at DESC", [user_id]).fetchall()
    finally:
        conn.close()
    acc, best, days = {}, {}, set()
    for r in rows:
        days.add(r["day"])
        best[r["game_id"]] = max(best.get(r["game_id"], 0), r["score"] or 0)
        for p in (json.loads(r["result_json"] or "{}").get("reveal") or []):
            a = acc.setdefault(p["topic"], {"correct": 0, "total": 0})
            a["total"] += 1
            a["correct"] += 1 if p["correct"] else 0
    streak, d = 0, date.today()
    while d.isoformat() in days:
        streak += 1
        d = date.fromordinal(d.toordinal() - 1)
    return {"rounds_30d": len(rows), "accuracy_by_topic": acc, "play_days_streak": streak, "best": best}
