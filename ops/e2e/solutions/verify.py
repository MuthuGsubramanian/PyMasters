"""Check reference solutions with the production grading rules. Runs INSIDE the test container
(copied to /app/ops_e2e/verify.py by run_scenarios.sh; cwd /app/backend so the backend imports resolve).

  python /app/ops_e2e/verify.py one <lesson_id> [index]  < code  → {"ok", "output", "error"}
  python /app/ops_e2e/verify.py all <dir>       → {"checked", "failed": [{lesson_id, index, output, error}]}
  python /app/ops_e2e/verify.py empty <lessons> → {"accepted_empty": ["lesson#i", ...]} (must be [])

The rules are the ones /api/classroom/evaluate applies to practice_challenges[index] — the same function,
vaathiyaar.grading.grade_submission: with a server-authored test_code harness, the code + harness must exit cleanly
(unless the harness passes on its own, which proves nothing); otherwise stdout must match expected_output (exact
after strip, <placeholder> tokens as wildcards).
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")


def _inherit_sandbox_firewall_flag() -> None:
    """start.sh verifies the sandbox-uid iptables rule and exports SANDBOX_NET_FIREWALL=1 to the app (PID 1's
    tree); a `docker exec` process does not inherit it. The rule lives in the container's network namespace, so
    it applies to this process too: adopt the flag only if the entrypoint really set it."""
    if os.environ.get("SANDBOX_NET_FIREWALL"):
        return
    try:
        env = dict(kv.split("=", 1) for kv in open("/proc/1/environ").read().split("\0") if "=" in kv)
    except OSError:
        return
    if env.get("SANDBOX_NET_FIREWALL") == "1":
        os.environ["SANDBOX_NET_FIREWALL"] = "1"


_inherit_sandbox_firewall_flag()

from routes.classroom import _load_lesson_from_dir          # noqa: E402
from vaathiyaar.grading import grade_submission             # noqa: E402
from vaathiyaar.execution import check_lesson_safety           # noqa: E402


def _sandbox_files(lesson: dict):
    sf = lesson.get("sandbox_files")
    if not isinstance(sf, dict):
        return None
    return {k: v for k, v in sf.items() if isinstance(k, str) and isinstance(v, str)
            and os.path.basename(k) == k and k != "main.py" and len(v) <= 65536}


def verify(lesson_id: str, code: str, index: int = 0) -> dict:
    lesson = _load_lesson_from_dir(lesson_id)
    pcs = (lesson or {}).get("practice_challenges") or []
    if not 0 <= index < len(pcs):
        return {"ok": False, "output": "", "error": f"no challenge {index} in lesson {lesson_id}"}
    ch = pcs[index]
    files = _sandbox_files(lesson)
    test_code = ch.get("test_code") if isinstance(ch.get("test_code"), str) and ch["test_code"].strip() else None
    lesson_code = "\n".join(c for c in (ch.get("starter_code"), ch.get("test_code")) if isinstance(c, str))
    blocked = check_lesson_safety(code, lesson_code=lesson_code, allowed_open_files=set(files) if files else None)
    if blocked:      # the same gate /api/classroom/evaluate applies before running anything
        return {"ok": False, "output": "", "error": f"Forbidden: {blocked}"}
    expected = ch.get("expected_output") if isinstance(ch.get("expected_output"), str) else ""
    r = grade_submission(code, expected, test_code=test_code, sandbox_files=files)
    return {"ok": r["success"], "output": r["output"], "error": r["error"]}


def main(argv) -> int:
    if argv[:1] == ["one"] and len(argv) in (2, 3):
        print(json.dumps(verify(argv[1], sys.stdin.read(), int(argv[2]) if len(argv) == 3 else 0)))
        return 0
    if argv[:1] == ["all"] and len(argv) == 2:
        failed, checked = [], 0
        for f in sorted(Path(argv[1]).glob("*.json")):
            sol = json.loads(f.read_text())
            for ch in sol.get("challenges", []):
                checked += 1
                r = verify(sol["lesson_id"], ch["code"], ch.get("index", 0))
                if not r["ok"]:
                    failed.append({"lesson_id": sol["lesson_id"], "index": ch.get("index", 0),
                                   "output": r["output"][-400:], "error": r["error"][-400:]})
        print(json.dumps({"checked": checked, "failed": failed}))
        return 1 if failed else 0
    if argv[:1] == ["empty"] and len(argv) == 2:
        # Every practice challenge must reject an empty submission (2026-11-04: 61 accepted anything).
        print(json.dumps({"accepted_empty": accepts_empty(Path(argv[1]))}))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


def accepts_empty(lessons_dir: Path) -> list:
    """Challenges an empty submission passes under grade_submission. An empty program prints nothing, so: with no
    harness (or a self-contained one) it passes iff "" matches expected_output; with a real harness, the empty run
    IS the harness on its own, which fails. One sandbox run per harness, serial: the sandbox user's RLIMIT_NPROC is
    shared, and parallel runs die spuriously (CI 2026-11-04 counted 9 instead of 61)."""
    from vaathiyaar.grading import output_matches, probe_harness
    accepted = []
    for f in sorted(lessons_dir.rglob("*.json")):
        try:
            d = json.loads(f.read_text())
        except Exception:  # noqa: BLE001 — non-lesson JSON
            continue
        if not isinstance(d, dict):
            continue
        for i, ch in enumerate(d.get("practice_challenges") or []):
            if not isinstance(ch, dict):
                continue
            tc = ch.get("test_code") if isinstance(ch.get("test_code"), str) and ch["test_code"].strip() else None
            alone = None
            for _ in range(3 if tc else 0):      # None = the run said nothing (busy/timeout/killed): try again
                alone = probe_harness(tc, _sandbox_files(d))
                if alone is not None:
                    break
            if tc and alone is None:
                print(f"warning: could not probe {d.get('id') or f.stem}#{i}", file=sys.stderr)
            expected = ch.get("expected_output") if isinstance(ch.get("expected_output"), str) else ""
            if (not tc or alone) and output_matches("", expected):
                accepted.append(f"{d.get('id') or f.stem}#{i}")
    return accepted

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
