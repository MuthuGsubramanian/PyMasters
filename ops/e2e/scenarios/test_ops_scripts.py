"""Guardrails on the unattended ops scripts (no container needed).

The repo is public and deploy.yml runs on pull requests, so a fork PR (even from a branch named main) creates
deploy runs whose titles and logs the fork controls. Anything feeding the unattended triage session or the
status email must read push-triggered runs only, and fork-controlled text must never reach the triage prompt.
"""
import re
from pathlib import Path

LAPTOP = Path(__file__).resolve().parents[2] / "laptop"


def test_deploy_run_queries_are_push_only():
    for name in ("e2e_triage.sh", "collect_status.sh"):
        for line in (LAPTOP / name).read_text().splitlines():
            if re.search(r"gh run list\b", line) and "nightly-e2e.yml" not in line:
                assert "-e push" in line, f"{name}: {line.strip()}"


def test_triage_prompt_carries_no_fork_controlled_text():
    src = (LAPTOP / "e2e_triage.sh").read_text()
    assert "displayTitle" not in src
    assert "--log-failed" not in src


def test_triage_session_cannot_push_main_or_bypass_checks():
    src = (LAPTOP / "e2e_triage.sh").read_text()
    for blocked in ("git push origin main", "git push --force", "gh pr merge --admin", "gh api"):
        assert blocked in src.split("--disallowedTools", 1)[-1], blocked
