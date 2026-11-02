"""Reference solutions are checked with the production grading rules (ops/e2e/solutions/verify.py)."""
import json
import subprocess

from conftest import CONTAINER, DOCKER, SOLUTIONS


def _verify(lesson_id: str, code: str) -> dict:
    out = subprocess.run([DOCKER, "exec", "-i", CONTAINER, "python", "/app/ops_e2e/verify.py", "one", lesson_id],
                         input=code, capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-500:]
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_stored_solution_passes_the_grader():
    sol = json.loads((SOLUTIONS / "variables_intro.json").read_text())
    r = _verify("variables_intro", sol["challenges"][0]["code"])
    assert r["ok"] is True, r
    assert r["output"].strip() == sol["challenges"][0]["verified_output"].strip()


def test_wrong_program_is_rejected():
    assert _verify("variables_intro", "print('not the answer')\n")["ok"] is False


def test_harness_graded_lesson_uses_its_test_code():
    # regex_fundamentals ships a test_code harness: printing the expected text without defining the function fails.
    lesson = "regex_fundamentals"
    fake = "print(['The', 'Python', 'Search', 'Replace', 'PyMasters'])\n"
    assert _verify(lesson, fake)["ok"] is False
    real = ("import re\n\ndef extract_capitalized(text):\n    return re.findall(r\"\\b[A-Z][a-zA-Z]*\", text)\n\n"
            "demo = \"The Python re module powers Search and Replace in PyMasters.\"\nprint(extract_capitalized(demo))\n")
    assert _verify(lesson, real)["ok"] is True
