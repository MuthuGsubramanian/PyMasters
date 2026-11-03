"""UX: pricing only promises what PyMasters has, shows the live catalogue size, and offers students their free
path from both Pricing and Upgrade (redesign PR 5, 2026-11-03). The backend has no SSO and issues no
completion certificates; the lesson count was hard-coded ("340+") while the catalogue had grown past 500."""
import re

import pytest

from conftest import BASE, api, create_user

UNBACKED = re.compile(r"\bSSO\b|certificate", re.I)


def _rounded(n: int) -> str:
    return f"{n // 10 * 10}+" if n >= 20 else str(n)


@pytest.fixture
def visitor(browser):
    ctx = browser.new_context(viewport={"width": 1366, "height": 850})
    page = ctx.new_page()
    page.problems = []
    page.on("pageerror", lambda e: page.problems.append(f"pageerror: {str(e)[:200]}"))
    yield page
    ctx.close()


def _student_modal_opens(page):
    page.get_by_role("button", name="Request student access").click()
    page.get_by_text("Upload student ID").first.wait_for(timeout=10000)


def test_pricing_is_honest_and_live(visitor):
    stats = api().get(f"{BASE}/api/classroom/catalog-stats", timeout=30).json()
    visitor.goto(f"{BASE}/pricing", wait_until="networkidle")
    want = f"{stats['tracks']} tracks, {_rounded(stats['lessons'])} lessons"
    visitor.get_by_text(want).wait_for(timeout=15000)
    text = visitor.locator("body").inner_text()
    assert not UNBACKED.search(text), UNBACKED.search(text).group(0)
    assert "Most popular" not in text
    _student_modal_opens(visitor)
    assert not visitor.problems, visitor.problems[:3]


def test_home_makes_no_unbacked_claims(visitor):
    visitor.goto(f"{BASE}/", wait_until="networkidle")
    text = visitor.locator("body").inner_text()
    assert not UNBACKED.search(text), UNBACKED.search(text).group(0)
    assert "AI Modules" not in text


@pytest.mark.parametrize("width", [1440, 390])
def test_upgrade_offers_the_student_path(logged_in_page, width):
    page = logged_in_page(create_user(), width=width, height=900)
    page.goto(f"{BASE}/dashboard/upgrade", wait_until="networkidle")
    page.get_by_role("heading", name=re.compile("Choose your plan|Keep learning")).wait_for(timeout=15000)
    assert not UNBACKED.search(page.locator("main").inner_text())
    _student_modal_opens(page)
    assert page.evaluate("document.documentElement.scrollWidth") <= width
    assert not [p for p in page.problems if "pageerror" in p], page.problems[:3]
