"""Review Focus: an org speaks its own vocabulary everywhere the console shows it (school → Students/Class,
training centre → Trainees/Batch, enterprise → Employees/Team), with correct plurals."""
import pytest

from conftest import BASE, api, create_user, db, with_org

LABELS = {"school": ("Students", "Class", "Classes"), "training_center": ("Trainees", "Batch", "Batches"),
          "enterprise": ("Employees", "Team", "Teams")}


def _member_in_group(admin, org_id, group):
    m = create_user()
    s = api(admin["ip"], admin["token"])
    inv = s.post(f"{BASE}/api/org/{org_id}/invite", json={"email": m["email"], "role": "member", "user_id": admin["id"]},
                 timeout=30).json()
    api(m["ip"], m["token"]).post(f"{BASE}/api/org/join/{inv['token']}", json={"user_id": m["id"]}, timeout=30)
    s.put(f"{BASE}/api/org/{org_id}/members/{m['id']}/groups", json={"groups": [group], "user_id": admin["id"]}, timeout=30)
    return m


@pytest.mark.parametrize("org_type", sorted(LABELS))
def test_org_labels_follow_type(org_type, logged_in_page):
    learners, group, groups = LABELS[org_type]
    admin = create_user(kind="organization", org_type=org_type)
    db("grandfather-org", admin["org_id"])
    _member_in_group(admin, admin["org_id"], f"{group} A")
    assert api(admin["ip"], admin["token"]).get(f"{BASE}/api/org/{admin['org_id']}/groups",
                                                params={"user_id": admin["id"]}, timeout=30).json()["group_label"] == group

    page = logged_in_page(admin)
    page.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    page.get_by_role("tab", name=learners).first.wait_for(timeout=30000)
    page.get_by_text(f"{group} Distribution").first.wait_for(timeout=15000)
    page.get_by_role("tab", name=learners).first.click()
    header = page.get_by_role("columnheader", name=groups, exact=True)
    header.first.wait_for(timeout=15000)
    body = page.locator("main").inner_text()
    assert f"{group}s " not in body.replace(groups, ""), f"naive plural '{group}s' shown"
    assert "Group Distribution" not in body and "Groups" not in body.replace(groups, ""), "generic 'Group' wording"


WELCOME = "Welcome to the Q4 Python upskilling programme - start with the assigned path."


def _joined_member(admin):
    m = create_user()
    inv = api(admin["ip"], admin["token"]).post(f"{BASE}/api/org/{admin['org_id']}/invite", timeout=30, json={
        "email": m["email"], "role": "member", "user_id": admin["id"]}).json()
    j = api(m["ip"], m["token"]).post(f"{BASE}/api/org/join/{inv['token']}", json={"user_id": m["id"]}, timeout=30)
    assert j.status_code == 200, j.text[:200]
    return with_org(m)


def _sidebar_and_dashboard(page):
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    page.get_by_role("heading", level=1).first.wait_for(timeout=30000)
    return page.locator("aside").first.inner_text(), page.locator("main").inner_text()


def test_employee_sees_their_company_not_a_game(logged_in_page):
    """Redesign PR 2: an enterprise member's app carries the company's name and welcome; no CADET, no quote."""
    admin = create_user(kind="organization", org_type="enterprise")
    db("grandfather-org", admin["org_id"])
    r = api(admin["ip"], admin["token"]).put(f"{BASE}/api/org/{admin['org_id']}/branding", timeout=30,
                                             json={"user_id": admin["id"], "welcome_message": WELCOME})
    assert r.status_code == 200, r.text[:200]
    member = _joined_member(admin)
    page = logged_in_page(member)
    aside, main = _sidebar_and_dashboard(page)
    org_name = member["org"].get("org_name") or member["org"].get("name")
    assert org_name and org_name in aside, (org_name, aside[:200])
    page.get_by_test_id("org-welcome").get_by_text(WELCOME).wait_for(timeout=15000)
    assert "CADET" not in aside, "game rank shown to an employee"
    assert page.get_by_test_id("org-identity").inner_text().endswith(org_name)
    assert page.evaluate("document.documentElement.dataset.audience") == "professional"


def test_student_sees_their_school_and_levels(logged_in_page):
    admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", admin["org_id"])
    member = _joined_member(admin)
    page = logged_in_page(member)
    aside, _ = _sidebar_and_dashboard(page)
    org_name = member["org"].get("org_name") or member["org"].get("name")
    assert org_name in aside and "Level 1" in aside and "CADET" not in aside, aside[:300]
    assert page.evaluate("document.documentElement.dataset.audience") == "education"


def test_individual_keeps_their_rank_and_sees_their_name(logged_in_page):
    u = create_user(name="Priya Raman")
    page = logged_in_page(u)
    aside, _ = _sidebar_and_dashboard(page)
    assert "Priya Raman" in aside and "CADET" in aside and "PYMASTERS" in aside, aside[:300]
    assert u["username"] not in aside.split("Priya Raman")[0], "sidebar shows the raw username instead of the name"
    assert page.evaluate("document.documentElement.dataset.audience") == "individual"
