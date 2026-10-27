"""Gradient Golf — exact gradient-descent re-simulation.

Keep this file and frontend/src/games/gradient-golf/levels.js in lock-step: same hole
table, same update order (v = m*v - lr_t*g; x = x + v; lr_t = lr / (1 + decay*t)),
polynomial gradients only (no exp/sin), noise from the shared mulberry32.
`golden/gradient_golf.json` pins fixed-seed runs for both test suites.
"""
import json
import sys
from pathlib import Path

from games.sims.rng import crc32, mulberry32

DIVERGE_AT = 1e3
GOLDEN_PATH = Path(__file__).parent / "golden" / "gradient_golf.json"

# fn kinds: quad (a, c) | quartic (c) | double_well (asymmetric) | plateau (k, c) | bowl2d (a, b) | noisy (a, c, sigma)
HOLES = [
    {"id": "quad_a1", "level": 1, "name": "The Bowl", "fn": "quad", "params": {"a": 1.0, "c": 0.0, "min": [0.0]},
     "start": [3.0], "tol": 0.05, "max_swings": 6, "allow_momentum": False, "allow_decay": False,
     "why": "For a bowl a·(x-c)², a learning rate below 1/a steps straight toward the bottom; above 2/a each step lands farther away."},
    {"id": "quad_a2", "level": 1, "name": "Wide Bowl", "fn": "quad", "params": {"a": 0.5, "c": 2.0, "min": [2.0]},
     "start": [-2.0], "tol": 0.05, "max_swings": 6, "allow_momentum": False, "allow_decay": False,
     "why": "A flatter bowl has smaller gradients, so the same learning rate moves the ball less: shallow curves need a bigger rate or more steps."},
    {"id": "quad_a3", "level": 2, "name": "Steep Bowl", "fn": "quad", "params": {"a": 3.0, "c": -1.0, "min": [-1.0]},
     "start": [2.0], "tol": 0.05, "max_swings": 6, "allow_momentum": False, "allow_decay": False,
     "why": "Steep curvature multiplies every step: a rate that worked on a gentle bowl overshoots here. The safe rate scales with 1/curvature."},
    {"id": "quartic", "level": 3, "name": "Flat Bottom", "fn": "quartic", "params": {"c": 1.0, "min": [1.0]},
     "start": [3.0], "tol": 0.05, "max_swings": 6, "allow_momentum": False, "allow_decay": True,
     "why": "Near a flat minimum the gradient shrinks to almost nothing, so progress crawls. A larger rate early plus decay, or simply more steps, finishes the approach."},
    {"id": "double_well", "level": 3, "name": "Two Valleys", "fn": "double_well",
     "params": {"min": [-1.035578714089], "local": [0.960149555519], "hump": [0.07542915857]},
     "start": [1.8], "tol": 0.05, "max_swings": 6, "allow_momentum": False, "allow_decay": False,
     "why": "Gradient descent only sees the slope under the ball. A timid rate settles in the shallow valley (a local minimum); a bolder rate overshoots it and clears the hump into the deeper one."},
    {"id": "plateau", "level": 4, "name": "The Shelf", "fn": "plateau", "params": {"k": 0.02, "c": 0.0, "min": [0.0]},
     "start": [2.5], "tol": 0.05, "max_swings": 6, "allow_momentum": True, "allow_decay": True,
     "why": "x⁶ is almost flat near zero and explosively steep far away: one rate cannot suit both regions. Decay tames the steep part; momentum carries you across the flat part."},
    {"id": "bowl2d", "level": 5, "name": "The Canyon", "fn": "bowl2d", "params": {"a": 1.0, "b": 10.0, "min": [0.0, 0.0]},
     "start": [3.0, 2.0], "tol": 0.08, "max_swings": 6, "allow_momentum": True, "allow_decay": False,
     "why": "The steep direction limits the learning rate (it diverges above 0.1) while the gentle direction then creeps. That mismatch is ill-conditioning; momentum helps the slow axis."},
    {"id": "noisy", "level": 6, "name": "Gravel Green", "fn": "noisy", "params": {"a": 1.0, "c": 0.0, "sigma": 0.6, "min": [0.0]},
     "start": [3.0], "tol": 0.08, "max_swings": 6, "allow_momentum": True, "allow_decay": True,
     "why": "Mini-batch gradients are noisy estimates. A large rate amplifies the noise into jitter around the minimum; decaying the rate lets the ball settle."},
    {"id": "double_well_momentum", "level": 6, "name": "Two Valleys, Momentum", "fn": "double_well",
     "params": {"min": [-1.035578714089], "local": [0.960149555519], "hump": [0.07542915857]},
     "start": [1.5], "tol": 0.05, "max_swings": 6, "allow_momentum": True, "allow_decay": False,
     "why": "Momentum keeps velocity from earlier steps, so with the same small rate the ball rolls up and over the hump that plain gradient descent stops in front of."},
]
_BY_ID = {h["id"]: h for h in HOLES}
TOPIC_BY_LEVEL = {1: "gradient_descent", 2: "gradient_descent", 3: "gradient_descent", 4: "gradient_descent",
                  5: "linear_regression_gd", 6: "neural_networks_intro"}
