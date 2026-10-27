"""Gradient Golf re-simulator: same maths as frontend/src/games/gradient-golf/levels.js.

The golden file pins fixed-seed runs so JS and Python cannot drift apart silently.
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games import engine  # noqa: E402
from games.sims import gradient_golf as gg  # noqa: E402
from games.sims.rng import mulberry32  # noqa: E402

GOLDEN = Path(__file__).parent.parent / "games" / "sims" / "golden" / "gradient_golf.json"


def test_mulberry32_matches_js_reference():
    r = mulberry32(7)
    assert [r(), r(), r()] == pytest.approx([0.011704753153026104, 0.06195825757458806, 0.97690763277933], rel=0, abs=1e-15)


def test_hole_table_has_nine_holes_across_levels():
    assert len(gg.HOLES) == 9
    assert {h["level"] for h in gg.HOLES} == {1, 2, 3, 4, 5, 6}
    for h in gg.HOLES:
        assert h["tol"] > 0 and h["max_swings"] >= 3 and "min" in h["params"]


def test_quad_converges_with_good_lr():
    hole = gg.hole_by_id("quad_a1")
    out = gg.simulate(hole, [{"lr": 0.5, "steps": 10}], seed=7)
    assert out["converged"] is True and out["diverged"] is False
    assert abs(out["final"][0] - hole["params"]["min"][0]) <= hole["tol"]
    assert len(out["path"]) == 11  # start + 10 steps


def test_quad_diverges_lr_over_2():
    hole = gg.hole_by_id("quad_a1")
    out = gg.simulate(hole, [{"lr": 2.2, "steps": 30}], seed=7)
    assert out["diverged"] is True and out["converged"] is False


def test_double_well_start_near_local_min_gets_stuck_with_small_lr():
    hole = gg.hole_by_id("double_well")
    out = gg.simulate(hole, [{"lr": 0.05, "steps": 60}], seed=7)
    assert out["converged"] is False and out["diverged"] is False
    assert abs(out["final"][0] - hole["params"]["local"][0]) < 0.1
    bold = gg.simulate(hole, [{"lr": 0.2, "steps": 40}], seed=7)
    assert bold["converged"] is True


def test_golden_matches():
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert len(golden["cases"]) == 9
    for case in golden["cases"]:
        hole = gg.hole_by_id(case["hole_id"])
        out = gg.simulate(hole, case["swings"], seed=case["seed"])
        assert out["converged"] == case["converged"] and out["diverged"] == case["diverged"], case["hole_id"]
        for got, want in zip(out["final"], case["final"]):
            assert got == pytest.approx(want, rel=1e-9, abs=1e-12), case["hole_id"]


def test_pick_items_and_items_by_id_round_trip():
    items = gg.pick_items(level=1, seed=123, n=3)
    assert len(items) == 3 and all(it["level"] in (1, 2) for it in items)
    assert all("hole" in it and "seed" in it and "answer" in it and "why" in it and "lesson_id" in it for it in items)
    again = gg.items_by_id([it["id"] for it in items], level=1, seed=123)
    assert [a["seed"] for a in again] == [it["seed"] for it in items]
    pub = engine.public_item(items[0])
    assert "hole" in pub and "answer" not in pub and "why" not in pub


def test_score_round_dispatches_sim():
    items = gg.items_by_id(["quad_a1", "quad_a2", "quad_a3"], level=1, seed=5)
    sim = {"holes": [
        {"hole_id": "quad_a1", "swings": [{"lr": 0.5, "steps": 10}]},                  # sinks in 1 swing → 6 pts
        {"hole_id": "quad_a2", "swings": [{"lr": 0.001, "steps": 2}] * 6},              # never gets there → 0, lr_too_low
        {"hole_id": "quad_a3", "swings": [{"lr": 3.0, "steps": 5}]},                    # diverges → 0, lr_too_high
    ]}
    r = engine.score_round(items, {}, level=1, sim=sim, game_id="gradient_golf")
    per = {p["id"]: p for p in r["per_item"]}
    assert per["quad_a1"]["correct"] and per["quad_a1"]["score"] == 6 and per["quad_a1"]["max"] == 6
    assert per["quad_a2"]["misconception"] == "lr_too_low" and per["quad_a2"]["score"] == 0
    assert per["quad_a3"]["misconception"] == "lr_too_high"
    assert r["max_score"] == 18 and r["score"] == 6
    # tampering: a hole the round did not contain is ignored; missing holes score 0
    r2 = engine.score_round(items, {}, level=1, sim={"holes": [{"hole_id": "noisy", "swings": [{"lr": 0.5, "steps": 10}]}]},
                            game_id="gradient_golf")
    assert r2["score"] == 0 and len(r2["per_item"]) == 3


def test_unplayed_hole_is_not_attempted_not_a_misconception():
    items = gg.items_by_id(["quad_a1", "quad_a2"], level=1, seed=5)
    r = engine.score_round(items, {}, level=1, sim={"holes": [{"hole_id": "quad_a1", "swings": [{"lr": 0.5, "steps": 10}]}]},
                           game_id="gradient_golf")
    per = {p["id"]: p for p in r["per_item"]}
    assert per["quad_a2"]["misconception"] == "not_attempted" and per["quad_a2"]["score"] == 0


def test_non_numeric_payload_scores_zero_instead_of_crashing():
    items = gg.items_by_id(["quad_a1"], level=1, seed=5)
    sim = {"holes": [{"hole_id": "quad_a1", "swings": [{"lr": "fast", "steps": "many"}]}]}
    r = engine.score_round(items, {}, level=1, sim=sim, game_id="gradient_golf")
    assert r["score"] == 0 and r["per_item"][0]["misconception"] == "not_attempted"
