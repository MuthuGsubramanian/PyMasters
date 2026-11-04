"""OAuth login CSRF (security review 2026-11-03, M2): the `state` must be bound to the browser that started sign-in.

Before: /start returned a signed state that any browser could use, so an attacker could finish the provider login
with their own account and send the victim the callback link; the victim was then signed in as the attacker.
Now /start also sets an HttpOnly nonce cookie and the callback requires it to match the nonce inside the state.
"""
import importlib
import os
import sys
from urllib.parse import parse_qs, urlparse

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PROVIDERS = [
    # (name, module, env prefix, error key in the login fragment)
    ("linkedin", "routes.oauth", "LINKEDIN", "li_error"),
    ("github", "routes.github_oauth", "GITHUB", "gh_error"),
]


class _Stop(Exception):
    pass


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    for _, _, env, _ in PROVIDERS:
        monkeypatch.setenv(f"{env}_CLIENT_ID", "cid")
        monkeypatch.setenv(f"{env}_CLIENT_SECRET", "secret")
        monkeypatch.setenv(f"{env}_REDIRECT_URI", "https://pymasters.net/api/auth/x/callback")
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app, follow_redirects=False)


def _start(client, name):
    r = client.get(f"/api/auth/{name}/start")
    assert r.status_code == 200, r.text
    state = parse_qs(urlparse(r.json()["authorize_url"]).query)["state"][0]
    return r, state


def _exchange_calls(monkeypatch, module):
    mod = importlib.import_module(module)
    calls = []

    def fake_post(*a, **k):
        calls.append(a)
        raise _Stop()
    monkeypatch.setattr(mod.requests, "post", fake_post)
    return calls


def _error(resp, key):
    assert resp.status_code in (302, 307), resp.status_code
    frag = urlparse(resp.headers["location"]).fragment
    return parse_qs(frag).get(key, [None])[0]


@pytest.mark.parametrize("name,module,env,err", PROVIDERS)
def test_start_sets_an_httponly_nonce_cookie_scoped_to_the_provider(client, name, module, env, err):
    r, _ = _start(client, name)
    cookie = r.headers.get("set-cookie", "")
    assert f"pm_oauth_{name}=" in cookie
    low = cookie.lower()
    assert "httponly" in low and "samesite=lax" in low and "secure" in low
    assert f"path=/api/auth/{name}" in low


@pytest.mark.parametrize("name,module,env,err", PROVIDERS)
def test_callback_without_the_starting_browsers_cookie_is_refused(client, monkeypatch, name, module, env, err):
    calls = _exchange_calls(monkeypatch, module)
    _, state = _start(client, name)
    client.cookies.clear()                          # the victim's browser never called /start
    resp = client.get(f"/api/auth/{name}/callback", params={"code": "attacker-code", "state": state})
    assert _error(resp, err)
    assert calls == [], "the code must not be exchanged without a matching nonce"


@pytest.mark.parametrize("name,module,env,err", PROVIDERS)
def test_callback_with_another_browsers_nonce_is_refused(client, monkeypatch, name, module, env, err):
    calls = _exchange_calls(monkeypatch, module)
    _, attacker_state = _start(client, name)
    client.cookies.clear()
    _start(client, name)                            # victim started their own sign-in: a different nonce
    resp = client.get(f"/api/auth/{name}/callback", params={"code": "attacker-code", "state": attacker_state})
    assert _error(resp, err)
    assert calls == []


@pytest.mark.parametrize("name,module,env,err", PROVIDERS)
def test_callback_from_the_browser_that_started_proceeds_to_the_code_exchange(client, monkeypatch, name, module,
                                                                               env, err):
    calls = _exchange_calls(monkeypatch, module)
    r, state = _start(client, name)
    nonce = r.cookies.get(f"pm_oauth_{name}")
    assert nonce
    resp = client.get(f"/api/auth/{name}/callback", params={"code": "c", "state": state},
                      cookies={f"pm_oauth_{name}": nonce})
    assert len(calls) == 1
    # the nonce is single-use: the callback clears it
    assert f"pm_oauth_{name}=" in resp.headers.get("set-cookie", "")
