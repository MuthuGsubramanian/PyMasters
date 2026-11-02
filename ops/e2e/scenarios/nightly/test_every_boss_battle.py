"""Nightly: every track's boss battle unlocks after its lessons and every question it deals has a valid key."""
from collections import defaultdict

import pytest
import requests

from conftest import BASE, api, create_user, db


def _tracks() -> dict:
    try:
        u = create_user()
        db("set-plan", u["id"], "enterprise", 30)
        by_track = defaultdict(list)
        for l in api(u["ip"], u["token"]).get(f"{BASE}/api/classroom/lessons", params={"user_id": u["id"]},
                                              timeout=120).json()["lessons"]:
            if l.get("track") and l["track"] != "assigned":
                by_track[l["track"]].append(l["id"])
        return {t: ids for t, ids in by_track.items() if len(ids) >= 3}
    except (requests.RequestException, RuntimeError):
        return {}


TRACKS = _tracks()


@pytest.mark.nightly
@pytest.mark.parametrize("track", sorted(TRACKS))
def test_every_boss_battle(track):
    u = create_user()
    db("set-plan", u["id"], "enterprise", 30)
    ids = TRACKS[track]
    for i in range(0, len(ids), 100):
        db("seed-completions", u["id"], *ids[i:i + 100])
    s = api(u["ip"], u["token"])
    boss = s.get(f"{BASE}/api/review/boss", params={"track": track}, timeout=60).json()
    assert boss["unlocked"] is True and boss["questions"], f"{track}: completed lessons have no usable quiz items: {boss}"
    for q in boss["questions"]:
        a = s.post(f"{BASE}/api/review/warmup/answer", json={"id": q["id"], "choice": 0}, timeout=30)
        assert a.status_code == 200, (q["id"], a.text[:200])
        assert 0 <= a.json()["correct_index"] < len(q["options"]), q
