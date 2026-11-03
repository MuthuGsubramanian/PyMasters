"""Module: live tutor sessions — book, list mine, cancel (spec §3)."""
import json
from datetime import datetime, timedelta, timezone

from conftest import BASE, api, create_user

_HOOK_PICKER = """() => { window.__pickers = 0; const o = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { window.__pickers++; try { return o.call(this); } catch (e) {} }; }"""


def test_book_through_the_ui_in_dark_mode(logged_in_page):
    """The way a learner books: click the date and time fields (the native picker must open), pick, submit."""
    u = create_user()
    page = logged_in_page(u, dark=True)
    page.goto(f"{BASE}/dashboard/live-tutor", wait_until="networkidle")
    date, time = page.locator("input[type=date]"), page.locator("input[type=time]")
    # Dark theme: the native calendar/clock icons and popups must be dark too, or they are invisible.
    assert date.evaluate("e => getComputedStyle(e).colorScheme") == "dark"
    assert time.evaluate("e => getComputedStyle(e).colorScheme") == "dark"
    page.evaluate(_HOOK_PICKER)
    date.click(position={"x": 40, "y": 20})
    time.click(position={"x": 40, "y": 20})
    assert page.evaluate("window.__pickers") >= 2, "clicking the date/time field did not open the picker"

    page.get_by_placeholder("e.g. Debugging my decorators lesson, or planning an ML learning path").fill("Decorators")
    past = datetime.now() - timedelta(hours=2)
    date.fill(past.strftime("%Y-%m-%d"))
    time.fill(past.strftime("%H:%M"))
    posted = []
    page.on("request", lambda r: posted.append(r.post_data) if r.method == "POST" and "tutor-sessions" in r.url else None)
    page.get_by_role("button", name="Request session").click()
    page.get_by_text("future").first.wait_for(timeout=5000)        # told why, nothing sent
    assert not posted

    future = datetime.now() + timedelta(days=2)
    date.fill(future.strftime("%Y-%m-%d"))
    time.fill("16:30")
    with page.expect_response(lambda r: r.request.method == "POST" and "tutor-sessions" in r.url) as resp:
        page.get_by_role("button", name="Request session").click()   # account email is used when left blank
    assert resp.value.status == 200, resp.value.text()[:200]
    sent = json.loads(resp.value.request.post_data)["preferred_at"]
    assert sent.endswith("Z") or "+" in sent[10:], f"preferred_at carries no timezone: {sent}"
    page.get_by_text("Decorators").first.wait_for(timeout=10000)


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
