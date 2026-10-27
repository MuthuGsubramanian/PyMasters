"""Deterministic picking and scoring for Play rounds (fixture bank, no real content)."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games import catalog, engine  # noqa: E402


def _items():
    return engine.load_bank("_fixture")


def test_catalog_has_six_games_with_contract_fields():
    assert set(catalog.GAMES) == {"output_oracle", "bug_hunt", "shape_sorter", "big_o_sprint", "gradient_golf", "overfit_detective"}
    for g in catalog.GAMES.values():
        assert g["kind"] in ("bank", "sim") and g["levels"] == 6 and g["topics"] and g["items_per_round"] > 0


def test_pick_items_deterministic_for_seed():
    a = engine.pick_items("_fixture", 1, seed=42, exclude_ids=set(), n=2)
    b = engine.pick_items("_fixture", 1, seed=42, exclude_ids=set(), n=2)
    assert [i["id"] for i in a] == [i["id"] for i in b]
    assert all(i["level"] == 1 for i in a) and len(a) == 2


def test_pick_items_falls_back_to_neighbour_level():
    picked = engine.pick_items("_fixture", 3, seed=1, exclude_ids=set(), n=3)
    assert len(picked) == 3 and {i["level"] for i in picked} <= {2, 3, 4}


def test_pick_items_respects_exclusions_when_possible():
    picked = engine.pick_items("_fixture", 1, seed=5, exclude_ids={"fx1"}, n=2)
    assert "fx1" not in {i["id"] for i in picked}
    # exclusions that would starve the round are ignored
    picked = engine.pick_items("_fixture", 1, seed=5, exclude_ids={"fx1", "fx2", "fx3"}, n=3)
    assert len(picked) == 3


def test_public_item_has_no_answer():
    pub = engine.public_item(_items()[0])
    assert "answer" not in pub and "why" not in pub and "misconception" not in pub and "lesson_id" not in pub
    assert pub["choices"] == ["3", "3.5", "4", "2"] and pub["prompt"]["code"]


def test_score_text_ignores_trailing_whitespace():
    item = next(i for i in _items() if i["id"] == "fx4")
    assert engine.score_item(item, "0 \n1\n2\n") == (1, 1)
    assert engine.score_item(item, "0\n1") == (0, 1)
    assert engine.score_item(item, None) == (0, 1)


def test_score_choice_and_bin():
    items = {i["id"]: i for i in _items()}
    assert engine.score_item(items["fx1"], 0) == (1, 1)
    assert engine.score_item(items["fx1"], "0") == (1, 1)
    assert engine.score_item(items["fx1"], 2) == (0, 1)
    assert engine.score_item(items["fx6"], "set") == (1, 1)
    assert engine.score_item(items["fx6"], "list") == (0, 1)


def test_score_line_then_choice_partial():
    item = next(i for i in _items() if i["id"] == "fx5")
    assert engine.score_item(item, [1, 0]) == (3, 3)
    assert engine.score_item(item, [1, 2]) == (1, 3)
    assert engine.score_item(item, [0, 0]) == (2, 3)
    assert engine.score_item(item, "garbage") == (0, 3)


def test_score_round_ignores_unknown_ids():
    items = [i for i in _items() if i["id"] in ("fx1", "fx2", "fx4")]
    r = engine.score_round(items, {"fx1": 0, "fx2": "3", "fx4": "wrong", "nope": 1})
    assert (r["score"], r["max_score"], r["correct"]) == (2, 3, 2)
    assert [p["id"] for p in r["per_item"]] == ["fx1", "fx2", "fx4"]
    wrong = r["per_item"][2]
    assert wrong["correct"] is False and wrong["misconception"] == "off_by_one" and wrong["topic"] == "for_loops"
    assert r["per_item"][0]["misconception"] is None


def test_xp_for_values():
    assert engine.xp_for(6, 6, median_ms=4000, today_xp=0) == 25
    assert engine.xp_for(3, 6, median_ms=4000, today_xp=0) == 15
    assert engine.xp_for(2, 6, median_ms=4000, today_xp=0) == 0       # below 40 % accuracy
    assert engine.xp_for(6, 6, median_ms=900, today_xp=0) == 0        # too fast to be human
    assert engine.xp_for(6, 6, median_ms=4000, today_xp=140) == 10    # daily cap 150
    assert engine.xp_for(6, 6, median_ms=4000, today_xp=150) == 0
    assert engine.xp_for(0, 0, median_ms=4000, today_xp=0) == 0


def test_start_and_next_level():
    assert engine.start_level({}, ["variables"]) == 1
    assert engine.start_level({"variables": 0.2, "lists": 0.5}, ["variables", "lists"]) == 2
    assert engine.start_level({"variables": 0.9}, ["variables", "lists"]) == 2   # missing topic counts as 0 → mean 0.45
    assert engine.start_level({"variables": 0.9, "lists": 0.7}, ["variables", "lists"]) == 3
    assert engine.next_level(3, 0.8) == 4 and engine.next_level(3, 0.39) == 2
    assert engine.next_level(6, 1.0) == 6 and engine.next_level(1, 0.0) == 1


def test_daily_seed_stable_and_distinct_per_game():
    d = date(2026, 10, 27)
    assert engine.daily_seed("output_oracle", d) == engine.daily_seed("output_oracle", d)
    assert engine.daily_seed("output_oracle", d) != engine.daily_seed("bug_hunt", d)
    assert engine.daily_seed("output_oracle", d) != engine.daily_seed("output_oracle", date(2026, 10, 28))
