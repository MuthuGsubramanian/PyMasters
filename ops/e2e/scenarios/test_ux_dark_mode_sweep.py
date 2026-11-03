"""UX: no light panels on the signed-in app in dark mode (live sweep of pymasters.net, 2026-11-03).

Run on the live site in the owner's dark-mode session, this detector found two components with light-only
colours: "Due for Review" on the dashboard (amber-50 gradient, near-white) and the Vaathiyaar pacing banner on
Profile (amber/sky/emerald-50). This sweeps every signed-in learner page so the whole class stays fixed."""
import json

import pytest

from conftest import BASE, SOLUTIONS, api, create_user, db

PAGES = ["/dashboard", "/dashboard/classroom", "/dashboard/classroom/variables_intro", "/dashboard/knowledge",
         "/dashboard/paths", "/dashboard/playground", "/dashboard/live-tutor", "/dashboard/profile",
         "/dashboard/challenges", "/dashboard/play", "/dashboard/community", "/dashboard/trending",
         "/dashboard/reference", "/dashboard/explains", "/dashboard/upgrade"]

# Large elements whose painted background (solid or gradient stops, any CSS colour space via a canvas) is light.
LIGHT_PANELS = r"""() => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const stops = i => i.match(/(?:rgba?|oklch|oklab|color|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || [];
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
    if (e.closest('[data-allow-light]') || ['IMG', 'CANVAS', 'VIDEO', 'svg', 'path'].includes(e.tagName)) continue;
    const r = e.getBoundingClientRect(); if (r.width * r.height < 4000) continue;
    const cs = getComputedStyle(e); const cols = [];
    const bg = rgba(cs.backgroundColor); if (bg[3] >= 128) cols.push(bg);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') cols.push(...stops(cs.backgroundImage).map(rgba).filter(c => c[3] >= 90));
    if (!cols.length) continue;
    const L = cols.reduce((a, c) => a + lum(c), 0) / cols.length;
    if (L > 0.45) out.push(`${L.toFixed(2)} ${(e.innerText || '').trim().slice(0, 40).replace(/\n/g, ' ')}`);
  }
  return out;
}"""


@pytest.fixture
def learner_with_due_review():
    """Passed a lesson months ago, so 'Due for Review' renders (it hides when nothing is due)."""
    u = create_user()
    code = json.loads((SOLUTIONS / "variables_intro.json").read_text())["challenges"][0]["code"]
    r = api(u["ip"], u["token"]).post(f"{BASE}/api/classroom/evaluate", timeout=120, json={
        "user_id": u["id"], "lesson_id": "variables_intro", "topic": "variables_intro", "challenge_index": 0,
        "code": code})
    assert r.status_code == 200 and r.json()["success"] is True, r.text[:200]
    db("age-completions", u["id"], 120)
    due = api(u["ip"], u["token"]).get(f"{BASE}/api/review/due", params={"user_id": u["id"]}, timeout=30).json()
    assert due["total_due"] >= 1, due
    return u


def test_no_light_panels_in_dark_mode(logged_in_page, learner_with_due_review):
    page = logged_in_page(learner_with_due_review)
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    page.get_by_role("heading", name="Due for Review").wait_for(timeout=30000)
    page.get_by_role("button", name="Switch to dark mode").first.click()      # the real toggle
    page.wait_for_function("document.documentElement.classList.contains('dark')")
    found = {}
    for path in PAGES:
        page.goto(f"{BASE}{path}", wait_until="networkidle")
        page.wait_for_timeout(1500)
        light = page.evaluate(LIGHT_PANELS)
        if light:
            found[path] = light[:4]
    assert not found, f"light panels in dark mode: {found}"
