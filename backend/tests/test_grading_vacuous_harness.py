"""A test_code harness that passes on its own proves nothing about the learner's program.

2026-11-04 live audit: 61 of 673 practice challenges (52 in python_fundamentals) shipped a harness that re-did the
work itself (e.g. variables_operators#0 set radius = 7 and computed the area), so ANY program that ran without an
error was graded correct — `print("hi")` got "You nailed this challenge" on the live site. Such a harness is
ignored and the challenge falls back to its expected_output.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar import grading  # noqa: E402

SELF_CONTAINED = "radius = 7\narea = 3.14159 * radius ** 2\nassert abs(area - 153.93791) < 0.0001\n"
EXPECTED = "153.93791\nTrue"
CORRECT = "radius = 7\narea = 3.14159 * radius ** 2\nprint(area)\nprint(area > 100)\n"

REAL_HARNESS = "assert total == 6, f'total should be 6, got {total}'\n"


def test_a_self_contained_harness_does_not_pass_an_unrelated_program():
    r = grading.grade_submission('print("hi")\n', EXPECTED, test_code=SELF_CONTAINED)
    assert r["success"] is False


def test_a_self_contained_harness_falls_back_to_the_expected_output():
    r = grading.grade_submission(CORRECT, EXPECTED, test_code=SELF_CONTAINED)
    assert r["success"] is True, r


def test_an_empty_submission_never_passes_a_self_contained_harness():
    assert grading.grade_submission("", EXPECTED, test_code=SELF_CONTAINED)["success"] is False


def test_a_harness_that_checks_the_learners_variables_still_grades():
    assert grading.grade_submission("total = 1 + 2 + 3\n", "", test_code=REAL_HARNESS)["success"] is True
    bad = grading.grade_submission("total = 5\n", "", test_code=REAL_HARNESS)
    assert bad["success"] is False and "total should be 6" in bad["error"]


def test_a_harness_is_checked_alone_only_once(monkeypatch):
    grading._VACUOUS.clear()
    calls = []
    real = grading.run_code_subprocess
    monkeypatch.setattr(grading, "run_code_subprocess", lambda code, **k: calls.append(code) or real(code, **k))
    for _ in range(3):
        grading.grade_submission("total = 6\n", "", test_code=REAL_HARNESS)
    assert calls.count(REAL_HARNESS) == 1, "the harness-alone probe should be cached"


def test_a_probe_that_fails_for_infrastructure_reasons_is_not_cached(monkeypatch):
    # A busy runner or a timeout says nothing about the harness; caching it as "real" would let a self-contained
    # harness pass every program until the next restart.
    grading._VACUOUS.clear()
    busy = {"output": "", "exit_code": 1, "error": "The code runner is busy right now. Please try again in a few seconds."}
    monkeypatch.setattr(grading, "run_code_subprocess", lambda code, **k: busy)
    assert grading.harness_is_vacuous(SELF_CONTAINED) is False
    assert grading._VACUOUS == {}
    monkeypatch.undo()
    assert grading.harness_is_vacuous(SELF_CONTAINED) is True


def test_an_inconclusive_probe_never_lets_a_self_contained_harness_pass_any_program(monkeypatch):
    # 2026-11-04 CI (PR #259): the probe hit "runner busy" while lesson traces held the sandbox, then the harness run
    # itself got the runner and passed `print("hi")`. Unknown must mean "try again", never "graded by the harness".
    grading._VACUOUS.clear()
    busy = {"output": "", "exit_code": 1, "error": "The code runner is busy right now. Please try again in a few seconds."}
    real = grading.run_code_subprocess
    monkeypatch.setattr(grading, "run_code_subprocess",
                        lambda code, **k: busy if code == SELF_CONTAINED else real(code, **k))
    r = grading.grade_submission('print("hi")\n', EXPECTED, test_code=SELF_CONTAINED)
    assert r["success"] is False
    assert "busy" in r["error"]


def test_output_matching_keeps_placeholder_wildcards():
    assert grading.output_matches("Name: Ada, Age: 36", "Name: <your_name>, Age: <your_age>")
    assert not grading.output_matches("Name: , Age: 36", "Name: <your_name>, Age: <your_age>")
