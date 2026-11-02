"""Module: knowledge map, reference cards, Explains essays (spec §3)."""
from conftest import BASE, api, create_user


def test_knowledge_map_concepts_and_gap_view(logged_in_page):
    u = create_user()
    s = api(u["ip"], u["token"])
    concepts = s.get(f"{BASE}/api/graph/concepts", timeout=30).json()["concepts"]
    assert concepts
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/knowledge", wait_until="networkidle")
    tile = page.locator("section[aria-label] button").first
    tile.wait_for(timeout=30000)
    with page.expect_response(lambda r: "/api/graph/gaps/" in r.url, timeout=30000) as gaps:
        tile.click()
    assert gaps.value.status == 200
    page.get_by_role("button", name="Close concept details").wait_for(timeout=15000)


def test_reference_opens_two_topics(logged_in_page):
    u = create_user()
    topics = api().get(f"{BASE}/api/reference/topics", timeout=30).json()["topics"]
    assert len(topics) >= 2
    for t in topics[:2]:
        key = t.get("id") or t.get("slug") or t.get("topic") or t
        card = api().get(f"{BASE}/api/reference/{key}", timeout=30)
        assert card.status_code == 200 and card.json(), (key, card.text[:200])
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/reference", wait_until="networkidle")
    assert page.locator("main").inner_text().strip()
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]


def test_explains_static_essay_and_generated(logged_in_page):
    u = create_user()
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/explains/gradient-descent", wait_until="networkidle")
    page.get_by_role("heading", level=1).first.wait_for(timeout=15000)
    r = api(u["ip"], u["token"]).post(f"{BASE}/api/classroom/explain", timeout=60,
                                      json={"user_id": u["id"], "lesson_id": "variables_intro"})
    assert r.status_code == 200, r.text[:200]
    explain_id = r.json().get("id") or r.json().get("explain_id")
    page.goto(f"{BASE}/dashboard/explains/generated/{explain_id}", wait_until="networkidle")
    page.get_by_text("Stub explanation").first.wait_for(timeout=15000)
    page.get_by_text("Stub explanation step 1").first.wait_for(timeout=15000)
