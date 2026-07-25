"""
Phase 2 regression: no default admin/admin123 account.

main.py seeded username 'admin' with the hardcoded password 'admin123' whenever
the users table was empty. start.sh can reach an empty DB in production (no GCS
replica, no baked-in seed), so this well-known credential could exist live with
nothing rate-limiting login. The bootstrap account must use a RANDOM password
printed once to stdout — never a known constant.
"""
import importlib
import os
import re
import sqlite3

import pytest
from fastapi import HTTPException


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    return main_mod


def test_admin123_cannot_log_in_after_fresh_seed(m):
    """The core defect: on a fresh empty DB, 'admin'/'admin123' must NOT work."""
    m.init_db()
    with pytest.raises(HTTPException) as exc:
        m.login(m.UserLogin(username="admin", password="admin123"))
    assert exc.value.status_code == 401


def test_bootstrap_admin_uses_random_password_printed_once(m, capsys):
    """A bootstrap admin may still be seeded, but with a random password emitted
    once to stdout. That printed password must actually log in."""
    m.init_db()
    out = capsys.readouterr().out
    match = re.search(r"admin password:\s*(\S+)", out, re.IGNORECASE)
    if match is None:
        # Acceptable alternative: no bootstrap account at all.
        conn = sqlite3.connect(os.environ["DB_PATH"])
        row = conn.execute("SELECT 1 FROM users WHERE username='admin'").fetchone()
        conn.close()
        assert row is None, "an 'admin' row exists but no password was printed to stdout"
        return
    password = match.group(1)
    assert password != "admin123"
    assert len(password) >= 12
    resp = m.login(m.UserLogin(username="admin", password=password))
    assert resp["token"]


def test_bootstrap_password_can_be_supplied_by_env(m, monkeypatch):
    """Ops can pin the bootstrap password deterministically via env instead of
    reading it from logs."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "s3tByOpsSecret!xyz")
    m.init_db()
    resp = m.login(m.UserLogin(username="admin", password="s3tByOpsSecret!xyz"))
    assert resp["token"]
    with pytest.raises(HTTPException):
        m.login(m.UserLogin(username="admin", password="admin123"))
