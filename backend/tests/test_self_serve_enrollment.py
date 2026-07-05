"""
test_self_serve_enrollment.py — locks the "self-sustained onboarding" contracts.

The portal must onboard new individuals and new organizations with ZERO
super-admin intervention (MSG, 2026-07-05). These tests pin the invariants that
make that true so a future refactor can't silently reintroduce a manual step:

  1. Any authenticated user can self-create an organization and becomes its
     super_admin (no allowlist, no admin approval).
  2. An org member seated via the invite→join flow gets full learning access
     immediately, with NO assigned plan (reason == "organization").
  3. account_type=="organization" accounts are access-exempt on their own.
  4. A brand-new individual is on trial (self-serve), not locked out.

If any of these break, onboarding is no longer hands-off — fail the deploy.
"""
import os
import sqlite3
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from access import get_access_status
import routes.organizations as orgmod
from routes.organizations import (
    create_org, invite_member, join_org,
    CreateOrgRequest, InviteRequest, JoinOrgRequest,
)


def _make_db(tmp_path):
    path = str(tmp_path / "enroll.db")
    conn = sqlite3.connect(path)
    conn.execute(
        """CREATE TABLE users (
            id TEXT PRIMARY KEY, username TEXT, email TEXT, name TEXT,
            points INTEGER DEFAULT 0, linkedin_url TEXT, github_url TEXT,
            created_at TIMESTAMP, plan TEXT DEFAULT 'free', plan_expires_at TEXT,
            account_type TEXT DEFAULT 'individual', is_super_admin INTEGER DEFAULT 0
        )"""
    )
    conn.execute(
        """CREATE TABLE organizations (
            id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'other',
            domain TEXT DEFAULT '', logo_url TEXT DEFAULT '', description TEXT DEFAULT '',
            settings TEXT DEFAULT '{}', plan TEXT DEFAULT 'free',
            created_at TIMESTAMP, updated_at TIMESTAMP
        )"""
    )
    conn.execute(
        "CREATE TABLE org_members (org_id TEXT, user_id TEXT, role TEXT DEFAULT 'member', "
        "department TEXT DEFAULT '', joined_at TIMESTAMP, invited_by TEXT DEFAULT '', "
        "PRIMARY KEY (org_id, user_id))"
    )
    conn.execute(
        "CREATE TABLE org_invites (id TEXT PRIMARY KEY, org_id TEXT, email TEXT, role TEXT, "
        "token TEXT, created_at TEXT, expires_at TEXT, used INTEGER DEFAULT 0, used_by TEXT)"
    )
    conn.commit()
    conn.close()
    return path


def _add_user(path, uid, account_type="individual", created_at=None):
    conn = sqlite3.connect(path)
    conn.execute(
        "INSERT INTO users (id, username, email, created_at, account_type) VALUES (?,?,?,?,?)",
        [uid, uid, f"{uid}@example.com",
         created_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), account_type],
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def db(tmp_path, monkeypatch):
    path = _make_db(tmp_path)
    # Org routes read a module-global DB_PATH; point it at the temp DB.
    monkeypatch.setattr(orgmod, "DB_PATH", path)
    return path


def test_any_user_can_self_create_org_as_super_admin(db):
    _add_user(db, "founder")
    res = create_org(
        CreateOrgRequest(name="Acme University", type="university", user_id="ignored"),
        caller="founder",
    )
    assert res["role"] == "super_admin"
    assert res["name"] == "Acme University"
    # Self-creating an org grants org-level access with no assigned plan.
    assert get_access_status(db, "founder")["reason"] == "organization"


def test_invited_member_gets_org_access_without_a_plan(db):
    _add_user(db, "founder")
    org = create_org(CreateOrgRequest(name="Acme", user_id="x"), caller="founder")
    _add_user(db, "learner")
    inv = invite_member(
        org["id"], InviteRequest(email="learner@example.com", role="member", user_id="x"),
        caller="founder",
    )
    joined = join_org(inv["token"], JoinOrgRequest(user_id="x"), caller="learner")
    assert joined["joined"] is True
    s = get_access_status(db, "learner")
    assert s["status"] == "active" and s["reason"] == "organization"


def test_organization_account_type_is_exempt(db):
    _add_user(db, "orgacct", account_type="organization")
    assert get_access_status(db, "orgacct")["reason"] == "organization"


def test_new_individual_is_on_self_serve_trial(db):
    _add_user(db, "newbie", created_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    s = get_access_status(db, "newbie")
    # Brand-new individual onboards straight into the trial — never pre-locked.
    assert s["status"] == "trial"
