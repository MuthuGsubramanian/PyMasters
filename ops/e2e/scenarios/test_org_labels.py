"""Review Focus: an org speaks its own vocabulary everywhere the console shows it (school → Students/Class,
training centre → Trainees/Batch, enterprise → Employees/Team), with correct plurals."""
import pytest

from conftest import BASE, api, create_user, db

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
