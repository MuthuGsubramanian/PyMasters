"""Build verified content banks: every answer key comes from really running the code.

Usage (from the repo root):  python backend/games/build_banks.py output_oracle [--seed 2026] [--per-level 30]

Items whose code fails, or whose distractors collide with the real answer, are rejected
and counted. The resulting JSON is what `games.engine.load_bank` serves; the matching
pytest re-verifies every shipped item so a stale bank cannot land.
"""
import argparse
import glob
import hashlib
import json
import os
import random
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from vaathiyaar.execution import run_code_subprocess  # noqa: E402

BANKS_DIR = BACKEND / "games" / "banks"
LESSONS_DIR = BACKEND / "lessons"
GENERIC_DISTRACTORS = ["None", "Error", "0", "[]", "True", "False", ""]


def verify_output(code: str) -> str:
    run = run_code_subprocess(code, timeout=5)
    if run.get("exit_code") != 0:
        raise ValueError(run.get("error") or "non-zero exit")
    return (run.get("output") or "").replace("\r\n", "\n").rstrip("\n")


def runs_clean(code: str, test: str) -> bool:
    """True when `code` followed by `test` exits 0 (test assertions hold)."""
    run = run_code_subprocess(code + "\n\n" + test, timeout=5)
    return run.get("exit_code") == 0


def apply_fix(code: str, line_index: int, fix_line: str) -> str:
    lines = code.split("\n")
    lines[line_index] = fix_line
    return "\n".join(lines)


_TRACE_HARNESS = """import sys
__count = [0]
def __tr(frame, event, arg):
    if event == 'line':
        __count[0] += 1
    return __tr
n = %d
sys.settrace(__tr)
%s
sys.settrace(None)
print(__count[0])
"""


