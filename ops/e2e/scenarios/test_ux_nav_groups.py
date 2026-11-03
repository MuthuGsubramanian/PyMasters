"""UX: the sidebar is grouped and role-aware (redesign PR 3, 2026-11-03).

15 items sat in one flat list, and org managers (Teacher/Faculty/Trainer/Manager) had no way to reach the
console that grants them the learner and analytics tabs."""
from conftest import BASE, api, create_user, db, with_org


def _join(admin, role):
    m = create_user()
    inv = api(admin["ip"], admin["token"]).post(f"{BASE}/api/org/{admin['org_id']}/invite", timeout=30, json={
        "email": m["email"], "role": role, "user_id": admin["id"]}).json()
    j = api(m["ip"], m["token"]).post(f"{BASE}/api/org/join/{inv['token']}", json={"user_id": m["id"]}, timeout=30)
    assert j.status_code == 200, j.text[:200]
    return with_org(m)


def _nav(page):
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    nav = page.get_by_role("navigation", name="Primary")
    nav.wait_for(timeout=30000)
    return nav


def test_teacher_reaches_their_class_console_from_the_sidebar(logged_in_page):
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    page = logged_in_page(_join(admin, "manager"))
    nav = _nav(page)
    nav.get_by_role("group", name="Manage").get_by_role("button", name="Class console").click()
    page.wait_for_url("**/dashboard/org", timeout=15000)
    page.get_by_role("tab", name="Students").first.wait_for(timeout=30000)
    page.get_by_role("tab", name="Analytics").first.wait_for(timeout=15000)


def test_learner_sees_grouped_sections_without_manage(logged_in_page):
    admin = create_user(kind="organization", org_type="enterprise")
    db("grandfather-org", admin["org_id"])
    page = logged_in_page(_join(admin, "member"))
    nav = _nav(page)
    headings = [h.strip().lower() for h in nav.get_by_role("heading").all_inner_texts()]
    assert headings == ["learn", "practice", "explore", "account"], headings
    assert nav.get_by_role("button", name="Team console").count() == 0


def test_owner_console_is_named_for_the_org_and_keyboard_reachable(logged_in_page):
    admin = create_user(kind="organization", org_type="training_center")
    db("grandfather-org", admin["org_id"])
    page = logged_in_page(with_org(admin))
    nav = _nav(page)
    item = nav.get_by_role("button", name="Batch console")
    item.wait_for(timeout=15000)
    for _ in range(60):                              # reach it the way a keyboard user does
        page.keyboard.press("Tab")
        if item.evaluate("e => e === document.activeElement"):
            break
    else:
        raise AssertionError("Batch console is not reachable with Tab")
    assert item.evaluate("e => getComputedStyle(e).boxShadow !== 'none' || getComputedStyle(e).outlineStyle !== 'none'"), \
        "no visible focus on a nav item"
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/org", timeout=15000)
