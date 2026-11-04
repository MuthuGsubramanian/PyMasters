"""UX: "Visualize my code" on the lesson practice screen steps through the learner's own program.

The Playground already had a time-travel visualizer; practice (where learners get stuck) did not."""
import re

from conftest import BASE, create_user


def test_visualize_my_code_in_lesson_practice(logged_in_page):
    page = logged_in_page(create_user())
    page.goto(f"{BASE}/dashboard/classroom/variables_operators", wait_until="networkidle")
    page.get_by_role("button", name="Start Practice").wait_for(timeout=30000)
    page.get_by_role("button", name="Start Practice").click()
    page.get_by_role("button", name="Run Code").wait_for(timeout=15000)

    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+A")
    page.keyboard.type("x = 2\ny = x + 3\nprint(y)\n")

    btn = page.get_by_role("button", name="Visualize my code")
    assert btn.is_enabled()
    assert btn.bounding_box()["height"] >= 40, "touch target too small"
    btn.click()

    dialog = page.get_by_role("dialog", name="Time-travel visualizer")
    dialog.wait_for(timeout=30000)
    m = re.search(r"Step 1 of (\d+)", dialog.inner_text())
    assert m, dialog.inner_text()[:200]
    assert int(m.group(1)) >= 2

    page.keyboard.press("Escape")
    dialog.wait_for(state="hidden", timeout=5000)
    assert page.evaluate("document.documentElement.scrollWidth") <= page.viewport_size["width"]
