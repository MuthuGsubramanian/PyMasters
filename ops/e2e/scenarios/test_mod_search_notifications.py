"""Module: global search, notifications, Vaathiyaar messages (spec §3)."""
from conftest import BASE, api, create_user, db, wait_semantic_ready


def test_search_finds_lessons_and_opens_one(logged_in_page):
    u = create_user()
    wait_semantic_ready()
    hits = api(u["ip"], u["token"]).get(f"{BASE}/api/semantic/search", params={"q": "list"}, timeout=60).json()
    assert hits.get("results"), hits
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    page.keyboard.press("Control+k")
    box = page.get_by_placeholder("Search pages, topics, settings...")
    box.fill("list")
    title = hits["results"][0]["title"]
    title = title.get("en") if isinstance(title, dict) else title   # lesson titles are per-language maps
    option = page.get_by_text(title, exact=False).first
    option.wait_for(timeout=30000)
    option.click()
    page.wait_for_url("**/dashboard/classroom**", timeout=15000)


def test_notifications_read_and_read_all():
    u = create_user()
    for title in ("First scenario notice", "Second scenario notice", "Third scenario notice"):
        db("seed-notification", u["id"], title)
    s = api(u["ip"], u["token"])
    q = {"user_id": u["id"]}
    body = s.get(f"{BASE}/api/notifications", params=q, timeout=30).json()
    unread = body.get("unread_count", body.get("unread"))
    assert unread >= 3, body
    nid = body["notifications"][0]["id"]
    assert s.put(f"{BASE}/api/notifications/{nid}/read", params=q, timeout=30).status_code == 200
    after_one = s.get(f"{BASE}/api/notifications", params=q, timeout=30).json()
    assert after_one.get("unread_count", after_one.get("unread")) == unread - 1, after_one
    assert s.patch(f"{BASE}/api/notifications/read-all", params=q, timeout=30).status_code == 200
    after_all = s.get(f"{BASE}/api/notifications", params=q, timeout=30).json()
    assert after_all.get("unread_count", after_all.get("unread")) == 0, after_all


def test_vaathiyaar_message_dismiss():
    u = create_user()
    db("seed-vmessage", u["id"], "Ready for your next lesson?")
    s = api(u["ip"], u["token"])
    msgs = s.get(f"{BASE}/api/messages/pending/{u['id']}", timeout=30).json()["messages"]
    mine = [m for m in msgs if m["message"] == "Ready for your next lesson?"]
    assert mine, msgs
    assert s.post(f"{BASE}/api/messages/{mine[0]['id']}/dismiss", json={}, timeout=30).status_code == 200
    left = s.get(f"{BASE}/api/messages/pending/{u['id']}", timeout=30).json()["messages"]
    assert mine[0]["id"] not in {m["id"] for m in left}
