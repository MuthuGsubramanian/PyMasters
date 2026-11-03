"""Daily production smoke (spec §5): is pymasters.net up, current and teaching? Read-only apart from one tutor reply.

  PYMASTERS_OPS_TOKEN=... python ops/e2e/prod_smoke.py [--json] [--base https://pymasters.net]

Signs in as the ops QA account (ops/pm_admin.py service login; the token is never printed) and checks:
health + live build among the last 5 commits on main, 8 key pages render with no console errors, the catalogue has ≥ 400 lessons,
a lesson loads, semantic search answers, and the real AI tutor streams a non-empty reply within 60 s.
Writes ~/pymasters-ops/reports/prod-smoke-<date>.json; exits 1 when any check fails.
"""
import argparse
import base64
import json
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops"))
import pm_admin  # noqa: E402

PAGES = ["/", "/pricing", "/login", "/dashboard", "/dashboard/classroom", "/dashboard/playground", "/dashboard/play",
         "/dashboard/paths"]
REPORTS = Path.home() / "pymasters-ops" / "reports"


RECENT_BUILDS = 5   # pushes land every ~30 min and a gated deploy takes ~20: the tip may still be rolling out


def _recent_main_shas() -> list:
    subprocess.run(["git", "-C", str(ROOT), "fetch", "-q", "origin", "main"], capture_output=True, timeout=120)
    out = subprocess.run(["git", "-C", str(ROOT), "rev-list", "-n", str(RECENT_BUILDS), "origin/main"],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.split()


def run(base: str) -> dict:
    checks = []

    def check(name, fn):
        t0 = time.time()
        try:
            detail = fn()
            checks.append({"name": name, "ok": True, "detail": detail, "seconds": round(time.time() - t0, 1)})
        except Exception as e:  # noqa: BLE001 — every failure becomes a red row, never a crash
            checks.append({"name": name, "ok": False, "detail": f"{type(e).__name__}: {e}"[:400],
                           "seconds": round(time.time() - t0, 1)})

    token = pm_admin.admin_session()
    claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "==="))
    user = {"id": claims["sub"], "username": claims.get("username", "ops"), "token": token, "onboarding_completed": True}
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {token}"

    def health():
        h = requests.get(f"{base}/health", timeout=30).json()
        recent = _recent_main_shas()
        assert h.get("status") == "ok" or h.get("ok") is True, h
        assert not recent or h.get("build") in recent, \
            f"live build {str(h.get('build'))[:7]} is not among the last {RECENT_BUILDS} commits on main"
        lag = recent.index(h["build"]) if h.get("build") in recent else 0
        return f"build {str(h.get('build'))[:7]}" + (f" ({lag} behind main, deploy in flight)" if lag else "")

    def catalogue():
        n = len(s.get(f"{base}/api/classroom/lessons", params={"user_id": user["id"]}, timeout=60).json()["lessons"])
        assert n >= 400, f"only {n} lessons"
        return f"{n} lessons"

    def lesson():
        r = s.get(f"{base}/api/classroom/lesson/variables_intro", timeout=30)
        assert r.status_code == 200 and r.json().get("practice_challenges"), r.status_code
        return "variables_intro loads"

    def search():
        r = s.get(f"{base}/api/semantic/search", params={"q": "python list comprehension"}, timeout=60).json()
        assert r.get("ready") and r.get("results"), r
        return f"{len(r['results'])} results"

    def tutor():
        t0 = time.time()
        r = s.post(f"{base}/api/playground/chat/stream", stream=True, timeout=60,
                   json={"user_id": user["id"], "message": "In one sentence, what does a Python list do?"})
        assert r.status_code == 200, r.status_code
        text = ""
        for chunk in r.iter_content(None):
            text += chunk.decode(errors="ignore")
            if time.time() - t0 > 60:
                break
        words = [w for w in text.replace("data:", " ").split() if w.isalpha()]
        assert len(words) >= 5, text[:200]
        return f"{len(text)} chars in {time.time() - t0:.0f}s"

    def pages():
        from playwright.sync_api import sync_playwright
        bad = []
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1366, "height": 850})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:160]))
            page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
            page.goto(f"{base}/login", wait_until="domcontentloaded")
            release = page.evaluate("() => localStorage.getItem('pm_release_seen')")
            page.evaluate("([u, v]) => { localStorage.setItem('pm_user', JSON.stringify(u));"
                          " if (v) localStorage.setItem('pm_release_seen', v); }", [user, release])
            for path in PAGES:
                errors.clear()
                # Not "networkidle": on production it never comes (2026-11-04) - Cloudflare's injected bot-detection
                # script holds a connection open, and headless Chromium leaves a memory-cached font request
                # unfinished. Real users are unaffected; wait for load, let the app render, then check.
                page.goto(f"{base}{path}", wait_until="load", timeout=60000)
                page.wait_for_timeout(3000)
                if not page.locator("body").inner_text().strip() or errors:
                    bad.append(f"{path}: {errors[:2] or 'blank'}")
            b.close()
        assert not bad, bad
        return f"{len(PAGES)} pages clean"

    for name, fn in (("health", health), ("catalogue", catalogue), ("lesson", lesson), ("search", search),
                     ("ai_tutor", tutor), ("pages", pages)):
        check(name, fn)
    return {"date": date.today().isoformat(), "base": base, "ok": all(c["ok"] for c in checks), "checks": checks}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=pm_admin.BASE)
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    rep = run(a.base.rstrip("/"))
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / f"prod-smoke-{rep['date']}.json").write_text(json.dumps(rep, indent=2) + "\n")
    if a.json:
        print(json.dumps(rep, indent=2))
    else:
        for c in rep["checks"]:
            print(f"{'ok ' if c['ok'] else 'FAIL'} {c['name']:<10} {c['detail']}")
    return 0 if rep["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
