"""Choice twins of free-text Output Oracle items: the correct choice is the real stdout."""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BANK = Path(__file__).parent.parent / "games" / "banks" / "arcade_choices.json"
ORACLE = Path(__file__).parent.parent / "games" / "banks" / "output_oracle.json"


@pytest.fixture(scope="module")
def bank():
    assert BANK.exists(), "run: python games/build_banks.py arcade_choices"
    return json.loads(BANK.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def oracle():
    return {i["id"]: i for i in json.loads(ORACLE.read_text(encoding="utf-8"))}


def test_twins_cover_most_free_text_items(bank, oracle):
    free = [i for i in oracle.values() if i["kind"] == "text"]
    assert len(bank) >= int(0.8 * len(free)), (len(bank), len(free))
    for it in bank:
        orig = oracle[it["source_id"]]
        assert it["id"] == "ac_" + orig["id"] and orig["kind"] == "text"
        assert it["kind"] == "choice" and len(it["choices"]) == 4 and len(set(it["choices"])) == 4
        assert it["choices"][it["answer"]] == orig["answer"], it["id"]
        assert it["topic"] == orig["topic"] and it["why"] == orig["why"] and it["lesson_id"] == orig["lesson_id"]
        assert it["prompt"]["code"] == orig["prompt"]["code"]


def test_answers_rederive_from_the_interpreter(bank):
    from games.build_banks import verify_output
    for it in bank[::6]:                          # every sixth item: a real run keeps the suite fast
        assert verify_output(it["prompt"]["code"]) == it["choices"][it["answer"]], it["id"]
