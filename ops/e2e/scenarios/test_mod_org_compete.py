"""Module: org compete — a challenge set for a group, its leaderboard ranks a solver (spec §3)."""
from conftest import BASE, SOLUTIONS, api, create_user, db, with_org
from test_mod_org_console import _member


def test_group_challenge_set_and_leaderboard(logged_in_page):
    admin = create_user(kind="organization", org_type="training_center")
    org_id = admin["org_id"]
    db("grandfather-org", org_id)
    s = api(admin["ip"], admin["token"])
    trainee = _member(admin, org_id, "member")
    assert s.put(f"{BASE}/api/org/{org_id}/members/{trainee['id']}/groups", timeout=30,
                 json={"groups": ["Batch A"], "user_id": admin["id"]}).status_code == 200

    catalog = s.get(f"{BASE}/api/org/challenges/catalog", timeout=30).json()
    ids = [c["id"] for c in catalog.get("challenges", catalog if isinstance(catalog, list) else [])]
    assert "ch-01-fibonacci" in ids, ids
    r = s.post(f"{BASE}/api/org/{org_id}/challenges", timeout=30, json={
        "title": "Batch A sprint", "challenge_ids": ["ch-01-fibonacci", "ch-02-anagram"], "group_name": "Batch A"})
    assert r.status_code == 200, r.text[:200]
    set_id = r.json().get("id") or r.json()["set"]["id"]

    code = (SOLUTIONS / "challenges" / "ch-01-fibonacci.py").read_text()
    sub = api(trainee["ip"], trainee["token"]).post(f"{BASE}/api/challenges/submit", timeout=60, json={
        "user_id": trainee["id"], "challenge_id": "ch-01-fibonacci", "code": code})
    assert sub.json()["status"] == "passed", sub.json()

    board = s.get(f"{BASE}/api/org/{org_id}/challenges/{set_id}/leaderboard", timeout=30).json()
    rows = board.get("leaderboard", board.get("rows", board if isinstance(board, list) else []))
    top = rows[0]
    assert top.get("user_id", top.get("id")) == trainee["id"] and top.get("solved", top.get("passed", 0)) >= 1, rows

    page = logged_in_page(with_org(admin))
    page.goto(f"{BASE}/dashboard/org-compete", wait_until="networkidle")
    page.get_by_text("Batch A sprint").first.wait_for(timeout=15000)
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]
