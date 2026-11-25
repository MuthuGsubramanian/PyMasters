"""Shared test setup."""
import os
import sys

import pytest


@pytest.fixture(autouse=True)
def _block_live_smtp(monkeypatch):
    """Never send real SMTP emails during pytest runs (prevents bounces to example.com/x.edu)."""
    for var in ("SMTP_USER", "SMTP_PASS", "SMTP_BACKUP_USER", "SMTP_BACKUP_PASS"):
        monkeypatch.delenv(var, raising=False)
    mod = sys.modules.get("notifications.email_sender")
    if mod is not None:
        for attr in ("SMTP_USER", "SMTP_PASS", "SMTP_BACKUP_USER", "SMTP_BACKUP_PASS"):
            monkeypatch.setattr(mod, attr, "", raising=False)
        monkeypatch.setattr(mod, "_smtp_send", lambda *a, **kw: None, raising=False)
    yield


@pytest.fixture(autouse=True)
def _reset_service_login_limits():
    """The service-login limiters live at module level; clear them so one test's calls don't throttle another."""
    mod = sys.modules.get("routes.ops_auth")
    if mod is not None:
        for name in ("SERVICE_LOGIN_PER_IP", "SERVICE_LOGIN_FAILURES"):
            lim = getattr(mod, name, None)
            if lim is not None:
                lim._calls.clear()
    yield
