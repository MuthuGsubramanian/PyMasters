"""Nightly: every lesson in the catalogue (spec §4, Tier 2).

For each lesson, as an enterprise-entitled learner: the page renders in every language its title is written in
with no page/console error; the stored verified solution passes /classroom/evaluate and awards XP; every quiz
item has a valid answer key (graded through /review/warmup/answer).
"""
import json

import pytest
import requests

from conftest import BASE, RELEASE_VERSION, SOLUTIONS, api, create_user, db, session_payload


def _entitled_user() -> dict:
    u = create_user()
    db("set-plan", u["id"], "enterprise", 30)
    return u


def _catalogue() -> list:
    try:
        u = _entitled_user()
        return api(u["ip"], u["token"]).get(f"{BASE}/api/classroom/lessons", params={"user_id": u["id"]},
                                            timeout=120).json()["lessons"]
    except (requests.RequestException, RuntimeError):   # collected without a running container
        return []


LESSONS = sorted(_catalogue(), key=lambda l: l["id"])   # xdist workers must collect identical ids


@pytest.mark.nightly
@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l["id"])
def test_every_lesson(lesson, browser):
    u = _entitled_user()
    s = api(u["ip"], u["token"])
    full = s.get(f"{BASE}/api/classroom/lesson/{lesson['id']}", timeout=60)
    assert full.status_code == 200, full.text[:200]
    full = full.json()

    langs = sorted(full["title"]) if isinstance(full.get("title"), dict) else ["en"]
    for lang in langs:
        ctx = browser.new_context(viewport={"width": 1366, "height": 850}, extra_http_headers={"X-Forwarded-For": u["ip"]})
        page = ctx.new_page()
        problems = []
        page.on("pageerror", lambda e: problems.append(f"pageerror: {str(e)[:200]}"))
        page.on("console", lambda m: problems.append(f"console: {m.text[:200]}") if m.type == "error" else None)
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.evaluate("([u, v, lang]) => { localStorage.setItem('pm_user', JSON.stringify(u));"
                      " localStorage.setItem('pm_release_seen', v); localStorage.setItem('pm_language', lang); }",
                      [session_payload(u), RELEASE_VERSION, lang])
        page.goto(f"{BASE}/dashboard/classroom/{lesson['id']}", wait_until="networkidle")
        page.get_by_role("button", name="Start Practice").wait_for(timeout=30000)
        page.wait_for_timeout(1000)                      # let the intro animation play its first steps (≤ 1 s rule)
        ctx.close()
        assert not problems, (lang, problems[:3])

    # Every practice challenge (not just the first) has a verified solution that the real grader accepts.
    sol_file = SOLUTIONS / f"{lesson['id']}.json"
    assert sol_file.exists(), f"no verified solution — content defect, see ops/e2e/out/unsolved.json"
    stored = {c["index"]: c["code"] for c in json.loads(sol_file.read_text())["challenges"]}
    for index, _ch in enumerate(full["practice_challenges"]):
        assert index in stored, f"challenge {index} has no verified solution — content defect"
        r = s.post(f"{BASE}/api/classroom/evaluate", timeout=120, json={
            "user_id": u["id"], "lesson_id": lesson["id"], "challenge_index": index, "code": stored[index]})
        assert r.status_code == 200 and r.json()["success"] is True, (index, r.text[:300])
    assert s.get(f"{BASE}/api/profile/{u['id']}/stats", timeout=30).json()["total_xp"] > 0

    for i, item in enumerate(full.get("quiz") or []):
        options = item.get("options")
        options = options.get("en") if isinstance(options, dict) else options
        a = s.post(f"{BASE}/api/review/warmup/answer", json={"id": f"{lesson['id']}:{i}", "choice": 0}, timeout=30)
        assert a.status_code == 200, (i, a.text[:200])
        assert isinstance(a.json()["correct_index"], int) and 0 <= a.json()["correct_index"] < len(options or []), (i, item)