def count_ops(code: str, n: int, timeout: int = 60) -> int:
    """Lines executed inside the snippet's functions for input size n (module level is free).

    Build-time instrumentation for Big-O Sprint; runs our own templates with the real
    interpreter in isolated mode. Returns -1 on timeout or error.
    """
    import subprocess
    try:
        run = subprocess.run([sys.executable, "-I", "-c", _TRACE_HARNESS % (n, code)], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return -1
    if run.returncode != 0:
        return -1
    try:
        return int(run.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return -1


def _build_big_o(seed: int, per_level: int) -> list:
    from games.templates.big_o_sprint import LABELS, TEMPLATES
    rng = random.Random(seed)
    lessons = _lesson_index()
    by_level = {}
    for t in TEMPLATES:
        by_level.setdefault(t(random.Random(0))["level"], []).append(t)
    items, seen, rejects = [], set(), {}
    for level in sorted(by_level):
        made, tries = 0, 0
        while made < per_level and tries < per_level * 10:
            tries += 1
            cand = rng.choice(by_level[level])(rng)
            if cand["code"] in seen:
                continue
            seen.add(cand["code"])
            if cand.get("exponential"):
                counts = {"10": count_ops(cand["code"], 10), "100": count_ops(cand["code"], 16), "1000": -1}
            else:
                counts = {k: count_ops(cand["code"], int(k)) for k in ("10", "100", "1000")}
            if any(v == -1 for k, v in counts.items() if not (cand.get("exponential") and k == "1000")):
                rejects["count_failed"] = rejects.get("count_failed", 0) + 1
                print(f"  reject (count failed {counts}) {cand['code'][:40]!r}")
                continue
            lesson_id = lessons.get(cand["topic"], "")
            if not lesson_id:
                rejects["no_lesson"] = rejects.get("no_lesson", 0) + 1
                continue
            items.append({"id": _item_id("bo", level, cand["code"]), "level": level, "topic": cand["topic"], "kind": "choice",
                          "prompt": {"code": cand["code"]}, "choices": list(LABELS), "answer": cand["answer"], "counts": counts,
                          "misconception": cand["misconception"], "why": cand["why"], "lesson_id": lesson_id})
            made += 1
        print(f"level {level}: {made} items ({tries} tries)")
    items.sort(key=lambda i: (i["level"], i["id"]))
    print(f"total {len(items)} items; rejects {rejects}")
    return items


def _lesson_index() -> dict:
    """topic -> lowest-order lesson id (first by order, then by id for stability)."""
    best = {}
    for path in glob.glob(str(LESSONS_DIR / "*" / "*.json")):
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        topic, order, lid = d.get("topic"), d.get("order") or 999, d.get("id")
        if not topic or not lid:
            continue
        if topic not in best or (order, lid) < best[topic]:
            best[topic] = (order, lid)
    return {t: v[1] for t, v in best.items()}


def _item_id(prefix: str, level: int, code: str) -> str:
    return f"{prefix}_{level}_{hashlib.sha1(code.encode('utf-8')).hexdigest()[:8]}"


def _finish_choice(item: dict, answer: str, rng: random.Random, rejects: dict) -> dict | None:
    distractors = []
    for alt in item.get("distractor_codes") or []:
        try:
            out = verify_output(alt)
        except ValueError:
            continue
        if out and out != answer and out not in distractors:
            distractors.append(out)
    for lit in list(item.get("extra_distractors") or []) + GENERIC_DISTRACTORS:
        if len(distractors) >= 3:
            break
        if lit != answer and lit not in distractors:
            distractors.append(lit)
    if len(distractors) < 3:
        rejects["too_few_distractors"] = rejects.get("too_few_distractors", 0) + 1
        return None
    choices = distractors[:3] + [answer]
    rng.shuffle(choices)
    item["choices"] = choices
    item["answer"] = choices.index(answer)
    return item


def _build_bug_hunt(seed: int, per_level: int) -> list:
    from games.templates.bug_hunt import TEMPLATES
    rng = random.Random(seed)
    lessons = _lesson_index()
    by_level = {}
    for t in TEMPLATES:
        by_level.setdefault(t(random.Random(0))["level"], []).append(t)
    items, seen, rejects = [], set(), {}
    for level in sorted(by_level):
        made, tries = 0, 0
        while made < per_level and tries < per_level * 12:
            tries += 1
            cand = rng.choice(by_level[level])(rng)
            key = (cand["code"], cand["test"])
            if key in seen:
                continue
            seen.add(key)
            code, test, line = cand["code"], cand["test"], cand["bug_line"]
            if runs_clean(code, test):
                rejects["buggy_passes"] = rejects.get("buggy_passes", 0) + 1
                print(f"  reject (buggy code passes) {code[:40]!r}")
                continue
            ok = [runs_clean(apply_fix(code, line, fx), test) for fx in cand["fixes"]]
            if not ok[cand["fix_index"]] or sum(ok) != 1:
                rejects["fix_set_invalid"] = rejects.get("fix_set_invalid", 0) + 1
                print(f"  reject (fix set invalid {ok}) {code[:40]!r}")
                continue
            order = list(range(3))
            rng.shuffle(order)
            choices = [cand["fixes"][i] for i in order]
            answer = [line, order.index(cand["fix_index"])]
            lesson_id = lessons.get(cand["topic"], "")
            if not lesson_id:
                rejects["no_lesson"] = rejects.get("no_lesson", 0) + 1
                continue
            items.append({"id": _item_id("bh", level, code + test), "level": level, "topic": cand["topic"], "kind": "line_then_choice",
                          "prompt": {"code": code, "test": test}, "choices": choices, "answer": answer,
                          "misconception": cand["misconception"], "why": cand["why"], "lesson_id": lesson_id})
            made += 1
        print(f"level {level}: {made} items ({tries} tries)")
    items.sort(key=lambda i: (i["level"], i["id"]))
    print(f"total {len(items)} items; rejects {rejects}")
    return items


def build(game_id: str, seed: int = 2026, per_level: int = 30) -> list:
    if game_id == "shape_sorter":
        from games.templates.shape_sorter import build_items
        items = build_items()
        print(f"total {len(items)} hand-authored cards")
        return items
    if game_id == "big_o_sprint":
        return _build_big_o(seed, min(per_level, 16))
    if game_id == "bug_hunt":
        return _build_bug_hunt(seed, min(per_level, 20))
    if game_id == "output_oracle":
        from games.templates.output_oracle import TEMPLATES
        prefix = "oo"
    else:
        raise SystemExit(f"no templates for {game_id}")
    rng = random.Random(seed)
    lessons = _lesson_index()
    by_level = {}
    for t in TEMPLATES:
        by_level.setdefault(t(random.Random(0))["level"], []).append(t)
    items, seen_code, rejects = [], set(), {}
    for level in sorted(by_level):
        made, tries = 0, 0
        while made < per_level and tries < per_level * 12:
            tries += 1
            cand = rng.choice(by_level[level])(rng)
            code = cand["code"]
            if code in seen_code:
                continue
            try:
                answer = verify_output(code)
            except ValueError as exc:
                rejects["run_failed"] = rejects.get("run_failed", 0) + 1
                print(f"  reject (run failed) {code[:40]!r}: {str(exc)[:60]}")
                continue
            if not answer:
                rejects["empty_output"] = rejects.get("empty_output", 0) + 1
                continue
            item = {"id": _item_id(prefix, level, code), "level": level, "topic": cand["topic"], "kind": cand["kind"],
                    "prompt": {"code": code}, "misconception": cand["misconception"], "why": cand["why"],
                    "lesson_id": lessons.get(cand["topic"], "")}
            if cand["kind"] == "choice":
                done = _finish_choice(dict(cand), answer, rng, rejects)
                if done is None:
                    continue
                item["choices"], item["answer"] = done["choices"], done["answer"]
            else:
                item["answer"] = answer
            if not item["lesson_id"]:
                rejects["no_lesson"] = rejects.get("no_lesson", 0) + 1
                continue
            seen_code.add(code)
            items.append(item)
            made += 1
        print(f"level {level}: {made} items ({tries} tries)")
    items.sort(key=lambda i: (i["level"], i["id"]))
    print(f"total {len(items)} items; rejects {rejects}")
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("game_id")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--per-level", type=int, default=30)
    args = ap.parse_args()
    items = build(args.game_id, args.seed, args.per_level)
    BANKS_DIR.mkdir(parents=True, exist_ok=True)
    out = BANKS_DIR / f"{args.game_id}.json"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=1)
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
