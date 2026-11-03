"""Generate verified reference solutions for every practice challenge of every lesson (all indices).

For each lesson without a stored, still-passing solution: ask headless Claude for a program, check it with the
production grading rules inside the test container (verify.py), feed the failure back, at most 3 attempts.
Passing programs are written to ops/e2e/solutions/<lesson_id>.json; challenges nothing could solve are content
defects, listed in ops/e2e/out/unsolved.json for triage.

  # a container from: PM_E2E_KEEP=1 ops/e2e/run_scenarios.sh tier1 -k framework_smoke
  python ops/e2e/solutions/generate.py [--workers 4] [--model sonnet] [--only id,id] [--reverify]
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
LESSONS = REPO / "backend" / "lessons"
OUT = HERE.parent / "out"
SCHEMA = json.dumps({"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]})
ATTEMPTS = 3

PROMPT = """You are writing the reference solution for a Python practice challenge on a learning platform.
Write a complete Python 3.11 program that a strong learner would submit. Use only the standard library unless the
challenge clearly needs numpy/pandas/scikit-learn (installed). No input(), no network, no files except the
sandbox files listed. Keep the learner-facing names from the starter code.

Grading: {grading}

Challenge instruction:
{instruction}

Starter code:
{starter}

Expected output (stdout, compared after stripping; <angle-bracket tokens> are wildcards):
{expected}
{harness}{sandbox}{feedback}
Return JSON {{"code": "<the full program>"}}."""


def _en(v) -> str:
    return v.get("en") or next((x for x in v.values() if isinstance(x, str)), "") if isinstance(v, dict) else (v or "")


def lessons() -> list:
    """(lesson_id, lesson, index, challenge) for every practice challenge of every lesson."""
    out = []
    for f in sorted(LESSONS.rglob("*.json")):
        try:
            d = json.loads(f.read_text())
        except Exception:  # noqa: BLE001 — non-lesson JSON
            continue
        if not isinstance(d, dict):
            continue
        for i, ch in enumerate(d.get("practice_challenges") or []):
            if isinstance(ch, dict):
                out.append((d.get("id") or f.stem, d, i, ch))
    return out


def stored_code(lesson_id: str, index: int):
    f = HERE / f"{lesson_id}.json"
    if not f.exists():
        return None
    return next((c["code"] for c in json.loads(f.read_text()).get("challenges", []) if c.get("index") == index), None)


def save(lesson_id: str, entry: dict) -> None:
    """Merge one verified challenge entry into the lesson's solution file (other indices are kept)."""
    f = HERE / f"{lesson_id}.json"
    data = json.loads(f.read_text()) if f.exists() else {"lesson_id": lesson_id, "challenges": []}
    data["challenges"] = sorted([c for c in data["challenges"] if c.get("index") != entry["index"]] + [entry],
                                key=lambda c: c["index"])
    f.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def verify(args, lesson_id: str, code: str, index: int = 0) -> dict:
    r = subprocess.run([args.docker, "exec", "-i", args.container, "python", "/app/ops_e2e/verify.py", "one", lesson_id,
                        str(index)], input=code, capture_output=True, text=True, timeout=180)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        return {"ok": False, "output": r.stdout[-400:], "error": (r.stderr or "verify crashed")[-400:]}


def ask(args, prompt: str) -> str:
    r = subprocess.run(["claude", "-p", prompt, "--output-format", "json", "--json-schema", SCHEMA,
                        "--model", args.model, "--tools", "", "--no-session-persistence", "--strict-mcp-config",
                        "--setting-sources", ""], capture_output=True, text=True, timeout=600)
    data = json.loads(r.stdout)
    return (data.get("structured_output") or json.loads(data["result"]))["code"]


def solve(args, lesson_id: str, lesson: dict, index: int, ch: dict) -> dict:
    test_code = ch.get("test_code") if isinstance(ch.get("test_code"), str) and ch["test_code"].strip() else ""
    grading = ("your program is run with the hidden test harness below appended; it must exit cleanly."
               if test_code else "stdout must match the expected output.")
    sandbox = lesson.get("sandbox_files") if isinstance(lesson.get("sandbox_files"), dict) else {}
    feedback, last = "", {}
    for attempt in range(1, ATTEMPTS + 1):
        prompt = PROMPT.format(
            grading=grading, instruction=_en(ch.get("instruction")), starter=ch.get("starter_code") or "(none)",
            expected=ch.get("expected_output") or "(none — graded by the harness)",
            harness=f"\nTest harness (appended to your program):\n{test_code}\n" if test_code else "",
            sandbox=(f"\nSandbox files in the working directory: {', '.join(sandbox)}\n" if sandbox else ""),
            feedback=feedback)
        try:
            code = ask(args, prompt)
        except Exception as e:  # noqa: BLE001 — CLI hiccup: count it as a failed attempt
            last = {"ok": False, "output": "", "error": f"generation failed: {e!r}"[:400]}
            continue
        last = verify(args, lesson_id, code, index)
        if last["ok"]:
            return {"lesson_id": lesson_id, "index": index, "ok": True, "attempts": attempt, "entry": {
                "index": index, "code": code, "verified_output": last["output"].strip(),
                "source": f"claude {args.model} {date.today().isoformat()}, verified by verify.py"}}
        feedback = (f"\nYour previous attempt failed.\nProgram:\n{code}\nstdout:\n{last['output'][-800:]}\n"
                    f"stderr:\n{last['error'][-800:]}\nFix it.\n")
    return {"lesson_id": lesson_id, "index": index, "ok": False, "attempts": ATTEMPTS, "last": last,
            "track": lesson.get("track"), "instruction": _en(ch.get("instruction"))[:300],
            "expected_output": (ch.get("expected_output") or "")[:300], "has_test_code": bool(test_code)}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--container", default=os.getenv("PM_E2E_CONTAINER", "pm-e2e"))
    p.add_argument("--docker", default=os.getenv("PM_E2E_DOCKER", "docker"))
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--model", default="sonnet")
    p.add_argument("--only", default="")
    p.add_argument("--from-index", type=int, default=0, help="skip challenges below this index")
    p.add_argument("--reverify", action="store_true", help="re-check stored solutions; regenerate the failing ones")
    args = p.parse_args()

    only = {x for x in args.only.split(",") if x}
    todo = []
    for lesson_id, lesson, index, ch in lessons():
        if (only and lesson_id not in only) or index < args.from_index:
            continue
        code = stored_code(lesson_id, index)
        if code is not None and not (args.reverify and not verify(args, lesson_id, code, index)["ok"]):
            continue
        todo.append((lesson_id, lesson, index, ch))
    print(f"{len(todo)} challenge(s) to solve", flush=True)

    unsolved, solved = [], 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(solve, args, *t): t[0] for t in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            res = fut.result()          # results are saved here, on one thread, so file merges never race
            if res["ok"]:
                solved += 1
                save(res["lesson_id"], res["entry"])
            else:
                unsolved.append(res)
            print(f"[{i}/{len(todo)}] {'ok ' if res['ok'] else 'FAIL'} {res['lesson_id']}#{res['index']} "
                  f"({res['attempts']} attempt(s))", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "unsolved.json").write_text(json.dumps(sorted(unsolved, key=lambda r: r["lesson_id"]), indent=2,
                                                  ensure_ascii=False) + "\n")
    print(f"solved {solved}, unsolved {len(unsolved)} → {OUT / 'unsolved.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
