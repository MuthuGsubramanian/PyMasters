"""
Regression tests: /api/graph endpoints must be authenticated and IDOR-guarded.

Before 2026-07-02, /api/graph/user-map/{user_id}, /recommendations/{user_id}
and /gaps/{user_id}/{target} were completely unauthenticated, letting anyone
read any user's mastery levels, knowledge map, and learning gaps. These tests
pin the fix: no token -> 401; someone else's user_id -> 403; own user_id is
allowed through the guard.
"""
import os
import sys

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module
from routes.graph import router as graph_router, _require_self


@pytest.fixture()
def client(monkeypatch):
    # Token-version lookup normally hits the users table; the routing/guard
    # behaviour under test is independent of that, so pin it to 0.
    monkeypatch.setattr(auth_module, "_current_token_version", lambda sub: 0)
    app = FastAPI()
    app.include_router(graph_router)
    return TestClient(app)


def _token_for(user_id: str) -> str:
    return auth_module.create_access_token(user_id)


USER_ENDPOINTS = [
    "/api/graph/user-map/{uid}",
    "/api/graph/recommendations/{uid}",
    "/api/graph/gaps/{uid}/variables",
]


@pytest.mark.parametrize("template", USER_ENDPOINTS)
def test_user_endpoints_reject_anonymous(client, template):
    resp = client.get(template.format(uid="victim-user"))
    assert resp.status_code == 401


@pytest.mark.parametrize("template", USER_ENDPOINTS)
def test_user_endpoints_reject_cross_user(client, template):
    token = _token_for("attacker-user")
    resp = client.get(
        template.format(uid="victim-user"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_concepts_require_auth(client):
    assert client.get("/api/graph/concepts").status_code == 401


def test_require_self_allows_own_id():
    _require_self("u1", "u1")  # must not raise


def test_require_self_blocks_other_id():
    with pytest.raises(HTTPException) as exc:
        _require_self("u1", "u2")
    assert exc.value.status_code == 403
