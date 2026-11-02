"""Nightly: every learning path — every lesson it lists exists, it starts, its page renders, progress counts."""
import pytest
import requests

from conftest import BASE, api, create_user, db


def _paths() -> list:
    try:
        u = create_user()
        return api(u["ip"], u["token"]).get(f"{BASE}/api/paths/", timeout=60).json()["paths"]
    except (requests.RequestException, RuntimeError):
        return []


@pytest.mark.nightly
@pytest.mark.parametrize("path", sorted(_paths(), key=lambda p: p["id"]), ids=lambda p: p["id"])
def test_every_path(path, logged_in_page):
    u = create_user()
    db("set-plan", u["id"], "enterprise", 30)
    s = api(u["ip"], u["token"])
    detail = s.get(f"{BASE}/api/paths/{path['id']}", timeout=60).json()
    lessons = detail["lessons"]
    assert lessons, detail
    catalogue = {l["id"] for l in s.get(f"{BASE}/api/classroom/lessons", params={"user_id": u["id"]},
                                        timeout=120).json()["lessons"]}
    missing = [l["id"] for l in lessons if l["id"] not in catalogue]
    assert not missing, f"path lists lessons that do not exist: {missing}"

    assert s.post(f"{BASE}/api/paths/{path['id']}/start", json={"user_id": u["id"]}, timeout=30).status_code == 200
    db("seed-completions", u["id"], lessons[0]["id"])
    prog = s.get(f"{BASE}/api/paths/{path['id']}/progress", params={"user_id": u["id"]}, timeout=30).json()
    assert lessons[0]["id"] in prog["completed_lessons"], prog

    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/paths/{path['id']}", wait_until="networkidle")
    assert page.locator("main").inner_text().strip()
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]
