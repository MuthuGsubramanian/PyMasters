"""Journey: a school or university teacher and their student (spec §2, journey 2; Review Focus: org labels).

Teacher registers the org through the UI and finishes org onboarding → invites a student from the console →
student joins through the invite link → student completes a lesson → teacher sees the student and the
completion in the console. The console speaks the org type's vocabulary.
"""
import uuid

import pytest

from conftest import BASE, PASSWORD, api, complete_lesson, db, dismiss_release_notes, fake_ip, onboard_learner_ui

LABELS = {"school": ("Students", "Class", "Teacher"), "university": ("Students", "Course", "Faculty")}
TYPE_LABEL = {"school": "School", "university": "University"}


def _teacher_signs_up(page, org_type, suffix):
    page.goto(f"{BASE}/login?mode=signup", wait_until="networkidle")
    page.get_by_text("Organization / School / Enterprise").click()
    page.get_by_placeholder("e.g., Stanford University, Google, Lincoln High").fill(f"E2E {org_type} {suffix}")
    page.get_by_text(TYPE_LABEL[org_type], exact=True).click()
    page.get_by_role("button", name="Next: Create Admin Account").click()
    page.get_by_placeholder("Enter your username").fill(f"e2e_t_{suffix}")
    page.get_by_placeholder("you@example.com").fill(f"e2e_t_{suffix}@example.com")
    page.get_by_placeholder("At least 8 characters").fill(PASSWORD)
    page.get_by_role("button", name="Create Organization & Account").click()
    page.wait_for_url("**/onboarding", timeout=30000)
    for label in ("11-50 learners", "K-12 Students" if org_type == "school" else "University Students",
                  "Complete Beginners", "Python Fundamentals", "Assign Specific Paths"):
        page.get_by_text(label, exact=False).first.click()
    page.get_by_role("button", name="Finish Setup").click()
    page.wait_for_url("**/dashboard/org**", timeout=30000)


@pytest.mark.parametrize("org_type", ["school", "university"])
def test_teacher_and_student_journey(browser, org_type):
    suffix = uuid.uuid4().hex[:8]
    t_ip = fake_ip()
    tctx = browser.new_context(viewport={"width": 1366, "height": 850}, extra_http_headers={"X-Forwarded-For": t_ip})
    tpage = tctx.new_page()
    _teacher_signs_up(tpage, org_type, suffix)
    teacher = tpage.evaluate("JSON.parse(localStorage.getItem('pm_user'))")
    ts = api(t_ip, teacher["token"])
    org_id = ts.get(f"{BASE}/api/org/my", timeout=30).json()["organizations"][0]["id"]
    db("grandfather-org", org_id)   # stands in for the platform approving the school's plan

    # Invite from the console's Invites tab.
    learner_label, group_label, instructor_label = LABELS[org_type]
    tpage.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    dismiss_release_notes(tpage)
    tpage.get_by_role("tab", name="Invites").first.click()
    student_email = f"e2e_s_{suffix}@example.com"
    tpage.get_by_label("Member email to invite").fill(student_email)
    with tpage.expect_response(lambda r: f"/api/org/{org_id}/invite" in r.url and r.request.method == "POST") as inv:
        tpage.get_by_role("button", name="Send Invite").click()
    token = inv.value.json()["token"]

    # Student joins through the link and completes a lesson.
    s_ip = fake_ip()
    sctx = browser.new_context(viewport={"width": 400, "height": 820}, is_mobile=True,
                               extra_http_headers={"X-Forwarded-For": s_ip})
    spage = sctx.new_page()
    spage.goto(f"{BASE}/join/{token}", wait_until="networkidle")
    spage.get_by_placeholder("Your full name").fill(f"Student {suffix}")
    spage.get_by_placeholder("Choose a username").fill(f"e2e_s_{suffix}")
    spage.get_by_placeholder("Create a password").fill(PASSWORD)
    spage.locator("button[type=submit]").click()
    onboard_learner_ui(spage)          # invited students set their own learning preferences first
    student = spage.evaluate("JSON.parse(localStorage.getItem('pm_user'))")
    student["ip"] = s_ip
    assert complete_lesson(student)["success"] is True

    # Teacher sees the student, in the org type's vocabulary.
    tpage.goto(f"{BASE}/dashboard/org", wait_until="networkidle")
    dismiss_release_notes(tpage)
    tpage.get_by_role("tab", name=learner_label).first.click()
    tpage.get_by_text(f"Student {suffix}").first.wait_for(timeout=15000)
    progress = ts.get(f"{BASE}/api/org/{org_id}/progress", params={"user_id": teacher["id"]}, timeout=30).json()
    row = next(m for m in progress["students"] if m["id"] == student["id"])
    assert row["lessons_completed"] >= 1 and row["xp"] > 0, row
    branding = ts.get(f"{BASE}/api/org/{org_id}/branding", timeout=30).json()
    eff = branding.get("branding", branding)
    assert (eff["learner_label"], eff["group_label"], eff["instructor_label"]) == LABELS[org_type]
    tctx.close()
    sctx.close()