LESSON_BY_TOPIC = {"gradient_descent": "bp_gradient_descent", "linear_regression_gd": "linreg_gradient_step",
                   "neural_networks_intro": "neural_networks_intro"}


def hole_by_id(hole_id: str) -> dict:
    return _BY_ID[hole_id]


def gradient(hole: dict, x: list, noise) -> list:
    p = hole["params"]
    kind = hole["fn"]
    if kind == "quad":
        return [2.0 * p["a"] * (x[0] - p["c"])]
    if kind == "quartic":
        d = x[0] - p["c"]
        return [4.0 * d * d * d]
    if kind == "double_well":
        return [4.0 * x[0] * (x[0] * x[0] - 1.0) + 0.3]
    if kind == "plateau":
        d = x[0] - p["c"]
        return [6.0 * p["k"] * d * d * d * d * d]
    if kind == "bowl2d":
        return [2.0 * p["a"] * x[0], 2.0 * p["b"] * x[1]]
    if kind == "noisy":
        u = noise()
        return [2.0 * p["a"] * (x[0] - p["c"]) + p["sigma"] * (2.0 * u - 1.0)]
    raise ValueError(kind)


def _dist(a: list, b: list) -> float:
    return sum((ai - bi) ** 2 for ai, bi in zip(a, b)) ** 0.5


def simulate(hole: dict, swings: list, seed: int) -> dict:
    """Play `swings` in order from the hole's start. Returns path, final, converged, diverged, swings_to_converge."""
    noise = mulberry32(seed)
    x = list(hole["start"])
    path = [list(x)]
    converged = diverged = False
    swings_to_converge = None
    for s_idx, sw in enumerate(swings[: hole["max_swings"]]):
        lr = float(sw.get("lr", 0.0))
        steps = max(0, min(200, int(sw.get("steps", 0))))
        momentum = float(sw.get("momentum", 0.0) or 0.0) if hole["allow_momentum"] else 0.0
        decay = float(sw.get("decay", 0.0) or 0.0) if hole["allow_decay"] else 0.0
        v = [0.0] * len(x)
        for t in range(steps):
            g = gradient(hole, x, noise)
            lr_t = lr / (1.0 + decay * t)
            v = [momentum * vi - lr_t * gi for vi, gi in zip(v, g)]
            x = [xi + vi for xi, vi in zip(x, v)]
            path.append(list(x))
            if any(abs(xi) > DIVERGE_AT for xi in x):
                diverged = True
                break
        if diverged:
            break
        if _dist(x, hole["params"]["min"]) <= hole["tol"]:
            converged = True
            swings_to_converge = s_idx + 1
            break
    return {"path": path, "final": x, "converged": converged, "diverged": diverged, "swings_to_converge": swings_to_converge}


def _item(hole: dict, round_seed: int) -> dict:
    topic = TOPIC_BY_LEVEL[hole["level"]]
    return {"id": hole["id"], "level": hole["level"], "topic": topic, "kind": "sim",
            "seed": (int(round_seed) ^ crc32(hole["id"])) & 0xFFFFFFFF, "hole": hole,
            "answer": f"sink {hole['name']} within {hole['max_swings']} swings",
            "why": hole["why"], "lesson_id": LESSON_BY_TOPIC[topic], "misconception": "lr_choice"}


def pick_items(level: int, seed: int, n: int) -> list:
    from games.engine import pick_items as _generic  # reuse the level-widening sampler
    import games.engine as eng
    # The generic sampler reads banks; feed it the hole table through a tiny shim.
    bank = [{"id": h["id"], "level": h["level"]} for h in HOLES]
    saved = eng.load_bank
    try:
        eng.load_bank = lambda gid: bank if gid == "gradient_golf" else saved(gid)
        picked = _generic("gradient_golf", level, seed, set(), n)
    finally:
        eng.load_bank = saved
    return [_item(_BY_ID[p["id"]], seed) for p in picked]


