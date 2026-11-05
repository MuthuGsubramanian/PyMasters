"""Every route renders cleanly at desktop and mobile size for the right kind of user (spec §2, Review Focus: mobile
layouts must not overflow). Checks: no JS errors, no failed API calls (except the page's expected ones), no
horizontal overflow, non-empty content."""
import base64
import json

import pytest

from conftest import BASE, api, create_user, db
from routes import ROUTES

VIEWPORTS = {"desktop": (1366, 850, False), "mobile": (400, 820, True)}


@pytest.fixture(scope="module")
def users(ops_token):
    learner = create_user()
    org_admin = create_user(kind="organization", org_type="school")
    db("grandfather-org", org_admin["org_id"])
    claims = json.loads(base64.urlsafe_b64decode(ops_token.split(".")[1] + "==="))
    ops = {"id": claims["sub"], "username": claims.get("username", "claude-qa"), "token": ops_token, "ip": None}
    fresh = create_user(onboard=False)
    r = api(learner["ip"], learner["token"]).post(f"{BASE}/api/classroom/explain",
                                                  json={"user_id": learner["id"], "lesson_id": "variables_intro"},
                                                  timeout=60)
    explain_id = (r.json() or {}).get("id") if r.status_code == 200 else None
    return {"learner": learner, "org_admin": org_admin, "super_admin": ops, "fresh": fresh,
            "explain_id": explain_id}


@pytest.mark.parametrize("vp", list(VIEWPORTS))
@pytest.mark.parametrize("route", ROUTES, ids=[r.name for r in ROUTES])
def test_page_health(route, vp, users, logged_in_page, browser):
    width, height, dark = VIEWPORTS[vp]
    if route.role == "public":
        ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme="dark" if dark else "light",
                                  is_mobile=width < 500)
        page = ctx.new_page()
        page.problems = []
        page.on("pageerror", lambda e: page.problems.append(f"pageerror: {str(e)[:200]}"))
        page.on("console", lambda m: page.problems.append(f"console: {m.text[:200]}") if m.type == "error" else None)
        page.on("response", lambda r: page.problems.append(f"http {r.status} {r.url[:120]}")
                if r.status >= 400 and "/api/" in r.url else None)
    else:
        page = logged_in_page(users[route.role], width, height, dark)
    url = route.url
    if "{explain_id}" in url:
        assert users["explain_id"], "could not generate an explainer to view"
        url = url.format(explain_id=users["explain_id"])
    page.goto(f"{BASE}{url}", wait_until="networkidle", timeout=45000)
    # Wait on content, not the clock: lazy route chunks can land after networkidle on a busy runner.
    try:
        page.wait_for_function("() => document.body.innerText.trim().length > 40", timeout=15000)
    except Exception:  # noqa: BLE001 — the assertion below reports the near-empty page
        pass
    sw, cw = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    text = page.evaluate("document.body.innerText.length")
    allowed = {f"http {s}" for s in route.allow_status}
    problems = [p for p in page.problems
                if not any(p.startswith(a) for a in allowed)
                and not (p.startswith("console:") and any(f" {s} " in p or f"status of {s}" in p for s in route.allow_status))]
    assert sw <= cw + 1, f"horizontal overflow {sw}>{cw}"
    assert text > 40, f"near-empty page ({text} chars)"
    assert not problems, problems[:5]
