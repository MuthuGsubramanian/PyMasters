"""Module: weekly challenges (every challenge's reference solution passes) and community follow (spec §3)."""
from pathlib import Path

import pytest

from conftest import BASE, SOLUTIONS, api, create_user

CHALLENGE_SOLUTIONS = sorted((SOLUTIONS / "challenges").glob("ch-*.py"))


def test_weekly_loads_and_every_challenge_has_a_solution():
    u = create_user()
    weekly = api().get(f"{BASE}/api/challenges/weekly", timeout=30).json()
    archive = api(u["ip"], u["token"]).get(f"{BASE}/api/challenges/archive", timeout=30).json()
    ids = {c["id"] for c in archive["challenges"]}
    assert (weekly["challenge"]["id"] if "challenge" in weekly else weekly["id"]) in ids
    assert ids == {p.stem for p in CHALLENGE_SOLUTIONS}, ids ^ {p.stem for p in CHALLENGE_SOLUTIONS}


@pytest.mark.parametrize("solution", CHALLENGE_SOLUTIONS, ids=lambda p: p.stem)
def test_reference_solution_passes(solution: Path):
    u = create_user()
    r = api(u["ip"], u["token"]).post(f"{BASE}/api/challenges/submit", timeout=60, json={
        "user_id": u["id"], "challenge_id": solution.stem, "code": solution.read_text()})
    assert r.status_code == 200, r.text[:200]
    assert r.json()["status"] == "passed", r.json()


def test_correct_submission_scores_and_reaches_leaderboard():
    u = create_user()
    weekly = api().get(f"{BASE}/api/challenges/weekly", timeout=30).json()
    cid = weekly["challenge"]["id"] if "challenge" in weekly else weekly["id"]
    code = (SOLUTIONS / "challenges" / f"{cid}.py").read_text()
    s = api(u["ip"], u["token"])
    r = s.post(f"{BASE}/api/challenges/submit", json={"user_id": u["id"], "challenge_id": cid, "code": code}, timeout=60)
    assert r.json()["status"] == "passed" and r.json().get("xp_awarded", r.json().get("xp", 0)) > 0, r.json()
    wrong = s.post(f"{BASE}/api/challenges/submit", timeout=60,
                   json={"user_id": u["id"], "challenge_id": cid, "code": "x = 1\n"}).json()
    assert wrong["status"] in ("already_completed", "failed"), wrong
    board = api().get(f"{BASE}/api/challenges/leaderboard", params={"limit": 500}, timeout=30).json()
    rows = board.get("leaderboard", board if isinstance(board, list) else [])
    assert u["id"] in {row.get("user_id", row.get("id")) for row in rows}, rows[:3]


def test_follow_and_unfollow():
    a, b = create_user(), create_user()
    s = api(a["ip"], a["token"])
    assert s.post(f"{BASE}/api/connections/{b['id']}", timeout=30).status_code == 200
    following = s.get(f"{BASE}/api/connections/{a['id']}", params={"kind": "following"}, timeout=30).json()["people"]
    assert b["id"] in {m["user_id"] for m in following}
    followers = s.get(f"{BASE}/api/connections/{b['id']}", params={"kind": "followers"}, timeout=30).json()["people"]
    assert a["id"] in {m["user_id"] for m in followers}
    assert s.delete(f"{BASE}/api/connections/{b['id']}", timeout=30).status_code == 200
    following = s.get(f"{BASE}/api/connections/{a['id']}", params={"kind": "following"}, timeout=30).json()["people"]
    assert b["id"] not in {m["user_id"] for m in following}
    assert s.post(f"{BASE}/api/connections/{a['id']}", timeout=30).status_code in (400, 422)   # not yourself
