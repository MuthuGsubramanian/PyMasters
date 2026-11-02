"""Weekly challenges: the names a description tells learners to write must be the names the grader expects.

The grader requires every top-level name in starter_code (routes/challenges.py grade gate) and the tests call
them by those names, so a description naming `TempDirectory()` while the starter defines temp_directory sends
learners into a guaranteed failure.
"""
import ast
import re

from routes.challenges import CHALLENGES


def _starter_names(code: str) -> set:
    names = set()
    for node in ast.walk(ast.parse(code)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
    return names


def test_described_callables_exist_in_the_starter():
    wrong = {}
    for ch in CHALLENGES:
        described = set(re.findall(r"`@?([A-Za-z_][A-Za-z0-9_]*)\(", ch["description"]))
        missing = described - _starter_names(ch["starter_code"])
        if missing:
            wrong[ch["id"]] = sorted(missing)
    assert not wrong, wrong


def test_network_challenges_say_the_grader_is_offline():
    for ch in CHALLENGES:
        if "aiohttp" in ch["description"] or "Fetches multiple URLs" in ch["description"]:
            assert "offline" in ch["description"].lower(), ch["id"]
