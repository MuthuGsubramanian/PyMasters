"""Phase 1 tests: Multi-tenant school provisioning, grade/board syllabus templates,
student cohort scoping, non-coding ConceptStudyView APIs, teacher cohort isolation,
and domain-verified SSO onboarding + seat caps.
"""

import importlib
import os
import sqlite3
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture()
def app_mod(tmp_path, monkeypatch):
    db_path = str(tmp_path / "school_test.db")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("SEMANTIC_FAKE_EMBED", "1")
    monkeypatch.delenv("K_SERVICE", raising=False)

    import routes.admin as admin_mod
    import routes.classroom as classroom_mod
    import routes.organizations as org_mod
    import routes.school_provisioning as school_routes_mod
    import school_provisioning as school_core_mod

    importlib.reload(auth_module)
    importlib.reload(school_core_mod)
    importlib.reload(admin_mod)
    importlib.reload(org_mod)
    importlib.reload(school_routes_mod)
    importlib.reload(classroom_mod)

    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture()
def client(app_mod):
    return TestClient(app_mod.app)


def _register(client, org_name=None, email=None):
    uname = f"u{uuid.uuid4().hex[:10]}"
    body = {
        "username": uname,
        "password": "pw123456",
        "name": uname,
        "email": email or f"{uname}@example.com",
    }
    if org_name:
        body["account_type"] = "organization"
        body["organization_name"] = org_name
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _add_member(client, org_id, admin, role="member", cohort=None, email=None):
    student = _register(client, email=email)
    inv = client.post(
        f"/api/org/{org_id}/invite",
        json={"email": student["email"], "role": role, "user_id": admin["id"]},
        headers=_auth(admin),
    )
    assert inv.status_code == 200, inv.text
    j = client.post(
        f"/api/org/join/{inv.json()['token']}",
        json={"user_id": student["id"]},
        headers=_auth(student),
    )
    assert j.status_code == 200, j.text
    if cohort:
        g = client.put(
            f"/api/org/{org_id}/members/{student['id']}/groups",
            json={"groups": [cohort]},
            headers=_auth(admin),
        )
        assert g.status_code == 200, g.text
    return student


def test_seeded_board_grade_templates(client):
    admin = _register(client, org_name="Oakridge High")
    res = client.get("/api/schools/templates", headers=_auth(admin))
    assert res.status_code == 200, res.text
    data = res.json()
    assert set(data["boards"]) == {"CBSE", "ICSE", "STATE", "IB"}
    assert data["grades"] == [6, 7, 8, 9, 10, 11, 12]
    assert len(data["templates"]) == 28

    cbse8 = client.get("/api/schools/templates?board=CBSE&grade=8", headers=_auth(admin))
    assert cbse8.status_code == 200
    tpls = cbse8.json()["templates"]
    assert len(tpls) == 1
    codes = {s["subject_code"]: s for s in tpls[0]["subjects"]}
    assert {"cs_ai", "mathematics", "physics", "chemistry", "biology", "social_studies"} <= set(codes)
    assert codes["cs_ai"]["pedagogy_mode"] == "coding_ide"
    assert codes["physics"]["pedagogy_mode"] == "concept_study"
    assert codes["social_studies"]["pedagogy_mode"] == "concept_study"


