"""
Playground saved files: authenticated CRUD scoped to the owner; other users
get 404 (not 403) so file ids aren't revealed; per-user cap returns 409;
oversized code returns 413.
"""
import importlib
import os
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
    import routes.playground_files as pf_mod
    importlib.reload(auth_module)
    importlib.reload(pf_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client):
    username = f"u{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={
        "username": username, "password": "pw123456", "name": "Learner",
        "email": f"{username}@example.com",
    })
    assert r.status_code == 200, r.text
    return r.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def test_crud_and_ownership(client):
    user = _register(client)

    # Create
    r = client.post("/api/playground/files",
                    json={"name": "fib.py", "code": "print('fib')"}, headers=_auth(user))
    assert r.status_code == 200, r.text
    f = r.json()["file"]
    assert f["name"] == "fib.py" and f["size"] == len("print('fib')")

    # List (metadata only, no code)
    lst = client.get("/api/playground/files", headers=_auth(user)).json()
    assert len(lst["files"]) == 1 and "code" not in lst["files"][0]

    # Get full file
    got = client.get(f"/api/playground/files/{f['id']}", headers=_auth(user)).json()["file"]
    assert got["code"] == "print('fib')"

    # Update code, then rename
    up = client.put(f"/api/playground/files/{f['id']}",
                    json={"code": "print('v2')"}, headers=_auth(user))
    assert up.status_code == 200 and up.json()["file"]["size"] == len("print('v2')")
    rn = client.put(f"/api/playground/files/{f['id']}",
                    json={"name": "fibonacci.py"}, headers=_auth(user))
    assert rn.status_code == 200 and rn.json()["file"]["name"] == "fibonacci.py"

    # Another user can't see, read, modify or delete it — always 404
    other = _register(client)
    assert client.get("/api/playground/files", headers=_auth(other)).json()["files"] == []
    assert client.get(f"/api/playground/files/{f['id']}", headers=_auth(other)).status_code == 404
    assert client.put(f"/api/playground/files/{f['id']}",
                      json={"code": "hacked"}, headers=_auth(other)).status_code == 404
    assert client.delete(f"/api/playground/files/{f['id']}", headers=_auth(other)).status_code == 404
    # Owner's content untouched
    still = client.get(f"/api/playground/files/{f['id']}", headers=_auth(user)).json()["file"]
    assert still["code"] == "print('v2')"

    # Delete
    assert client.delete(f"/api/playground/files/{f['id']}", headers=_auth(user)).status_code == 200
    assert client.get(f"/api/playground/files/{f['id']}", headers=_auth(user)).status_code == 404
    assert client.get("/api/playground/files", headers=_auth(user)).json()["files"] == []


def test_validation(client):
    user = _register(client)
    # Empty / whitespace name
    assert client.post("/api/playground/files",
                       json={"name": "   ", "code": "x"}, headers=_auth(user)).status_code == 422
    # Oversized code
    big = "x" * 100_001
    assert client.post("/api/playground/files",
                       json={"name": "big.py", "code": big}, headers=_auth(user)).status_code == 413
    # Empty update
    r = client.post("/api/playground/files", json={"name": "a.py"}, headers=_auth(user))
    fid = r.json()["file"]["id"]
    assert client.put(f"/api/playground/files/{fid}", json={},
                      headers=_auth(user)).status_code == 422
    # No auth
    assert client.get("/api/playground/files").status_code == 401
    assert client.post("/api/playground/files", json={"name": "x.py"}).status_code == 401


def test_file_cap(client, monkeypatch):
    import routes.playground_files as pf_mod
    monkeypatch.setattr(pf_mod, "MAX_FILES_PER_USER", 3)
    user = _register(client)
    for i in range(3):
        assert client.post("/api/playground/files",
                           json={"name": f"f{i}.py", "code": "pass"},
                           headers=_auth(user)).status_code == 200
    assert client.post("/api/playground/files",
                       json={"name": "overflow.py", "code": "pass"},
                       headers=_auth(user)).status_code == 409
    # Deleting one frees a slot
    fid = client.get("/api/playground/files", headers=_auth(user)).json()["files"][0]["id"]
    client.delete(f"/api/playground/files/{fid}", headers=_auth(user))
    assert client.post("/api/playground/files",
                       json={"name": "overflow.py", "code": "pass"},
                       headers=_auth(user)).status_code == 200
