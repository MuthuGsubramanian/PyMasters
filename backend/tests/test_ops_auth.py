"""POST /api/admin/service-login — machine-to-machine super-admin session (2026-10-26)."""

import importlib
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "ops.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "ops-token-abc")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import auth as auth_module
    import routes.admin as admin_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return TestClient(main_mod.app)


def test_wrong_token_is_403(client):
    r = client.post("/api/admin/service-login", json={"token": "nope"})
    assert r.status_code == 403


def test_disabled_when_env_unset(client, monkeypatch):
    monkeypatch.delenv("OPS_ADMIN_TOKEN")
    r = client.post("/api/admin/service-login", json={"token": "ops-token-abc"})
    assert r.status_code == 503


def test_valid_token_yields_super_admin_session(client):
    r = client.post("/api/admin/service-login", json={"token": "ops-token-abc"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    assert r.json()["username"] == "claude-qa"
    # The session passes the real super-admin gate.
    chk = client.get("/api/admin/check", headers={"Authorization": f"Bearer {tok}"})
    assert chk.status_code == 200, chk.text
    # Idempotent: second login reuses the same account.
    r2 = client.post("/api/admin/service-login", json={"token": "ops-token-abc"})
    assert r2.json()["user_id"] == r.json()["user_id"]


def test_service_account_cannot_be_registered_by_public(client):
    r = client.post("/api/auth/register", json={"username": "claude-qa", "email": "claude-qa@pymasters.net",
                                                 "password": "Whatever123!x"})
    assert r.status_code in (400, 403, 409, 422)


def test_service_account_creation_race_is_safe(client, monkeypatch):
    """Two first-ever service logins at once (found by the parallel scenario suite, 2026-11-03): the loser of
    the INSERT race must reuse the winner's row, not crash with a UNIQUE constraint error (500)."""
    import sqlite3
    import routes.ops_auth as ops
    client.post("/api/admin/service-login", json={"token": "ops-token-abc"})   # the "winner" creates claude-qa

    class LosingRace:
        """Wraps a connection so the first lookup misses, as it does for the request that lost the race."""
        def __init__(self, conn):
            self._c, self._missed = conn, False

        def execute(self, sql, *a):
            cur = self._c.execute(sql, *a)
            if not self._missed and sql.lstrip().upper().startswith("SELECT") and "FROM USERS" in sql.upper():
                self._missed = True
                cur.fetchall()
                return self._c.execute("SELECT 1 WHERE 0")
            return cur

        def __getattr__(self, name):
            return getattr(self._c, name)

        def __setattr__(self, name, value):
            if name in ("_c", "_missed"):
                object.__setattr__(self, name, value)
            else:
                setattr(self._c, name, value)       # e.g. row_factory must reach the real connection

    real_connect = sqlite3.connect
    monkeypatch.setattr(ops.sqlite3, "connect", lambda *a, **k: LosingRace(real_connect(*a, **k)))
    r = client.post("/api/admin/service-login", json={"token": "ops-token-abc"})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "claude-qa"
