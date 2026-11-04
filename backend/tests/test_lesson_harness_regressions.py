"""Harnesses found broken by the nightly every-lesson sweep (2026-11-05).

neural_networks_intro and transformers_intro shipped a test_code that re-did the whole exercise itself, so it
passed with no learner code (the grader then ignores it, see grading.py), and an expected_output that the correct
program does not print (different random numbers). Correct answers were graded wrong. The harnesses now check
the learner's own names, and expected_output is what the reference solution prints.
"""
import json
import os
import subprocess
import sys

import pytest

pytest.importorskip("numpy")

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
CASES = [
    ("machine_learning", "neural_networks_intro"),
    ("deep_learning", "transformers_intro"),
]


def _challenge(track, lesson_id):
    with open(os.path.join(ROOT, "backend", "lessons", track, f"{lesson_id}.json"), encoding="utf-8") as fh:
        return json.load(fh)["practice_challenges"][0]


def _solution(lesson_id):
    with open(os.path.join(ROOT, "ops", "e2e", "solutions", f"{lesson_id}.json"), encoding="utf-8") as fh:
        return json.load(fh)["challenges"][0]["code"]


def _run(code):
    r = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, timeout=120)
    return r.returncode, r.stdout


@pytest.mark.parametrize("track,lesson_id", CASES)
def test_the_harness_does_not_pass_on_its_own(track, lesson_id):
    rc, _ = _run(_challenge(track, lesson_id)["test_code"])
    assert rc != 0, "a harness that passes without learner code grades every program correct"


@pytest.mark.parametrize("track,lesson_id", CASES)
def test_the_unfinished_starter_code_fails_the_harness(track, lesson_id):
    ch = _challenge(track, lesson_id)
    rc, _ = _run(ch["starter_code"] + "\n\n" + ch["test_code"])
    assert rc != 0


def test_the_neural_network_starter_code_runs_as_given():
    # Its print line used f'{pred[0]:.3f}' on a 1-element array, a TypeError on NumPy 2: a learner who kept the
    # given line crashed even with a correct training loop.
    rc, _ = _run(_challenge("machine_learning", "neural_networks_intro")["starter_code"])
    assert rc == 0


@pytest.mark.parametrize("track,lesson_id", CASES)
def test_the_reference_solution_passes_and_prints_the_expected_output(track, lesson_id):
    ch = _challenge(track, lesson_id)
    sol = _solution(lesson_id)
    rc, _ = _run(sol + "\n\n" + ch["test_code"])
    assert rc == 0
    rc, out = _run(sol)
    assert rc == 0
    assert out.strip() == ch["expected_output"].strip()
