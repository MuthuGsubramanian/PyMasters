"""Security review 2026-11-03, L5 and L12 (2026-11-05).

L5: /api/auth/register accepted any non-empty password (even "a"); change/reset required only 6 characters.
    New passwords now need at least 8 characters. Existing accounts keep working.
L12: production allowed http://localhost origins in CORS with credentials, so a page served from a visitor's own
    machine could make credentialed calls to the API. Production now allows only https://pymasters.net (+ www).
"""
import importlib

import pytest


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("PYMASTERS_ENV", raising=False)
    import main as m
    importlib.reload(m)
    m.init_db()
    from fastapi.testclient import TestClient
    return TestClient(m.app), m


def test_register_refuses_a_password_shorter_than_8(env):
    client, _ = env
    r = client.post("/api/auth/register", json={"username": "shorty", "password": "abc1234"})
    assert r.status_code == 422
    assert "8 characters" in r.json()["detail"]
    ok = client.post("/api/auth/register", json={"username": "longer", "password": "abcd1234"})
    assert ok.status_code == 200, ok.text


@pytest.mark.parametrize("path,body", [
    ("/api/auth/change-password", {"current_password": "x", "new_password": "1234567"}),
    ("/api/auth/reset-password", {"token": "t", "new_password": "1234567"}),
])
def test_new_passwords_need_8_characters(env, path, body):
    client, m = env
    reg = client.post("/api/auth/register", json={"username": "owner1", "password": "abcd1234"})
    headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    r = client.post(path, json=body, headers=headers)
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"]


def test_production_cors_allows_only_the_https_site():
    import main as m
    prod = m.cors_origins(production=True)
    assert set(prod) == {"https://pymasters.net", "https://www.pymasters.net"}
    dev = m.cors_origins(production=False)
    assert "http://localhost:5173" in dev and "https://pymasters.net" in dev
