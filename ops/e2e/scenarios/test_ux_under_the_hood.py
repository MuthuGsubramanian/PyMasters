"""UX: "Under the hood" on a lesson intro steps through the lesson's example and explains each step in plain words
(spec docs/superpowers/specs/2026-11-04-under-the-hood-design.md section E test 4).

Lesson used: how_python_objects_work (python_internals, open to a brand-new user). Its example is
`a = [1, 2]; b = a; b.append(99); ...`, so stepping reaches the alias sentence, then the mutation sentence."""
import re

import pytest

from conftest import BASE, create_user

LESSON = "how_python_objects_work"
ALIAS = re.compile(r"now point to the same list object")
MUTATE = re.compile(r"itself changed")

# Contrast of an element's text against the first opaque background behind it (same helper as test_ux_lesson_visuals.py).
_CONTRAST = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const t = rgba(getComputedStyle(e).color), al = t[3] / 255;
  const fg = [0, 1, 2].map(i => t[i] * al + bg[i] * (1 - al));
  const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""


def _open(logged_in_page, width, height, dark):
    page = logged_in_page(create_user(), width=width, height=height, dark=dark)
    page.goto(f"{BASE}/dashboard/classroom/{LESSON}", wait_until="networkidle")
    launcher = page.get_by_role("button", name=re.compile("Under the hood"))
    launcher.first.wait_for(timeout=60000)
    assert launcher.first.bounding_box()["height"] >= 44, "touch target too small"
    launcher.first.click()
    dialog = page.get_by_role("dialog", name=re.compile("Under the hood"))
    dialog.wait_for(timeout=30000)
    dialog.locator('[data-uth="headline"]').wait_for(timeout=30000)
    pause = dialog.get_by_role("button", name="Pause")
    if pause.count() and pause.first.is_visible():
        pause.first.click()
    return page, dialog


def _step_until(dialog, pattern, limit=40):
    headline = dialog.locator('[data-uth="headline"]')
    nxt = dialog.get_by_role("button", name="Next step")
    for _ in range(limit):
        if pattern.search(headline.inner_text()):
            return headline
        nxt.click()
    raise AssertionError(f"never reached {pattern.pattern!r}; last headline: {headline.inner_text()!r}")


@pytest.mark.parametrize("dark", [False, True])
@pytest.mark.parametrize("width,height", [(390, 844), (1440, 900)])
def test_under_the_hood_explains_alias_then_mutation(logged_in_page, width, height, dark):
    page, dialog = _open(logged_in_page, width, height, dark)

    headline = _step_until(dialog, ALIAS)
    # At the alias step both names point at one object.
    refs = dialog.locator("[data-uth-name]").evaluate_all("rows => rows.map(r => [r.dataset.uthName, r.dataset.ref])")
    by_name = dict(refs)
    assert by_name.get("a") and by_name.get("a") == by_name.get("b"), refs

    ratio = headline.evaluate(_CONTRAST)
    assert ratio >= 4.5, f"headline contrast {ratio:.1f}:1 ({'dark' if dark else 'light'}, {width}px)"

    _step_until(dialog, MUTATE)
    assert page.evaluate("document.documentElement.scrollWidth") <= page.viewport_size["width"], "page scrolls sideways"

    page.keyboard.press("Escape")
    dialog.wait_for(state="hidden", timeout=5000)
