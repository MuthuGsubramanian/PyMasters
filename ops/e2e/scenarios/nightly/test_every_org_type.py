"""Nightly: every organisation type — signs up, gets its own vocabulary, console renders with every tab."""
import pytest

from conftest import BASE, api, create_user, db

LABELS = {"school": ("Students", "Class", "Teacher"), "university": ("Students", "Course", "Faculty"),
          "training_center": ("Trainees", "Batch", "Trainer"), "enterprise": ("Employees", "Team", "Manager"),
          "other": ("Learners", "Group", "Mentor")}       # backend/routes/organizations.py ORG_TYPES defaults


@pytest.mark.nightly
@pytest.mark.parametrize("org_type", sorted(LABELS))
def test_every_org_type(org_type, logged_in_page):
    admin = create_user(kind="organization", org_type=org_type)
    db("grandfather-org", admin["org_id"])
    s = api(admin["ip"], admin["token"])
    branding = s.get(f"{BASE}/api/org/{admin['org_id']}/branding", timeout=30).json()
    eff = branding.get("branding", branding)
    assert (eff["learner_label"], eff["group_label"], eff["instructor_label"]) == LABELS[org_type]

    page = logged_in_page(admin)
    page.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    page.get_by_role("tab").first.wait_for(timeout=30000)
    tabs = [t.strip() for t in page.get_by_role("tab").all_inner_texts()]
    assert LABELS[org_type][0] in tabs and len(tabs) == 8, tabs
    for name in tabs:
        page.get_by_role("tab", name=name, exact=True).first.click()
        page.wait_for_load_state("networkidle")
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]
