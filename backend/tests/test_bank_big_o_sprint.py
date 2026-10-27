"""Big-O Sprint bank: complexity labels plus measured operation counts (instrumented runs)."""
import json
import os
import sys
from collections import Counter
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games.build_banks import count_ops  # noqa: E402

BANK = Path(__file__).parent.parent / "games" / "banks" / "big_o_sprint.json"
LESSONS = Path(__file__).parent.parent / "lessons"
LABELS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"]


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists(), "run: python backend/games/build_banks.py big_o_sprint"
    return json.loads(BANK.read_text(encoding="utf-8"))


def test_bank_shape_and_coverage(bank):
    per_level = Counter(int(i["level"]) for i in bank)
    assert set(per_level) == {1, 2, 3, 4, 5, 6} and all(per_level[lv] >= 12 for lv in per_level), per_level
    assert len({i["id"] for i in bank}) == len(bank)
    for item in bank:
        assert item["kind"] == "choice" and item["choices"] == LABELS, item["id"]
        assert 0 <= item["answer"] < 6 and item["prompt"]["code"]
        assert set(item["counts"]) == {"10", "100", "1000"}, item["id"]
        assert len(item["why"]) >= 20 and item["misconception"] and item["topic"]
        assert any(LESSONS.glob(f"*/{item['lesson_id']}.json")), item["lesson_id"]


def test_counts_grow_consistently_with_the_label(bank):
    """Measured counts must scale like the labelled class (ratio 100→1000 within a band)."""
    bad = []
    for item in bank:
        c10, c100, c1000 = (item["counts"][k] for k in ("10", "100", "1000"))
        label = item["choices"][item["answer"]]
        r = c1000 / max(c100, 1)
        ok = {"O(1)": r < 1.5, "O(log n)": 1.0 <= r < 3, "O(n)": 6 < r < 14, "O(n log n)": 12 < r < 20,
              "O(n²)": 60 < r < 140, "O(2ⁿ)": r > 1000 or c1000 == -1}[label]
        if not ok:
            bad.append((item["id"], label, c10, c100, c1000, round(r, 1)))
    assert not bad, bad[:8]


def test_sampled_items_recount_live(bank):
    """Re-instrument a deterministic sample so a stale bank cannot ship."""
    for item in sorted(bank, key=lambda i: i["id"])[::9]:
        if item["counts"]["1000"] == -1:
            continue
        assert count_ops(item["prompt"]["code"], 100) == item["counts"]["100"], item["id"]
