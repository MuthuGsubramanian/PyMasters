"""A program the OS kills (OOM killer, hard resource limit) must not come back as a silent failure.

2026-11-04: the CI deploy gate saw /classroom/evaluate return success=false with output "" and error "" for a
known-correct solution: the sandboxed process was killed by a signal (memory pressure under parallel tests),
which writes nothing to stdout/stderr. A learner on the 1 GB VM would see a failed run with no explanation.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar.execution import run_code_subprocess  # noqa: E402

pytestmark = pytest.mark.skipif(os.name == "nt", reason="POSIX signals")


def test_a_program_killed_by_a_signal_gets_an_explanation():
    r = run_code_subprocess("import os, signal\nos.kill(os.getpid(), signal.SIGKILL)\n")
    assert r["exit_code"] != 0
    assert r["error"].strip(), "killed run returned no explanation"
    assert "stopped" in r["error"].lower()


def test_a_normal_failure_keeps_its_own_traceback():
    r = run_code_subprocess("raise ValueError('boom')\n")
    assert "ValueError: boom" in r["error"]
    assert "stopped" not in r["error"].lower()


def test_a_successful_run_is_unchanged():
    r = run_code_subprocess("print('ok')\n")
    assert r["exit_code"] == 0 and r["output"].strip() == "ok" and r["error"] == ""
