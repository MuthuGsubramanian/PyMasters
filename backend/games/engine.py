"""Deterministic item picking and server-side scoring for Play rounds.

Bank items carry their answer key; `public_item` strips it before anything
reaches the client. Simulation games (kind 'sim') are scored by re-running the
same maths in `games.sims.<game_id>`.
"""
import json
import random
import statistics
import zlib
from datetime import date
from functools import lru_cache
from importlib import import_module
from pathlib import Path

from games import catalog

BANKS_DIR = Path(__file__).parent / "banks"
XP_DAILY_CAP = 150
XP_MIN_ACCURACY = 0.4
HUMAN_FLOOR_MS = 1500
LEVEL_UP_ACCURACY = 0.8
LEVEL_DOWN_ACCURACY = 0.4
MASTERY_LEVEL_2 = 0.3
MASTERY_LEVEL_3 = 0.6
PRIVATE_FIELDS = ("answer", "why", "misconception", "lesson_id", "counts")


@lru_cache(maxsize=None)
def load_bank(game_id: str) -> list:
    name = "_fixture_bank" if game_id == "_fixture" else (catalog.GAMES.get(game_id) or {}).get("bank")
    if not name:
        return []
    path = BANKS_DIR / f"{name}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def pick_items(game_id: str, level: int, seed: int, exclude_ids: set, n: int) -> list:
    """Seeded sample of `n` items at `level`, widening to level±1 (then ±2…) when short.

    Exclusions (recently seen ids) are honoured unless they would starve the round.
    """
    bank = load_bank(game_id)
    rng = random.Random(seed)
    level = int(level)
    for spread in range(0, 6):
        pool = [i for i in bank if abs(int(i["level"]) - level) <= spread]
        fresh = [i for i in pool if i["id"] not in (exclude_ids or set())]
        candidates = fresh if len(fresh) >= n else pool
        if len(candidates) >= n or spread == 5:
            order = {i["id"]: rng.random() for i in candidates}
            candidates.sort(key=lambda i: (abs(int(i["level"]) - level), order[i["id"]]))
            return candidates[:n]
    return []


def public_item(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in PRIVATE_FIELDS}


def _norm_text(s) -> str:
    return "\n".join(line.rstrip() for line in str(s).replace("\r\n", "\n").split("\n")).strip("\n")


def score_item(item: dict, response) -> tuple:
    kind = item.get("kind")
    if kind == "line_then_choice":
        max_score = 3
        if not isinstance(response, (list, tuple)) or len(response) != 2:
            return 0, max_score
        want_line, want_choice = item["answer"]
        score = 0
        try:
            if int(response[0]) == int(want_line):
                score += 1
            if int(response[1]) == int(want_choice):
                score += 2
        except (TypeError, ValueError):
            return 0, max_score
        return score, max_score
    if response is None:
        return 0, 1
    if kind == "text":
        return (1 if _norm_text(response) == _norm_text(item["answer"]) else 0), 1
    if kind == "choice":
        try:
            return (1 if int(response) == int(item["answer"]) else 0), 1
        except (TypeError, ValueError):
            return 0, 1
    if kind == "bin":
        return (1 if str(response).strip() == str(item["answer"]).strip() else 0), 1
    return 0, 1


def score_round(items: list, responses: dict, level: int = 1, sim: dict | None = None,
                game_id: str | None = None) -> dict:
    """Score a round. Bank games use `responses` keyed by item id; sims use the `sim` payload."""
    game = catalog.GAMES.get(game_id or "", {})
    if game.get("kind") == "sim":
        per_item = import_module(f"games.sims.{game_id}").score(sim or {}, level, items)
    else:
        responses = responses or {}
        per_item = []
        for item in items:
            s, m = score_item(item, responses.get(item["id"]))
            per_item.append({"id": item["id"], "topic": item["topic"], "correct": s == m, "score": s, "max": m,
                             "misconception": None if s == m else item.get("misconception")})
    score = sum(p["score"] for p in per_item)
    max_score = sum(p["max"] for p in per_item)
    return {"score": score, "max_score": max_score,
            "correct": sum(1 for p in per_item if p["correct"]), "per_item": per_item}


def xp_for(score: int, max_score: int, median_ms: float, today_xp: int, cap: int = XP_DAILY_CAP) -> int:
    if not max_score or score / max_score < XP_MIN_ACCURACY:
        return 0
    if median_ms is not None and median_ms < HUMAN_FLOOR_MS:
        return 0
    raw = round(5 + 20 * score / max_score)
    return max(0, min(raw, cap - int(today_xp or 0)))


def median_ms(item_ms: dict) -> float | None:
    vals = [float(v) for v in (item_ms or {}).values() if isinstance(v, (int, float)) and v >= 0]
    return statistics.median(vals) if vals else None


def start_level(mastery_by_topic: dict, topics: list) -> int:
    if not topics:
        return 1
    mean = sum(float((mastery_by_topic or {}).get(t) or 0.0) for t in topics) / len(topics)
    if mean < MASTERY_LEVEL_2:
        return 1
    if mean < MASTERY_LEVEL_3:
        return 2
    return 3


def next_level(level: int, accuracy: float) -> int:
    if accuracy >= LEVEL_UP_ACCURACY:
        return min(6, int(level) + 1)
    if accuracy < LEVEL_DOWN_ACCURACY:
        return max(1, int(level) - 1)
    return int(level)


def daily_seed(game_id: str, day: date) -> int:
    return int(day.strftime("%Y%m%d")) ^ zlib.crc32(game_id.encode("utf-8"))
