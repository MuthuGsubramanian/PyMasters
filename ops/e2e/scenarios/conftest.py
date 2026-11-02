"""Shared fixtures for the scenario suites (spec: docs/superpowers/specs/2026-11-03-autonomous-scenario-testing-design.md).

The suites drive a disposable copy of the production image (see ../run_scenarios.sh):
  PM_E2E_BASE       base URL of the test container   (default http://127.0.0.1:8080)
  PM_E2E_CONTAINER  container name for `exec`        (default pm-e2e)
  PM_E2E_DOCKER     docker | podman                  (default docker)
  PM_E2E_OPS_TOKEN  the container's OPS_ADMIN_TOKEN  (service login for admin steps)

Every user gets its own fake client IP (X-Forwarded-For; nginx in the container passes it through) so the
per-IP signup/login limits behave as they would for real, separate visitors.
"""
import itertools
import json
import os
import subprocess
import uuid
from pathlib import Path

import pytest
import requests

BASE = os.getenv("PM_E2E_BASE", "http://127.0.0.1:8080").rstrip("/")
CONTAINER = os.getenv("PM_E2E_CONTAINER", "pm-e2e")
DOCKER = os.getenv("PM_E2E_DOCKER", "docker")
SOLUTIONS = Path(__file__).resolve().parents[1] / "solutions"
PASSWORD = "Scenario-Pass-2026!"
_ip_counter = itertools.count(1)


def fake_ip() -> str:
    n = next(_ip_counter) + (os.getpid() % 200) * 10000
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255 or 1}"


