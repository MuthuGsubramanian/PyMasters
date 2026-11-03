"""Module: Arcade — with the unlock ladder satisfied, every game's page loads and a session completes (spec §3)."""
import pytest

from conftest import BASE, api, create_user, db
from test_mod_play import blank_response

GAMES = ["snakes_ladders", "linked_snake", "code_slingshot", "loop_runner", "bug_invaders", "dict_dash",
         "big_o_grand_prix"]   # backend/arcade/unlocks.py GAMES; test_every_catalog_game_is_covered keeps this honest


def _unlocked_user() -> dict:
    """A learner who has completed every non-enterprise lesson, so every game and board is unlocked."""
    u = create_user()
    s = api(u["ip"], u["token"])
    ids = [l["id"] for l in s.get(f"{BASE}/api/classroom/lessons", params={"user_id": u["id"]}, timeout=60).json()["lessons"]]
    for i in range(0, len(ids), 100):
        db("seed-completions", u["id"], *ids[i:i + 100])
    return u


def test_every_catalog_game_is_covered():
    u = _unlocked_user()
    cat = api(u["ip"], u["token"]).get(f"{BASE}/api/arcade/catalog", timeout=60).json()
    assert {g["id"] for g in cat["games"]} == set(GAMES)
    locked = [g["id"] for g in cat["games"] if not g["unlocked"] or g["needs_content"]]
    assert not locked, locked


@pytest.mark.parametrize("game_id", GAMES)
def test_full_session(game_id, logged_in_page):
    u = _unlocked_user()
    s = api(u["ip"], u["token"])
    cat = {g["id"]: g for g in s.get(f"{BASE}/api/arcade/catalog", timeout=60).json()["games"]}
    body = {"game_id": game_id}
    if cat[game_id].get("boards"):
        body["board"] = next(b["key"] for b in cat[game_id]["boards"] if b["unlocked"])
    start = s.post(f"{BASE}/api/arcade/session/start", json=body, timeout=60)
    assert start.status_code == 200, start.text[:300]
    sess = start.json()
    items = sess.get("items") or s.post(f"{BASE}/api/arcade/session/questions",
                                        json={"session_id": sess["session_id"]}, timeout=60).json()["items"]
    assert items, sess
    for item in items[:6]:
        a = s.post(f"{BASE}/api/arcade/session/answer", timeout=60, json={
            "session_id": sess["session_id"], "item_id": item["id"], "response": blank_response(item), "ms": 4000})
        assert a.status_code == 200, (item.get("kind"), a.text[:300])
    fin = s.post(f"{BASE}/api/arcade/session/finish", json={"session_id": sess["session_id"], "score": 120}, timeout=60)
    assert fin.status_code == 200, fin.text[:300]

    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/play/arcade/{game_id}", wait_until="networkidle")
    assert page.locator("main").inner_text().strip()
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]
