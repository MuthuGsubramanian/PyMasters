"""Security review 2026-11-03, L4: the public semantic search endpoints are limited per client IP (2026-11-05).

/api/semantic/search and /related run an embedding model on the 1 GB VM for every call and need no sign-in, so a
script could keep the CPU busy. Behind Caddy, X-Forwarded-For carries exactly the visitor's IP (Cloudflare's
CF-Connecting-IP is only trusted from Cloudflare's ranges), so the first hop is a sound key.
"""
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    import routes.semantic as semantic
    from ratelimit import SlidingWindowRateLimiter
    monkeypatch.setattr(semantic, "_search_ip_limiter", SlidingWindowRateLimiter(max_calls=3, window_seconds=60),
                        raising=False)

    class _Idx:
        ready = False
        lessons = []

        def ensure_started(self):
            pass
    monkeypatch.setattr(semantic, "get_index", lambda: _Idx())
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


@pytest.mark.parametrize("path", ["/api/semantic/search?q=loops", "/api/semantic/related/lists"])
def test_a_client_over_the_budget_gets_429(client, path):
    ip = {"X-Forwarded-For": "203.0.113.7"}
    for _ in range(3):
        assert client.get(path, headers=ip).status_code == 200
    r = client.get(path, headers=ip)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1
    # another visitor is unaffected
    assert client.get(path, headers={"X-Forwarded-For": "198.51.100.9"}).status_code == 200
