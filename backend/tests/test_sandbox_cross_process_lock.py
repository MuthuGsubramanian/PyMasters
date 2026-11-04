"""One sandbox run at a time across PROCESSES, not just threads (2026-11-05).

After every run the sandbox kills all processes of the sandbox uid. A second process using the sandbox in the
same container (ops/e2e verify.py next to the API, in CI) therefore killed the API's runs mid-way; a cut-off
harness probe then graded a correct practice answer "runner busy" (PR #262 CI). A file lock serializes them.
"""
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar import execution  # noqa: E402

HOLD = ("import fcntl, sys, time\n"
        "f = open(sys.argv[1], 'a')\n"
        "fcntl.flock(f, fcntl.LOCK_EX)\n"
        "print('locked', flush=True)\n"
        "time.sleep(float(sys.argv[2]))\n")


@pytest.mark.skipif(os.name == "nt", reason="POSIX file locks")
def test_a_run_waits_for_another_process_holding_the_sandbox(tmp_path, monkeypatch):
    lock = tmp_path / "sandbox.lock"
    monkeypatch.setattr(execution, "SANDBOX_LOCK_PATH", str(lock), raising=False)
    monkeypatch.setattr(execution, "RUN_QUEUE_WAIT_S", 0.5)
    holder = subprocess.Popen([sys.executable, "-c", HOLD, str(lock), "3"], stdout=subprocess.PIPE, text=True)
    try:
        assert holder.stdout.readline().strip() == "locked"
        busy = execution.run_code_subprocess("print('hi')\n")
        assert busy["exit_code"] != 0 and "busy" in busy["error"], busy
    finally:
        holder.kill()
        holder.wait()
    ok = execution.run_code_subprocess("print('hi')\n")
    assert ok["exit_code"] == 0 and ok["output"].strip() == "hi", ok
