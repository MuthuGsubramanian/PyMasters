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