def test_load_all_vs_subset_scoping_and_concept_study_flow(client):
    admin = _register(client, org_name="Sunrise Academy")
    org_id = admin["org"]["org_id"]

    # Provision Cohort A with All Subjects and strict scoping
    prov_all = client.post(
        f"/api/org/{org_id}/cohorts/provision",
        json={
            "cohort_name": "Grade 8 - A",
            "board": "CBSE",
            "grade": 8,
            "load_all_subjects": True,
            "hide_public_tracks": True,
        },
        headers=_auth(admin),
    )
    assert prov_all.status_code == 200, prov_all.text
    all_payload = prov_all.json()
    assert len(all_payload["subjects"]) == 6
    assert len(all_payload["modules"]) >= 6

    # Provision Cohort B with Physics + Biology only
    prov_sub = client.post(
        f"/api/org/{org_id}/cohorts/provision",
        json={
            "cohort_name": "Grade 8 - B",
            "board": "CBSE",
            "grade": 8,
            "load_all_subjects": False,
            "subject_codes": ["physics", "biology"],
            "hide_public_tracks": True,
        },
        headers=_auth(admin),
    )
    assert prov_sub.status_code == 200, prov_sub.text
    assert [s["subject_code"] for s in prov_sub.json()["subjects"]] == ["physics", "biology"]

    student_a = _add_member(client, org_id, admin, role="member", cohort="Grade 8 - A")
    student_b = _add_member(client, org_id, admin, role="member", cohort="Grade 8 - B")

    lessons_a = client.get("/api/classroom/lessons", headers=_auth(student_a))
    assert lessons_a.status_code == 200, lessons_a.text
    la = lessons_a.json()
    assert la["school_scope"]["hide_public_tracks"] is True
    assert la["school_scope"]["cohort_name"] == "Grade 8 - A"
    ids_a = {l["id"] for l in la["lessons"]}
    # Public tracks hidden for strictly scoped school cohorts
    assert "vars_01" not in ids_a
    assert any(lid.startswith("school_cbse_g08_") for lid in ids_a)

    lessons_b = client.get("/api/classroom/lessons", headers=_auth(student_b)).json()
    subj_b = {l.get("subject_code") for l in lessons_b["lessons"] if l.get("subject_code")}
    assert subj_b == {"physics", "biology"}

    # Fetch non-coding school concept lesson detail and submit concept check + teach-back
    physics_lesson = next(l for l in lessons_b["lessons"] if l.get("subject_code") == "physics")
    detail = client.get(f"/api/classroom/lesson/{physics_lesson['id']}", headers=_auth(student_b))
    assert detail.status_code == 200, detail.text
    ljson = detail.json()
    assert ljson["pedagogy_mode"] == "concept_study"
    assert len(ljson["socratic_cards"]) >= 1
    assert len(ljson["concept_checks"]) >= 1

    check = ljson["concept_checks"][0]
    wrong_idx = (check["correct_index"] + 1) % len(check["options"])
    miss = client.post(
        "/api/classroom/concept-check",
        json={"lesson_id": physics_lesson["id"], "check_id": check["id"], "selected_index": wrong_idx},
        headers=_auth(student_b),
    )
    assert miss.status_code == 200
    assert miss.json()["passed"] is False
    assert miss.json()["xp_earned"] == 0

    hit1 = client.post(
        "/api/classroom/concept-check",
        json={"lesson_id": physics_lesson["id"], "check_id": check["id"], "selected_index": check["correct_index"]},
        headers=_auth(student_b),
    )
    assert hit1.status_code == 200
    assert hit1.json()["passed"] is True
    assert hit1.json()["xp_earned"] > 0

    # Idempotent retry should not double-award XP
    hit2 = client.post(
        "/api/classroom/concept-check",
        json={"lesson_id": physics_lesson["id"], "check_id": check["id"], "selected_index": check["correct_index"]},
        headers=_auth(student_b),
    )
    assert hit2.status_code == 200
    assert hit2.json()["passed"] is True
    assert hit2.json()["xp_earned"] == 0

    tb = client.post(
        "/api/classroom/teach-back",
        json={
            "lesson_id": physics_lesson["id"],
            "concept": "Force and Pressure",
            "explanation": (
                "Pressure equals force divided by area, because spreading weight over a larger area "
                "reduces pressure; for example snowshoes prevent sinking into snow."
            ),
        },
        headers=_auth(student_b),
    )
    assert tb.status_code == 200, tb.text
    assert tb.json()["verdict"] in ("solid", "mastered")
    assert "production" not in tb.json()["follow_up_question"].lower()


