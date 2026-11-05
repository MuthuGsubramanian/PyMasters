"""Journey: an individual learner, end to end through the real UI (spec §2, journey 1).

Sign up → onboarding → dashboard → open a lesson → intro → chat with Vaathiyaar → solve the practice →
XP and streak update → warm-up has questions → profile stats show the completion.
"""
import uuid

from conftest import BASE, PASSWORD, api, dismiss_release_notes, fake_ip, onboard_learner_ui, solution_for

LESSON = "variables_intro"


def _signup(page, username, email):
    page.goto(f"{BASE}/login?mode=signup", wait_until="networkidle")
    page.get_by_text("Individual Learner").click()
    page.get_by_placeholder("Enter your username").fill(username)
    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("At least 8 characters").fill(PASSWORD)
    page.get_by_role("button", name="Create Account").click()


def test_individual_learner_journey(browser):
    suffix = uuid.uuid4().hex[:8]
    username, email, ip = f"e2e_ind_{suffix}", f"e2e_ind_{suffix}@example.com", fake_ip()
    ctx = browser.new_context(viewport={"width": 1366, "height": 850}, extra_http_headers={"X-Forwarded-For": ip})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))

    _signup(page, username, email)
    onboard_learner_ui(page)

    session = page.evaluate("JSON.parse(localStorage.getItem('pm_user'))")
    uid, token = session["id"], session["token"]
    s = api(ip, token)
    lesson = s.get(f"{BASE}/api/classroom/lesson/{LESSON}", timeout=30).json()
    challenge = lesson["practice_challenges"][0]

    # Lesson: intro renders, chat answers, practice is solved through the real grader.
    page.goto(f"{BASE}/dashboard/classroom/{LESSON}", wait_until="networkidle")
    dismiss_release_notes(page)
    page.get_by_role("button", name="Open Vaathiyaar chat").click()
    page.get_by_placeholder("Ask Vaathiyaar anything...").fill("What is a variable?")
    page.keyboard.press("Enter")
    page.get_by_text("Stub tutor reply.").first.wait_for(timeout=30000)

    page.get_by_role("button", name="Start Practice").click()
    editor = page.locator(".cm-content").first
    editor.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    page.keyboard.insert_text(solution_for(LESSON, 0, challenge.get("expected_output", "")))
    with page.expect_response(lambda r: "/api/classroom/evaluate" in r.url, timeout=60000) as ev:
        page.get_by_role("button", name="Run Code").click()
    result = ev.value.json()
    assert result.get("success") is True, result

    # Progress shows up everywhere it should.
    stats = s.get(f"{BASE}/api/profile/{uid}/stats", timeout=30).json()
    assert stats.get("total_xp", stats.get("xp", 0)) > 0, stats
    assert stats.get("lessons_completed", stats.get("completed_lessons", 0)) >= 1, stats
    assert (stats.get("streak") or stats.get("current_streak") or 0) >= 1, stats
    warm = s.get(f"{BASE}/api/review/warmup", timeout=30).json()
    assert warm.get("questions") or warm.get("items"), warm

    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    assert page.locator("body").inner_text().strip()
    assert not errors, errors[:3]
    ctx.close()
