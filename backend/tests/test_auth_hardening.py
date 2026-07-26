"""
Phase 5 regression: authentication hardening.

- CORS: the wildcard "*" origin was listed alongside explicit origins with
  allow_credentials=True, so Starlette echoed ANY caller's Origin. A credentialed
  cross-origin request from an unlisted origin must now be rejected.
- Rate limiting: /api/auth/login, /register and /forgot-password were unlimited.
  They are now IP-throttled, and repeated login failures lock a single username.
"""
import importlib
import os

import pytest


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as m
    importlib.reload(m)
    m.init_db()
    from fastapi.testclient import TestClient
    return TestClient(m.app), m


# --- CORS --------------------------------------------------------------------

def test_cors_does_not_echo_unlisted_origin(env):
    client, _ = env
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    acao = r.headers.get("access-control-allow-origin")
    assert acao != "https://evil.example"
    assert acao != "*"


def test_cors_allows_listed_origin(env):
    client, _ = env
    r = client.get("/api/health", headers={"Origin": "https://pymasters.net"})
    assert r.headers.get("access-control-allow-origin") == "https://pymasters.net"


# --- Rate limiting -----------------------------------------------------------

def test_forgot_password_is_ip_rate_limited(env):
    client, _ = env
    codes = [client.post("/api/auth/forgot-password", json={"identifier": "x"}).status_code
             for _ in range(12)]
    assert 429 in codes, codes
    assert codes.count(200) <= 6  # generous headroom above the configured limit


def test_register_is_ip_rate_limited(env):
    client, _ = env
    codes = []
    for i in range(12):
        r = client.post("/api/auth/register",
                        json={"username": f"user{i}", "password": "hunter22pw"})
        codes.append(r.status_code)
    assert 429 in codes, codes


def test_repeated_login_failures_lock_the_username(env):
    client, m = env
    # Seed a real user so the account exists (lockout must not depend on that).
    m.register(m.UserRegister(username="victim", password="correct-horse-pw"))
    seen = []
    for _ in range(8):
        r = client.post("/api/auth/login", json={"username": "victim", "password": "wrong"})
        seen.append(r.status_code)
    assert 401 in seen  # early attempts are ordinary auth failures
    assert 429 in seen  # later attempts are locked out
    # The lockout must be by username: even the CORRECT password is now refused.
    r = client.post("/api/auth/login", json={"username": "victim", "password": "correct-horse-pw"})
    assert r.status_code == 429


def test_successful_login_clears_failure_counter(env):
    client, m = env
    m.register(m.UserRegister(username="carol", password="correct-horse-pw"))
    # A few failures, but below the lockout threshold...
    for _ in range(3):
        client.post("/api/auth/login", json={"username": "carol", "password": "wrong"})
    # ...then a success must reset the counter so the account isn't near-locked.
    ok = client.post("/api/auth/login", json={"username": "carol", "password": "correct-horse-pw"})
    assert ok.status_code == 200
    for _ in range(3):
        client.post("/api/auth/login", json={"username": "carol", "password": "wrong"})
    # Still not locked (counter was reset), so a correct login still works.
    ok2 = client.post("/api/auth/login", json={"username": "carol", "password": "correct-horse-pw"})
    assert ok2.status_code == 200
