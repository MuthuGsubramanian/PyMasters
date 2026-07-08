"""
Lesson content-validity regression (2026-07-08). A lesson is BROKEN if a
correct reference solution does not satisfy its own grading (exact-output for
stdout lessons). Found this way: python_intermediate/decorators_basics shipped
an expected_output with 'Done with greet' BEFORE the wrapped function's own
output — impossible for a correct decorator, so a correct answer was marked
wrong. This test pins reference solutions for a sample of pure-Python lessons so
that class of content bug can't regress. (ai_ml_foundations needs numpy/pandas/
sklearn and is validated out-of-band; see scratchpad/validate_aiml.py.)
"""
import contextlib
import io
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

LESSONS = os.path.join(os.path.dirname(__file__), "..", "lessons", "python_intermediate")

# lesson id -> a correct reference solution
REFERENCE_SOLUTIONS = {
    "oop_classes_basics": (
        "class Student:\n"
        "    def __init__(self, name, grade):\n"
        "        self.name = name; self.grade = grade\n"
        "    def is_passing(self):\n"
        "        return self.grade >= 50\n"
        "for s in [Student('Alice', 80), Student('Bob', 40)]:\n"
        "    print(f'{s.name}: {s.is_passing()}')"
    ),
    "generators_yield": (
        "def even_numbers(limit):\n"
        "    for n in range(0, limit, 2):\n"
        "        yield n\n"
        "for n in even_numbers(10):\n"
        "    print(n)"
    ),
    "decorators_basics": (
        "import functools\n"
        "def logger(fn):\n"
        "    @functools.wraps(fn)\n"
        "    def w(*a, **k):\n"
        "        print(f'Calling {fn.__name__}')\n"
        "        r = fn(*a, **k)\n"
        "        print(f'Done with {fn.__name__}')\n"
        "        return r\n"
        "    return w\n"
        "@logger\n"
        "def greet(name):\n"
        "    print(f'Hello, {name}!')\n"
        "greet('Vaathiyaar')"
    ),
    "regex_basics": (
        "import re\n"
        "text = 'Call 555-123-4567 or 800-999-8888 today'\n"
        "print(re.findall(r'\\d{3}-\\d{3}-\\d{4}', text))"
    ),
}


def _expected_output(lesson_id):
    d = json.load(open(os.path.join(LESSONS, lesson_id + ".json"), encoding="utf-8"))
    return d["practice_challenges"][0].get("expected_output", "")


@pytest.mark.parametrize("lesson_id", sorted(REFERENCE_SOLUTIONS))
def test_reference_solution_matches_expected_output(lesson_id):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(REFERENCE_SOLUTIONS[lesson_id], {})
    actual = buf.getvalue().strip()
    expected = _expected_output(lesson_id).strip()
    assert actual == expected, (
        f"{lesson_id}: a correct solution produces:\n{actual!r}\n"
        f"but the lesson expects:\n{expected!r}"
    )
