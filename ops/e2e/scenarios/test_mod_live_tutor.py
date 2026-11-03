"""Module: live tutor sessions — book, list mine, cancel (spec §3)."""
import json

import pytest
from datetime import datetime, timedelta, timezone

from conftest import BASE, api, create_user

_HOOK_PICKER = """() => { window.__pickers = 0; const o = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { window.__pickers++; try { return o.call(this); } catch (e) {} }; }"""


@pytest.mark.parametrize("width,height", [(1440, 900), (390, 844)])
def test_book_through_the_ui_in_dark_mode(logged_in_page, width, height):
    """The way a learner books: pick a day, tap a slot, choose a length, read the slot back, request it."""
    u = create_user()
    page = logged_in_page(u, width=width, height=height, dark=True)
    page.goto(f"{BASE}/dashboard/live-tutor", wait_until="networkidle")

    # The fallback date field: native picker opens on click and is dark in dark mode.
    other = page.get_by_label("Or another date")
    assert other.evaluate("e => getComputedStyle(e).colorScheme") == "dark"
    page.evaluate(_HOOK_PICKER)
    other.click(position={"x": 30, "y": 20})
    assert page.evaluate("window.__pickers") >= 1, "clicking the date field did not open the picker"
    page.keyboard.press("Escape")

    # Today offers no slot less than an hour away.
    page.get_by_role("radiogroup", name="Day").get_by_role("radio").first.click()
    now = datetime.now()
    soonest = now.hour * 60 + now.minute + 59
    for v in page.locator("[role=radiogroup][aria-label='Start time'] [role=radio]").evaluate_all(
            "els => els.map(e => Number(e.dataset.value))"):
        assert v >= soonest, f"today's slot at minute {v} is in the past or less than an hour away"

    # Nothing chosen yet → explains what is missing, sends nothing.
    posted = []
    page.on("request", lambda r: posted.append(r.post_data) if r.method == "POST" and "tutor-sessions" in r.url else None)
    page.get_by_placeholder("e.g. Debugging my decorators lesson, or planning an ML learning path").fill("Decorators")
    page.get_by_role("radiogroup", name="Day").get_by_role("radio").nth(2).click()   # the day after tomorrow
    page.get_by_role("button", name="Request this slot").click()
    page.get_by_role("alert").get_by_text("and a time").wait_for(timeout=5000)
    assert not posted

    page.get_by_role("radiogroup", name="Part of the day").get_by_role("radio", name="Afternoon").click()
    slot = page.locator("[role=radiogroup][aria-label='Start time'] [role=radio][data-value='990']")   # 16:30
    slot.click()
    page.get_by_role("radiogroup", name="Duration").get_by_role("radio", name="45 min").click()
    start_label, end_label = slot.inner_text().strip(), page.evaluate(
        "() => new Date(2000, 0, 1, 17, 15).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})")
    page.get_by_text(f"{start_label}–{end_label}").first.wait_for(timeout=5000)   # the slot is read back in full
    sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert sw <= cw + 1, f"horizontal overflow {sw}>{cw}"
    with page.expect_response(lambda r: r.request.method == "POST" and "tutor-sessions" in r.url) as resp:
        page.get_by_role("button", name="Request this slot").click()   # account email is used when left blank
    assert resp.value.status == 200, resp.value.text()[:200]
    body = json.loads(resp.value.request.post_data)
    assert body["duration_minutes"] == 45
    sent = body["preferred_at"]
    assert sent.endswith("Z") or "+" in sent[10:], f"preferred_at carries no timezone: {sent}"
    page.get_by_text("Decorators").first.wait_for(timeout=10000)

    # Cancelling asks first.
    page.get_by_role("button", name="Cancel").first.click()
    page.get_by_role("button", name="Yes, cancel").click()
    page.get_by_text("Past and cancelled (1)").wait_for(timeout=10000)


def test_book_list_cancel():
    u = create_user()
    s = api(u["ip"], u["token"])
    when = (datetime.now(timezone.utc) + timedelta(days=3)).replace(minute=0, second=0, microsecond=0).isoformat()
    r = s.post(f"{BASE}/api/tutor-sessions", timeout=30, json={
        "topic": "Decorators", "preferred_at": when, "timezone": "Asia/Kolkata", "duration_minutes": 30,
        "notes": "Scenario test booking"})
    assert r.status_code == 200, r.text[:200]
    sid = r.json().get("id") or r.json()["session"]["id"]
    mine = s.get(f"{BASE}/api/tutor-sessions/mine", timeout=30).json()
    rows = mine.get("sessions", mine if isinstance(mine, list) else [])
    assert sid in {x["id"] for x in rows}, rows
    c = s.post(f"{BASE}/api/tutor-sessions/{sid}/cancel", timeout=30)
    assert c.status_code == 200, c.text[:200]
    mine = s.get(f"{BASE}/api/tutor-sessions/mine", timeout=30).json()
    row = next(x for x in mine.get("sessions", mine if isinstance(mine, list) else []) if x["id"] == sid)
    assert row["status"] in ("cancelled", "canceled"), row
    past = s.post(f"{BASE}/api/tutor-sessions", timeout=30, json={
        "topic": "Past", "preferred_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()})
    assert past.status_code in (400, 422), past.text[:200]
