"""
Per-organization portal branding ("white-label lite").

Presets give each org kind (school / university / training_center / enterprise /
other) a default vocabulary; an org admin can overlay typed branding fields
(portal name, logo URL, two hex colours, labels, welcome message) via
PUT /api/org/{org_id}/branding. Any member can read the effective result; it is
also inlined into GET /api/org/my so the shell can theme right after login.
"""
import importlib
import json
import os
import sqlite3
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture
def m(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import routes.admin as admin_mod
    import routes.organizations as org_mod
    importlib.reload(auth_module)
    importlib.reload(org_mod)
    importlib.reload(admin_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client):
    username = f"u{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={
        "username": username, "password": "pw123456", "name": username,
        "email": f"{username}@example.com"})
    assert r.status_code == 200, r.text
    return r.json()


def _auth(u):
    return {"Authorization": f"Bearer {u['token']}"}


def _new_org(client, owner, org_type="school", name="Acme School"):
    r = client.post("/api/org", json={"name": name, "type": org_type,
                                      "user_id": owner["id"]}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    return r.json()["org_id"]


def _add_member(client, owner, org_id, role="member"):
    inv = client.post(f"/api/org/{org_id}/invite",
                      json={"email": f"{uuid.uuid4().hex[:6]}@x.edu", "role": role,
                            "user_id": owner["id"]},
                      headers=_auth(owner)).json()
    u = _register(client)
    r = client.post(f"/api/org/join/{inv['token']}", json={"user_id": u["id"]}, headers=_auth(u))
    assert r.status_code == 200, r.text
    return u


# ---- presets ---------------------------------------------------------------

@pytest.mark.parametrize("org_type,learner,group,instructor,kind", [
    ("school", "Students", "Class", "Teacher", "educational"),
    ("university", "Students", "Course", "Faculty", "educational"),
    ("training_center", "Trainees", "Batch", "Trainer", "professional"),
    ("enterprise", "Employees", "Team", "Manager", "professional"),
    ("other", "Learners", "Group", "Mentor", "professional"),
])
def test_preset_defaults_per_type(client, org_type, learner, group, instructor, kind):
    owner = _register(client)
    org_id = _new_org(client, owner, org_type=org_type)
    r = client.get(f"/api/org/{org_id}/branding", headers=_auth(owner))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == org_type
    assert body["preset"]["kind"] == kind
    b = body["branding"]
    assert (b["learner_label"], b["group_label"], b["instructor_label"]) == (learner, group, instructor)
    # Nothing saved yet -> no custom portal name / colours, powered-by on.
    assert b["portal_name"] == "" and b["primary_color"] == "" and b["accent_color"] == ""
    assert b["show_powered_by"] is True


def test_training_center_is_a_valid_type_everywhere(client):
    owner = _register(client)
    org_id = _new_org(client, owner, org_type="training_center", name="Skill Forge")
    assert client.get(f"/api/org/{org_id}", headers=_auth(owner)).json()["type"] == "training_center"
    # Org admin can switch an existing org to the new type too.
    other = _new_org(client, owner, org_type="other")
    r = client.put(f"/api/org/{other}", json={"type": "training_center", "user_id": owner["id"]},
                   headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert client.get(f"/api/org/{other}/branding", headers=_auth(owner)).json()["branding"]["learner_label"] == "Trainees"


def test_unknown_org_type_rejected(client):
    owner = _register(client)
    r = client.post("/api/org", json={"name": "Bad", "type": "bootcamp", "user_id": owner["id"]},
                    headers=_auth(owner))
    assert r.status_code == 422


# ---- authz -----------------------------------------------------------------

def test_member_can_read_branding(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    member = _add_member(client, owner, org_id)
    r = client.get(f"/api/org/{org_id}/branding", headers=_auth(member))
    assert r.status_code == 200
    assert r.json()["branding"]["learner_label"] == "Students"


def test_non_member_cannot_read_branding(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    outsider = _register(client)
    # require_org_role convention in this router: non-members get 403.
    assert client.get(f"/api/org/{org_id}/branding", headers=_auth(outsider)).status_code == 403


def test_member_cannot_update_branding(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    member = _add_member(client, owner, org_id)
    r = client.put(f"/api/org/{org_id}/branding", json={"portal_name": "Hijacked"},
                   headers=_auth(member))
    assert r.status_code == 403
    assert client.get(f"/api/org/{org_id}/branding", headers=_auth(member)).json()["branding"]["portal_name"] == ""


# ---- admin writes ----------------------------------------------------------

def test_admin_update_persists_and_reflects_everywhere(client):
    owner = _register(client)
    org_id = _new_org(client, owner, org_type="enterprise", name="Globex")
    admin = _add_member(client, owner, org_id, role="admin")
    payload = {
        "portal_name": "  Globex Academy  ",
        "tagline": "Learn. Ship. Repeat.",
        "logo_url": "https://cdn.example.com/globex.png",
        "primary_color": "#1E90FF",
        "accent_color": "#ff8800",
        "learner_label": "Engineers",
        "welcome_message": "Welcome aboard!",
        "show_powered_by": False,
    }
    r = client.put(f"/api/org/{org_id}/branding", json=payload, headers=_auth(admin))
    assert r.status_code == 200, r.text
    b = r.json()["branding"]
    assert b["portal_name"] == "Globex Academy"          # stripped
    assert b["primary_color"] == "#1e90ff"               # normalised lower-case
    assert b["accent_color"] == "#ff8800"
    assert b["learner_label"] == "Engineers"             # override
    assert b["group_label"] == "Team"                    # preset kept (not sent)
    assert b["instructor_label"] == "Manager"
    assert b["show_powered_by"] is False

    # GET reflects the same effective branding
    g = client.get(f"/api/org/{org_id}/branding", headers=_auth(owner)).json()["branding"]
    assert g == b

    # /my inlines it for the shell
    my = client.get("/api/org/my", headers=_auth(admin)).json()["organizations"]
    mine = next(o for o in my if o["org_id"] == org_id)
    assert mine["branding"]["portal_name"] == "Globex Academy"
    assert mine["branding"]["primary_color"] == "#1e90ff"

    # Partial update leaves untouched fields alone; empty string clears.
    r = client.put(f"/api/org/{org_id}/branding", json={"tagline": "", "learner_label": ""},
                   headers=_auth(admin))
    assert r.status_code == 200
    b2 = r.json()["branding"]
    assert b2["portal_name"] == "Globex Academy"
    assert b2["tagline"] == ""
    assert b2["learner_label"] == "Employees"            # back to preset

    # Audited
    audit = client.get(f"/api/org/{org_id}/audit", headers=_auth(owner)).json()["audit"]
    assert any(a["action"] == "org.branding.update" for a in audit)


@pytest.mark.parametrize("payload", [
    {"primary_color": "red"},
    {"primary_color": "#fff"},
    {"accent_color": "#12345G"},
    {"accent_color": "123456"},
    {"portal_name": "x" * 41},
    {"tagline": "t" * 81},
    {"welcome_message": "w" * 281},
    {"learner_label": "l" * 31},
    {"logo_url": "javascript:alert(1)"},
    {"logo_url": "ftp://files.example.com/logo.png"},
    {"portal_name": "<script>alert(1)</script>"},
    {"show_powered_by": "yes please"},
])
def test_invalid_branding_rejected_422(client, payload):
    owner = _register(client)
    org_id = _new_org(client, owner)
    r = client.put(f"/api/org/{org_id}/branding", json=payload, headers=_auth(owner))
    assert r.status_code == 422, r.text


def test_portal_name_at_limit_accepted(client):
    owner = _register(client)
    org_id = _new_org(client, owner)
    r = client.put(f"/api/org/{org_id}/branding", json={"portal_name": "x" * 40}, headers=_auth(owner))
    assert r.status_code == 200, r.text


# ---- legacy group_label mirror --------------------------------------------

def test_legacy_group_label_is_honoured_and_mirrored(client):
    owner = _register(client)
    org_id = _new_org(client, owner, org_type="university")
    # Older path writes settings.group_label at the top level
    r = client.put(f"/api/org/{org_id}", json={"group_label": "Cohort", "user_id": owner["id"]},
                   headers=_auth(owner))
    assert r.status_code == 200
    assert client.get(f"/api/org/{org_id}/branding", headers=_auth(owner)).json()["branding"]["group_label"] == "Cohort"
    assert client.get(f"/api/org/{org_id}/groups", headers=_auth(owner)).json()["group_label"] == "Cohort"

    # New path updates branding.group_label AND mirrors to the legacy key
    r = client.put(f"/api/org/{org_id}/branding", json={"group_label": "Section"}, headers=_auth(owner))
    assert r.status_code == 200
    assert r.json()["branding"]["group_label"] == "Section"
    assert client.get(f"/api/org/{org_id}/groups", headers=_auth(owner)).json()["group_label"] == "Section"
    conn = sqlite3.connect(os.environ["DB_PATH"])
    settings = json.loads(conn.execute("SELECT settings FROM organizations WHERE id = ?", [org_id]).fetchone()[0])
    conn.close()
    assert settings["group_label"] == "Section"
    assert settings["branding"]["group_label"] == "Section"

    # Clearing the branding label removes the legacy mirror -> preset default
    r = client.put(f"/api/org/{org_id}/branding", json={"group_label": ""}, headers=_auth(owner))
    assert r.json()["branding"]["group_label"] == "Course"
    assert client.get(f"/api/org/{org_id}/groups", headers=_auth(owner)).json()["group_label"] == "Group"
