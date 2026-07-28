"""
Phase 2 regression: no default admin/admin123 account.

main.py seeded username 'admin' with the hardcoded password 'admin123' whenever
the users table was empty. start.sh can reach an empty DB in production (no GCS
replica, no baked-in seed), so this well-known credential could exist live with
nothing rate-limiting login. The bootstrap account must use a RANDOM password —
never a known constant.

2026-07-27 hardening: the random password is NO LONGER printed to stdout (Cloud
Run captures stdout into Cloud Logging, exposing the credential). It's either
unrecoverable-random (owner signs in via SUPER_ADMIN_EMAILS / forgot-password)
or pinned deterministically via BOOTSTRAP_ADMIN_PASSWORD.
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


def test_bootstrap_admin_uses_random_unlogged_password(m, capsys):
    """A bootstrap admin may be seeded with a RANDOM password that is NOT logged.
    The plaintext credential must never appear on stdout (→ Cloud Logging), and
    the well-known 'admin123' must not work."""
    m.init_db()
    out = capsys.readouterr().out
    # The credential must NOT be printed. Old code logged "admin password: <pw>".
    assert not re.search(r"admin password:\s*\S+", out, re.IGNORECASE), \
        "bootstrap password must not be printed to stdout (Cloud Logging exposure)"
    # A bootstrap admin row may exist, but its password is unrecoverable-random.
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute("SELECT 1 FROM users WHERE username='admin'").fetchone()
    conn.close()
    # Either no admin account, or one whose default constant does not work.
    if row is not None:
        with pytest.raises(HTTPException) as exc:
            m.login(m.UserLogin(username="admin", password="admin123"))
        assert exc.value.status_code == 401


def test_bootstrap_password_can_be_supplied_by_env(m, monkeypatch):
    """Ops can pin the bootstrap password deterministically via env instead of
    reading it from logs."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "s3tByOpsSecret!xyz")
    m.init_db()
    resp = m.login(m.UserLogin(username="admin", password="s3tByOpsSecret!xyz"))
    assert resp["token"]
    with pytest.raises(HTTPException):
        m.login(m.UserLogin(username="admin", password="admin123"))
