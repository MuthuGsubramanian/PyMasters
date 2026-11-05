"""UX: "Under the hood" opens on "How it works", the lesson's authored explainer of the topic itself
(lesson field `under_the_hood`), and "Python's view" still shows the heap trace of the example.

Lesson used: how_python_objects_work (python_internals, open to a brand-new user). Skipped while that lesson has
no `under_the_hood` (in this checkout, or on the server under test), so it never fails before the content lands."""
import json
import pathlib
import re

import pytest

from conftest import BASE, create_user
from test_ux_under_the_hood import _CONTRAST

LESSON = "how_python_objects_work"
LESSON_FILE = (pathlib.Path(__file__).resolve().parents[3] / "backend" / "lessons" / "python_internals"
               / f"{LESSON}.json")

# Visible text nodes under `root` whose computed font size is below 12 px.
_SMALL_TEXT = r"""root => [...root.querySelectorAll('*')]
  .filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
  .map(e => [e.textContent.trim().slice(0, 40), parseFloat(getComputedStyle(e).fontSize)])
  .filter(([, px]) => px < 12)"""


def _has_topic_content():
    try:
        return "under_the_hood" in json.loads(LESSON_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False


pytestmark = pytest.mark.skipif(not _has_topic_content(), reason=f"{LESSON} has no under_the_hood yet")


def _open(logged_in_page, width, height, dark):
    page = logged_in_page(create_user(), width=width, height=height, dark=dark)
    page.goto(f"{BASE}/dashboard/classroom/{LESSON}", wait_until="networkidle")
    launcher = page.get_by_role("button", name=re.compile("Under the hood"))
    launcher.first.wait_for(timeout=60000)
    launcher.first.click()
    dialog = page.get_by_role("dialog", name=re.compile("Under the hood"))
    dialog.wait_for(timeout=30000)
    topic_tab = dialog.get_by_role("tab", name="How it works")
    try:
        topic_tab.wait_for(timeout=10000)
    except Exception:
        pytest.skip("the server under test does not serve topic content for this lesson yet")
    return page, dialog


def _check_text(page, dialog, where):
    section = dialog.locator('section[aria-label="How it works"]')
    small = section.evaluate(_SMALL_TEXT)
    assert not small, f"text under 12 px at {where}: {small}"
    for sel in ('[data-uth-topic="summary"]', '[data-uth-topic="title"]', '[data-uth-topic="body"]'):
        ratio = dialog.locator(sel).evaluate(_CONTRAST)
        assert ratio >= 4.5, f"{sel} contrast {ratio:.1f}:1 at {where}"
    assert page.evaluate("document.documentElement.scrollWidth") <= page.viewport_size["width"], \
        f"page scrolls sideways at {where}"


@pytest.mark.parametrize("dark", [False, True])
@pytest.mark.parametrize("width,height", [(390, 844), (1440, 900)])
def test_under_the_hood_topic_steps_to_takeaway_then_python_view(logged_in_page, width, height, dark):
    page, dialog = _open(logged_in_page, width, height, dark)
    where = f"{'dark' if dark else 'light'} {width}px"

    assert dialog.get_by_role("tab", name="How it works").get_attribute("aria-selected") == "true"
    dialog.locator('[data-uth-topic="summary"]').wait_for(timeout=5000)

    nxt = dialog.get_by_role("button", name="Next", exact=True)
    assert nxt.bounding_box()["height"] >= 44, "Next is smaller than 44 px"
    counter = dialog.locator('[data-uth-topic="counter"]')
    for _ in range(10):
        _check_text(page, dialog, f"{where}, {counter.inner_text()}")
        if nxt.is_disabled():
            break
        nxt.click()
    else:
        raise AssertionError("never reached the last step")

    takeaway = dialog.locator('[data-uth-topic="takeaway"]')
    takeaway.wait_for(timeout=5000)
    ratio = takeaway.locator("p").last.evaluate(_CONTRAST)
    assert ratio >= 4.5, f"takeaway contrast {ratio:.1f}:1 at {where}"

    # Arrow keys step back too.
    dialog.locator('[data-uth-topic="stepper"]').focus()
    page.keyboard.press("ArrowLeft")
    assert takeaway.count() == 0, "takeaway should only show on the last step"

    dialog.get_by_role("tab", name="Python's view").click()
    dialog.locator('[data-uth="headline"]').wait_for(timeout=60000)
    assert page.evaluate("document.documentElement.scrollWidth") <= page.viewport_size["width"], \
        f"page scrolls sideways on Python's view at {where}"

    page.keyboard.press("Escape")
    dialog.wait_for(state="hidden", timeout=5000)
