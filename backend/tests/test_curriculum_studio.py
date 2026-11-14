"""Phase 2 tests: Enterprise & Training Center Curriculum Studio:
- PDF / DOCX / multi-column CSV syllabus extraction
- fastembed vector search across lessons + concept-graph nodes + gap queueing
- Hardened pipeline AST verification + heap trace capture
- Explainable Curriculum Alignment Card
- Semantic versioning v1.0 -> v1.1, Impact Diff, and non-destructive delta rollout
  preserving earned XP, streaks, lesson_completions, and user_credentials.
"""

import importlib
import io
import json
import os
import sqlite3
import sys
import uuid
import zipfile
import zlib

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module


@pytest.fixture()
def app_mod(tmp_path, monkeypatch):
    db_path = str(tmp_path / "studio_test.db")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("SEMANTIC_FAKE_EMBED", "1")
    monkeypatch.delenv("K_SERVICE", raising=False)

    import routes.admin as admin_mod
    import routes.classroom as classroom_mod
    import routes.curriculum_studio as studio_routes_mod
    import routes.org_curriculum as cur_mod
    import routes.organizations as org_mod

    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    importlib.reload(org_mod)
    importlib.reload(cur_mod)
    monkeypatch.setattr(cur_mod, "_spawn_generation", lambda *a, **k: None)
    importlib.reload(studio_routes_mod)
    monkeypatch.setattr(studio_routes_mod, "_spawn_generation", lambda *a, **k: None)
    importlib.reload(classroom_mod)

    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    return main_mod


@pytest.fixture()
def client(app_mod):
    return TestClient(app_mod.app)


def _register(client, org_name=None):
    uname = f"u{uuid.uuid4().hex[:10]}"
    body = {
        "username": uname,
        "password": "pw123456",
        "name": uname,
        "email": f"{uname}@example.com",
    }
    if org_name:
        body["account_type"] = "organization"
        body["organization_name"] = org_name
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _make_docx_bytes(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    body_xml = "".join(f"<w:p><w:r><w:t>{ln}</w:t></w:r></w:p>" for ln in lines)
    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body_xml}</w:body></w:document>"
    )
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", doc_xml)
    return buf.getvalue()


def _make_pdf_bytes(lines: list[str]) -> bytes:
    payload = "\n".join(f"({ln}) Tj" for ln in lines).encode("latin-1")
    compressed = zlib.compress(payload)
    return b"%PDF-1.4\n1 0 obj\n<< /Length " + str(len(compressed)).encode() + b" >>\nstream\n" + compressed + b"\nendstream\nendobj\n%%EOF"


def test_document_extractors_pdf_docx_csv():
    from syllabus_ingest import extract_topics_from_upload

    docx_bytes = _make_docx_bytes(["1. Python Dictionaries", "2. Asyncio Event Loop", "- Unit Testing"])
    assert extract_topics_from_upload("syllabus.docx", docx_bytes) == [
        "Python Dictionaries",
        "Asyncio Event Loop",
        "Unit Testing",
    ]

    csv_bytes = b"week,topic,hours\n1,Variables & Types,2\n2,List Comprehensions,3\n"
    assert extract_topics_from_upload("plan.csv", csv_bytes) == [
        "Variables & Types",
        "List Comprehensions",
    ]

    pdf_bytes = _make_pdf_bytes(["Module 1: Decorators & Closures", "Module 2: SQLite Transactions"])
    assert extract_topics_from_upload("course.pdf", pdf_bytes) == [
        "Decorators & Closures",
        "SQLite Transactions",
    ]


