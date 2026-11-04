"""UX: lesson visuals are readable, steppable and never covered on phones and laptops (visual clarity foundation,
2026-11-04; spec docs/superpowers/specs/2026-11-04-visual-clarity-foundation-design.md section D tests 4-5).

Lessons used (all open for a brand-new user, none sit in an enterprise-only track):
- variables_operators: an ExecutionVisualizer with a playback bar (Watch It Run popup).
- for_loops: its ExecutionVisualizer code has an indented line (a loop body).
- ml_workflow: its ExecutionVisualizer has lines of up to 92 characters (long-line overflow on a phone).
- /dashboard/explains/gradient-descent: a ScrollyBody essay."""
import re

import pytest
from playwright.sync_api import expect

from conftest import BASE, create_user

SIZES = [(390, 844), (1440, 900)]
THEMES = [False, True]
COUNTER = re.compile(r"^Step (\d+) of (\d+)$")

# Same contrast helper as test_ux_playground_layout.py, plus the text colour's own alpha blended over the background
# (the visual labels are code-foreground at 60-80% opacity).
_CONTRAST = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const t = rgba(getComputedStyle(e).color), al = t[3] / 255;
  const fg = [0, 1, 2].map(i => t[i] * al + bg[i] * (1 - al));
  const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""

# Visible text nodes (and their computed font size) under an element, smaller than 12px.
_SMALL_TEXT = r"""root => { const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const text = n.textContent.trim(); if (!text) continue;
    const el = n.parentElement; if (!el || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const px = parseFloat(cs.fontSize); if (px < 12) out.push(px + 'px: ' + text.slice(0, 40)); }
  return out; }"""

# x of the first non-space character of a code line span (leading spaces count, so an indented line sits further right).
_FIRST_CHAR_X = r"""(span) => { const w = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.textContent.search(/\S/); if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect().x; }
  return null; }"""


def _open_visual(logged_in_page, lesson_id, width, height, dark=False):
    """Open a lesson intro, click Watch It Run and return (page, dialog)."""
    page = logged_in_page(create_user(), width=width, height=height, dark=dark)
    page.goto(f"{BASE}/dashboard/classroom/{lesson_id}", wait_until="networkidle")
    launcher = page.get_by_role("button", name=re.compile("Watch It Run"))
    launcher.first.wait_for(timeout=30000)
    launcher.first.click()
    dialog = page.get_by_role("dialog", name="Code execution and flow")
    dialog.wait_for(timeout=30000)
    return page, dialog


def _playback(dialog):
    """The focusable wrapper around the first step-based visual (the one holding the Next step button)."""
    wrapper = dialog.locator('div[tabindex="0"]').filter(has=dialog.page.get_by_role("button", name="Next step")).first
    wrapper.wait_for(timeout=30000)
    return wrapper


def _counter(wrapper):
    return wrapper.get_by_text(COUNTER).first


def _pause(wrapper):
    # Playback autoplays; stop it so the step number only changes when the test asks.
    wrapper.get_by_role("button", name="Pause").click()
    wrapper.get_by_role("button", name="Play").wait_for(timeout=10000)


@pytest.mark.parametrize("dark", THEMES)
@pytest.mark.parametrize("width,height", SIZES)
def test_visual_has_controls_that_step_by_keyboard_and_do_not_overflow(logged_in_page, width, height, dark):
    page, dialog = _open_visual(logged_in_page, "variables_operators", width, height, dark)
    wrapper = _playback(dialog)
    for name in ("Previous step", "Next step", "Restart"):
        assert wrapper.get_by_role("button", name=name).is_visible(), f"'{name}' button is not visible"
    _counter(wrapper).wait_for(timeout=10000)

    _pause(wrapper)
    m = COUNTER.match(_counter(wrapper).inner_text().strip())
    step, total = int(m.group(1)), int(m.group(2))
    assert total >= 2 and step < total, f"unexpected counter {m.group(0)}"

    wrapper.focus()
    page.keyboard.press("ArrowRight")
    expect(_counter(wrapper)).to_have_text(f"Step {step + 1} of {total}", timeout=10000)
    page.keyboard.press("ArrowLeft")
    expect(_counter(wrapper)).to_have_text(f"Step {step} of {total}", timeout=10000)

    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), \
        f"page scrolls sideways: scrollWidth={page.evaluate('document.documentElement.scrollWidth')} innerWidth={width}"


