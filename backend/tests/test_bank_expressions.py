"""Expressions bank (Loop Runner gates): every answer is re-verified by evaluating the expression."""
import json
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BANK = Path(__file__).parent.parent / "games" / "banks" / "expressions.json"
ALLOWED_TOPICS = {"variables", "conditionals", "lists", "ds_dicts", "comprehensions", "for_loops"}
LESSONS = Path(__file__).parent.parent / "lessons"


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists(), "run: python games/build_banks.py expressions"
    return json.loads(BANK.read_text(encoding="utf-8"))


def test_size_and_topics(bank):
    assert len(bank) >= 150
    per_topic = Counter(i["topic"] for i in bank)
    assert set(per_topic) <= ALLOWED_TOPICS and all(per_topic[t] >= 15 for t in ALLOWED_TOPICS), per_topic
    assert len({i["id"] for i in bank}) == len(bank)
    assert len({i["prompt"]["code"] for i in bank}) == len(bank), "duplicate expressions"


def test_every_answer_rederives(bank):
    for it in bank:
        assert it["kind"] == "choice" and len(it["choices"]) == 4 and len(set(it["choices"])) == 4, it["id"]
        ctx = {}
        for name, literal in (it["prompt"].get("context") or {}).items():
            ctx[name] = eval(literal, {"__builtins__": {}}, {})  # noqa: S307 — our own literals
        truth = repr(eval(it["prompt"]["expr"], dict(ctx)))  # noqa: S307 — our own templates
        assert it["choices"][it["answer"]] == truth, (it["id"], it["prompt"]["expr"], truth)
        assert it["prompt"]["expr"] in it["prompt"]["code"]
        assert len(it["why"]) >= 20 and it["misconception"] and 1 <= it["level"] <= 6
        assert any(LESSONS.glob(f"*/{it['lesson_id']}.json")), it["lesson_id"]


def test_board_pools_clear_the_floor():
    from arcade import unlocks
    for fn in (unlocks._bank_items, unlocks.pool_size, unlocks.drill_backed_topics):
        fn.cache_clear()
    sizes = {k: unlocks.pool_size(k) for k in unlocks.BOARDS}
    assert all(v >= unlocks.BOARD_MIN_POOL for v in sizes.values()), sizes
