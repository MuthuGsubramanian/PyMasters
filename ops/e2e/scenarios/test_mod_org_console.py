"""Module: org console — tabs per role, branding reaches the learner shell (spec §3)."""
from conftest import BASE, api, create_user, db, with_org

ADMIN_TABS = ["Overview", "Members", "Students", "Invites", "Curriculum", "Analytics", "Requests", "Branding"]
ADMIN_ONLY = ["Invites", "Curriculum", "Branding", "Requests"]


def _member(admin, org_id, role):
    m = create_user()
    s = api(admin["ip"], admin["token"])
    inv = s.post(f"{BASE}/api/org/{org_id}/invite", json={"email": m["email"], "role": role, "user_id": admin["id"]},
                 timeout=30)
    assert inv.status_code == 200, inv.text[:200]
    j = api(m["ip"], m["token"]).post(f"{BASE}/api/org/join/{inv.json()['token']}", json={"user_id": m["id"]}, timeout=30)
    assert j.status_code == 200, j.text[:200]
    return m


def _tabs(page) -> list:
    page.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    page.get_by_role("tab").first.wait_for(timeout=30000)
    return [t.strip() for t in page.get_by_role("tab").all_inner_texts()]


def test_admin_sees_and_opens_every_tab(logged_in_page):
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    page = logged_in_page(admin)
    tabs = _tabs(page)
    assert len(tabs) == 8, tabs
    for name in tabs:
        page.get_by_role("tab", name=name).first.click()
        page.wait_for_load_state("networkidle")
        assert page.get_by_role("tab", name=name).first.get_attribute("aria-selected") == "true", name
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]


def test_manager_sees_progress_but_not_admin_tabs(logged_in_page):
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    manager = _member(admin, admin["org_id"], "manager")
    tabs = _tabs(logged_in_page(manager))
    assert "Analytics" in tabs and "Students" in tabs, tabs
    assert not set(ADMIN_ONLY) & set(tabs), tabs


def test_member_is_refused_admin_data(logged_in_page):
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    member = _member(admin, admin["org_id"], "member")
    s = api(member["ip"], member["token"])
    assert s.get(f"{BASE}/api/org/{admin['org_id']}/progress", params={"user_id": member["id"]},
                 timeout=30).status_code == 403
    assert s.post(f"{BASE}/api/org/{admin['org_id']}/invite", timeout=30,
                  json={"email": "x@example.com", "role": "member", "user_id": member["id"]}).status_code == 403
    tabs = _tabs(logged_in_page(member))
    assert not {"Analytics", "Students", *ADMIN_ONLY} & set(tabs), tabs


def test_branding_shows_in_learner_shell(logged_in_page):
    admin = create_user(kind="organization", org_type="training_center")
    db("grandfather-org", admin["org_id"])
    member = _member(admin, admin["org_id"], "member")
    r = api(admin["ip"], admin["token"]).put(f"{BASE}/api/org/{admin['org_id']}/branding", timeout=30,
                                             json={"portal_name": "Scenario Academy", "primary_color": "#0f766e"})
    assert r.status_code == 200, r.text[:200]
    bad = api(member["ip"], member["token"]).put(f"{BASE}/api/org/{admin['org_id']}/branding", timeout=30,
                                                 json={"portal_name": "Hijacked"})
    assert bad.status_code == 403
    page = logged_in_page(with_org(member))
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    page.get_by_text("Scenario Academy").filter(visible=True).first.wait_for(timeout=15000)


def _struggle(student, times=4):
    """Fail a challenge the way a learner does: each wrong run after the first adds one struggle."""
    s = api(student["ip"], student["token"])
    for _ in range(times):
        r = s.post(f"{BASE}/api/classroom/evaluate", timeout=120, json={
            "user_id": student["id"], "lesson_id": "variables_intro", "topic": "variables_intro",
            "code": "print('not the answer')\n"})
        assert r.status_code == 200 and r.json()["success"] is False, r.text[:200]


def test_overview_lists_who_needs_attention_and_opens_their_detail(logged_in_page):
    """Redesign PR 4: the teacher's first screen answers "who needs help"; deleting the org is not on it."""
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    struggling = _member(admin, admin["org_id"], "member")
    _member(admin, admin["org_id"], "member")
    _struggle(struggling)

    page = logged_in_page(admin)
    page.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    attention = page.get_by_role("list", name="Needs attention")
    attention.wait_for(timeout=30000)
    row = attention.get_by_role("button", name=f"Open {struggling['name']} detail")
    assert "At risk" in row.inner_text(), row.inner_text()
    assert page.get_by_role("button", name="Delete Organization").count() == 0, "delete is still on Overview"
    row.click()
    page.get_by_role("dialog").first.wait_for(timeout=15000)
    page.keyboard.press("Escape")

    page.get_by_role("tab", name="Branding").click()
    page.get_by_role("button", name="Delete Organization").wait_for(timeout=15000)
    assert page.get_by_text("Owner", exact=True).count() >= 1
    assert page.get_by_text("Super Admin", exact=True).count() == 0
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]


def test_console_tabs_fit_a_phone(logged_in_page):
    admin = create_user(kind="organization", org_type="enterprise")
    db("grandfather-org", admin["org_id"])
    page = logged_in_page(admin, width=390, height=844)
    page.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    tablist = page.get_by_role("tablist").first
    tablist.wait_for(timeout=30000)
    assert page.evaluate("document.documentElement.scrollWidth") <= 390, "console scrolls the whole page sideways"
    box = tablist.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= 390 + 1, box
    last = page.get_by_role("tab").last
    last.scroll_into_view_if_needed()
    last.click()
    assert last.get_attribute("aria-selected") == "true"
