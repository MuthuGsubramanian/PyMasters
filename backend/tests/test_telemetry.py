"""
Tests for routes/telemetry.py (2026-07-02): presence heartbeat, visit log,
login events with coarse geo, ops_activity — the data behind the Super Admin
Overview telemetry cards. All writes are fail-silent; these tests pin the
happy paths and the schema.
"""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.telemetry import ensure_telemetry_tables, record_login, _is_private


@pytest.fixture()
def db(tmp_path):
    path = str(tmp_path / "t.db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, created_at TIMESTAMP)")
    conn.execute("INSERT INTO users (id) VALUES ('u1')")
    conn.commit()
    conn.close()
    ensure_telemetry_tables(path)
    return path


class _StubRequest:
    """Minimal stand-in for fastapi.Request (headers + client.host)."""
    def __init__(self, forwarded=None, host="127.0.0.1"):
        self.headers = {"x-forwarded-for": forwarded} if forwarded else {}
        self.client = type("C", (), {"host": host})()


def test_ensure_tables_idempotent(db):
    # Second call must be a no-op, not an error.
    ensure_telemetry_tables(db)
    conn = sqlite3.connect(db)
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"site_visits", "login_events", "ops_activity"} <= tables


def test_last_seen_column_added(db):
    conn = sqlite3.connect(db)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    conn.close()
    assert "last_seen_at" in cols


def test_record_login_inserts_event_and_presence(db):
    record_login("u1", _StubRequest(forwarded="203.0.113.9, 10.0.0.1"), db_path=db)
    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT user_id, ip FROM login_events ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    seen = conn.execute("SELECT last_seen_at FROM users WHERE id='u1'").fetchone()[0]
    conn.close()
    # First hop of X-Forwarded-For is the real client on Cloud Run.
    assert row == ("u1", "203.0.113.9")
    assert seen is not None


def test_record_login_never_raises_on_bad_db(tmp_path):
    # Missing tables/db → swallowed, login flow must be unaffected.
    record_login("u1", _StubRequest(), db_path=str(tmp_path / "missing.db"))


def test_private_ips_skip_geo():
    assert _is_private("10.1.2.3") is True
    assert _is_private("127.0.0.1") is True
    # NB: TEST-NET ranges (192.0.2.x etc.) count as private in Python's
    # ipaddress module — use a real public address for the negative case.
    assert _is_private("8.8.8.8") is False
    assert _is_private("not-an-ip") is True  # fail-safe: treat as private
