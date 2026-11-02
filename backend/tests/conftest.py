"""Shared test setup."""
import sys

import pytest


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
