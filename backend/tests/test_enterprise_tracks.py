"""
Tests for enterprise-track gating (2026-07-02 policy, set by MSG):
the cloud/enterprise-AI curriculum (access.ENTERPRISE_TRACKS) is visible ONLY
to org members, organization accounts, super admins, and users on an unexpired
enterprise plan. Unlike general learning access (fail-open), this gate fails
CLOSED — anonymous callers and lookup errors hide the catalog.
"""
import os
import sqlite3
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from access import ENTERPRISE_TRACKS, has_enterprise_access


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


def _add_user(db, uid, plan="free", plan_expires_at=None,
              account_type="individual", is_super_admin=0):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO users (id, created_at, plan, plan_expires_at, account_type, is_super_admin) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [uid, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), plan,
         plan_expires_at, account_type, is_super_admin],
    )
    conn.commit()
    conn.close()


def _add_org_member(db, uid, org_id="org1"):
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member')",
                 [org_id, uid])
    conn.commit()
    conn.close()


def test_track_set_is_stable():
    # The five org-gated tracks; renaming one silently un-gates its lessons.
    assert ENTERPRISE_TRACKS == {
        "azure_enterprise", "azure_ai_foundry", "aws_enterprise",
        "gcp_vertex_ai", "cross_cloud_architecture", "frontier_ai_platforms",
    }


def test_anonymous_has_no_access(db):
    assert has_enterprise_access(db, None) is False
    assert has_enterprise_access(db, "") is False


def test_individual_trial_user_denied(db):
    _add_user(db, "u1")  # fresh individual on trial — full learning access,
    assert has_enterprise_access(db, "u1") is False  # but no enterprise tracks


def test_pro_plan_denied(db):
    # MSG's call: Pro (₹999) does NOT include enterprise tracks — org only.
    _add_user(db, "u1", plan="pro")
    assert has_enterprise_access(db, "u1") is False


def test_enterprise_plan_allowed(db):
    _add_user(db, "u1", plan="enterprise")
    assert has_enterprise_access(db, "u1") is True


def test_expired_enterprise_plan_denied(db):
    past = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    _add_user(db, "u1", plan="enterprise", plan_expires_at=past)
    assert has_enterprise_access(db, "u1") is False


def test_org_member_allowed(db):
    _add_user(db, "u1")
    _add_org_member(db, "u1")
    assert has_enterprise_access(db, "u1") is True


def test_organization_account_allowed(db):
    _add_user(db, "u1", account_type="organization")
    assert has_enterprise_access(db, "u1") is True


def test_super_admin_allowed(db):
    _add_user(db, "u1", is_super_admin=1)
    assert has_enterprise_access(db, "u1") is True


def test_lookup_error_fails_closed(tmp_path):
    # Nonexistent DB → get_access_status fails open for learning ("active"),
    # but enterprise access must fail CLOSED (reason is lookup_error).
    assert has_enterprise_access(str(tmp_path / "missing.db"), "u1") is False


def test_unknown_user_denied(db):
    assert has_enterprise_access(db, "ghost") is False
