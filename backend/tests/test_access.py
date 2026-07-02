"""
Tests for access.py — 7-day individual trial enforcement (2026-07-02 policy).

Individual free-plan users: trial from signup (or FEATURE_EPOCH for older
accounts), expired -> 402 on learning endpoints. Org members, super admins and
admin-assigned plans are exempt. Fail-open on lookup errors.
"""
import os
import sqlite3
import sys
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import access
from access import get_access_status, assert_learning_access, FEATURE_EPOCH


@pytest.fixture()
def db(tmp_path):
    path = str(tmp_path / "a.db")
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE users (
            id TEXT PRIMARY KEY, created_at TIMESTAMP, plan TEXT DEFAULT 'free',
            plan_expires_at TEXT, account_type TEXT DEFAULT 'individual',
            is_super_admin INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE TABLE org_members (org_id TEXT, user_id TEXT, role TEXT)")
    conn.commit()
    conn.close()
    return path


def _add_user(db, uid, created_at, plan="free", plan_expires_at=None,
              account_type="individual", is_super_admin=0):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO users (id, created_at, plan, plan_expires_at, account_type, is_super_admin) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [uid, created_at, plan, plan_expires_at, account_type, is_super_admin],
    )
    conn.commit()
    conn.close()


def _ts(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def test_new_individual_is_on_trial(db):
    _add_user(db, "u1", _ts(datetime.utcnow() - timedelta(days=1)))
    s = get_access_status(db, "u1")
    assert s["status"] == "trial"
    assert 0 <= s["trial_days_left"] <= 7


def test_individual_past_seven_days_expires(db):
    _add_user(db, "u1", _ts(max(FEATURE_EPOCH, datetime.utcnow() - timedelta(days=30))))
    # created 30 days ago (clamped to epoch); if epoch is <7 days ago this is
    # still trial — simulate an old post-epoch account explicitly instead:
    _add_user(db, "u2", _ts(datetime.utcnow() - timedelta(days=10)))
    s = get_access_status(db, "u2")
    if datetime.utcnow() - timedelta(days=10) < FEATURE_EPOCH:
        assert s["status"] in ("trial", "expired")  # epoch clamp applies
    else:
        assert s["status"] == "expired"


def test_pre_epoch_account_grandfathered_from_epoch(db):
    _add_user(db, "old", "2026-04-07 15:23:52")  # months before epoch
    s = get_access_status(db, "old")
    # Clock starts at FEATURE_EPOCH, never retroactive insta-lockout at ship time.
    expected_end = FEATURE_EPOCH + timedelta(days=7)
    if datetime.utcnow() < expected_end:
        assert s["status"] == "trial"
    else:
        assert s["status"] == "expired"


def test_org_member_exempt(db):
    _add_user(db, "u1", "2020-01-01 00:00:00")
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO org_members VALUES ('o1','u1','member')")
    conn.commit(); conn.close()
    assert get_access_status(db, "u1")["status"] == "active"


def test_org_account_type_exempt(db):
    _add_user(db, "u1", "2020-01-01 00:00:00", account_type="organization")
    assert get_access_status(db, "u1")["status"] == "active"


def test_super_admin_exempt(db):
    _add_user(db, "u1", "2020-01-01 00:00:00", is_super_admin=1)
    assert get_access_status(db, "u1")["status"] == "active"


def test_assigned_plan_active_without_expiry(db):
    _add_user(db, "u1", "2020-01-01 00:00:00", plan="pro")
    s = get_access_status(db, "u1")
    assert s["status"] == "active" and s["reason"] == "assigned_plan"


def test_assigned_plan_active_until_future_expiry(db):
    _add_user(db, "u1", "2020-01-01 00:00:00", plan="beginner",
              plan_expires_at=_ts(datetime.utcnow() + timedelta(days=30)))
    assert get_access_status(db, "u1")["status"] == "active"


def test_lapsed_plan_falls_back_to_trial_rules(db):
    _add_user(db, "u1", "2020-01-01 00:00:00", plan="pro",
              plan_expires_at="2021-01-01 00:00:00")
    s = get_access_status(db, "u1")
    # Pre-epoch account → epoch-clamped trial window applies after plan lapse.
    assert s["status"] in ("trial", "expired")


def test_unknown_user_fails_open(db):
    assert get_access_status(db, "ghost")["status"] == "active"


def test_lookup_error_fails_open(tmp_path):
    assert get_access_status(str(tmp_path / "missing-dir" / "x.db"), "u")["status"] == "active"


def test_assert_learning_access_raises_402(db, monkeypatch):
    _add_user(db, "u1", _ts(datetime.utcnow() - timedelta(days=40)))
    monkeypatch.setattr(access, "FEATURE_EPOCH", datetime.utcnow() - timedelta(days=30))
    with pytest.raises(HTTPException) as exc:
        assert_learning_access(db, "u1")
    assert exc.value.status_code == 402


def test_assert_learning_access_allows_trial(db):
    _add_user(db, "u1", _ts(datetime.utcnow()))
    assert_learning_access(db, "u1")  # must not raise
