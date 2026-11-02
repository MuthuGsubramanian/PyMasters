"""Journeys: enterprise and training centre (spec §2, journey 3; Review Focus: enterprise tracks hidden from
individuals).

Enterprise members get the enterprise-only tracks; individuals never see them (catalogue, search, direct URL).
A training centre builds a curriculum lesson set for a batch and publishes it to that batch; the platform admin
approves an org's plan request.
"""
import time

from conftest import BASE, api, create_user, db, wait_semantic_ready

ENTERPRISE_TRACKS = {"azure_enterprise", "azure_ai_foundry", "aws_enterprise", "gcp_vertex_ai",
                     "cross_cloud_architecture", "frontier_ai_platforms"}
AWS_LESSON = "aws_accounts_iam_organizations"


def _join(org_admin, org_id, role="member"):
    s = api(org_admin["ip"], org_admin["token"])
    member = create_user()
    r = s.post(f"{BASE}/api/org/{org_id}/invite", json={"email": member["email"], "role": role,
                                                      "user_id": org_admin["id"]}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = api(member["ip"], member["token"]).post(f"{BASE}/api/org/join/{r.json()['token']}",
                                                 json={"user_id": member["id"]}, timeout=30)
    assert j.status_code == 200, j.text[:200]
    return member


def _tracks(user) -> set:
    return {l.get("track") for l in _catalogue(user)}


def _catalogue(user) -> list:
    """The learner's catalogue as the Classroom page requests it (user_id adds org-assigned lessons)."""
    return api(user["ip"], user["token"]).get(f"{BASE}/api/classroom/lessons", params={"user_id": user["id"]},
                                              timeout=60).json()["lessons"]


def test_enterprise_member_sees_enterprise_tracks():
    admin = create_user(kind="organization", org_type="enterprise")
    db("set-org-plan", admin["org_id"], "enterprise")
    member = _join(admin, admin["org_id"])
    assert ENTERPRISE_TRACKS <= _tracks(member)
    r = api(member["ip"], member["token"]).get(f"{BASE}/api/classroom/lesson/{AWS_LESSON}", timeout=30)
    assert r.status_code == 200


def test_enterprise_tracks_hidden_from_individual():
    u = create_user()
    s = api(u["ip"], u["token"])
    assert not (ENTERPRISE_TRACKS & _tracks(u))
    wait_semantic_ready()
    hits = s.get(f"{BASE}/api/semantic/search", params={"q": "AWS IAM organizations azure"}, timeout=60).json()
    found = {h.get("track") for h in hits["results"]}
    assert hits["results"] and not (ENTERPRISE_TRACKS & found), found
    assert s.get(f"{BASE}/api/classroom/lesson/{AWS_LESSON}", timeout=30).status_code == 403


def test_training_centre_curriculum_published_to_batch():
    admin = create_user(kind="organization", org_type="training_center")
    db("grandfather-org", admin["org_id"])
    org_id = admin["org_id"]
    s = api(admin["ip"], admin["token"])
    trainee = _join(admin, org_id)
    other = _join(admin, org_id)
    assert s.put(f"{BASE}/api/org/{org_id}/members/{trainee["id"]}/groups", json={"groups": ["Batch A"],
                  "user_id": admin["id"]}, timeout=30).status_code == 200

    branding = s.get(f"{BASE}/api/org/{org_id}/branding", timeout=30).json()
    eff = branding.get("branding", branding)
    assert (eff["learner_label"], eff["group_label"], eff["instructor_label"]) == ("Trainees", "Batch", "Trainer")

    r = s.post(f"{BASE}/api/org/{org_id}/lesson-sets", json={"title": "Batch A week 1", "group_name": "Batch A",
                                                            "topics": ["Python dictionaries"]}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    set_id = r.json().get("id") or r.json().get("set_id")
    deadline, item = time.time() + 180, None
    while time.time() < deadline:
        sets = s.get(f"{BASE}/api/org/{org_id}/lesson-sets", timeout=30).json()
        cur = next(x for x in sets.get("sets", sets.get("lesson_sets", [])) if x["id"] == set_id)
        item = cur["items"][0]
        if item.get("status") in ("ready", "draft", "generated", "failed", "error"):
            break
        time.sleep(3)
    assert item and item.get("status") not in ("failed", "error"), item
    p = s.post(f"{BASE}/api/org/{org_id}/lesson-sets/{set_id}/items/{item['id']}/publish", json={}, timeout=30)
    assert p.status_code == 200, p.text[:200]
    lesson_id = item.get("lesson_id")
    assert lesson_id in {l["id"] for l in _catalogue(trainee)}
    assert lesson_id not in {l["id"] for l in _catalogue(other)}


def test_org_plan_request_approved_by_platform(ops_token):
    admin = create_user(kind="organization", org_type="enterprise")
    org_id = admin["org_id"]
    s = api(admin["ip"], admin["token"])
    r = s.post(f"{BASE}/api/org/{org_id}/requests", json={"kind": "plan", "plan": "enterprise",
                                                         "message": "Pilot for our engineering team"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    req_id = r.json().get("id") or r.json().get("request_id")
    a = api(token=ops_token).post(f"{BASE}/api/admin/org-requests/{req_id}/approve",
                                  json={"plan": "enterprise", "note": "approved"}, timeout=30)
    assert a.status_code == 200, a.text[:200]
    member = _join(admin, org_id)
    assert ENTERPRISE_TRACKS <= _tracks(member)
