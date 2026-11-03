"""UX: the landing page speaks to each audience and does not read as a template (redesign PR 6, 2026-11-03).

Every h2 carried its own gradient text, every button a gradient with a purple glow and scale-on-hover, there
was no way in for schools or training centres except one "For Schools" link, and on phones the floating
Support button sat on top of the hero's live code demo."""
import pytest

from conftest import BASE


@pytest.fixture
def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.problems = []
    page.on("pageerror", lambda e: page.problems.append(f"pageerror: {str(e)[:200]}"))
    yield page
    ctx.close()


def test_only_the_hero_headline_uses_gradient_text(browser):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(f"{BASE}/", wait_until="networkidle")
    clipped = page.evaluate("""() => [...document.querySelectorAll('h1 *, h2 *, h2')]
        .filter(e => getComputedStyle(e).backgroundClip === 'text' || getComputedStyle(e).webkitBackgroundClip === 'text')
        .map(e => e.closest('h1, h2').tagName)""")
    assert clipped == ["H1"], clipped
    assert page.get_by_role("link", name="For organisations").count() >= 1
    ctx.close()


def test_audience_links_reach_their_sections(phone):
    phone.goto(f"{BASE}/", wait_until="networkidle")
    switch = phone.get_by_role("navigation", name="Who PyMasters is for")
    for label, heading in [("For schools & colleges", "Schools & colleges"),
                           ("For teams & training centres", "Teams & training centres")]:
        switch.get_by_role("link", name=label).click()
        target = phone.get_by_role("heading", name=heading, exact=True)
        target.wait_for(timeout=10000)
        phone.wait_for_timeout(800)   # smooth scroll
        box = target.bounding_box()
        assert 0 <= box["y"] < 844, f"{label} did not bring '{heading}' into view: {box}"
        phone.evaluate("window.scrollTo(0, 0)")
    assert not phone.problems, phone.problems[:3]


def test_support_button_waits_until_past_the_hero_on_phones(phone):
    phone.goto(f"{BASE}/", wait_until="networkidle")
    fab = phone.get_by_role("button", name="Open support")
    assert not fab.is_visible(), "Support button covers the hero on a phone"
    phone.evaluate("window.scrollTo(0, 900)")
    fab.wait_for(state="visible", timeout=5000)
    assert phone.evaluate("document.documentElement.scrollWidth") <= 390
