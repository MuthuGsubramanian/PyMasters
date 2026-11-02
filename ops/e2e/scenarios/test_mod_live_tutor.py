"""Module: live tutor sessions — book, list mine, cancel (spec §3)."""
from datetime import datetime, timedelta, timezone

from conftest import BASE, api, create_user


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
