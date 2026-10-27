"""Headless sweep of every dashboard module: console/page errors, failed API calls,
horizontal overflow, empty renders — at desktop and 400 px, light and dark.

Usage: python ops/e2e/module_sweep.py [--base https://pymasters.net] [--only classroom,play]
Writes screenshots to .superpowers/e2e/sweep/ and prints a JSON report.
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops"))
sys.path.insert(0, str(ROOT))
import pm_admin  # noqa: E402

ROUTES = [
    ("overview", "/dashboard"), ("paths", "/dashboard/paths"), ("knowledge", "/dashboard/knowledge"),
    ("classroom", "/dashboard/classroom"), ("classroom_lesson", "/dashboard/classroom/variables_intro"),
    ("playground", "/dashboard/playground"), ("play", "/dashboard/play"), ("trending", "/dashboard/trending"),
    ("challenges", "/dashboard/challenges"), ("reference", "/dashboard/reference"), ("explains", "/dashboard/explains"),
    ("explains_essay", "/dashboard/explains/gradient-descent"), ("community", "/dashboard/community"),
    ("live_tutor", "/dashboard/live-tutor"), ("profile", "/dashboard/profile"), ("upgrade", "/dashboard/upgrade"),
    ("admin", "/dashboard/admin"), ("org", "/dashboard/org"),
    ("login", "/login"), ("pricing", "/pricing"), ("terms", "/terms"), ("privacy", "/privacy"), ("security", "/security"),
    ("home", "/"), ("notfound", "/this-page-does-not-exist"),
]


def session_user():
    pm_admin.load_secrets()
    token = pm_admin.admin_session()
    payload = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
    return {"id": payload["sub"], "username": payload.get("username", "ops"), "token": token, "onboarding_completed": True}


def sweep(base, only, out):
    from playwright.sync_api import sync_playwright
    user = session_user()
    report = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, vp, scheme in (("desktop-light", {"width": 1366, "height": 850}, "light"), ("mobile-dark", {"width": 400, "height": 820}, "dark")):
            ctx = browser.new_context(viewport=vp, color_scheme=scheme, is_mobile=vp["width"] < 500, has_touch=vp["width"] < 500)
            page = ctx.new_page()
            errs, pageerrs, failed = [], [], []
            page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
            page.on("pageerror", lambda e: pageerrs.append(str(e)[:200]))
            page.on("response", lambda r: failed.append((r.status, r.url[:120])) if r.status >= 400 and "/api/" in r.url else None)
            page.goto(f"{base}/login", wait_until="domcontentloaded")
            page.evaluate("(u) => { localStorage.setItem('pm_user', JSON.stringify(u)); localStorage.setItem('pm_release_seen', '2.0.0'); localStorage.setItem('pm_dark_mode', %s); }" % ("'1'" if scheme == "dark" else "'0'"), user)
            for name, path in ROUTES:
                if only and name not in only:
                    continue
                errs.clear(); pageerrs.clear(); failed.clear()
                t0 = time.time()
                try:
                    page.goto(f"{base}{path}", wait_until="networkidle", timeout=45000)
                except Exception as exc:  # noqa: BLE001
                    report.append({"route": name, "mode": label, "problem": f"navigation: {str(exc)[:120]}"})
                    continue
                page.wait_for_timeout(700)
                load_s = round(time.time() - t0, 1)
                sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                text_len = page.evaluate("document.body.innerText.length")
                page.screenshot(path=str(out / f"{name}-{label}.png"), full_page=False)
                entry = {"route": name, "mode": label, "load_s": load_s, "url": page.url}
                problems = []
                if sw > cw + 1:
                    problems.append(f"horizontal overflow {sw}>{cw}")
                if pageerrs:
                    problems.append(f"pageerror: {pageerrs[:2]}")
                if errs:
                    problems.append(f"console errors: {errs[:3]}")
                bad = [f for f in failed if f[0] not in (401,) or name not in ("login", "home", "pricing")]
                if bad:
                    problems.append(f"api failures: {bad[:4]}")
                if text_len < 80 and name != "notfound":
                    problems.append(f"near-empty page ({text_len} chars)")
                if load_s > 8:
                    problems.append(f"slow load {load_s}s")
                if problems:
                    entry["problems"] = problems
                report.append(entry)
            ctx.close()
        browser.close()
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("PYMASTERS_API", "https://pymasters.net"))
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=str(ROOT / ".superpowers" / "e2e" / "sweep"))
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    report = sweep(args.base, only, out)
    flagged = [r for r in report if r.get("problems")]
    print(json.dumps({"checked": len(report), "flagged": flagged, "slowest": sorted(report, key=lambda r: -r.get("load_s", 0))[:5]}, indent=1))
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