def test_teacher_cohort_isolation(client):
    admin = _register(client, org_name="Riverdale School")
    org_id = admin["org"]["org_id"]

    client.post(
        f"/api/org/{org_id}/cohorts/provision",
        json={"cohort_name": "Grade 9 - Alpha", "board": "ICSE", "grade": 9, "load_all_subjects": True},
        headers=_auth(admin),
    )
    client.post(
        f"/api/org/{org_id}/cohorts/provision",
        json={"cohort_name": "Grade 9 - Beta", "board": "ICSE", "grade": 9, "load_all_subjects": True},
        headers=_auth(admin),
    )

    teacher = _add_member(client, org_id, admin, role="manager")
    student_alpha = _add_member(client, org_id, admin, role="member", cohort="Grade 9 - Alpha")
    student_beta = _add_member(client, org_id, admin, role="member", cohort="Grade 9 - Beta")

    assign = client.put(
        f"/api/org/{org_id}/teachers/{teacher['id']}/cohorts",
        json={"cohort_names": ["Grade 9 - Alpha"], "subject_code": "physics"},
        headers=_auth(admin),
    )
    assert assign.status_code == 200, assign.text

    cohorts_res = client.get(f"/api/org/{org_id}/cohorts", headers=_auth(teacher))
    assert cohorts_res.status_code == 200
    assert [c["cohort_name"] for c in cohorts_res.json()["cohorts"]] == ["Grade 9 - Alpha"]

    progress = client.get(f"/api/org/{org_id}/progress", headers=_auth(teacher)).json()
    visible_ids = {m["id"] for m in progress["students"]}
    assert student_alpha["id"] in visible_ids
    assert student_beta["id"] not in visible_ids

    analytics = client.get(f"/api/org/{org_id}/analytics", headers=_auth(teacher)).json()
    assert analytics["total_members"] == 1

    denied_detail = client.get(f"/api/org/{org_id}/students/{student_beta['id']}", headers=_auth(teacher))
    assert denied_detail.status_code == 403


def test_school_sso_domain_join_and_seat_cap(client):
    admin = _register(client, org_name="Greenwood International")
    org_id = admin["org"]["org_id"]

    cfg = client.put(
        f"/api/org/{org_id}/school-config",
        json={
            "board": "IB",
            "academic_year": "2026-27",
            "sso_provider": "google_workspace",
            "sso_domain": "greenwood.edu",
            "hide_public_tracks": True,
            "seat_limit": 5,
        },
        headers=_auth(admin),
    )
    assert cfg.status_code == 200, cfg.text

    sso_meta = client.get("/api/auth/sso/google_workspace/start?domain=greenwood.edu")
    assert sso_meta.status_code == 200, sso_meta.text
    assert sso_meta.json()["org_id"] == org_id
    assert sso_meta.json()["board"] == "IB"

    client.post(
        f"/api/org/{org_id}/cohorts/provision",
        json={"cohort_name": "MYP Year 3", "board": "IB", "grade": 8, "load_all_subjects": True},
        headers=_auth(admin),
    )

    learner = _register(client, email="aarav@greenwood.edu")
    join = client.post(
        "/api/auth/sso/domain-join",
        json={"email": "aarav@greenwood.edu", "cohort_name": "MYP Year 3"},
        headers=_auth(learner),
    )
    assert join.status_code == 200, join.text
    assert join.json()["joined"] is True
    assert join.json()["org_id"] == org_id

    # Lower seat_limit below existing members by adding users up to limit=5 (admin=1, aarav=2)
    for idx in range(3):
        u = _register(client, email=f"s{idx}@greenwood.edu")
        r = client.post(
            "/api/auth/sso/domain-join",
            json={"email": f"s{idx}@greenwood.edu"},
            headers=_auth(u),
        )
        assert r.status_code == 200

    overflow = _register(client, email="overflow@greenwood.edu")
    denied = client.post(
        "/api/auth/sso/domain-join",
        json={"email": "overflow@greenwood.edu"},
        headers=_auth(overflow),
    )
    assert denied.status_code == 403
