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
        for _ in range(40):           # smooth scroll + settle take a variable time on a loaded runner: poll
            box = target.bounding_box()
            if 0 <= box["y"] < 844:
                break
            phone.wait_for_timeout(100)
        assert 0 <= box["y"] < 844, f"{label} did not bring '{heading}' into view: {box}"
        phone.wait_for_timeout(1600)  # let the link's settle re-checks finish before going back up
        phone.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })")
        phone.wait_for_function("window.scrollY === 0")
    assert not phone.problems, phone.problems[:3]


# Same contrast helper as test_ux_lesson_visuals.py (text alpha blended over the first opaque background).
_CONTRAST = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const t = rgba(getComputedStyle(e).color), al = t[3] / 255;
  const fg = [0, 1, 2].map(i => t[i] * al + bg[i] * (1 - al));
  const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""


@pytest.mark.parametrize("width,height", [(390, 844), (1440, 900)])
def test_how_a_lesson_works_replaces_the_feature_cards(browser, width, height):
    # Deferred redesign item (2026-11-05): the 4 identical icon/title/sentence cards became one ordered strip,
    # story -> Watch It Run -> Under the hood -> practice, each with a piece of the real lesson UI.
    ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=width < 500, has_touch=width < 500)
    page = ctx.new_page()
    page.goto(f"{BASE}/", wait_until="networkidle")
    section = page.locator("section#how-it-works")
    section.scroll_into_view_if_needed()
    assert section.get_by_role("heading", name="How a lesson works").is_visible()
    titles = section.locator("ol > li h3").all_inner_texts()
    assert titles == ["Read the story", "Watch It Run", "Under the hood", "Practice with instant grading"], titles
    assert page.get_by_text("A different kind of", exact=False).count() == 0, "old feature-card section is still there"
    low = []
    for el in section.locator("h2, h3, p, code, pre, span:not([aria-hidden])").all():
        if el.is_visible() and el.inner_text().strip():
            ratio = el.evaluate(_CONTRAST)
            if ratio < 4.5:
                low.append(f"{ratio:.1f}:1 {el.inner_text()[:40]!r}")
    assert not low, low
    small = section.evaluate("""s => [...s.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.textContent.trim()
        && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.trim().slice(0, 30))""")
    assert not small, small
    assert page.evaluate("document.documentElement.scrollWidth") <= width
    if width >= 640:
        page.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })")
        page.get_by_role("link", name="How it works").first.click()
        page.wait_for_function("document.getElementById('how-it-works').getBoundingClientRect().top < innerHeight / 2")
    ctx.close()


def test_support_button_waits_until_past_the_hero_on_phones(phone):
    phone.goto(f"{BASE}/", wait_until="networkidle")
    fab = phone.get_by_role("button", name="Open support")
    assert not fab.is_visible(), "Support button covers the hero on a phone"
    phone.evaluate("window.scrollTo(0, 900)")
    fab.wait_for(state="visible", timeout=5000)
    assert phone.evaluate("document.documentElement.scrollWidth") <= 390
