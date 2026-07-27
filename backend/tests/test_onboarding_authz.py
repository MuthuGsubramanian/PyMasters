"""
Onboarding endpoints must require authentication and only ever write the
CALLER's own account. Regression for the pre-2026-07-27 hole where
/api/profile/onboarding and /onboarding/org took no JWT and trusted a
client-supplied user_id (cross-user / cross-org tampering, unauthenticated).
"""
import importlib
import os
import sqlite3
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import routes.admin as admin_mod
    import routes.profile as profile_mod
    import routes.organizations as org_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(profile_mod)
    importlib.reload(org_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client, account_type="individual", org_name=None):
    username = f"u{uuid.uuid4().hex[:10]}"
    body = {"username": username, "password": "pw123456", "name": "T",
            "email": f"{username}@example.com", "account_type": account_type}
    if org_name:
        body["organization_name"] = org_name
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _onboarding_body(user_id):
    return {
        "user_id": user_id, "motivation": "x", "prior_experience": "none",
        "known_languages": ["python"], "learning_style": "visual", "goal": "job",
        "time_commitment": "daily", "preferred_language": "en",
    }


def test_onboarding_requires_auth(client):
    victim = _register(client)
    # No token at all -> 401, victim's onboarding untouched
    assert client.post("/api/profile/onboarding", json=_onboarding_body(victim["id"])).status_code == 401


def test_onboarding_cannot_target_another_user(client):
    victim = _register(client)
    attacker = _register(client)
    # Attacker authenticated but supplies the victim's user_id in the body:
    # the write is silently redirected to the attacker (caller), victim untouched.
    r = client.post("/api/profile/onboarding", json=_onboarding_body(victim["id"]),
                    headers=_auth(attacker))
    assert r.status_code == 200
    conn = sqlite3.connect(os.environ["DB_PATH"])
    v_done = conn.execute("SELECT onboarding_completed FROM users WHERE id = ?", [victim["id"]]).fetchone()[0]
    a_done = conn.execute("SELECT onboarding_completed FROM users WHERE id = ?", [attacker["id"]]).fetchone()[0]
    conn.close()
    assert v_done == 0          # victim NOT flipped
    assert a_done == 1          # attacker's own onboarding completed


def test_org_onboarding_requires_auth(client):
    admin = _register(client, account_type="organization", org_name="Test School")
    body = {"user_id": admin["id"], "preferred_language": "en", "org_size": "50",
            "learner_profile": "students", "skill_level": "beginner",
            "learning_focus": "python", "structure_preference": "guided"}
    # Unauthenticated -> 401; the org profile must not be writable anonymously.
    assert client.post("/api/profile/onboarding/org", json=body).status_code == 401


def test_org_onboarding_cannot_write_another_orgs_profile(client):
    victim_admin = _register(client, account_type="organization", org_name="Victim School")
    attacker = _register(client)  # plain individual, no org
    body = {"user_id": victim_admin["id"], "preferred_language": "en", "org_size": "999",
            "learner_profile": "TAMPERED", "skill_level": "x",
            "learning_focus": "x", "structure_preference": "x"}
    # Attacker supplies victim admin's id; caller override means the attacker
    # (not an org admin) writes only their own onboarding — victim org profile
    # is never touched.
    r = client.post("/api/profile/onboarding/org", json=body, headers=_auth(attacker))
    assert r.status_code == 200
    assert r.json().get("org_profile_saved") is False
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute(
        "SELECT learner_profile FROM org_profiles op "
        "JOIN org_members om ON om.org_id = op.org_id "
        "WHERE om.user_id = ?", [victim_admin["id"]]).fetchone()
    conn.close()
    assert row is None or row[0] != "TAMPERED"


def test_org_admin_can_still_onboard_own_org(client):
    admin = _register(client, account_type="organization", org_name="Real School")
    body = {"user_id": admin["id"], "preferred_language": "en", "org_size": "50",
            "learner_profile": "undergrads", "skill_level": "beginner",
            "learning_focus": "python", "structure_preference": "guided"}
    r = client.post("/api/profile/onboarding/org", json=body, headers=_auth(admin))
    assert r.status_code == 200 and r.json()["org_profile_saved"] is True
    conn = sqlite3.connect(os.environ["DB_PATH"])
    row = conn.execute(
        "SELECT learner_profile FROM org_profiles op "
        "JOIN org_members om ON om.org_id = op.org_id "
        "WHERE om.user_id = ?", [admin["id"]]).fetchone()
    conn.close()
    assert row and row[0] == "undergrads"


def test_create_org_rate_limited(client):
    user = _register(client)
    for i in range(5):
        r = client.post("/api/org", json={"name": f"Org {i}", "user_id": user["id"]}, headers=_auth(user))
        assert r.status_code == 200, r.text
    # 6th within the window -> 429
    assert client.post("/api/org", json={"name": "Org 6", "user_id": user["id"]},
                       headers=_auth(user)).status_code == 429
