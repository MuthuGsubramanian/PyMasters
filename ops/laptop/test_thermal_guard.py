"""Thermal guard: whatever pauses heavy work must be able to resume it (python -m pytest ops/laptop)."""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import thermal_guard  # noqa: E402


def _state(pid):
    return open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()[0]


def _wait_state(pid, want, timeout=5):
    deadline = time.time() + timeout
    while _state(pid) != want and time.time() < deadline:
        time.sleep(0.05)
    return _state(pid)


@pytest.fixture
def stopped_sleeper(tmp_path):
    """A SIGSTOPped process listed in a fake cgroup subtree (the 2026-11-03 v1 -> v2 upgrade left one like this)."""
    p = subprocess.Popen(["sleep", "30"])
    os.kill(p.pid, signal.SIGSTOP)
    assert _wait_state(p.pid, "T") == "T"
    leaf = tmp_path / "unit" / "child"
    leaf.mkdir(parents=True)
    (tmp_path / "unit" / "cgroup.procs").write_text("")
    (leaf / "cgroup.procs").write_text(f"{p.pid}\n")
    yield p, tmp_path / "unit"
    p.kill()
    p.wait()


def test_continue_stopped_resumes_sigstopped_processes_in_the_subtree(stopped_sleeper):
    p, cg = stopped_sleeper
    assert thermal_guard.continue_stopped(str(cg)) == 1
    assert _wait_state(p.pid, "S") == "S"


def test_thawing_the_units_also_resumes_sigstopped_processes(stopped_sleeper, monkeypatch):
    # cgroup.freeze = 0 cannot undo a SIGSTOP; resuming must send SIGCONT as well.
    p, cg = stopped_sleeper
    monkeypatch.setattr(thermal_guard, "HEAVY_CGROUPS", [str(cg)])
    thermal_guard.signal_units(signal.SIGCONT)
    assert (cg / "cgroup.freeze").read_text() == "0"
    assert _wait_state(p.pid, "S") == "S"


@pytest.mark.parametrize("temp, frozen", [(95.0, True), (thermal_guard.RESUME_AT + 1, True), (50.0, False)])
def test_a_guard_starting_hot_keeps_heavy_work_frozen(monkeypatch, temp, frozen):
    # 2026-11-03 20:04: a restarted guard thawed everything at 94 C and needed 15 s to pause again (100 C trip).
    calls = []
    monkeypatch.setattr(thermal_guard, "signal_units", lambda sig: calls.append(sig) or 0)
    monkeypatch.setattr(thermal_guard, "log", lambda _m: None)
    monkeypatch.setattr(thermal_guard, "temps", lambda: {"acpitz": temp})
    assert thermal_guard.start_state() is frozen
    assert calls == [signal.SIGSTOP if frozen else signal.SIGCONT]


def test_thaw_works_when_systemctl_hangs(tmp_path, monkeypatch):
    # 2026-11-04 09:30: the guard froze the heavy slice while systemd was spawning a unit into it; systemd blocked
    # (state D), so `systemctl --user show` timed out, the guard could not resolve the cgroup and logged RESUME
    # without thawing — a deadlock that stopped the social bot and every new user service.
    slice_dir = tmp_path / "pymasters-heavy.slice"
    slice_dir.mkdir()
    (slice_dir / "cgroup.freeze").write_text("1")
    (slice_dir / "cgroup.procs").write_text("")
    monkeypatch.setattr(thermal_guard, "HEAVY_CGROUPS", [str(slice_dir)])

    def hang(*_a, **_k):
        raise thermal_guard.subprocess.TimeoutExpired("systemctl", 5)
    monkeypatch.setattr(thermal_guard.subprocess, "run", hang)
    thermal_guard.signal_units(signal.SIGCONT)
    assert (slice_dir / "cgroup.freeze").read_text() == "0"


def test_stopping_the_guard_thaws_heavy_work(monkeypatch):
    calls = []
    monkeypatch.setattr(thermal_guard, "signal_units", lambda sig: calls.append(sig) or 0)
    monkeypatch.setattr(thermal_guard, "log", lambda _m: None)
    with pytest.raises(SystemExit):
        thermal_guard.on_term(signal.SIGTERM, None)
    assert calls == [signal.SIGCONT]
