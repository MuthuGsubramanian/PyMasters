"""
Endpoint-level IDOR regression (2026-07-08): the enterprise curriculum gate on
GET /api/classroom/lessons and GET /api/classroom/lesson/{id} must key off the
JWT-verified identity, NOT the client-supplied `user_id` query param.

Before the fix, an anonymous caller could pass ?user_id=<any org user's id> and
receive the full paid B2B catalog (list) or open any enterprise lesson (detail).
"""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


def _headers(user_id):
    return {"Authorization": f"Bearer {auth_module.create_access_token(user_id)}"}


@pytest.fixture
def client(tmp_path):
    os.environ["DB_PATH"] = str(tmp_path / "test.db")
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    # An organization account (reason == "organization" ⇒ enterprise access).
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, account_type) "
        "VALUES (?, 'orguser', 'hash', 'Org', 'organization')", ["org-1"]
    )
    # A plain individual account (no enterprise access).
    conn.execute(
        "INSERT INTO users (id, username, password_hash, name, account_type) "
        "VALUES (?, 'individual', 'hash', 'Indi', 'individual')", ["ind-1"]
    )
    conn.commit()
    conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _enterprise_tracks_in(lessons):
    from access import ENTERPRISE_TRACKS
    return {l.get("track") for l in lessons if l.get("track") in ENTERPRISE_TRACKS}


def test_list_anonymous_with_forged_org_user_id_gets_no_enterprise(client):
    # Forged param, NO token → enterprise tracks must stay hidden.
    r = client.get("/api/classroom/lessons?user_id=org-1")
    assert r.status_code == 200
    assert _enterprise_tracks_in(r.json()["lessons"]) == set()


def test_list_individual_token_gets_no_enterprise_even_with_forged_param(client):
    # Authenticated as an individual, but forging the org id in the param.
    r = client.get("/api/classroom/lessons?user_id=org-1", headers=_headers("ind-1"))
    assert r.status_code == 200
    assert _enterprise_tracks_in(r.json()["lessons"]) == set()


def test_list_org_token_sees_enterprise(client):
    r = client.get("/api/classroom/lessons", headers=_headers("org-1"))
    assert r.status_code == 200
    assert len(_enterprise_tracks_in(r.json()["lessons"])) > 0


def test_detail_anonymous_forged_param_is_forbidden(client):
    from access import ENTERPRISE_TRACKS
    # Find a served enterprise lesson id via an org token, then hit detail anon.
    listing = client.get("/api/classroom/lessons", headers=_headers("org-1")).json()["lessons"]
    ent = next((l for l in listing if l.get("track") in ENTERPRISE_TRACKS), None)
    assert ent is not None, "no enterprise lesson available to test"
    r = client.get(f"/api/classroom/lesson/{ent['id']}?user_id=org-1")
    assert r.status_code == 403


def test_detail_org_token_allowed(client):
    from access import ENTERPRISE_TRACKS
    listing = client.get("/api/classroom/lessons", headers=_headers("org-1")).json()["lessons"]
    ent = next((l for l in listing if l.get("track") in ENTERPRISE_TRACKS), None)
    assert ent is not None
    r = client.get(f"/api/classroom/lesson/{ent['id']}", headers=_headers("org-1"))
    assert r.status_code == 200