@pytest.mark.parametrize("dark", THEMES)
@pytest.mark.parametrize("width,height", SIZES)
def test_visual_text_is_at_least_12px(logged_in_page, width, height, dark):
    page, dialog = _open_visual(logged_in_page, "variables_operators", width, height, dark)
    wrapper = _playback(dialog)
    _counter(wrapper).wait_for(timeout=10000)
    _pause(wrapper)
    small = wrapper.evaluate(_SMALL_TEXT)
    assert not small, f"visual text under 12px: {small}"


@pytest.mark.parametrize("dark", THEMES)
@pytest.mark.parametrize("width,height", SIZES)
def test_visual_labels_have_readable_contrast(logged_in_page, width, height, dark):
    page, dialog = _open_visual(logged_in_page, "variables_operators", width, height, dark)
    wrapper = _playback(dialog)
    _counter(wrapper).wait_for(timeout=10000)
    _pause(wrapper)
    # Step 1 of this lesson has a description, so "What's happening" is shown; restart is not needed.
    checks = {
        "step counter": _counter(wrapper),
        "Visual Debugger label": wrapper.get_by_text("Visual Debugger", exact=True).first,
        "Variables label": wrapper.get_by_text("Variables", exact=True).first,
        "What's happening label": wrapper.get_by_text("What's happening", exact=True).first,
    }
    for name, el in checks.items():
        el.wait_for(timeout=10000)
        ratio = el.evaluate(_CONTRAST)
        assert ratio >= 4.5, f"{name} contrast {ratio:.1f}:1 ({'dark' if dark else 'light'}, {width}px)"


@pytest.mark.parametrize("width,height", SIZES)
def test_code_indentation_is_preserved(logged_in_page, width, height):
    # for_loops: line 1 "for i in range(5):", line 2 "    print(f'Delivering to house {i}')".
    page, dialog = _open_visual(logged_in_page, "for_loops", width, height)
    body = dialog.locator("span.whitespace-pre").filter(has_text="Delivering").first
    body.wait_for(timeout=30000)
    assert body.evaluate("e => e.textContent.startsWith('    ')"), "the loop body lost its leading spaces"
    # Compare against line 1 of the same code column.
    xs = body.evaluate("""(e, firstCharX) => { const col = e.parentElement.parentElement;
        const head = [...col.querySelectorAll('span.whitespace-pre')].find(s => s.textContent.startsWith('for i in range'));
        const fx = eval(firstCharX);
        return [head ? fx(head) : null, fx(e)]; }""", _FIRST_CHAR_X)
    head_x, body_x = xs
    assert head_x is not None and body_x is not None, "could not measure the code lines"
    assert body_x > head_x + 8, f"loop body is not indented: for-line x={head_x:.1f}, body x={body_x:.1f}"


def test_long_code_line_scrolls_inside_its_box_on_a_phone(logged_in_page):
    # ml_workflow is the widest existing ExecutionVisualizer (a 92-character line).
    page, dialog = _open_visual(logged_in_page, "ml_workflow", 390, 844)
    line = dialog.locator("span.whitespace-pre").filter(has_text="train_test_split(X, y").first
    line.wait_for(timeout=30000)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), \
        f"a long code line widens the page: scrollWidth={page.evaluate('document.documentElement.scrollWidth')}"
    column = line.evaluate_handle("e => e.parentElement.parentElement")
    scrolls = column.evaluate("c => ({ overflowX: getComputedStyle(c).overflowX, inner: c.scrollWidth, outer: c.clientWidth })")
    assert scrolls["overflowX"] in ("auto", "scroll"), f"code column does not scroll: {scrolls}"
    assert scrolls["inner"] > scrolls["outer"], f"long line is clipped instead of scrollable: {scrolls}"


def test_explains_step_headings_are_not_covered_on_a_short_phone(logged_in_page):
    # Below lg the steps stack visual-then-text; on main a sticky visual sat on top of the step heading.
    page = logged_in_page(create_user(), width=390, height=660)
    page.goto(f"{BASE}/dashboard/explains/gradient-descent", wait_until="networkidle")
    headings = page.locator("section[data-step] h2")
    headings.first.wait_for(timeout=30000)
    count = headings.count()
    assert count >= 3, f"expected the essay's steps, found {count} headings"
    for i in range(count):
        h = headings.nth(i)
        h.evaluate("e => e.scrollIntoView({ block: 'center', behavior: 'instant' })")
        page.wait_for_timeout(150)   # one frame or two for layout to settle after the jump
        hidden_by = h.evaluate("""e => { const r = e.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return e.contains(top) ? null : (top ? top.tagName + '.' + String(top.className).slice(0, 60) : 'nothing'); }""")
        assert hidden_by is None, f"step {i + 1} heading is covered by {hidden_by}"
