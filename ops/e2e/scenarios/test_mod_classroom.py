"""Module: classroom extras — Learn Anything generation, track boss battle, podcast manifest (spec §3)."""
import json
import time
from collections import defaultdict

from conftest import BASE, SOLUTIONS, api, create_user, db


def test_learn_anything_request_completes_and_is_listed():
    u = create_user()
    s = api(u["ip"], u["token"])
    r = s.post(f"{BASE}/api/modules/request", json={"user_id": u["id"], "topic": "Python list slicing"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    job_id, deadline, job = r.json()["job_id"], time.time() + 240, {}
    while time.time() < deadline:
        job = s.get(f"{BASE}/api/modules/status/{job_id}", timeout=30).json()
        if job["status"] in ("completed", "failed"):
            break
        time.sleep(3)
    assert job.get("status") == "completed", job
    mine = s.get(f"{BASE}/api/modules/generated/{u['id']}", timeout=30).json()["modules"]
    assert job["result_lesson_id"] in {m["id"] for m in mine}
    lesson = s.get(f"{BASE}/api/classroom/lesson/{job['result_lesson_id']}", timeout=30)
    assert lesson.status_code == 200, lesson.text[:200]


def test_boss_battle_unlocks_after_three_completions_and_grades_answers():
    u = create_user()
    s = api(u["ip"], u["token"])
    by_track = defaultdict(list)
    for lesson in s.get(f"{BASE}/api/classroom/lessons", params={"user_id": u["id"]}, timeout=60).json()["lessons"]:
        by_track[lesson.get("track")].append(lesson["id"])
    track = next(t for t, ids in by_track.items() if t and len(ids) >= 6)

    db("seed-completions", u["id"], *by_track[track][:2])
    locked = s.get(f"{BASE}/api/review/boss", params={"track": track}, timeout=30).json()
    assert locked["unlocked"] is False and locked["needed"] == 3, locked

    db("seed-completions", u["id"], *by_track[track][2:6])
    boss = s.get(f"{BASE}/api/review/boss", params={"track": track}, timeout=30).json()
    assert boss["unlocked"] is True and boss["questions"], boss
    q = boss["questions"][0]
    a = s.post(f"{BASE}/api/review/warmup/answer", json={"id": q["id"], "choice": 0}, timeout=30)
    assert a.status_code == 200 and isinstance(a.json()["correct"], bool), a.text[:200]
    assert 0 <= a.json()["correct_index"] < len(q["options"])


def test_podcast_manifest_loads(logged_in_page):
    # Shape: {content_id: {lang: {audio_url, transcript_url, duration}}}. No episodes are published yet
    # (backend/podcasts/manifest.json is {} — a content gap for sub-project E), so an empty map is valid.
    r = api().get(f"{BASE}/api/podcasts/manifest", timeout=30)
    assert r.status_code == 200, r.text[:200]
    for content_id, langs in r.json().items():
        for lang, ep in langs.items():
            assert ep.get("audio_url") and ep.get("duration"), (content_id, lang, ep)
    page = logged_in_page(create_user())
    page.goto(f"{BASE}/dashboard/classroom/variables_intro", wait_until="networkidle")
    page.get_by_role("button", name="Start Practice").wait_for(timeout=30000)
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]


MULTI = "agent_budget_guardrails"   # a lesson with two practice challenges


def _solution(lesson_id, index):
    sol = json.loads((SOLUTIONS / f"{lesson_id}.json").read_text())
    return next(c["code"] for c in sol["challenges"] if c["index"] == index)


def test_every_practice_challenge_is_reachable_and_graded_on_its_own(logged_in_page):
    """149 lessons ship a second challenge that used to be unreachable (the UI and grader used only [0])."""
    u = create_user()
    s = api(u["ip"], u["token"])
    lesson = s.get(f"{BASE}/api/classroom/lesson/{MULTI}", timeout=30).json()
    first, second = lesson["practice_challenges"][:2]

    def evaluate(code, index):
        return s.post(f"{BASE}/api/classroom/evaluate", timeout=120, json={
            "user_id": u["id"], "lesson_id": MULTI, "challenge_index": index, "code": code}).json()

    assert evaluate(_solution(MULTI, 1), 1)["success"] is True
    assert evaluate(_solution(MULTI, 0), 1)["success"] is False      # challenge 2 has its own answer
    assert evaluate(_solution(MULTI, 0), 0)["success"] is True

    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/classroom/{MULTI}", wait_until="networkidle")
    page.get_by_role("button", name="Start Practice").click()
    page.get_by_text("Challenge 1 of 2").wait_for(timeout=15000)
    page.get_by_role("group", name="Practice challenges").get_by_role("button", name="Challenge 2").click()
    page.get_by_text("Challenge 2 of 2").wait_for(timeout=15000)
    page.get_by_text(second["instruction"]["en"][:60] if isinstance(second["instruction"], dict)
                     else second["instruction"][:60]).first.wait_for(timeout=15000)
    starter = second.get("starter_code") or ""
    if starter:
        page.locator(".cm-content").first.get_by_text(starter.strip().splitlines()[0][:40]).first.wait_for(timeout=15000)
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]
