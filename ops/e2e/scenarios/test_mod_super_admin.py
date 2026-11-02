"""Module: super admin console — every tab, user search, plan change, audit trail; admin-only surfaces (spec §3)."""
from conftest import BASE, api, create_user, ops_user

TABS = ["Overview", "Users", "Organizations", "Content", "Support", "Social Studio", "Admins", "Audit", "Settings"]


def test_every_tab_renders(logged_in_page, ops_token):
    page = logged_in_page(ops_user(ops_token))
    page.goto(f"{BASE}/dashboard/admin", wait_until="networkidle")
    page.get_by_role("tab").first.wait_for(timeout=30000)
    assert [t.strip() for t in page.get_by_role("tab").all_inner_texts()] == TABS
    for name in TABS:
        page.get_by_role("tab", name=name, exact=True).first.click()
        page.wait_for_load_state("networkidle")
        assert page.get_by_role("tab", name=name, exact=True).first.get_attribute("aria-selected") == "true", name
    assert not [p for p in page.problems if "pageerror" in p or p.startswith("http 5")], page.problems[:3]


def test_search_change_plan_and_audit(ops_token):
    u = create_user()
    admin = api(token=ops_token)
    found = admin.get(f"{BASE}/api/admin/users", params={"q": u["username"]}, timeout=30).json()
    rows = found.get("users", found if isinstance(found, list) else [])
    assert [r["id"] for r in rows] == [u["id"]], rows
    r = admin.post(f"{BASE}/api/admin/users/{u['id']}/plan", json={"plan": "pro", "expires_at": "2030-01-01"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    access = api(u["ip"], u["token"]).get(f"{BASE}/api/profile/{u['id']}/access", timeout=30).json()
    assert access["plan"] == "pro", access
    audit = admin.get(f"{BASE}/api/admin/audit", params={"limit": 50}, timeout=30).json()["audit"]
    assert any(a.get("target_id") == u["id"] and "plan" in a.get("action", "") for a in audit), audit[:3]


def test_admin_surfaces_refuse_learners():
    u = create_user()
    s = api(u["ip"], u["token"])
    for path in ("/api/admin/users", "/api/admin/audit", "/api/admin/settings/notification-emails",
                 "/api/admin/vaathiyaar/health", "/api/admin/vaathiyaar/adaptive"):
        assert s.get(f"{BASE}{path}", timeout=30).status_code == 403, path


def test_platform_and_tutor_admin_endpoints(ops_token):
    admin = api(token=ops_token)
    emails = admin.get(f"{BASE}/api/admin/settings/notification-emails", timeout=30)
    assert emails.status_code == 200, emails.text[:200]
    health = admin.get(f"{BASE}/api/admin/vaathiyaar/health", timeout=30)
    assert health.status_code == 200, health.text[:200]
    assert admin.get(f"{BASE}/api/admin/vaathiyaar/lesson-health", timeout=60).status_code == 200
