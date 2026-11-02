"""The scenario framework itself works against the test container (Task 2)."""
from conftest import BASE, api, create_user, db


def test_health_ok():
    r = api().get(f"{BASE}/health", timeout=30)
    assert r.status_code == 200 and r.json()["db"] == "ok"


def test_new_user_token_is_accepted():
    u = create_user()
    r = api(u["ip"], u["token"]).get(f"{BASE}/api/auth/me", timeout=30)
    assert r.status_code == 200 and r.json()["id"] == u["id"]


def test_backdated_signup_expires_trial():
    u = create_user()
    db("backdate-signup", u["id"], 10)
    r = api(u["ip"], u["token"]).get(f"{BASE}/api/profile/{u['id']}/access", timeout=30)
    assert r.json()["status"] == "expired"


def test_ops_session_is_super_admin(ops_token):
    r = api(token=ops_token).get(f"{BASE}/api/admin/check", timeout=30)
    assert r.status_code == 200 and r.json().get("is_super_admin") is True
