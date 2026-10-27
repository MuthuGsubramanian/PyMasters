"""Frame-time check for the arcade games under 4x CPU throttling (headless Chromium + CDP).

    python ops/e2e/arcade_perf.py [--base https://pymasters.net] [--games snakes_ladders,linked_snake,...]

Logs in as the ops user, opens each game, throttles the CPU 4x (a mid-range phone), records
requestAnimationFrame deltas for 6 s while the game runs, and reports the worst frame gap and the
share of frames over 32 ms. The spec's bar: no frame over 32 ms (we report, the caller decides).
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

GAMES = ["snakes_ladders?board=lists", "linked_snake", "code_slingshot", "loop_runner", "bug_invaders", "dict_dash", "big_o_grand_prix"]

PROBE = """
() => new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const start = last;
  function tick(now) {
    deltas.push(now - last); last = now;
    if (now - start < 6000) requestAnimationFrame(tick); else resolve(deltas.slice(5));
  }
  requestAnimationFrame(tick);
})
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_API", "https://pymasters.net"))
    ap.add_argument("--games", default=",".join(GAMES))
    ap.add_argument("--rate", type=float, default=4.0)
    args = ap.parse_args()

    pm_admin.load_secrets()
    token = pm_admin.admin_session()
    import base64
    payload = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
    user = {"id": payload["sub"], "username": payload.get("username", "ops"), "token": token, "onboarding_completed": True}

    from playwright.sync_api import sync_playwright

    worst_overall = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-gpu-rasterization"])
        ctx = browser.new_context(viewport={"width": 1100, "height": 760})
        page = ctx.new_page()
        page.goto(f"{args.base}/login", wait_until="domcontentloaded")
        page.evaluate("(u) => { localStorage.setItem('pm_user', JSON.stringify(u)); localStorage.setItem('pm_release_seen', '2.0.0'); }", user)
        cdp = ctx.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.rate})
        for g in args.games.split(","):
            page.goto(f"{args.base}/dashboard/play/arcade/{g}", wait_until="networkidle")
            page.wait_for_timeout(2500)
            # nudge the games that wait for input so the loop has work to do
            page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowRight"); page.keyboard.down("Space"); page.wait_for_timeout(200); page.keyboard.up("Space")
            deltas = page.evaluate(PROBE)
            if not deltas:
                print(f"{g:28} no frames")
                continue
            worst = max(deltas)
            over = sum(1 for d in deltas if d > 32) / len(deltas)
            avg = sum(deltas) / len(deltas)
            worst_overall = max(worst_overall, worst)
            print(f"{g:28} frames={len(deltas):4d} avg={avg:5.1f}ms worst={worst:6.1f}ms over32={over*100:4.1f}%")
        browser.close()
    print(f"worst frame overall: {worst_overall:.1f} ms at {args.rate}x CPU throttling")
    return 0


if __name__ == "__main__":
    sys.exit(main())
