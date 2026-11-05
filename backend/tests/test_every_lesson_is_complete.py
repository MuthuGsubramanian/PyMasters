"""Every lesson ships complete (2026-11-05).

A lesson is only done when it has, besides its story and challenges:
- an Under the hood "How it works" explainer (`under_the_hood`, validated like the others),
- an example program "Python's view" can trace (a self-contained visual `code`, or `uth_example`),
- a stored, verified reference solution for every practice challenge (ops/e2e/solutions/<id>.json).

The daily content routine shipped two lessons without solutions on 2026-11-05 and every PR's deploy gate failed
until #277; this runs in the fast backend stage so a half-finished lesson is caught on its own PR.
See CLAUDE.md "Adding or changing a lesson".
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from vaathiyaar.lesson_code import example_code  # noqa: E402
from vaathiyaar.topic_uth import validate_under_the_hood  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
LESSONS = os.path.join(ROOT, "backend", "lessons")
SOLUTIONS = os.path.join(ROOT, "ops", "e2e", "solutions")


def _lessons():
    for dirpath, _, files in os.walk(LESSONS):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8") as fh:
                    data = json.load(fh)
            except ValueError:
                continue
            if isinstance(data, dict) and "id" in data:
                yield os.path.relpath(path, LESSONS), data


LESSON_LIST = list(_lessons())


def test_lessons_found():
    assert len(LESSON_LIST) > 500


@pytest.mark.parametrize("rel,lesson", LESSON_LIST, ids=[r for r, _ in LESSON_LIST])
def test_lesson_has_a_valid_how_it_works(rel, lesson):
    assert "under_the_hood" in lesson, f"{rel}: add an under_the_hood explainer (see CLAUDE.md)"
    assert validate_under_the_hood(lesson["under_the_hood"]) == []


@pytest.mark.parametrize("rel,lesson", LESSON_LIST, ids=[r for r, _ in LESSON_LIST])
def test_lesson_has_an_example_python_can_trace(rel, lesson):
    assert example_code(lesson), f"{rel}: needs a self-contained example (visual `code` or `uth_example`)"


@pytest.mark.parametrize("rel,lesson", LESSON_LIST, ids=[r for r, _ in LESSON_LIST])
def test_every_practice_challenge_has_a_stored_solution(rel, lesson):
    challenges = [c for c in lesson.get("practice_challenges") or [] if isinstance(c, dict)]
    if not challenges:
        return
    path = os.path.join(SOLUTIONS, f"{lesson['id']}.json")
    assert os.path.exists(path), f"{rel}: no stored solution — write one and verify it with grade_submission"
    with open(path, encoding="utf-8") as fh:
        have = {c["index"] for c in json.load(fh).get("challenges", [])}
    missing = [i for i in range(len(challenges)) if i not in have]
    assert not missing, f"{rel}: no stored solution for challenge(s) {missing}"
