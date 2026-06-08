"""
Security and behavior tests for the student code-execution sandbox.

The sandbox is the single most security-sensitive surface in the product:
arbitrary student code runs server-side. These tests pin down the guarantees.
"""
import os
import sys
import textwrap

import pytest

from vaathiyaar.execution import run_code_subprocess, check_code_safety

POSIX = os.name != "nt"


# ── Executor: must not leak the parent process environment (secrets) ────────

def test_subprocess_does_not_inherit_parent_secrets(monkeypatch):
    """A student printing os.environ must not see server secrets."""
    monkeypatch.setenv("PYMASTERS_FAKE_SECRET", "topsecret-do-not-leak-123")
    code = "import os; print(os.environ.get('PYMASTERS_FAKE_SECRET', 'ABSENT'))"

    result = run_code_subprocess(code)

    assert "topsecret-do-not-leak-123" not in result["output"]
    assert "ABSENT" in result["output"]


def test_subprocess_environ_is_minimal(monkeypatch):
    """The child env should be a tiny allowlist, not the full parent env."""
    monkeypatch.setenv("JWT_SECRET", "super-secret-signing-key")
    monkeypatch.setenv("OLLAMA_API_KEY", "ollama-key-leak")
    code = "import os; print('||'.join(sorted(os.environ.keys())))"

    result = run_code_subprocess(code)

    assert "JWT_SECRET" not in result["output"]
    assert "OLLAMA_API_KEY" not in result["output"]


# ── Executor: legitimate code still works ───────────────────────────────────

def test_runs_simple_program():
    result = run_code_subprocess("print(2 + 2)")
    assert result["output"].strip() == "4"
    assert result["exit_code"] == 0
    assert result["error"] == ""


def test_runs_program_with_allowed_imports():
    """Playground is intentionally permissive: math/json imports must work."""
    code = "import math, json; print(json.dumps({'r': round(math.pi, 2)}))"
    result = run_code_subprocess(code)
    assert '"r": 3.14' in result["output"]
    assert result["exit_code"] == 0


def test_captures_runtime_error():
    result = run_code_subprocess("raise ValueError('boom')")
    assert result["exit_code"] != 0
    assert "ValueError" in result["error"]
    assert "boom" in result["error"]


# ── Executor: timeout + resource bounds ─────────────────────────────────────

def test_infinite_loop_times_out():
    result = run_code_subprocess("while True:\n    pass", timeout=2)
    assert result["exit_code"] != 0
    assert "tim" in result["error"].lower()  # "timed out" / "timeout"


def test_relative_file_write_does_not_touch_cwd():
    """File ops must land in an isolated, auto-cleaned sandbox dir."""
    marker = "pm_marker_should_not_exist.txt"
    if os.path.exists(marker):
        os.remove(marker)
    run_code_subprocess(f"open({marker!r}, 'w').write('hi')")
    assert not os.path.exists(marker)


@pytest.mark.skipif(not POSIX, reason="resource limits are POSIX-only")
def test_memory_bomb_is_capped():
    """A giant allocation must be killed by RLIMIT_AS, not OOM the host."""
    code = "x = bytearray(2 * 1024 * 1024 * 1024)  # 2 GiB\nprint(len(x))"
    result = run_code_subprocess(code, timeout=10)
    assert result["exit_code"] != 0
    assert "2147483648" not in result["output"]


# ── check_code_safety: AST-based, robust to substring tricks ────────────────

def test_safety_blocks_os_import():
    assert check_code_safety("import os\nos.getcwd()") is not None


def test_safety_blocks_dunder_subclasses_escape():
    """The classic sandbox escape via __subclasses__ must be caught."""
    code = "().__class__.__bases__[0].__subclasses__()"
    assert check_code_safety(code) is not None


def test_safety_blocks_eval_and_exec_builtins():
    assert check_code_safety("eval('1+1')") is not None
    assert check_code_safety("exec('x=1')") is not None


def test_safety_blocks_dunder_import():
    assert check_code_safety("__import__('os').system('ls')") is not None


def test_safety_allows_normal_learning_code():
    code = textwrap.dedent("""
        total = 0
        for i in range(5):
            total += i
        print(total)
    """)
    assert check_code_safety(code) is None


def test_safety_does_not_false_positive_on_substrings():
    """Old substring matcher flagged any 'open(' — a user fn named reopen() is fine."""
    code = textwrap.dedent("""
        def reopen(value):
            return value * 2
        print(reopen(21))
    """)
    assert check_code_safety(code) is None


def test_safety_passes_through_syntax_errors():
    """Unparseable code is safe to pass through: the same interpreter that
    couldn't parse it here also can't run it, so it fails harmlessly with a
    real SyntaxError rather than a misleading 'forbidden operation' message."""
    assert check_code_safety("def (:\n  pass") is None
