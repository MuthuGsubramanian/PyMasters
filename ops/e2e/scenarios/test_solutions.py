"""Reference solutions are checked with the production grading rules (ops/e2e/solutions/verify.py), and every
library a lesson's practice challenge imports must exist in the production sandbox."""
import ast
import json
import subprocess
from pathlib import Path

from conftest import CONTAINER, DOCKER, SOLUTIONS

LESSONS = Path(__file__).resolve().parents[3] / "backend" / "lessons"
# No exceptions any more (2026-11-03): every challenge that imported torch / LLM SDKs / langchain / tiktoken was
# rewritten to numpy, pure Python or an offline stand-in the sandbox can run. A new lesson needing such a library
# must do the same — the sandbox has 512 MB and no network.


def _imports(src: str) -> set:
    try:
        tree = ast.parse(src or "")
    except SyntaxError:
        return set()
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            out |= {a.name.split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            out.add(n.module.split(".")[0])
    return out


def test_lesson_imports_exist_in_the_sandbox():
    needed = {}
    for f in LESSONS.rglob("*.json"):
        try:
            challenges = json.loads(f.read_text()).get("practice_challenges") or []
        except Exception:  # noqa: BLE001 — non-lesson JSON
            continue
        for i, ch in enumerate(challenges):      # every challenge, not just the first
            if isinstance(ch, dict):
                for m in _imports(ch.get("starter_code")) | _imports(ch.get("test_code")):
                    needed.setdefault(m, []).append(f"{f.stem}#{i}")
    probe = ("import importlib.util, json, sys; "
             "print(json.dumps([m for m in sys.argv[1:] if importlib.util.find_spec(m) is None]))")
    out = subprocess.run([DOCKER, "exec", CONTAINER, "python", "-c", probe, *sorted(needed)],
                         capture_output=True, text=True, timeout=120)
    missing = set(json.loads(out.stdout.strip().splitlines()[-1]))
    assert not missing, {m: needed[m][:5] for m in sorted(missing)}


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
