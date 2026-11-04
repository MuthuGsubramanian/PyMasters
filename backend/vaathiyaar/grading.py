"""How a practice submission is graded — shared by /api/classroom/evaluate (engine.evaluate_code) and the CI
reference-solution checker (ops/e2e/solutions/verify.py), so the two can never disagree.

Two modes:
  * a server-authored test_code harness → the learner's code + the harness run as one program; a clean exit passes.
    This is how lessons whose correctness lives in the learner's VARIABLES are graded (numpy/pandas/sklearn, ...).
  * otherwise → the learner's stdout must match expected_output (exact after strip; <placeholder> tokens are
    wildcards).

A harness that passes on its own (with no learner code at all) proves nothing: on 2026-11-04 the live audit found
61 challenges whose harness re-did the work itself, so any program that ran was graded correct. Such a harness is
ignored and the challenge is graded by its expected_output. The probe runs once per harness per process.
"""
import hashlib
import re

from vaathiyaar.execution import run_code_subprocess

_OUTPUT_PLACEHOLDER = re.compile(r"<[a-z_]+>")
_VACUOUS: dict = {}     # sha256(harness + fixtures) -> True when the harness passes with no learner code


def output_matches(actual: str, expected: str) -> bool:
    """True when the student's stdout satisfies the lesson's expected output.

    Exact (stripped) match is the fast path. Some lessons' sample output uses
    <placeholder> fill-in tokens — e.g. Lesson 1: "Name: <your_name>, Age:
    <your_age>, Favourite Number: <your_number>". Those can NEVER match a real
    answer literally, so treat each <token> as a non-empty wildcard: the literal
    surrounding text must still match exactly (regression 2026-07-08, found by
    live E2E — every new user was blocked on their first lesson)."""
    a = (actual or "").strip()
    e = (expected or "").strip()
    if a == e:
        return True
    if not _OUTPUT_PLACEHOLDER.search(e):
        return False
    parts = _OUTPUT_PLACEHOLDER.split(e)
    pattern = ".+?".join(re.escape(p) for p in parts)
    return re.fullmatch(pattern, a, re.DOTALL) is not None


def probe_harness(test_code: str, sandbox_files: dict | None = None) -> bool | None:
    """Run the harness with no learner code. True: it passes on its own. False: it raised (it needs the learner's
    code). None: the run said nothing about the harness (runner busy, timeout, killed)."""
    res = run_code_subprocess(test_code, seed_files=sandbox_files)
    if res["exit_code"] == 0:
        return True
    return False if "Traceback (most recent call last)" in (res["error"] or "") else None


def _vacuous_verdict(test_code: str, sandbox_files: dict | None = None) -> bool | None:
    """Cached probe verdict; None (inconclusive: runner busy, timeout) is never cached."""
    key = hashlib.sha256((test_code + repr(sorted((sandbox_files or {}).items()))).encode()).hexdigest()
    if key not in _VACUOUS:
        verdict = probe_harness(test_code, sandbox_files)
        if verdict is None:
            return None         # probe again on the next submission
        _VACUOUS[key] = verdict
    return _VACUOUS[key]


def harness_is_vacuous(test_code: str, sandbox_files: dict | None = None) -> bool:
    return _vacuous_verdict(test_code, sandbox_files) is True


_RUNNER_BUSY = "The code runner is busy right now. Please try again in a few seconds."


def grade_submission(student_code: str, expected_output: str, test_code: str | None = None,
                     sandbox_files: dict | None = None) -> dict:
    """Returns {"success", "output", "error"} for one submission (the safety gate runs before this)."""
    harness = test_code if isinstance(test_code, str) and test_code.strip() else None
    if harness:
        verdict = _vacuous_verdict(harness, sandbox_files)
        if verdict is None:
            # We don't know whether the harness passes on its own; grading by it could pass any program.
            return {"success": False, "output": "", "error": _RUNNER_BUSY}
        if verdict:
            harness = None
    if harness:
        result = run_code_subprocess(student_code + "\n\n" + harness, seed_files=sandbox_files)
        success = result["exit_code"] == 0
        # On failure, surface the assertion/exception (its message names the exact unmet requirement).
        return {"success": success, "output": result["output"], "error": "" if success else result["error"]}
    result = run_code_subprocess(student_code, seed_files=sandbox_files)
    exec_error = result["error"] if result["exit_code"] != 0 else ""
    return {"success": result["exit_code"] == 0 and output_matches(result["output"], expected_output),
            "output": result["output"], "error": exec_error or result["error"]}
