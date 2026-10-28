"""Founder directives 2026-10-28: one fixed super admin (+ backup), admin sees every game
unlocked, inactive accounts removed after 21 days by a backend job."""
import importlib
import os
import sqlite3
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402


def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "someone@else.com,claude-qa@pymasters.net")   # must be ignored
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("PYMASTERS_JOBS", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    conn = sqlite3.connect(os.environ["DB_PATH"])
    main_mod.init_db()
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) VALUES ('owner','muthu','h','M','Muthu@PyMasters.net', CURRENT_TIMESTAMP, 0)")
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) VALUES ('backup','muthug','h','M','muthu.g.subramanian@gmail.com', CURRENT_TIMESTAMP, 0)")
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) VALUES ('imposter','imp','h','I','someone@else.com', CURRENT_TIMESTAMP, 1)")
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, is_super_admin) VALUES ('qa','claude-qa','h','Q','claude-qa@pymasters.net', CURRENT_TIMESTAMP, 1)")
    conn.commit(); conn.close()
    main_mod.init_db()     # second boot: the resolver runs again on existing rows
    from fastapi.testclient import TestClient
    return main_mod, TestClient(main_mod.app)


def _db():
    c = sqlite3.connect(os.environ["DB_PATH"])
    c.row_factory = sqlite3.Row
    return c


def test_only_the_two_founder_emails_are_super_admin(app):
    rows = {r["id"]: r["is_super_admin"] for r in _db().execute("SELECT id, is_super_admin FROM users").fetchall()}
    assert rows["owner"] == 1 and rows["backup"] == 1
    assert rows["imposter"] == 0 and rows["qa"] == 0
    from routes.admin import SUPER_ADMINS
    assert SUPER_ADMINS == {"muthu@pymasters.net", "muthu.g.subramanian@gmail.com"}


def test_super_admin_sees_every_game_unlocked_without_lessons(app):
    _, client = app
    cat = client.get("/api/arcade/catalog", headers=_headers("owner")).json()
    assert all(g["unlocked"] for g in cat["games"])
    boards = next(g for g in cat["games"] if g["id"] == "snakes_ladders")["boards"]
    assert all(b["unlocked"] for b in boards)
    r = client.post("/api/arcade/session/start", json={"game_id": "big_o_grand_prix"}, headers=_headers("owner"))
    assert r.status_code == 200, r.text
    # nothing is recorded as an "unlock" and nobody is notified for the admin
    assert _db().execute("SELECT COUNT(*) FROM arcade_unlocks WHERE user_id = 'owner'").fetchone()[0] == 0
    assert _db().execute("SELECT COUNT(*) FROM notifications WHERE user_id = 'owner'").fetchone()[0] == 0
    # a normal account is still gated
    cat2 = client.get("/api/arcade/catalog", headers=_headers("imposter")).json()
    assert not any(g["unlocked"] for g in cat2["games"])


def test_lifecycle_defaults_remove_after_21_days_and_spare_paying_and_org_admins(app):
    import lifecycle
    importlib.reload(lifecycle)
    assert lifecycle.INACTIVITY_DAYS + lifecycle.GRACE_DAYS == 21
    assert lifecycle._delete_enabled() is True
    conn = _db()
    old = (datetime.utcnow() - timedelta(days=40)).strftime("%Y-%m-%d %H:%M:%S")
    for uid, email in (("idle", "idle@x.com"), ("orgadmin", "oa@x.com"), ("payer", "pay@x.com")):
        conn.execute("INSERT INTO users (id, username, password_hash, name, email, created_at, last_seen_at) VALUES (?, ?, 'h', 'U', ?, ?, ?)", [uid, uid, email, old, old])
    conn.execute("INSERT INTO organizations (id, name, created_at) VALUES ('o1', 'Org', CURRENT_TIMESTAMP)")
    conn.execute("INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ('o1', 'orgadmin', 'admin', CURRENT_TIMESTAMP)")
    conn.execute("INSERT INTO payments (id, user_id, plan, amount, currency, status, created_at) VALUES ('p1', 'payer', 'pro', 999, 'INR', 'captured', CURRENT_TIMESTAMP)")
    conn.commit(); conn.close()
    # notice pass
    first = lifecycle.run_sweep(os.environ["DB_PATH"], dry_run=False)
    notified = {e["user_id"] for e in first["notified"]}
    assert "idle" in notified and "orgadmin" not in notified and "payer" not in notified and "owner" not in notified
    # grace lapsed → deleted
    later = datetime.utcnow() + timedelta(days=lifecycle.GRACE_DAYS + 1)
    second = lifecycle.run_sweep(os.environ["DB_PATH"], dry_run=False, now=later)
    assert "idle" in {d["user_id"] if isinstance(d, dict) else d for d in second["deleted"]}
    assert _db().execute("SELECT COUNT(*) FROM users WHERE id = 'idle'").fetchone()[0] == 0
    assert _db().execute("SELECT COUNT(*) FROM users WHERE id IN ('payer', 'orgadmin')").fetchone()[0] == 2


def test_job_scheduler_runs_each_job_once_per_window(app, monkeypatch):
    from jobs import scheduler
    calls = []
    monkeypatch.setattr(scheduler, "JOBS", {"demo": {"every": "daily", "at_utc": "00:00", "run": lambda db: calls.append(db) or {"ok": True}}})
    now = datetime(2026, 10, 28, 0, 5)
    scheduler.tick(os.environ["DB_PATH"], now=now)
    scheduler.tick(os.environ["DB_PATH"], now=now + timedelta(minutes=10))
    assert len(calls) == 1
    scheduler.tick(os.environ["DB_PATH"], now=now + timedelta(days=1))
    assert len(calls) == 2
    rows = _db().execute("SELECT job, status FROM job_runs ORDER BY id").fetchall()
    assert [r["status"] for r in rows] == ["ok", "ok"]
