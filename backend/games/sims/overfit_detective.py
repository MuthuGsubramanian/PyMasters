"""Overfit Detective — polynomial least squares with ridge, re-simulated server-side.

Lock-step twin of frontend/src/games/overfit-detective/levels.js: same dataset table,
same mulberry32 draws in the same order, same normal-equation solve (Gaussian
elimination with partial pivoting, intercept unpenalised). Polynomials only, so the
two languages agree to ~1e-12. `golden/overfit_detective.json` pins fixed runs.
"""
import json
import sys
from pathlib import Path

from games.sims.rng import crc32, mulberry32

MAX_DEGREE = 12
GOLDEN_PATH = Path(__file__).parent / "golden" / "overfit_detective.json"

TRUE_FNS = {
    "poly3": lambda x: 1.2 * x * x * x - 0.8 * x + 0.3,
    "poly5": lambda x: 2.0 * x ** 5 - 3.0 * x ** 3 + 1.0 * x,
    "bump": lambda x: 1.0 - 3.0 * x * x + 2.0 * x ** 4,
}

DATASETS = [
    {"id": "gentle_cubic", "level": 1, "name": "Gentle Curve", "fn": "poly3", "noise": 0.10, "n_train": 20, "n_test": 20, "allow_lambda": False,
     "why": "With little noise the true shape shows through: a degree near the real curve (3) fits the test points best; higher degrees chase the noise."},
    {"id": "bump_low", "level": 1, "name": "Soft Bump", "fn": "bump", "noise": 0.10, "n_train": 20, "n_test": 20, "allow_lambda": False,
     "why": "Two humps need an even polynomial of degree about 4; a straight line underfits, degree 12 wiggles between points."},
    {"id": "cubic_noisy", "level": 2, "name": "Noisy Curve", "fn": "poly3", "noise": 0.25, "n_train": 14, "n_test": 20, "allow_lambda": False,
     "why": "More noise punishes flexibility: a high-degree fit memorises the training scatter and its test error climbs."},
    {"id": "bump_mid", "level": 2, "name": "Rough Bump", "fn": "bump", "noise": 0.20, "n_train": 14, "n_test": 20, "allow_lambda": False,
     "why": "Training error always falls as degree rises; only test error tells you where learning turns into memorising."},
    {"id": "quintic", "level": 3, "name": "Five Turns", "fn": "poly5", "noise": 0.15, "n_train": 18, "n_test": 24, "allow_lambda": True,
     "why": "A wavier truth needs a higher degree; ridge regularisation lets you use that degree without exploding coefficients."},
    {"id": "bump_noisy", "level": 3, "name": "Rough Bump II", "fn": "bump", "noise": 0.30, "n_train": 14, "n_test": 20, "allow_lambda": True,
     "why": "When data are noisy, a small λ shrinks the wild coefficients that a high degree would otherwise fit to noise."},
    {"id": "quintic_noisy", "level": 4, "name": "Five Turns, Fog", "fn": "poly5", "noise": 0.30, "n_train": 18, "n_test": 24, "allow_lambda": True,
     "why": "Noise and a complex truth together: pick enough degree for the shape, then λ to tame the variance."},
    {"id": "tiny_train", "level": 5, "name": "Ten Points", "fn": "poly3", "noise": 0.20, "n_train": 10, "n_test": 20, "allow_lambda": True,
     "why": "With only ten training points even modest degrees overfit; fewer samples call for simpler models or stronger λ."},
    {"id": "wild", "level": 6, "name": "Wild Data", "fn": "poly5", "noise": 0.40, "n_train": 12, "n_test": 24, "allow_lambda": True,
     "why": "Few, noisy points and a wavy truth: the honest answer is a moderate degree with regularisation, not the degree that nails every dot."},
    {"id": "bump_tiny", "level": 6, "name": "Tiny Bump", "fn": "bump", "noise": 0.30, "n_train": 10, "n_test": 20, "allow_lambda": True,
     "why": "Ten noisy points cannot support twelve coefficients; the test set exposes the mirage."},
]
_BY_ID = {d["id"]: d for d in DATASETS}
TOPIC_BY_LEVEL = {1: "linear_regression", 2: "linear_regression", 3: "model_evaluation", 4: "model_evaluation",
                  5: "train_test_split", 6: "train_test_split"}
