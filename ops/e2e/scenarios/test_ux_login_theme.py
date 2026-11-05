"""UX: the sign-in page follows the light/dark theme like every other product screen (redesign "Later" I11).

Login was dark-always (#020617 with white/slate text, blurred orbs, gradient buttons) even for learners who use
the light theme. It now uses the theme tokens; every piece of text keeps 4.5:1 in both themes and the controls
are 44px touch targets on a phone."""
import pytest

from conftest import BASE

# Same contrast helper as test_ux_lesson_visuals.py (text alpha blended over the first opaque background).
_CONTRAST = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const t = rgba(getComputedStyle(e).color), al = t[3] / 255;
  const fg = [0, 1, 2].map(i => t[i] * al + bg[i] * (1 - al));
  const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""

# Luminance of the first opaque background behind the page heading (the page itself, outside the card).
_BG_LUM = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(bg[0]) + 0.7152 * f(bg[1]) + 0.0722 * f(bg[2]); }"""


def _open(browser, width, height, dark):
    ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme="dark" if dark else "light",
                              is_mobile=width < 500, has_touch=width < 500)
    page = ctx.new_page()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.evaluate("d => localStorage.setItem('pm_dark_mode', d ? 'true' : 'false')", dark)
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.get_by_role("heading", name="Welcome Back").wait_for(timeout=15000)
    page.wait_for_timeout(800)  # entrance animation (opacity) settles before colours are read
    return ctx, page


def _low_contrast(page):
    low = []
    for el in page.locator("h2, h3, p, label, a, button, button span, input").all():
        if not el.is_visible():
            continue
        text = el.inner_text().strip() if el.evaluate("e => e.tagName") != "INPUT" else el.input_value()
        if not text:
            continue
        ratio = el.evaluate(_CONTRAST)
        if ratio < 4.5:
            low.append(f"{ratio:.1f}:1 {text[:40]!r}")
    return low


@pytest.mark.parametrize("dark", [False, True])
@pytest.mark.parametrize("width,height", [(390, 844), (1440, 900)])
def test_login_follows_the_theme(browser, width, height, dark):
    ctx, page = _open(browser, width, height, dark)
    bg = page.get_by_role("heading", name="Welcome Back").evaluate(_BG_LUM)
    if dark:
        assert bg < 0.05, f"dark theme but the sign-in page background is light (luminance {bg:.2f})"
    else:
        assert bg > 0.8, f"light theme but the sign-in page background is dark (luminance {bg:.2f})"
    page.get_by_label("Username").fill("someone")
    assert not _low_contrast(page), _low_contrast(page)

    # The sign-up account-type step and the organisation step too.
    page.get_by_role("button", name="Sign up").click()
    page.get_by_role("button", name="Organization / School / Enterprise").click()
    page.get_by_label("Organization Name *").wait_for(timeout=10000)
    page.wait_for_timeout(500)
    assert not _low_contrast(page), _low_contrast(page)

    if width < 500:
        small = [b.inner_text()[:30] or b.get_attribute("aria-label") for b in page.locator("button").all()
                 if b.is_visible() and b.bounding_box()["height"] < 44]
        assert not small, f"buttons under 44px tall on a phone: {small}"
        assert page.evaluate("document.documentElement.scrollWidth") <= width
    ctx.close()