def items_by_id(ids: list, level: int, seed: int) -> list:
    return [_item(_BY_ID[i], seed) for i in ids if i in _BY_ID]


def score(payload: dict, level: int, items: list) -> list:
    played = {h.get("hole_id"): h for h in (payload or {}).get("holes") or [] if isinstance(h, dict)}
    per = []
    for it in items:
        hole = it["hole"]
        swings = (played.get(it["id"]) or {}).get("swings") or []
        swings = [s for s in swings if isinstance(s, dict)]
        try:
            out = simulate(hole, swings, it["seed"]) if swings else None
        except (TypeError, ValueError):      # tampered / non-numeric payload: score as unplayed
            swings, out = [], None
        if out is None:
            out = {"converged": False, "diverged": False, "swings_to_converge": None, "final": list(hole["start"])}
        max_score = hole["max_swings"]
        used = out["swings_to_converge"] if out["converged"] else max_score + 1
        sc = max(0, max_score + 1 - used)
        mc = None
        if not out["converged"]:
            if not swings:
                mc = "not_attempted"
            elif out["diverged"]:
                mc = "lr_too_high"
            elif "local" in hole["params"] and _dist(out["final"], hole["params"]["local"]) <= 0.15:
                mc = "local_minimum"
            elif _dist(out["final"], hole["start"]) < 0.1 * max(_dist(hole["start"], hole["params"]["min"]), 1e-9):
                mc = "lr_too_low"
            else:
                mc = "not_converged"
        per.append({"id": it["id"], "topic": it["topic"], "correct": bool(out["converged"]), "score": sc, "max": max_score,
                    "misconception": mc})
    return per


GOLDEN_SWINGS = {
    "quad_a1": [{"lr": 0.3, "steps": 5}, {"lr": 0.5, "steps": 5}, {"lr": 0.1, "steps": 5}],
    "quad_a2": [{"lr": 0.5, "steps": 4}, {"lr": 1.0, "steps": 4}, {"lr": 1.5, "steps": 4}],
    "quad_a3": [{"lr": 0.4, "steps": 3}, {"lr": 0.1, "steps": 10}, {"lr": 0.05, "steps": 10}],
    "quartic": [{"lr": 0.05, "steps": 20, "decay": 0.1}, {"lr": 0.2, "steps": 20}, {"lr": 0.5, "steps": 20, "decay": 0.5}],
    "double_well": [{"lr": 0.05, "steps": 20}, {"lr": 0.6, "steps": 5}, {"lr": 0.1, "steps": 30}],
    "plateau": [{"lr": 0.5, "steps": 20, "momentum": 0.8}, {"lr": 2.0, "steps": 10, "decay": 0.3}, {"lr": 5.0, "steps": 10}],
    "bowl2d": [{"lr": 0.09, "steps": 20}, {"lr": 0.05, "steps": 30, "momentum": 0.5}, {"lr": 0.11, "steps": 10}],
    "noisy": [{"lr": 0.3, "steps": 15}, {"lr": 0.3, "steps": 30, "decay": 0.2}, {"lr": 0.05, "steps": 40}],
    "double_well_momentum": [{"lr": 0.1, "steps": 20, "momentum": 0.9}, {"lr": 0.05, "steps": 30}, {"lr": 0.3, "steps": 10, "momentum": 0.5}],
}


def write_golden(path: Path = GOLDEN_PATH, seed: int = 7) -> dict:
    cases = []
    for hole in HOLES:
        out = simulate(hole, GOLDEN_SWINGS[hole["id"]], seed)
        cases.append({"hole_id": hole["id"], "seed": seed, "swings": GOLDEN_SWINGS[hole["id"]],
                      "final": out["final"], "converged": out["converged"], "diverged": out["diverged"],
                      "swings_to_converge": out["swings_to_converge"], "path_len": len(out["path"])})
    data = {"note": "generated by python -m games.sims.gradient_golf --golden; asserted by both test suites", "cases": cases}
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=1)
    return data


if __name__ == "__main__":
    if "--golden" in sys.argv:
        d = write_golden()
        for c in d["cases"]:
            print(c["hole_id"], "converged" if c["converged"] else "diverged" if c["diverged"] else "open", c["final"])
