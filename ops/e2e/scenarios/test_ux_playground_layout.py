"""UX: the Playground works on a phone and its buttons do not wrap on a laptop (redesign "Later" I9, 2026-11-03).

At 390px the Save button sat on top of the file name, the pip Install button was cut off at the right edge and
the editor was ~150-200px tall; at 1440px "Run Code" and "Send to Vaathiyaar" wrapped onto two lines."""
import pytest

from conftest import BASE, create_user


def _open(logged_in_page, width, height):
    page = logged_in_page(create_user(), width=width, height=height)
    page.goto(f"{BASE}/dashboard/playground", wait_until="networkidle")
    page.locator(".cm-content").first.wait_for(timeout=30000)
    return page


def _overlap(a, b):
    return not (a["x"] + a["width"] <= b["x"] or b["x"] + b["width"] <= a["x"]
                or a["y"] + a["height"] <= b["y"] or b["y"] + b["height"] <= a["y"])


@pytest.mark.parametrize("dark", [False, True])
def test_playground_fits_a_phone(logged_in_page, dark):
    page = logged_in_page(create_user(), width=390, height=844, dark=dark)
    page.goto(f"{BASE}/dashboard/playground", wait_until="networkidle")
    editor = page.locator(".cm-editor").first
    editor.wait_for(timeout=30000)

    assert editor.bounding_box()["height"] >= 300, f"editor is only {editor.bounding_box()['height']:.0f}px tall"
    name = page.get_by_text("code.py", exact=True).first.bounding_box()
    save = page.get_by_role("button", name="Save", exact=True).bounding_box()
    assert not _overlap(name, save), (name, save)

    install = page.get_by_role("button", name="Install", exact=True)
    install.scroll_into_view_if_needed()
    box = install.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= 390, f"Install button is cut off: {box}"
    page.get_by_label("Package name to install").fill("rich")
    assert install.is_enabled()
    assert page.evaluate("document.documentElement.scrollWidth") <= 390

    # Deferred polish 2026-11-05: every Playground control is a 44px touch target on a phone, and Run Code's
    # white label is readable (it was white on green-600, 3.3:1).
    small = []
    for name in ("Voice", "Save", "Save as", "My files", "Run Code", "Visualize", "Clear", "Send to Vaathiyaar", "Install"):
        box = page.get_by_role("button", name=name, exact=True).first.bounding_box()
        if box is None or box["height"] < 44 or box["width"] < 44:
            small.append(f"{name}: {box and (round(box['width']), round(box['height']))}")
    field = page.get_by_label("Package name to install").bounding_box()
    if field["height"] < 44:
        small.append(f"pip field: {round(field['height'])}px")
    assert not small, f"touch targets under 44px on a phone: {small}"
    run = page.get_by_role("button", name="Run Code", exact=True)
    page.locator(".cm-content").first.click()
    page.keyboard.type("print(1)")
    ratio = run.evaluate(_CONTRAST)
    assert ratio >= 4.5, f"'Run Code' contrast {ratio:.1f}:1"
    assert page.evaluate("document.documentElement.scrollWidth") <= 390


def test_playground_actions_stay_on_one_line_on_a_laptop(logged_in_page):
    page = _open(logged_in_page, 1440, 900)
    for name in ("Run Code", "Send to Vaathiyaar", "Visualize"):
        b = page.get_by_role("button", name=name).first
        assert b.bounding_box()["height"] <= 44, f"'{name}' wraps onto two lines ({b.bounding_box()['height']:.0f}px tall)"


_CONTRAST = r"""e => { const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = [255, 255, 255]; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] >= 200) { bg = c; break; } }
  const a = lum(rgba(getComputedStyle(e).color)), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }"""


@pytest.mark.parametrize("dark", [False, True])
def test_send_to_vaathiyaar_is_readable_on_the_code_panel(logged_in_page, dark):
    # Live light-mode check 2026-11-04: the theme accent (dark violet in light mode) sat on the always-dark code
    # panel at 3.6:1.
    page = logged_in_page(create_user(), width=1440, height=900, dark=dark)
    page.goto(f"{BASE}/dashboard/playground", wait_until="networkidle")
    label = page.get_by_role("button", name="Send to Vaathiyaar").locator("span").first
    label.wait_for(timeout=30000)
    ratio = label.evaluate(_CONTRAST)
    assert ratio >= 4.5, f"'Send to Vaathiyaar' contrast {ratio:.1f}:1 on the code panel"


def test_visualizer_opens_above_the_top_bar(logged_in_page):
    # Live audit 2026-11-04 at 748x660: the visualizer overlay (z-70) rendered inside the page container's own
    # stacking context (z-10), so the mobile top bar painted over its title and close button.
    page = _open(logged_in_page, 748, 660)
    page.locator(".cm-content").first.click()
    page.keyboard.type("total = 0\nfor i in range(3):\ntotal += i\n")   # Visualize stays disabled on an empty editor
    page.get_by_role("button", name="Visualize").first.click()
    dialog = page.get_by_role("dialog", name="Time-travel visualizer")
    dialog.wait_for(timeout=30000)
    for name, el in (("title", dialog.get_by_role("heading").first), ("close button", dialog.get_by_role("button", name="Close visualizer"))):
        hidden_by = el.evaluate("""e => { const r = e.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return e.contains(top) ? null : (top ? top.tagName + '.' + top.className : 'nothing'); }""")
        assert hidden_by is None, f"visualizer {name} is covered by {hidden_by}"