def api(ip: str = None, token: str = None) -> requests.Session:
    s = requests.Session()
    s.headers["X-Forwarded-For"] = ip or fake_ip()
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def db(cmd: str, *args) -> str:
    """Run _dbtool.py inside the test container; returns its stdout (stripped)."""
    out = subprocess.run([DOCKER, "exec", CONTAINER, "python", "/app/ops_e2e/_dbtool.py", cmd, *map(str, args)],
                         capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(f"_dbtool {cmd} failed: {out.stderr.strip() or out.stdout.strip()}")
    return out.stdout.strip()


ONBOARDING = {"motivation": "career", "prior_experience": "beginner", "learning_style": "visual",
              "goal": "ai_ml", "time_commitment": "30min", "preferred_language": "en",
              "user_type": "college_student"}


def create_user(kind: str = "individual", org_type: str = None, onboard: bool = True, name: str = None) -> dict:
    """Register a fresh user through the real API. kind: individual | organization."""
    suffix = uuid.uuid4().hex[:8]
    ip = fake_ip()
    body = {"username": f"e2e_{suffix}", "password": PASSWORD, "name": name or f"E2E {suffix}",
            "email": f"e2e_{suffix}@example.com", "account_type": kind}
    if kind == "organization":
        body.update(organization_name=f"E2E Org {suffix}", organization_type=org_type or "school",
                    organization_domain=f"e2e-{suffix}.example.com")
    r = api(ip).post(f"{BASE}/api/auth/register", json=body, timeout=30)
    assert r.status_code == 200, f"register {r.status_code}: {r.text[:300]}"
    data = r.json()
    user = {"id": data["id"], "username": body["username"], "password": PASSWORD, "email": body["email"],
            "name": body["name"], "token": data["token"], "ip": ip,
            "org_id": (data.get("organization") or data.get("org") or {}).get("id")}
    if onboard:
        s = api(ip, user["token"])
        path = "/api/profile/onboarding/org" if kind == "organization" else "/api/profile/onboarding"
        payload = {**ONBOARDING, "user_id": user["id"]}
        if kind == "organization":
            payload = {"user_id": user["id"], "org_size": "10-50", "preferred_language": "en",
                       "learner_profile": "k12" if org_type in ("school", None) else "professional",
                       "skill_level": "beginner", "learning_focus": "fundamentals",
                       "structure_preference": "assigned"}
        r = s.post(f"{BASE}{path}", json=payload, timeout=30)
        assert r.status_code == 200, f"onboarding {r.status_code}: {r.text[:300]}"
    return user


def session_payload(user: dict) -> dict:
    """The localStorage `pm_user` shape the frontend expects after login (same as ops/e2e/module_sweep.py)."""
    return {"id": user["id"], "username": user["username"], "name": user.get("name"), "token": user["token"],
            "onboarding_completed": True}


def solution_for(lesson_id: str, index: int, expected_output: str) -> str:
    """Verified reference solution if one is stored (Task 12), else a program printing the expected output."""
    f = SOLUTIONS / f"{lesson_id}.json"
    if f.exists():
        for ch in json.loads(f.read_text()).get("challenges", []):
            if ch.get("index") == index and ch.get("code"):
                return ch["code"]
    return f"print({expected_output.strip()!r})"   # the grader compares stripped stdout


def complete_lesson(user: dict, lesson_id: str = "variables_intro") -> dict:
    """Solve a lesson's first practice challenge through the real grader; returns /classroom/evaluate's JSON."""
    s = api(user["ip"], user["token"])
    lesson = s.get(f"{BASE}/api/classroom/lesson/{lesson_id}", timeout=30).json()
    ch = lesson["practice_challenges"][0]
    r = s.post(f"{BASE}/api/classroom/evaluate", timeout=90, json={
        "user_id": user["id"], "lesson_id": lesson_id, "expected_output": ch.get("expected_output", ""),
        "code": solution_for(lesson_id, 0, ch.get("expected_output", ""))})
    assert r.status_code == 200, r.text[:300]
    return r.json()


def onboard_learner_ui(page) -> None:
    """Answer the learner onboarding questionnaire through the UI and land on the dashboard."""
    page.wait_for_url("**/onboarding", timeout=30000)
    for label in ("I'm a Student", "College / University Student", "Total Beginner",
                  "Visual — Charts & Diagrams", "AI / Machine Learning", "30 minutes", "Skip for now"):
        page.get_by_text(label, exact=False).first.click()
    page.get_by_role("button", name="Finish & Start Learning").click()
    page.wait_for_url("**/dashboard**", timeout=30000)


def dismiss_release_notes(page) -> None:
    """New accounts see a "what's new" dialog on first dashboard visit; a real user closes it."""
    btn = page.get_by_role("button", name="Close release notes")
    try:
        btn.first.wait_for(state="visible", timeout=3000)
        btn.first.click()
    except Exception:  # noqa: BLE001 — not shown (already seen) is fine
        pass


def signed_in_context(browser, user: dict, width: int = 1366, height: int = 850):
    """A browser context whose localStorage holds `user`'s session (no UI login)."""
    ctx = browser.new_context(viewport={"width": width, "height": height},
                              extra_http_headers={"X-Forwarded-For": user.get("ip") or fake_ip()})
    page = ctx.new_page()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.evaluate("u => { localStorage.setItem('pm_user', JSON.stringify(u)); localStorage.setItem('pm_release_seen', '9.9.9'); }",
                  session_payload(user))
    return ctx, page


# ---- fixtures ------------------------------------------------------------------------------------------

@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE


@pytest.fixture
def new_user():
    return create_user


@pytest.fixture(scope="session")
def ops_token() -> str:
    tok = os.environ["PM_E2E_OPS_TOKEN"]
    r = api().post(f"{BASE}/api/admin/service-login", json={"token": tok}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def logged_in_page(browser):
    """Factory: logged_in_page(user, width=1366, height=850, dark=False) -> Page signed in as `user`."""
    contexts = []

    def _make(user: dict, width: int = 1366, height: int = 850, dark: bool = False):
        ctx = browser.new_context(viewport={"width": width, "height": height},
                                  color_scheme="dark" if dark else "light",
                                  is_mobile=width < 500, has_touch=width < 500,
                                  extra_http_headers={"X-Forwarded-For": user.get("ip") or fake_ip()})
        contexts.append(ctx)
        page = ctx.new_page()
        page.problems = []
        page.on("pageerror", lambda e: page.problems.append(f"pageerror: {str(e)[:200]}"))
        page.on("console", lambda m: page.problems.append(f"console: {m.text[:200]}") if m.type == "error" else None)
        page.on("response", lambda r: page.problems.append(f"http {r.status} {r.url[:120]}")
                if r.status >= 400 and "/api/" in r.url else None)
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.evaluate("([u, dark]) => { localStorage.setItem('pm_user', JSON.stringify(u));"
                      " localStorage.setItem('pm_release_seen', '9.9.9');"
                      " localStorage.setItem('pm_dark_mode', dark ? '1' : '0'); }",
                      [session_payload(user), dark])
        page.problems.clear()
        return page

    yield _make
    for c in contexts:
        c.close()
