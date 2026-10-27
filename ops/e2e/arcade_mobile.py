"""Headless mobile smoke for the Arcade (400 px, dark mode, touch).

Usage: python ops/e2e/arcade_mobile.py [--base https://pymasters.net] [--game snakes_ladders] [--board lists]
Logs in with the vault's ops service token, injects the session like the SPA does, screenshots
the Arcade gallery and one game screen, and reports layout overflow, page errors and console errors.
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops"))
sys.path.insert(0, str(ROOT))

import pm_admin  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_API", "https://pymasters.net"))
    ap.add_argument("--game", default="snakes_ladders")
    ap.add_argument("--board", default="lists")
    ap.add_argument("--out", default=os.getenv("PM_E2E_OUT", str(ROOT / ".superpowers" / "e2e")))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    pm_admin.load_secrets()
    token = pm_admin.admin_session()
    import base64
    payload = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
    user = {"id": payload["sub"], "username": payload.get("username", "ops"), "token": token, "onboarding_completed": True}

    from playwright.sync_api import sync_playwright

    problems, console = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 400, "height": 820}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  color_scheme="dark", reduced_motion="no-preference")
        page = ctx.new_page()
        page.on("console", lambda m: console.append((m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.goto(f"{args.base}/login", wait_until="domcontentloaded")
        page.evaluate("(u) => { localStorage.setItem('pm_user', JSON.stringify(u)); localStorage.setItem('pm_dark_mode', '1'); localStorage.setItem('pm_release_seen', '2.0.0'); }", user)
        page.goto(f"{args.base}/dashboard/play", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(out / "arcade_gallery_mobile.png"), full_page=True)
        cards = page.locator("[data-arcade-card]").count()
        print(f"arcade cards: {cards}")
        if cards != 3:
            problems.append(f"expected 3 arcade cards, saw {cards}")
        overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 2:
            problems.append(f"gallery horizontal overflow {overflow}px")
        url = f"{args.base}/dashboard/play/arcade/{args.game}" + (f"?board={args.board}" if args.game == "snakes_ladders" else "")
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(out / f"arcade_{args.game}_mobile.png"), full_page=True)
        overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 2:
            problems.append(f"{args.game} horizontal overflow {overflow}px")
        has_canvas_or_board = page.locator("canvas, svg[role=img]").count() > 0
        print(f"game surface present: {has_canvas_or_board}")
        if not has_canvas_or_board and page.locator("[role=alert]").count() == 0:
            problems.append("no game surface rendered")
        alert = page.locator("[role=alert]")
        if alert.count():
            print("alert:", alert.first.inner_text()[:160])
        # touch targets
        small = page.evaluate("() => [...document.querySelectorAll('button, a')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40); }).map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30))")
        if small:
            print(f"small touch targets ({len(small)}): {small[:8]}")
        browser.close()

    for kind, text in console:
        if "favicon" in text or "ResizeObserver" in text:
            continue
        problems.append(f"console {kind}: {text[:160]}")
    print("\n".join(problems) if problems else "no problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
