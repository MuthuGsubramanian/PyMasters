"""Headless mobile smoke for Play (400 px, dark mode, reduced motion).

Usage: python ops/e2e/play_mobile.py [--base https://pymasters.net] [--game output_oracle]
Logs in with the vault's ops service token (no personal password), injects the session
like the SPA does, screenshots to the scratch dir and reports layout + console problems.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops"))
sys.path.insert(0, str(ROOT))

import pm_admin  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_API", "https://pymasters.net"))
    ap.add_argument("--game", default="output_oracle")
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
                                  color_scheme="dark", reduced_motion="reduce")
        page = ctx.new_page()
        page.on("console", lambda m: console.append((m.type, m.text)) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.goto(f"{args.base}/login", wait_until="domcontentloaded")
        page.evaluate("(u) => { localStorage.setItem('pm_user', JSON.stringify(u)); localStorage.setItem('pm_dark_mode', '1'); localStorage.setItem('pm_reduce_motion', '1'); localStorage.setItem('pm_release_seen', '2.0.0'); }", user)
        page.goto(f"{args.base}/dashboard/play", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=str(out / "play_mobile.png"), full_page=True)
        sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
        if sw > cw + 1:
            problems.append(f"Play page scrolls horizontally: scrollWidth {sw} > clientWidth {cw}")
        if not page.locator("text=Play to review").count() and not page.locator("text=Output Oracle").count():
            problems.append("Play page did not render game cards")

        page.goto(f"{args.base}/dashboard/play/{args.game}?level=1", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(out / f"round_{args.game}_mobile.png"), full_page=True)
        sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
        if sw > cw + 1:
            problems.append(f"Round page scrolls horizontally: scrollWidth {sw} > clientWidth {cw}")
        small = page.evaluate("""() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && (b.getBoundingClientRect().height < 40 || b.getBoundingClientRect().width < 40)).map(b => (b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,30))""")
        if small:
            problems.append(f"buttons under 40px on the round page: {small[:8]}")
        if args.game == "output_oracle":
            # keyboard path: answer with '1', Enter to the next item
            t0 = time.time()
            page.keyboard.press("1")
            page.wait_for_selector("text=/Correct|Not quite|Answer recorded/", timeout=15000)
            problems.append(f"answer round trip {time.time() - t0:.1f}s") if time.time() - t0 > 4 else None
            page.screenshot(path=str(out / "reveal_mobile.png"), full_page=True)
            page.keyboard.press("Enter")
            page.wait_for_timeout(600)
        if args.game == "gradient_golf":
            page.focus("input[name=lr]")
            for _ in range(40):
                page.keyboard.press("ArrowRight")
            page.get_by_role("button", name="Swing").click()
            page.wait_for_selector("text=/Correct|Not quite|Answer recorded/", timeout=20000)
            page.screenshot(path=str(out / "golf_reveal_mobile.png"), full_page=True)
        browser.close()

    errs = [c for c in console if c[0] == "error"]
    print(json.dumps({"problems": problems, "console_errors": errs[:10], "screens": str(out)}, indent=2))
    return 1 if problems or errs else 0


if __name__ == "__main__":
    sys.exit(main())
