"""UX: a lesson's header reads cleanly on a phone (redesign "Later" I10, 2026-11-03).

At 390px the "+50 XP" chip broke onto two lines, "Python Fundamentals · Le..." was cut off, and the Visual
Debugger header wrapped "Visual Debugger" and "Step 1/6" onto two lines each."""
import pytest

from conftest import BASE, create_user


@pytest.mark.parametrize("dark", [False, True])
def test_lesson_header_fits_a_phone(logged_in_page, dark):
    page = logged_in_page(create_user(), width=390, height=844, dark=dark)
    page.goto(f"{BASE}/dashboard/classroom/variables_intro", wait_until="networkidle")
    page.get_by_role("button", name="Start Practice").wait_for(timeout=30000)

    xp = page.get_by_text("+50 XP", exact=True).first
    assert xp.bounding_box()["height"] <= 26, f"XP chip wraps ({xp.bounding_box()['height']:.0f}px)"
    crumb = page.get_by_text("Lesson 1 of", exact=False).first
    assert crumb.evaluate("e => e.scrollWidth <= e.clientWidth + 1"), "track breadcrumb is cut off"
    assert crumb.bounding_box()["x"] + crumb.bounding_box()["width"] <= 390

    title = page.get_by_text("Visual Debugger", exact=True).first
    title.wait_for(timeout=15000)
    line = title.evaluate("e => parseFloat(getComputedStyle(e).lineHeight) || 16")
    assert title.bounding_box()["height"] <= line * 1.5, "'Visual Debugger' wraps onto two lines"
    assert page.evaluate("document.documentElement.scrollWidth") <= 390
