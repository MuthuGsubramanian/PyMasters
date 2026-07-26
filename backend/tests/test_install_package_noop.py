"""
Phase 6 regression: /install-package must not mutate the live interpreter.

The endpoint ran `pip install <pkg>` into the serving container: heavy wheels
(torch/tensorflow) blow the 1Gi/60s limits, a resolver-driven downgrade of
pydantic/fastapi can break the app on next import, and installs vanish on
revision restart so behaviour drifts by instance age. It must instead report
what is already available in the baked image, without ever shelling out to pip.
"""
import subprocess

import pytest

import routes.playground as pg


@pytest.fixture(autouse=True)
def _forbid_pip(monkeypatch):
    """Any attempt to shell out during install-package is a regression."""
    def _boom(*a, **k):
        raise AssertionError(f"install-package shelled out: {a!r}")
    monkeypatch.setattr(subprocess, "run", _boom)
    monkeypatch.setattr(subprocess, "Popen", _boom)


def test_available_package_reports_available_without_pip():
    # fastapi is a hard dependency, so it is always importable in the runtime.
    r = pg.install_package({"package": "fastapi"}, user_id="u-avail")
    assert r["success"] is True
    assert r.get("already_available") is True


def test_unlisted_package_is_rejected_without_pip():
    r = pg.install_package({"package": "totally-not-allowed-xyz"}, user_id="u-unlisted")
    assert r["success"] is False
    assert "allowed" in r


def test_allowlisted_but_unbundled_package_does_not_install():
    # tensorflow is allowlisted but not bundled in the image; must NOT try to install.
    r = pg.install_package({"package": "tensorflow"}, user_id="u-heavy")
    assert r["success"] is False
    assert r.get("installed") is False


def test_empty_package_name_rejected():
    r = pg.install_package({"package": "   "}, user_id="u-empty")
    assert r["success"] is False
