"""Bug Hunt bank: the buggy snippet must fail its test, the right fix must pass, the
other two fixes must still fail — all checked against the real interpreter."""
import json
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games.build_banks import apply_fix, runs_clean  # noqa: E402

BANK = Path(__file__).parent.parent / "games" / "banks" / "bug_hunt.json"
LESSONS = Path(__file__).parent.parent / "lessons"


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists(), "run: python backend/games/build_banks.py bug_hunt"
    return json.loads(BANK.read_text(encoding="utf-8"))


def test_bank_shape_and_coverage(bank):
    per_level = Counter(int(i["level"]) for i in bank)
    assert set(per_level) == {1, 2, 3, 4, 5, 6} and all(per_level[lv] >= 15 for lv in per_level), per_level
    assert len({i["id"] for i in bank}) == len(bank)
    for item in bank:
        assert item["kind"] == "line_then_choice"
        assert item["prompt"]["code"] and item["prompt"]["test"]
        assert len(item["choices"]) == 3
        line, choice = item["answer"]
        assert 0 <= line < len(item["prompt"]["code"].split("\n")) and 0 <= choice < 3
        assert len(item["why"]) >= 20 and item["misconception"]
        assert any(LESSONS.glob(f"*/{item['lesson_id']}.json")), item["lesson_id"]


def test_bank_items_reverify(bank):
    failures = []
    for item in bank:
        code, test = item["prompt"]["code"], item["prompt"]["test"]
        line, choice = item["answer"]
        if runs_clean(code, test):
            failures.append((item["id"], "buggy code passes its test"))
        for k, fix in enumerate(item["choices"]):
            ok = runs_clean(apply_fix(code, line, fix), test)
            if k == choice and not ok:
                failures.append((item["id"], "correct fix does not pass"))
            if k != choice and ok:
                failures.append((item["id"], f"distractor {k} also passes"))
    assert not failures, failures[:10]
