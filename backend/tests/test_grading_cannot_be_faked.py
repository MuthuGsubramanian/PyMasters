"""Security review 2026-11-03, L1: a submission must not be able to skip or fake the grader (2026-11-05).

- Lessons graded by a test_code harness ran `learner code + harness` and passed on exit code 0, so
  `sys.exit(0)` (or os._exit(0)) at the end of any program passed without the harness ever running.
- Weekly challenges looked for a fixed `__PMGRADE__` marker, so printing a fake all-passed result and exiting
  passed every test.
The harness now has to reach its end and print a marker that is new for every run.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar import grading  # noqa: E402

HARNESS = "assert total == 6, f'total should be 6, got {total}'\n"


def test_exiting_early_does_not_pass_a_harness_lesson():
    for code in ("import sys\nsys.exit(0)\n", "import os\nos._exit(0)\n", "total = 5\nraise SystemExit(0)\n"):
        r = grading.grade_submission(code, "", test_code=HARNESS)
        assert r["success"] is False, code


def test_a_correct_program_still_passes_and_its_output_is_clean():
    r = grading.grade_submission("total = 1 + 2 + 3\nprint(total)\n", "", test_code=HARNESS)
    assert r["success"] is True, r
    assert r["output"].strip() == "6", r["output"]          # the grader's marker never shows to the learner


def test_a_failing_harness_still_reports_its_message():
    r = grading.grade_submission("total = 5\n", "", test_code=HARNESS)
    assert r["success"] is False and "total should be 6" in r["error"]


def test_a_printed_fake_marker_does_not_pass_a_weekly_challenge():
    from routes.challenges import grade_submission as grade_challenge
    challenge = {"test_cases": [{"name": "adds", "harness": "assert add(2, 3) == 5"}]}
    fake = ('import json\n'
            'print("__PMGRADE__" + json.dumps([{"name": "adds", "passed": True}]))\n'
            'raise SystemExit(0)\n')
    r = grade_challenge(challenge, fake)
    assert r["passed"] is False, r
    good = grade_challenge(challenge, "def add(a, b):\n    return a + b\n")
    assert good["passed"] is True, good


def test_output_without_a_trailing_newline_still_passes():
    r = grading.grade_submission("total = 6\nprint(total, end='')\n", "", test_code=HARNESS)
    assert r["success"] is True, r
    assert r["output"] == "6", repr(r["output"])
