"""Module: profile — settings persist, change password, export, reset progress (spec §3)."""
from conftest import BASE, PASSWORD, api, complete_lesson, create_user

NEW_PASSWORD = "Scenario-Changed-2026!"


def test_settings_persist_after_reload(logged_in_page):
    u = create_user()
    s = api(u["ip"], u["token"])
    r = s.put(f"{BASE}/api/profile/{u['id']}/settings", timeout=30,
              json={"name": "Renamed Learner", "email": u["email"], "bio": "Learning Python by scenario"})
    assert r.status_code == 200, r.text[:200]
    prof = s.get(f"{BASE}/api/profile/{u['id']}", timeout=30).json()
    flat = {**prof, **(prof.get("user") or {}), **(prof.get("profile") or {})}
    assert flat.get("name") == "Renamed Learner" and flat.get("bio") == "Learning Python by scenario", prof
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/profile", wait_until="networkidle")
    page.reload(wait_until="networkidle")
    page.get_by_text("Renamed Learner").first.wait_for(timeout=15000)


def test_change_password():
    u = create_user()
    s = api(u["ip"], u["token"])
    bad = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "wrong-one", "new_password": NEW_PASSWORD},
                 timeout=30)
    assert bad.status_code in (400, 401, 403), bad.text[:200]
    ok = s.post(f"{BASE}/api/auth/change-password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
                timeout=30)
    assert ok.status_code == 200, ok.text[:200]
    login = api(u["ip"]).post(f"{BASE}/api/auth/login", json={"username": u["username"], "password": NEW_PASSWORD},
                              timeout=30)
    assert login.status_code == 200
    old = api(u["ip"]).post(f"{BASE}/api/auth/login", json={"username": u["username"], "password": PASSWORD}, timeout=30)
    assert old.status_code == 401


def test_export_contains_the_user():
    u = create_user()
    r = api(u["ip"], u["token"]).get(f"{BASE}/api/profile/{u['id']}/export", timeout=30)
    assert r.status_code == 200 and r.json()["user"]["id"] == u["id"]
    assert "password" not in r.json()["user"] and "password_hash" not in r.json()["user"], list(r.json()["user"])
    other = create_user()
    assert api(other["ip"], other["token"]).get(f"{BASE}/api/profile/{u['id']}/export", timeout=30).status_code == 403


def test_reset_progress_zeroes_xp():
    u = create_user()
    assert complete_lesson(u)["success"] is True
    s = api(u["ip"], u["token"])
    assert s.get(f"{BASE}/api/profile/{u['id']}/stats", timeout=30).json()["total_xp"] > 0
    assert s.post(f"{BASE}/api/profile/{u['id']}/reset", timeout=30).status_code == 200
    stats = s.get(f"{BASE}/api/profile/{u['id']}/stats", timeout=30).json()
    assert stats["total_xp"] == 0 and stats.get("lessons_completed", 0) == 0, stats