def test_studio_ingest_matching_alignment_card_and_non_destructive_delta(client):
    admin = _register(client, org_name="Acme Engineering Academy")
    org_id = admin["org"]["org_id"]

    learner = _register(client)
    inv = client.post(
        f"/api/org/{org_id}/invite",
        json={"email": learner["email"], "role": "member", "user_id": admin["id"]},
        headers=_auth(admin),
    )
    assert inv.status_code == 200
    client.post(f"/api/org/join/{inv.json()['token']}", json={"user_id": learner["id"]}, headers=_auth(learner))
    client.put(f"/api/org/{org_id}/members/{learner['id']}/groups", json={"groups": ["Cohort-Eng"]}, headers=_auth(admin))

    # Seed existing learner XP, streak, completion, and verifiable credential
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("UPDATE users SET points = 420 WHERE id = ?", [learner["id"]])
    conn.execute("INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, 'ds_dicts', 50)", [learner["id"]])
    conn.execute(
        """
        INSERT INTO user_credentials (cred_id, user_id, kind, target_id, title, recipient_name, lessons_completed, issued_at)
        VALUES ('PYM-2026-ABCDEF12', ?, 'path', 'python_core', 'Python Core', ?, 4, '2026-11-14T00:00:00Z')
        """,
        [learner["id"], learner["username"]],
    )
    conn.commit()
    conn.close()

    # 1. Semantic ingest with one matching topic + one synthetic gap topic
    ingest = client.post(
        f"/api/org/{org_id}/studio/ingest",
        json={
            "title": "Backend Python Track",
            "topics": ["Python Dictionaries", "Zx99 Quantum Flux Pipeline Unmatched"],
            "threshold": 0.25,
            "auto_generate_gaps": True,
        },
        headers=_auth(admin),
    )
    assert ingest.status_code == 200, ingest.text
    ing_data = ingest.json()
    assert ing_data["topics_count"] == 2
    assert ing_data["matched_count"] >= 1
    by_topic = {m["topic"]: m for m in ing_data["matches"]}
    assert by_topic["Python Dictionaries"]["status"] == "matched"
    assert by_topic["Zx99 Quantum Flux Pipeline Unmatched"]["status"] == "gap_queued"
    assert len(ing_data["queued_jobs"]) == 1

    # 2. Build curriculum v1.0 with Explainable Alignment Card
    matched_lid = by_topic["Python Dictionaries"]["matches"][0]["id"]
    if matched_lid.startswith("concept:") and by_topic["Python Dictionaries"]["matches"][0]["linked_lesson_ids"]:
        matched_lid = by_topic["Python Dictionaries"]["matches"][0]["linked_lesson_ids"][0]

    created = client.post(
        f"/api/org/{org_id}/studio/curricula",
        json={
            "title": "Backend Engineering Bootcamp",
            "group_name": "Cohort-Eng",
            "modules": [
                {
                    "order": 1,
                    "topic": "Python Dictionaries",
                    "lesson_id": "ds_dicts",
                    "score": 0.88,
                    "source": "lesson",
                },
            ],
        },
        headers=_auth(admin),
    )
    assert created.status_code == 200, created.text
    c_data = created.json()
    curriculum_id = c_data["curriculum_id"]
    bp = c_data["blueprint"]
    assert bp["estimated_hours"] > 0
    assert bp["hands_on_lab_coverage_pct"] == 100
    assert len(bp["module_rationales"]) == 1
    assert "88% semantic alignment" in bp["module_rationales"][0]["why_included"]

    # 3. Version bump v1.0 -> v1.1 + Impact Diff + Publish Delta
    v11 = client.post(
        f"/api/org/{org_id}/studio/curricula/{curriculum_id}/versions",
        json={
            "bump": "minor",
            "modules": [
                {"order": 1, "topic": "Python Dictionaries", "lesson_id": "ds_dicts", "source": "lesson"},
                {"order": 2, "topic": "Async Generators", "lesson_id": "adv_generators", "source": "lesson", "score": 0.72},
            ],
            "changelog": "Add Async Generators module",
            "publish_delta": True,
        },
        headers=_auth(admin),
    )
    assert v11.status_code == 200, v11.text
    vdata = v11.json()
    assert vdata["from_version"] == "v1.0"
    assert vdata["version"] == "v1.1"
    assert vdata["impact_diff"]["affected_learners"] == 1
    assert vdata["impact_diff"]["delta_lesson_ids"] == ["adv_generators"]
    assert vdata["impact_diff"]["preserved_records"] == {
        "xp": True,
        "streaks": True,
        "lesson_completions": True,
        "verifiable_credentials": True,
    }

    # Verify XP, completions, and verifiable credential remained completely intact!
    conn = sqlite3.connect(os.environ["DB_PATH"])
    pts = conn.execute("SELECT points FROM users WHERE id = ?", [learner["id"]]).fetchone()[0]
    creds = conn.execute("SELECT cred_id FROM user_credentials WHERE user_id = ?", [learner["id"]]).fetchall()
    assigned = [
        r[0]
        for r in conn.execute("SELECT lesson_id FROM cohort_assigned_modules WHERE user_id = ?", [learner["id"]]).fetchall()
    ]
    conn.close()
    assert pts == 420
    assert [c[0] for c in creds] == ["PYM-2026-ABCDEF12"]
    # ds_dicts was already completed by learner, so delta publish assigned ONLY the uncompleted module!
    assert assigned == ["adv_generators"]


def test_pipeline_ast_verification_and_heap_trace(monkeypatch):
    import modules.pipeline as pipe

    monkeypatch.setattr(pipe, "_update_job_status", lambda *a, **k: None)
    monkeypatch.setattr(
        pipe,
        "call_vaathiyaar",
        lambda **k: {
            "message": json.dumps([
                {
                    "instruction": {"en": "Sum two integers cleanly."},
                    "solution": "a, b = 3, 4\nprint(a + b)",
                    "expected_output": "7",
                    "hints": ["Use + operator"],
                    "test_code": "assert a + b == 7",
                },
                {
                    "instruction": {"en": "Unsafe challenge should be repaired."},
                    "solution": "import os\nos.system('echo hacked')",
                    "expected_output": "safe_value",
                    "hints": ["Try again"],
                    "test_code": "",
                },
            ])
        },
    )
    challenges = pipe.stage_4_challenges("job1", {"title": "Arithmetic", "learning_objectives": ["Add numbers"]}, {"en": "story"})
    assert len(challenges) == 2
    assert all(ch["ast_verified"] is True for ch in challenges)
    assert all(isinstance(ch["heap_trace"], list) and len(ch["heap_trace"]) > 0 for ch in challenges)
    # Disallowed os.system challenge must have been sanitized into safe verified code
    assert "os.system" not in challenges[1]["solution"]
