"""Overfit Detective re-simulator: polynomial least squares with ridge, pure Python,
bit-for-bit the same algorithm as frontend/src/games/overfit-detective/levels.js."""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from games import engine  # noqa: E402
from games.sims import overfit_detective as od  # noqa: E402

GOLDEN = Path(__file__).parent.parent / "games" / "sims" / "golden" / "overfit_detective.json"


def test_dataset_table_covers_levels():
    assert len(od.DATASETS) >= 8 and {d["level"] for d in od.DATASETS} == {1, 2, 3, 4, 5, 6}
    for d in od.DATASETS:
        assert d["n_train"] >= 8 and d["n_test"] >= 8 and d["noise"] > 0 and d["fn"] in od.TRUE_FNS


def test_make_dataset_is_seeded_and_split():
    ds = od.dataset_by_id("gentle_cubic")
    a, b = od.make_dataset(ds, 7), od.make_dataset(ds, 7)
    assert a == b
    assert len(a["train_x"]) == ds["n_train"] and len(a["test_x"]) == ds["n_test"]
    assert all(-1.0 <= x <= 1.0 for x in a["train_x"] + a["test_x"])
    assert od.make_dataset(ds, 8) != a


def test_fit_recovers_a_clean_line():
    xs = [-1.0, -0.5, 0.0, 0.5, 1.0]
    ys = [2 * x + 1 for x in xs]
    w = od.fit(xs, ys, degree=1, lam=0.0)
    assert w[0] == pytest.approx(1.0, abs=1e-9) and w[1] == pytest.approx(2.0, abs=1e-9)
    assert od.mse(xs, ys, w) < 1e-18


def test_high_degree_overfits_noisy_data():
    ds = od.dataset_by_id("cubic_noisy")
    data = od.make_dataset(ds, 11)
    lo = od.evaluate(ds, 11, degree=3, lam=0.0)
    hi = od.evaluate(ds, 11, degree=12, lam=0.0)
    assert hi["train_mse"] < lo["train_mse"]          # fits the training points better…
    assert hi["test_mse"] > lo["test_mse"]            # …but generalises worse
    assert 1 <= lo["best_degree"] <= 12 and lo["rank"] <= hi["rank"]
    assert data["train_x"]


def test_score_ranks_against_all_degrees():
    items = od.items_by_id(["gentle_cubic", "bump_tiny"], level=1, seed=3)
    sim = {"datasets": [{"dataset_id": "gentle_cubic", "degree": 3, "lam": 0.0}, {"dataset_id": "bump_tiny", "degree": 12, "lam": 0.0}]}
    r = engine.score_round(items, {}, level=1, sim=sim, game_id="overfit_detective")
    per = {p["id"]: p for p in r["per_item"]}
    assert per["gentle_cubic"]["max"] == 5 and per["gentle_cubic"]["score"] >= 4
    assert per["bump_tiny"]["score"] == 0 and per["bump_tiny"]["misconception"] == "overfit"
    assert od.score_from_ratio(1.0, 1.0) == 5 and od.score_from_ratio(1.2, 1.0) == 4 and od.score_from_ratio(5.0, 1.0) == 0
    # unplayed dataset
    r2 = engine.score_round(items, {}, level=1, sim={"datasets": []}, game_id="overfit_detective")
    assert all(p["misconception"] == "not_attempted" for p in r2["per_item"])


def test_golden_matches():
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert len(golden["cases"]) == len(od.DATASETS)
    for case in golden["cases"]:
        ds = od.dataset_by_id(case["dataset_id"])
        ev = od.evaluate(ds, case["seed"], case["degree"], case["lam"])
        for key in ("train_mse", "test_mse"):
            assert ev[key] == pytest.approx(case[key], rel=1e-9, abs=1e-12), (case["dataset_id"], key)
        assert ev["best_degree"] == case["best_degree"] and ev["rank"] == case["rank"]
