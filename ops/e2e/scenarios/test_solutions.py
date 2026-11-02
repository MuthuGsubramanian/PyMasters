"""Reference solutions are checked with the production grading rules (ops/e2e/solutions/verify.py), and every
library a lesson's practice challenge imports must exist in the production sandbox."""
import ast
import json
import subprocess
from pathlib import Path

from conftest import CONTAINER, DOCKER, SOLUTIONS

LESSONS = Path(__file__).resolve().parents[3] / "backend" / "lessons"
# Not installable in the 512 MB / offline sandbox: lessons importing these need a numpy or pure-Python rewrite
# (sub-project E). Shrinking this set is progress; growing it needs a reason.
NOT_PROVIDED = {
    "torch": "PyTorch cannot even import under the sandbox's 512 MB address-space cap",
    "torchvision": "needs torch", "transformers": "needs torch + model downloads",
    "sentence_transformers": "needs torch + model downloads",
    "openai": "needs network + API keys", "anthropic": "needs network + API keys",
    "langchain": "needs network + API keys", "langchain_openai": "needs network + API keys",
    "langchain_community": "needs network + API keys", "chromadb": "needs network/model downloads",
    "tiktoken": "downloads its encodings from the network at first use",
    "app": "a learner-local module the lesson assumes exists (content defect)",
}


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
            ch = (json.loads(f.read_text()).get("practice_challenges") or [None])[0]
        except Exception:  # noqa: BLE001 — non-lesson JSON
            continue
        if isinstance(ch, dict):
            for m in _imports(ch.get("starter_code")) | _imports(ch.get("test_code")):
                needed.setdefault(m, []).append(f.stem)
    probe = ("import importlib.util, json, sys; "
             "print(json.dumps([m for m in sys.argv[1:] if importlib.util.find_spec(m) is None]))")
    out = subprocess.run([DOCKER, "exec", CONTAINER, "python", "-c", probe, *sorted(needed)],
                         capture_output=True, text=True, timeout=120)
    missing = set(json.loads(out.stdout.strip().splitlines()[-1])) - set(NOT_PROVIDED)
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
