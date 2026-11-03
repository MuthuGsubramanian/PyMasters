"""UX: "Start Practice" opens the practice screen at once, even on a slow device (live audit 2026-11-04).

On pymasters.net the practice screen appeared 1.8 s after the press (8 s+ on a busy browser) with no sign the press
registered: the phases use AnimatePresence mode="wait", so practice mounted only after the long intro (Visual
Debugger, scrolly sections) finished animating out. Learners pressed again or thought it was broken."""
import time

import pytest

from conftest import BASE, create_user


@pytest.mark.parametrize("lesson", ["sklearn_regression", "variables_intro"])
def test_start_practice_opens_practice_quickly_on_a_slow_cpu(logged_in_page, lesson):
    page = logged_in_page(create_user())
    page.goto(f"{BASE}/dashboard/classroom/{lesson}", wait_until="networkidle")
    start = page.get_by_role("button", name="Start Practice")
    start.wait_for(timeout=30000)
    page.wait_for_timeout(1500)                       # the intro is up and animating, as a learner sees it
    cdp = page.context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})   # a mid-range phone / busy laptop
    try:
        t0 = time.time()
        start.click()
        page.get_by_text("Run Code", exact=True).first.wait_for(timeout=15000)
        took = time.time() - t0
    finally:
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    assert took < 2.0, f"practice screen took {took:.1f}s to appear after Start Practice (4x CPU throttle)"
