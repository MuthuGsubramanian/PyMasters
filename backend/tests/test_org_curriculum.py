"""
Org curriculum: an org admin turns topics into lessons, reviews them, and
publishes to a cohort; members see only published lessons for their org/group.
Generation is monkeypatched (no real LLM) — we simulate the pipeline result and
test the set/item lifecycle + cohort visibility.
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
    import routes.org_curriculum as cur_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(org_mod)
    importlib.reload(cur_mod)
    # Never spawn real generation threads in tests.
    monkeypatch.setattr(cur_mod, "_spawn_generation", lambda *a, **k: None)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture
def client(m):
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def _register(client, org_name=None):
    username = f"u{uuid.uuid4().hex[:10]}"
    body = {"username": username, "password": "pw123456", "name": username,
            "email": f"{username}@example.com"}
    if org_name:
        body["account_type"] = "organization"
        body["organization_name"] = org_name
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _auth(u):
    return {"Authorization": f"Bearer {u['token']}"}


def _org_of(user):
    return (user.get("org") or {}).get("org_id")


def _add_member(client, org_id, admin, role="member", group=None):
    inv = client.post(f"/api/org/{org_id}/invite",
                      json={"email": f"{uuid.uuid4().hex[:8]}@x.edu", "role": role,
                            "user_id": admin["id"]}, headers=_auth(admin)).json()
    member = _register(client)
    client.post(f"/api/org/join/{inv['token']}", json={"user_id": member["id"]}, headers=_auth(member))
    if group:
        # tag the member into a group (admin action)
        client.put(f"/api/org/{org_id}/members/{member['id']}/groups",
                   json={"groups": [group]}, headers=_auth(admin))
    return member


def _simulate_generation(set_id):
    """Stand in for run_pipeline: for each item's job, insert a generated_lesson
    and mark the job completed with that lesson id."""
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.row_factory = sqlite3.Row
    items = conn.execute("SELECT id, job_id, topic FROM org_lesson_set_items WHERE set_id = ?",
                         [set_id]).fetchall()
    for it in items:
        job = conn.execute("SELECT user_id FROM module_generation_jobs WHERE id = ?", [it["job_id"]]).fetchone()
        lesson_id = f"gen_{uuid.uuid4().hex[:8]}"
        lesson_data = json.dumps({
            "id": lesson_id, "topic": it["topic"], "track": "generated",
            "title": {"en": f"Lesson: {it['topic']}"}, "description": {"en": "x"},
            "xp_reward": 50,
        })
        conn.execute(
            "INSERT INTO generated_lessons (id, user_id, job_id, topic, track, lesson_data, trigger) "
            "VALUES (?, ?, ?, ?, 'generated', ?, 'org_curriculum')",
            [lesson_id, job["user_id"], it["job_id"], it["topic"], lesson_data])
        conn.execute("UPDATE module_generation_jobs SET status='completed', result_lesson_id=? WHERE id=?",
                     [lesson_id, it["job_id"]])
    conn.commit()
    conn.close()


def _member_lesson_ids(m, user_id, track=None):
    from routes.classroom import _list_all_lessons
    lessons = _list_all_lessons(user_id=user_id)
    return [l["id"] for l in lessons if track is None or l.get("track") == track]


def _make_set(client, org_id, admin, topics, group_name=""):
    r = client.post(f"/api/org/{org_id}/lesson-sets",
                    json={"title": "Intro Module", "group_name": group_name, "topics": topics},
                    headers=_auth(admin))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_create_review_publish_and_member_sees_it(client, m):
    admin = _register(client, org_name="Acme School")
    org_id = _org_of(admin)
    member = _add_member(client, org_id, admin)

    set_id = _make_set(client, org_id, admin, ["Recursion", "Dictionaries"])

    # Items exist and are generating
    sets = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"]
    assert len(sets) == 1 and len(sets[0]["items"]) == 2

    # Member sees nothing assigned yet (not generated, not published)
    assert _member_lesson_ids(m, member["id"], track="assigned") == []

    # Simulate generation completing, then reconcile via list
    _simulate_generation(set_id)
    sets = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"]
    items = sets[0]["items"]
    assert all(i["status"] == "generated" and i["lesson_id"] for i in items)
    assert sets[0]["status"] == "ready"

    # Still hidden from members until published
    assert _member_lesson_ids(m, member["id"], track="assigned") == []

    # Publish one item → member sees exactly that one as "assigned"
    it = items[0]
    pub = client.post(f"/api/org/{org_id}/lesson-sets/{set_id}/items/{it['id']}/publish", headers=_auth(admin))
    assert pub.status_code == 200
    assigned = _member_lesson_ids(m, member["id"], track="assigned")
    assert assigned == [it["lesson_id"]]

    # Unpublish → hidden again
    client.post(f"/api/org/{org_id}/lesson-sets/{set_id}/items/{it['id']}/unpublish", headers=_auth(admin))
    assert _member_lesson_ids(m, member["id"], track="assigned") == []


def test_group_scoping(client, m):
    admin = _register(client, org_name="Group School")
    org_id = _org_of(admin)
    in_group = _add_member(client, org_id, admin, group="CS101")
    other = _add_member(client, org_id, admin)  # no group

    set_id = _make_set(client, org_id, admin, ["Loops"], group_name="CS101")
    _simulate_generation(set_id)
    item = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"][0]["items"][0]
    client.post(f"/api/org/{org_id}/lesson-sets/{set_id}/items/{item['id']}/publish", headers=_auth(admin))

    # Only the CS101 member sees it; the ungrouped member does not.
    assert _member_lesson_ids(m, in_group["id"], track="assigned") == [item["lesson_id"]]
    assert _member_lesson_ids(m, other["id"], track="assigned") == []


def test_non_member_and_non_admin_cannot_touch(client, m):
    admin = _register(client, org_name="Locked School")
    org_id = _org_of(admin)
    member = _add_member(client, org_id, admin)   # role=member
    outsider = _register(client)

    # Members and outsiders can't create sets
    assert client.post(f"/api/org/{org_id}/lesson-sets", json={"title": "x", "topics": ["y"]},
                       headers=_auth(member)).status_code == 403
    assert client.post(f"/api/org/{org_id}/lesson-sets", json={"title": "x", "topics": ["y"]},
                       headers=_auth(outsider)).status_code == 403
    # Unauthenticated -> 401
    assert client.post(f"/api/org/{org_id}/lesson-sets", json={"title": "x", "topics": ["y"]}).status_code == 401


def test_topic_cap_and_dedup(client, m):
    admin = _register(client, org_name="Cap School")
    org_id = _org_of(admin)
    # >10 distinct topics rejected
    assert client.post(f"/api/org/{org_id}/lesson-sets",
                       json={"title": "Big", "topics": [f"t{i}" for i in range(11)]},
                       headers=_auth(admin)).status_code == 422
    # dedup: 3 lines, 2 unique
    set_id = _make_set(client, org_id, admin, ["Recursion", "recursion", "Lists"])
    items = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"][0]["items"]
    assert len(items) == 2


def test_upload_creates_set(client, m):
    admin = _register(client, org_name="Upload School")
    org_id = _org_of(admin)
    csv_body = b"# my syllabus\nRecursion\nSorting, with examples\n\nRecursion\n"
    r = client.post(
        f"/api/org/{org_id}/lesson-sets/upload",
        data={"title": "From file", "group_name": ""},
        files={"file": ("syllabus.txt", csv_body, "text/plain")},
        headers=_auth(admin))
    assert r.status_code == 200, r.text
    items = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"][0]["items"]
    topics = sorted(i["topic"] for i in items)
    # comment skipped, CSV first field taken, dedup applied
    assert topics == ["Recursion", "Sorting"]


def test_delete_set_removes_member_visibility(client, m):
    admin = _register(client, org_name="Del School")
    org_id = _org_of(admin)
    member = _add_member(client, org_id, admin)
    set_id = _make_set(client, org_id, admin, ["Recursion"])
    _simulate_generation(set_id)
    item = client.get(f"/api/org/{org_id}/lesson-sets", headers=_auth(admin)).json()["sets"][0]["items"][0]
    client.post(f"/api/org/{org_id}/lesson-sets/{set_id}/items/{item['id']}/publish", headers=_auth(admin))
    assert _member_lesson_ids(m, member["id"], track="assigned") == [item["lesson_id"]]

    d = client.delete(f"/api/org/{org_id}/lesson-sets/{set_id}", headers=_auth(admin))
    assert d.status_code == 200
    assert _member_lesson_ids(m, member["id"], track="assigned") == []
