"""
Phase 4 regression: the code-execution sandbox must not have network egress.

The Playground runs arbitrary imports server-side. Without egress blocking, student
code can reach the GCP metadata server (169.254.169.254 / metadata.google.internal),
lift the runtime service-account token, and read every secret + the user-DB bucket.

The real control is an OS-level per-child network namespace with no route out
(`unshare --net`), not a Python module blocklist (which is bypassable). These tests
verify (a) the isolation prefix is wired into the child command, and (b) where the
platform can create the namespace, the metadata endpoint is actually unreachable.
"""
import os

import pytest

import vaathiyaar.execution as ex
from vaathiyaar.execution import run_code_subprocess, _net_isolation_prefix, _build_child_command


def _isolation_available():
    try:
        return bool(_net_isolation_prefix())
    except Exception:
        return False


def test_isolation_prefix_is_wired_into_the_child_command(monkeypatch):
    """Whatever the platform's isolation prefix is, run_code_subprocess must run
    the interpreter THROUGH it (prefix first), then `python -I -B <script>`."""
    monkeypatch.setattr(ex, "_net_isolation_prefix", lambda: ("FAKE_UNSHARE", "--net"))
    cmd = _build_child_command("py", "/work/main.py")
    assert cmd[:2] == ["FAKE_UNSHARE", "--net"]
    assert cmd[2:] == ["py", "-I", "-B", "/work/main.py"]


def test_prefix_empty_when_isolation_unavailable(monkeypatch):
    """On Windows (and any platform without a working `unshare --net`) the prefix
    is empty — execution still works, it just isn't network-isolated there."""
    if os.name == "nt":
        assert _net_isolation_prefix() == ()


def test_normal_code_still_runs_with_isolation_wiring():
    """Wiring the prefix must not break ordinary (non-network) execution."""
    r = run_code_subprocess("print(6 * 7)")
    assert r["output"].strip() == "42"


@pytest.mark.skipif(
    not _isolation_available(),
    reason="no per-process network namespace on this platform; see REMEDIATION_LOG Phase 4",
)
def test_metadata_endpoint_is_unreachable_from_sandbox():
    """Where the namespace can be created, a socket connect to the GCP metadata
    server must fail — the token-theft path is closed."""
    code = (
        "import socket\n"
        "s = socket.socket(); s.settimeout(3)\n"
        "try:\n"
        "    s.connect(('169.254.169.254', 80)); print('CONNECTED')\n"
        "except Exception as e:\n"
        "    print('BLOCKED', type(e).__name__)\n"
    )
    r = run_code_subprocess(code, timeout=10)
    assert "CONNECTED" not in r["output"], r
    assert "BLOCKED" in r["output"], r
