"""Check reference solutions with the production grading rules. Runs INSIDE the test container
(copied to /app/ops_e2e/verify.py by run_scenarios.sh; cwd /app/backend so the backend imports resolve).

  python /app/ops_e2e/verify.py one <lesson_id>  < code      → {"ok", "output", "error"}
  python /app/ops_e2e/verify.py all <dir>                    → {"checked", "failed": [{lesson_id, output, error}]}

The rules are the ones /api/classroom/evaluate applies to practice_challenges[0] (the only challenge a learner
can reach): with a server-authored test_code harness, the code + harness must exit cleanly; otherwise stdout
must satisfy _output_matches (exact after strip, <placeholder> tokens as wildcards).
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes.classroom import _load_lesson_from_dir          # noqa: E402
from vaathiyaar.engine import _output_matches               # noqa: E402
from vaathiyaar.execution import check_lesson_safety, run_code_subprocess  # noqa: E402


def _sandbox_files(lesson: dict):
    sf = lesson.get("sandbox_files")
    if not isinstance(sf, dict):
        return None
    return {k: v for k, v in sf.items() if isinstance(k, str) and isinstance(v, str)
            and os.path.basename(k) == k and k != "main.py" and len(v) <= 65536}


def verify(lesson_id: str, code: str) -> dict:
    lesson = _load_lesson_from_dir(lesson_id)
    if not lesson or not lesson.get("practice_challenges"):
        return {"ok": False, "output": "", "error": f"no lesson/challenge for {lesson_id}"}
    ch = lesson["practice_challenges"][0]
    files = _sandbox_files(lesson)
    test_code = ch.get("test_code") if isinstance(ch.get("test_code"), str) and ch["test_code"].strip() else None
    lesson_code = "\n".join(c for c in (ch.get("starter_code"), ch.get("test_code")) if isinstance(c, str))
    blocked = check_lesson_safety(code, lesson_code=lesson_code, allowed_open_files=set(files) if files else None)
    if blocked:      # the same gate /api/classroom/evaluate applies before running anything
        return {"ok": False, "output": "", "error": f"Forbidden: {blocked}"}
    if test_code:
        res = run_code_subprocess(code + "\n\n" + test_code, seed_files=files)
        return {"ok": res["exit_code"] == 0, "output": res["output"], "error": res["error"]}
    res = run_code_subprocess(code, seed_files=files)
    expected = ch.get("expected_output") if isinstance(ch.get("expected_output"), str) else ""
    ok = res["exit_code"] == 0 and _output_matches(res["output"], expected)
    return {"ok": ok, "output": res["output"], "error": res["error"]}


def main(argv) -> int:
    if argv[:1] == ["one"] and len(argv) == 2:
        print(json.dumps(verify(argv[1], sys.stdin.read())))
        return 0
    if argv[:1] == ["all"] and len(argv) == 2:
        failed, checked = [], 0
        for f in sorted(Path(argv[1]).glob("*.json")):
            sol = json.loads(f.read_text())
            for ch in sol.get("challenges", []):
                if ch.get("index") != 0:
                    continue
                checked += 1
                r = verify(sol["lesson_id"], ch["code"])
                if not r["ok"]:
                    failed.append({"lesson_id": sol["lesson_id"], "output": r["output"][-400:], "error": r["error"][-400:]})
        print(json.dumps({"checked": checked, "failed": failed}))
        return 1 if failed else 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
