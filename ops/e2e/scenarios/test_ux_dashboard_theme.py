"""UX: the learner dashboard reads well in dark mode and on a phone (redesign PR 1, 2026-11-03).

The 5-minute warm-up card used hard-coded violet-50/cyan-50 colours: a pale card with pale text at the top of
every dark-mode dashboard. Stats stacked one per row on phones, pushing the next lesson far down."""
import json
import re

import pytest

from conftest import BASE, SOLUTIONS, api, create_user

_LUMA = """e => { const m = getComputedStyle(e).backgroundColor.match(/[\\d.]+/g).map(Number);
    const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; }"""


def _learner_with_a_completed_lesson():
    """The warm-up only appears once a lesson is learned: pass one the way a learner does."""
    u = create_user()
    code = json.loads((SOLUTIONS / "variables_intro.json").read_text())["challenges"][0]["code"]
    r = api(u["ip"], u["token"]).post(f"{BASE}/api/classroom/evaluate", timeout=120, json={
        "user_id": u["id"], "lesson_id": "variables_intro", "challenge_index": 0, "code": code})
    assert r.status_code == 200 and r.json()["success"] is True, r.text[:300]
    return u


def test_warmup_card_is_dark_and_readable_after_switching_to_dark_mode(logged_in_page):
    page = logged_in_page(_learner_with_a_completed_lesson())
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    card = page.locator("div.rounded-2xl", has=page.get_by_role("heading", name="5-minute warm-up")).first
    card.wait_for(timeout=20000)
    page.get_by_role("button", name="Switch to dark mode").first.click()
    page.wait_for_function("document.documentElement.classList.contains('dark')")
    page.wait_for_timeout(400)   # colour transitions settle

    assert card.evaluate(_LUMA) < 0.2, "warm-up card background is still light in dark mode"
    subtitle = card.get_by_text(re.compile(r"quick questions mixed from lessons"))
    assert subtitle.evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 12
    assert subtitle.evaluate(_LUMA.replace("backgroundColor", "color")) > 0.3, "subtitle text is too dark to read"
    start = card.get_by_role("button", name=re.compile(r"^(Start|Another round)$"))
    start.click()
    card.get_by_text(re.compile(r"^1 / \d+$")).wait_for(timeout=10000)   # the warm-up still works
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]


@pytest.mark.parametrize("dark", [False, True])
def test_phone_dashboard_puts_the_next_lesson_first_and_stats_two_per_row(logged_in_page, dark):
    page = logged_in_page(create_user(), width=390, height=844, dark=dark)
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    rec = page.get_by_role("heading", name="Today's Recommended Lesson")
    xp = page.get_by_text("Total XP", exact=True)
    lessons = page.get_by_text("Lessons Completed", exact=True)
    rec.wait_for(timeout=20000)
    xp.wait_for()
    assert rec.bounding_box()["y"] < xp.bounding_box()["y"], "recommended lesson should come before the stats"
    assert abs(xp.bounding_box()["y"] - lessons.bounding_box()["y"]) < 4, "first two stat cards should share a row"
    assert page.evaluate("document.documentElement.scrollWidth") <= 390, "dashboard scrolls sideways on a phone"
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]
