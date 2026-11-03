"""Journeys: access, billing and account edges (spec §2, journey 4).

Expired trial → upgrade page; a verified payment activates the plan (and a forged one does not); a student
access request is approved by the platform; a blocked user is signed out and refused; password reset; the
OAuth buttons follow the provider config endpoints.
"""
import hashlib
import hmac
import os
import struct
import uuid
import zlib

from conftest import BASE, PASSWORD, api, create_user, db, fake_ip

NEW_PASSWORD = "Scenario-Reset-2026!"


def _png(size: int = 16) -> bytes:
    """A small valid PNG (the access-request form sniffs magic bytes and refuses files under 100 bytes)."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes((x * 13 + y * 7) % 256 for x in range(size * 3)) for y in range(size))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def _access(user) -> dict:
    return api(user["ip"], user["token"]).get(f"{BASE}/api/profile/{user['id']}/access", timeout=30).json()


def test_expired_trial_redirects_to_upgrade(logged_in_page):
    u = create_user()
    db("backdate-signup", u["id"], 10)
    assert _access(u)["status"] == "expired"
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard/classroom/variables_intro", wait_until="domcontentloaded")
    page.wait_for_url("**/dashboard/upgrade", timeout=30000)


def test_payment_activates_plan():
    u = create_user()
    db("backdate-signup", u["id"], 10)
    s = api(u["ip"], u["token"])
    order_id, payment_id = db("seed-order", u["id"], "pro"), f"pay_e2e{uuid.uuid4().hex[:12]}"
    secret = os.environ["PM_E2E_RZP_SECRET"]

    forged = s.post(f"{BASE}/api/payments/verify", timeout=30, json={
        "razorpay_order_id": order_id, "razorpay_payment_id": payment_id, "razorpay_signature": "0" * 64})
    assert forged.status_code == 400 and _access(u)["status"] == "expired"

    sig = hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    body = {"razorpay_order_id": order_id, "razorpay_payment_id": payment_id, "razorpay_signature": sig}
    other = create_user()
    assert api(other["ip"], other["token"]).post(f"{BASE}/api/payments/verify", json=body, timeout=30).status_code == 403
    r = s.post(f"{BASE}/api/payments/verify", json=body, timeout=30)
    assert r.status_code == 200 and r.json()["plan"] == "pro", r.text[:200]
    acc = _access(u)
    assert (acc["status"], acc["plan"]) == ("active", "pro"), acc
    assert s.post(f"{BASE}/api/payments/verify", json=body, timeout=30).json().get("already_processed") is True


def test_student_access_request_approved(browser, ops_token):
    u = create_user()
    ctx = browser.new_context(viewport={"width": 1366, "height": 850}, extra_http_headers={"X-Forwarded-For": fake_ip()})
    page = ctx.new_page()
    page.goto(f"{BASE}/", wait_until="domcontentloaded")
    page.get_by_role("button", name="Get free student access").first.click()
    page.get_by_placeholder("Full name").first.fill(u["name"])
    page.get_by_placeholder("you@university.edu").fill(u["email"])
    page.locator("input[type=file]").first.set_input_files(
        {"name": "student-id.png", "mimeType": "image/png", "buffer": _png()})
    with page.expect_response(lambda r: "/api/support/access-request" in r.url) as resp:
        page.get_by_role("button", name="Request free access").click()
    assert resp.value.status == 200, resp.value.text()[:200]
    ctx.close()

    admin = api(token=ops_token)
    reqs = admin.get(f"{BASE}/api/support/admin/requests", params={"kind": "access"}, timeout=30).json()["requests"]
    req = next(r for r in reqs if r["email"].lower() == u["email"].lower())
    a = admin.post(f"{BASE}/api/support/admin/requests/{req['id']}/approve", json={"note": "verified"}, timeout=30)
    assert a.status_code == 200 and a.json()["granted"] is True, a.text[:200]
    assert _access(u)["plan"] == "student"


def test_blocked_user_refused(logged_in_page, ops_token):
    u = create_user()
    page = logged_in_page(u)
    page.goto(f"{BASE}/dashboard", wait_until="networkidle")
    b = api(token=ops_token).post(f"{BASE}/api/admin/users/{u['id']}/block", json={"blocked": True}, timeout=30)
    assert b.status_code == 200, b.text[:200]
    # The live session is revoked (token_version bump → 401) and the app sends the user back to sign in.
    assert api(u["ip"], u["token"]).get(f"{BASE}/api/profile/{u['id']}/stats", timeout=30).status_code == 401
    page.goto(f"{BASE}/dashboard/classroom", wait_until="domcontentloaded")
    page.wait_for_url("**/login**", timeout=30000)
    # Signing in again is refused while blocked.
    login = api(u["ip"]).post(f"{BASE}/api/auth/login", json={"username": u["username"], "password": PASSWORD},
                              timeout=30)
    assert login.status_code == 403, login.text[:200]


def test_password_reset_flow(browser):
    u = create_user()
    ctx = browser.new_context(viewport={"width": 1366, "height": 850}, extra_http_headers={"X-Forwarded-For": u["ip"]})
    page = ctx.new_page()
    page.goto(f"{BASE}/forgot-password", wait_until="networkidle")
    page.get_by_placeholder("Username or email").fill(u["email"])
    with page.expect_response(lambda r: "/api/auth/forgot-password" in r.url) as resp:
        page.locator("button[type=submit]").click()
    assert resp.value.status == 200
    token = db("reset-token", u["email"])
    page.goto(f"{BASE}/reset-password/{token}", wait_until="networkidle")
    page.get_by_placeholder("New password (min 6 characters)").fill(NEW_PASSWORD)
    page.get_by_placeholder("Confirm new password").fill(NEW_PASSWORD)
    with page.expect_response(lambda r: "/api/auth/reset-password" in r.url) as resp:
        page.locator("button[type=submit]").click()
    assert resp.value.status == 200, resp.value.text()[:200]
    ctx.close()

    s = api(u["ip"])
    assert s.post(f"{BASE}/api/auth/login", json={"username": u["username"], "password": PASSWORD},
                  timeout=30).status_code == 401
    assert s.post(f"{BASE}/api/auth/login", json={"username": u["username"], "password": NEW_PASSWORD},
                  timeout=30).status_code == 200


def test_oauth_buttons_render(browser):
    ctx = browser.new_context(extra_http_headers={"X-Forwarded-For": fake_ip()})
    page = ctx.new_page()
    # The CI container has no OAuth apps configured: both config endpoints say disabled → no buttons.
    for provider in ("github", "linkedin"):
        assert api().get(f"{BASE}/api/auth/{provider}/config", timeout=30).json()["enabled"] is False
    page.goto(f"{BASE}/login", wait_until="networkidle")
    assert page.get_by_text("Continue with GitHub").count() == 0
    assert page.get_by_text("Continue with LinkedIn").count() == 0
    # When the endpoints report enabled, both buttons appear.
    def enabled(provider):
        return lambda route: route.fulfill(json={"enabled": True, "provider": provider})
    for provider in ("github", "linkedin"):
        page.route(f"**/api/auth/{provider}/config", enabled(provider))
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.get_by_text("Continue with GitHub").first.wait_for(timeout=10000)
    page.get_by_text("Continue with LinkedIn").first.wait_for(timeout=10000)
    ctx.close()
