"""The shipped Output Oracle bank must re-verify against the real interpreter.

A stale or wrong answer key can never land: every item is executed here.
"""
import json
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games import engine  # noqa: E402
from vaathiyaar.execution import run_code_subprocess  # noqa: E402

BANK = Path(__file__).parent.parent / "games" / "banks" / "output_oracle.json"
LESSONS = Path(__file__).parent.parent / "lessons"


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists(), "run: python backend/games/build_banks.py output_oracle"
    return json.loads(BANK.read_text(encoding="utf-8"))


def test_bank_exists_and_covers_levels(bank):
    per_level = Counter(int(i["level"]) for i in bank)
    assert set(per_level) == {1, 2, 3, 4, 5, 6}
    assert all(per_level[lv] >= 25 for lv in range(1, 7)), per_level
    assert len({i["id"] for i in bank}) == len(bank), "duplicate ids"
    assert len({i["prompt"]["code"] for i in bank}) == len(bank), "duplicate snippets"


def test_bank_items_have_lesson_and_why(bank):
    for item in bank:
        assert item["kind"] in ("choice", "text")
        assert len(item["why"]) >= 20, item["id"]
        assert item["misconception"], item["id"]
        assert any(LESSONS.glob(f"*/{item['lesson_id']}.json")), (item["id"], item["lesson_id"])
        if item["kind"] == "choice":
            assert len(item["choices"]) == 4 and 0 <= item["answer"] < 4, item["id"]
            assert len(set(item["choices"])) == 4, (item["id"], "distractor collides with answer or another")


def test_bank_items_reverify(bank):
    failures = []
    for item in bank:
        run = run_code_subprocess(item["prompt"]["code"], timeout=5)
        if run["exit_code"] != 0:
            failures.append((item["id"], "exit", run["error"][:80]))
            continue
        expected = item["choices"][item["answer"]] if item["kind"] == "choice" else item["answer"]
        if engine._norm_text(run["output"]) != engine._norm_text(expected):
            failures.append((item["id"], "answer", run["output"][:60], expected[:60]))
    assert not failures, failures[:10]
