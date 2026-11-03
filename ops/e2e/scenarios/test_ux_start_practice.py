"""UX: "Start Practice" opens the practice screen at once (live audit 2026-11-04).

On pymasters.net the practice screen appeared ~1.8 s after the press (8 s+ on a busy browser) with no sign the press
registered: the phases use AnimatePresence mode="wait", so practice mounted only after the long intro (Visual
Debugger, scrolly sections) finished a 300 ms exit animation, which stretches on slow or busy devices."""
import pytest

from conftest import BASE, create_user

# Press the real button and time, inside the page, until the practice screen's "Run Code" button exists.
_TIME_TO_PRACTICE = """() => new Promise((resolve) => {
  const start = [...document.querySelectorAll('button')].find(b => /^start practice$/i.test(b.innerText.trim()));
  const has = () => [...document.querySelectorAll('button')].some(b => /^run code$/i.test(b.innerText.trim()));
  const t0 = performance.now();
  const obs = new MutationObserver(() => { if (has()) { obs.disconnect(); resolve(performance.now() - t0); } });
  obs.observe(document.body, { childList: true, subtree: true });
  start.click();
  setTimeout(() => { obs.disconnect(); resolve(has() ? performance.now() - t0 : 99999); }, 10000);
})"""


@pytest.mark.parametrize("lesson", ["sklearn_regression", "variables_intro"])
def test_start_practice_opens_practice_at_once(logged_in_page, lesson):
    page = logged_in_page(create_user())
    page.goto(f"{BASE}/dashboard/classroom/{lesson}", wait_until="networkidle")
    page.get_by_role("button", name="Start Practice").wait_for(timeout=30000)
    page.wait_for_timeout(1500)                       # the intro is up and animating, as a learner sees it
    ms = page.evaluate(_TIME_TO_PRACTICE)
    assert ms < 250, f"practice screen appeared {ms:.0f} ms after Start Practice (must not wait for the intro's exit)"
