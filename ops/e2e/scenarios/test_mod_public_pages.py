"""Module: public pages and public APIs — what a signed-out visitor meets (spec §3)."""
import re

import pytest

from conftest import BASE, api, create_user

BAD_LINK = re.compile(r"invalid|expired|no longer exists", re.I)


@pytest.fixture
def visitor(browser):
    ctx = browser.new_context(viewport={"width": 1366, "height": 850})
    page = ctx.new_page()
    page.problems = []
    page.on("pageerror", lambda e: page.problems.append(f"pageerror: {str(e)[:200]}"))
    yield page
    ctx.close()


def test_login_and_signup_forms(visitor):
    visitor.goto(f"{BASE}/login", wait_until="networkidle")
    visitor.get_by_placeholder("Enter your username").wait_for(timeout=15000)
    visitor.goto(f"{BASE}/login?mode=signup", wait_until="networkidle")
    visitor.get_by_text("Individual Learner").wait_for(timeout=15000)
    visitor.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    visitor.get_by_placeholder("Username or email").wait_for(timeout=15000)
    assert not visitor.problems, visitor.problems[:3]


def test_bad_tokens_explain_themselves(visitor):
    visitor.goto(f"{BASE}/reset-password/not-a-real-token", wait_until="networkidle")
    visitor.get_by_placeholder("New password (min 6 characters)").fill("Another-Pass-2026!")
    visitor.get_by_placeholder("Confirm new password").fill("Another-Pass-2026!")
    visitor.locator("button[type=submit]").click()
    visitor.get_by_text(BAD_LINK).first.wait_for(timeout=15000)
    for url in ("/verify-email/not-a-real-token", "/join/not-a-real-token"):
        visitor.goto(f"{BASE}{url}", wait_until="networkidle")
        visitor.get_by_text(BAD_LINK).first.wait_for(timeout=15000)


def test_pricing_shows_plan_prices(visitor):
    visitor.goto(f"{BASE}/pricing", wait_until="networkidle")
    body = visitor.locator("body").inner_text()
    assert "₹299" in body and "₹999" in body, body[:400]
    cfg = api().get(f"{BASE}/api/payments/config", timeout=30).json()
    assert cfg["plans"]["beginner"]["amount"] == 29900 and cfg["plans"]["pro"]["amount"] == 99900, cfg


@pytest.mark.parametrize("path,heading", [("/terms", "Terms of Use"), ("/privacy", "Privacy Policy"),
                                          ("/security", "Security")])
def test_legal_pages(visitor, path, heading):
    visitor.goto(f"{BASE}{path}", wait_until="networkidle")
    visitor.get_by_role("heading", name=heading, level=1).wait_for(timeout=15000)


def test_unknown_path_is_404(visitor):
    visitor.goto(f"{BASE}/this-page-does-not-exist", wait_until="networkidle")
    visitor.get_by_role("heading", name="Page Not Found").wait_for(timeout=15000)


def test_public_apis():
    s = api()
    langs = s.get(f"{BASE}/api/languages", timeout=30)
    assert langs.status_code == 200 and langs.json(), langs.text[:200]
    assert s.get(f"{BASE}/api/languages/check/ta", timeout=30).status_code == 200
    trending = s.get(f"{BASE}/api/trending", timeout=30)
    assert trending.status_code == 200, trending.text[:200]
    assert s.get(f"{BASE}/api/trending/categories", timeout=30).status_code == 200
    assert s.post(f"{BASE}/api/track/visit", json={"path": "/pricing"}, timeout=30).status_code == 200
    mods = s.get(f"{BASE}/api/content/modules", timeout=30)
    assert mods.status_code == 200, mods.text[:200]
    for provider in ("/api/auth/github/config", "/api/auth/linkedin/config"):
        assert s.get(f"{BASE}{provider}", timeout=30).json()["enabled"] is False


def test_learner_side_apis():
    u = create_user()
    s = api(u["ip"], u["token"])
    assert s.get(f"{BASE}/api/misconceptions", timeout=30).status_code == 200
    assert s.get(f"{BASE}/api/trending/personalized/{u['id']}", timeout=30).status_code == 200
    voice = s.post(f"{BASE}/api/voice/transcribe", files={"audio": ("clip.webm", b"\x1aE\xdf\xa3" + b"\0" * 64, "audio/webm")},
                   data={"language": "en"}, timeout=60)
    assert voice.status_code < 500 or voice.status_code == 503, voice.text[:200]   # no speech model in CI: 4xx/503 ok
