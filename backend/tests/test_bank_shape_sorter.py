"""Shape Sorter bank is hand-authored: validate its shape and the facts it teaches."""
import json
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BANK = Path(__file__).parent.parent / "games" / "banks" / "shape_sorter.json"
LESSONS = Path(__file__).parent.parent / "lessons"
BINS_BY_LEVEL = {
    1: ["list", "tuple", "set", "dict"], 2: ["list", "tuple", "set", "dict"],
    3: ["list", "tuple", "set", "dict", "frozenset", "deque"], 4: ["list", "tuple", "set", "dict", "frozenset", "deque"],
    5: ["list.append", "list.insert(0)", "set.add", "dict.get", "deque.appendleft", "in list", "in set"],
    6: ["list.append", "list.insert(0)", "set.add", "dict.get", "deque.appendleft", "in list", "in set"],
}


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists()
    return json.loads(BANK.read_text(encoding="utf-8"))


def test_bank_shape_and_coverage(bank):
    per_level = Counter(int(i["level"]) for i in bank)
    assert set(per_level) == {1, 2, 3, 4, 5, 6} and all(per_level[lv] >= 12 for lv in per_level), per_level
    assert len({i["id"] for i in bank}) == len(bank)
    assert len({i["prompt"]["text"] for i in bank}) == len(bank), "duplicate cards"
    for item in bank:
        assert item["kind"] == "bin"
        assert item["choices"] == BINS_BY_LEVEL[item["level"]], item["id"]
        assert item["answer"] in item["choices"], item["id"]
        assert len(item["why"]) >= 20 and item["misconception"] and item["topic"]
        assert any(LESSONS.glob(f"*/{item['lesson_id']}.json")), item["lesson_id"]


def test_each_bin_is_an_answer_at_least_twice_per_level_band(bank):
    for band in ((1, 2), (3, 4), (5, 6)):
        answers = Counter(i["answer"] for i in bank if i["level"] in band)
        for b in BINS_BY_LEVEL[band[0]]:
            assert answers[b] >= 2, (band, b, answers)