LESSON_BY_TOPIC = {"linear_regression": "linear_regression", "model_evaluation": "model_evaluation", "train_test_split": "train_test_split"}


def dataset_by_id(ds_id: str) -> dict:
    return _BY_ID[ds_id]


def make_dataset(ds: dict, seed: int) -> dict:
    """Train then test points, each x uniform in [-1, 1], y = f(x) + noise·(2u − 1)."""
    rnd = mulberry32(seed)
    f = TRUE_FNS[ds["fn"]]
    out = {}
    for part, n in (("train", ds["n_train"]), ("test", ds["n_test"])):
        xs, ys = [], []
        for _ in range(n):
            x = 2.0 * rnd() - 1.0
            y = f(x) + ds["noise"] * (2.0 * rnd() - 1.0)
            xs.append(x)
            ys.append(y)
        out[f"{part}_x"], out[f"{part}_y"] = xs, ys
    return out


def _solve(a: list, b: list) -> list:
    """Gaussian elimination with partial pivoting; a is n×n (list of rows), b length n."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = col
        for r in range(col + 1, n):
            if abs(m[r][col]) > abs(m[piv][col]):
                piv = r
        m[col], m[piv] = m[piv], m[col]
        p = m[col][col]
        if p == 0.0:
            p = 1e-300
        for r in range(col + 1, n):
            factor = m[r][col] / p
            if factor != 0.0:
                for c in range(col, n + 1):
                    m[r][c] -= factor * m[col][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = m[i][n]
        for j in range(i + 1, n):
            s -= m[i][j] * x[j]
        d = m[i][i] if m[i][i] != 0.0 else 1e-300
        x[i] = s / d
    return x


def fit(xs: list, ys: list, degree: int, lam: float = 0.0) -> list:
    """Ridge least squares for a polynomial of `degree`; returns weights w[0..degree] (intercept first)."""
    k = degree + 1
    ata = [[0.0] * k for _ in range(k)]
    aty = [0.0] * k
    for x, y in zip(xs, ys):
        pw = [1.0]
        for _ in range(degree):
            pw.append(pw[-1] * x)
        for i in range(k):
            aty[i] += pw[i] * y
            row = ata[i]
            for j in range(k):
                row[j] += pw[i] * pw[j]
    for i in range(1, k):            # intercept unpenalised
        ata[i][i] += float(lam)
    return _solve(ata, aty)


def predict(w: list, x: float) -> float:
    acc, pw = 0.0, 1.0
    for wi in w:
        acc += wi * pw
        pw *= x
    return acc


def mse(xs: list, ys: list, w: list) -> float:
    if not xs:
        return 0.0
    s = 0.0
    for x, y in zip(xs, ys):
        d = predict(w, x) - y
        s += d * d
    return s / len(xs)


def evaluate(ds: dict, seed: int, degree: int, lam: float = 0.0) -> dict:
    """Train/test MSE for the learner's choice, plus the best degree (λ = 0) and the learner's rank."""
    data = make_dataset(ds, seed)
    degree = max(1, min(MAX_DEGREE, int(degree)))
    lam = float(lam or 0.0) if ds["allow_lambda"] else 0.0
    w = fit(data["train_x"], data["train_y"], degree, lam)
    train_mse = mse(data["train_x"], data["train_y"], w)
    test_mse = mse(data["test_x"], data["test_y"], w)
    ladder = []
    for d in range(1, MAX_DEGREE + 1):
        wd = fit(data["train_x"], data["train_y"], d, 0.0)
        ladder.append((mse(data["test_x"], data["test_y"], wd), d))
    best_mse, best_degree = min(ladder)
    rank = sum(1 for m, _ in ladder if m < test_mse)
    return {"train_mse": train_mse, "test_mse": test_mse, "best_degree": best_degree, "best_test_mse": best_mse, "rank": rank,
            "weights": w, "data": data}


SCORE_BANDS = ((1.10, 5), (1.25, 4), (1.50, 3), (2.00, 2), (4.00, 1))


def score_from_ratio(test_mse: float, best_test_mse: float) -> int:
    """5 when within 10 % of the best achievable test error, down to 0 beyond 4× it."""
    ratio = test_mse / best_test_mse if best_test_mse > 0 else (1.0 if test_mse == 0 else 1e9)
    for limit, points in SCORE_BANDS:
        if ratio <= limit:
            return points
    return 0


def _item(ds: dict, round_seed: int) -> dict:
    topic = TOPIC_BY_LEVEL[ds["level"]]
    return {"id": ds["id"], "level": ds["level"], "topic": topic, "kind": "sim",
            "seed": (int(round_seed) ^ crc32(ds["id"])) & 0xFFFFFFFF, "dataset": {k: v for k, v in ds.items() if k != "why"},
            "answer": "pick the degree (and λ) with the lowest hidden test error", "why": ds["why"],
            "lesson_id": LESSON_BY_TOPIC[topic], "misconception": "complexity_choice"}


def pick_items(level: int, seed: int, n: int) -> list:
    import games.engine as eng
    bank = [{"id": d["id"], "level": d["level"]} for d in DATASETS]
    saved = eng.load_bank
    try:
        eng.load_bank = lambda gid: bank if gid == "overfit_detective" else saved(gid)
        picked = eng.pick_items("overfit_detective", level, seed, set(), n)
    finally:
        eng.load_bank = saved
    return [_item(_BY_ID[p["id"]], seed) for p in picked]


def items_by_id(ids: list, level: int, seed: int) -> list:
    return [_item(_BY_ID[i], seed) for i in ids if i in _BY_ID]


def score(payload: dict, level: int, items: list) -> list:
    played = {d.get("dataset_id"): d for d in (payload or {}).get("datasets") or [] if isinstance(d, dict)}
    per = []
    for it in items:
        ds = _BY_ID[it["id"]]
        move = played.get(it["id"])
        if not move or "degree" not in move:
            per.append({"id": it["id"], "topic": it["topic"], "correct": False, "score": 0, "max": 5, "misconception": "not_attempted"})
            continue
        ev = evaluate(ds, it["seed"], move.get("degree", 1), move.get("lam", 0.0))
        sc = score_from_ratio(ev["test_mse"], ev["best_test_mse"])
        deg = max(1, min(MAX_DEGREE, int(move.get("degree", 1))))
        mc = None
        if sc < 4:
            if deg > ev["best_degree"] + 2:
                mc = "overfit"
            elif deg < ev["best_degree"] - 2:
                mc = "underfit"
            else:
                mc = "near_miss"
        per.append({"id": it["id"], "topic": it["topic"], "correct": sc >= 4, "score": sc, "max": 5, "misconception": mc})
    return per


GOLDEN_MOVES = {"gentle_cubic": (3, 0.0), "bump_low": (4, 0.0), "cubic_noisy": (12, 0.0), "bump_mid": (2, 0.0), "quintic": (5, 0.01),
                "bump_noisy": (8, 0.1), "quintic_noisy": (9, 0.05), "tiny_train": (6, 0.0), "wild": (5, 0.2), "bump_tiny": (12, 0.0)}


def write_golden(path: Path = GOLDEN_PATH, seed: int = 7) -> dict:
    cases = []
    for ds in DATASETS:
        degree, lam = GOLDEN_MOVES[ds["id"]]
        ev = evaluate(ds, seed, degree, lam)
        cases.append({"dataset_id": ds["id"], "seed": seed, "degree": degree, "lam": lam, "train_mse": ev["train_mse"],
                      "test_mse": ev["test_mse"], "best_degree": ev["best_degree"], "rank": ev["rank"]})
    data = {"note": "generated by python -m games.sims.overfit_detective --golden; asserted by both test suites", "cases": cases}
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=1)
    return data


if __name__ == "__main__":
    if "--golden" in sys.argv:
        for c in write_golden()["cases"]:
            print(c["dataset_id"], "deg", c["degree"], "train", round(c["train_mse"], 4), "test", round(c["test_mse"], 4), "best", c["best_degree"], "rank", c["rank"])
