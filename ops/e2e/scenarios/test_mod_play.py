"""Module: Play — every game's page loads and a full round goes start → answer every item → finish (spec §3)."""
import pytest
import requests

from conftest import BASE, api, create_user, fake_ip

_catalog_user = None


def _games() -> list:
    global _catalog_user
    _catalog_user = _catalog_user or create_user()
    r = api(_catalog_user["ip"], _catalog_user["token"]).get(f"{BASE}/api/play/catalog", timeout=30)
    return [g["id"] for g in r.json()["games"]]


def blank_response(item: dict):
    """A response a learner could give without knowing the answer (each grader must accept it and score it)."""
    if item.get("kind") == "line_then_choice":
        return [1, 0]
    if item.get("choices") or item.get("options"):
        return 0
    return None if item.get("kind") in ("sim", "hole", "dataset") else ""


def _ids():
    try:
        return _games()
    except requests.RequestException:   # collected before the container is up (e.g. --collect-only)
        return []


@pytest.mark.parametrize("game_id", _ids())
def test_full_round(game_id, logged_in_page):
    u = create_user()
    s = api(u["ip"], u["token"])
    before = s.get(f"{BASE}/api/play/stats", timeout=30).json()["rounds_30d"]

    start = s.post(f"{BASE}/api/play/round/start", json={"game_id": game_id}, timeout=60)
    assert start.status_code == 200, start.text[:300]
    rnd = start.json()
    assert rnd["items"], rnd
    for item in rnd["items"]:
        a = s.post(f"{BASE}/api/play/round/answer", timeout=60, json={
            "round_id": rnd["round_id"], "item_id": item["id"], "response": blank_response(item), "ms": 4000})
        assert a.status_code == 200, (item.get("kind"), a.text[:300])
        assert {"correct", "score", "max"} <= set(a.json()), a.json()
    fin = s.post(f"{BASE}/api/play/round/finish", json={"round_id": rnd["round_id"]}, timeout=60)
    assert fin.status_code == 200, fin.text[:300]
    assert s.get(f"{BASE}/api/play/stats", timeout=30).json()["rounds_30d"] == before + 1

    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/play/{game_id}", wait_until="networkidle")
    assert page.locator("main").inner_text().strip()
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]
