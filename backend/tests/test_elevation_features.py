"""Tests for curriculum visibility, Vaathiyaar active learning, curated paths,
concept graph links, adaptive arcade scaffolding, pipeline fallbacks,
public Python guides, and verifiable credentials.
"""

import importlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def app_env(tmp_path, monkeypatch):
    db_file = str(tmp_path / "elevation.db")
    monkeypatch.setenv("DB_PATH", db_file)
    monkeypatch.setenv("JWT_SECRET", "elevation-test-secret-long-enough-1234567890")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.setenv("VAATHIYAAR_ACTIVE_LLM", "0")

    import main as m
    importlib.reload(m)
    m.init_db()

    import routes.paths as paths_routes
    monkeypatch.setattr(paths_routes, "DB_PATH", db_file)

    client = TestClient(m.app)
    return client, db_file


def _register_user(client: TestClient, username: str = "elev_learner", name: str = "Ada Lovelace"):
    res = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "StrongPassword123!",
            "name": name,
        },
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    return payload["id"], {"Authorization": f"Bearer {payload['token']}"}


# ---------------------------------------------------------------------------
# 1. Curriculum Visibility & Module Ordering
# ---------------------------------------------------------------------------


def test_trending_ai_visibility_and_module_order(app_env):
    client, db_file = app_env
    from routes.classroom import _MODULE_ORDER

    for track in (
        "ai_agents",
        "ai_engineering",
        "deep_learning",
        "trending_ai",
        "python_modern",
        "testing_quality",
        "async_concurrency",
        "dsa",
    ):
        assert track in _MODULE_ORDER, f"Missing _MODULE_ORDER entry for {track}"
        assert len(_MODULE_ORDER[track]) >= 1

    # Verify beginner, intermediate, and advanced learners get trending_ai recommended
    for idx, (level, motivation) in enumerate(
        (("beginner", "career_switch"), ("intermediate", "ai_ml"), ("advanced", "work"))
    ):
        uid, headers = _register_user(client, username=f"vis_{level}_{idx}")
        conn = sqlite3.connect(db_file)
        conn.execute(
            """INSERT OR REPLACE INTO user_profiles
               (user_id, skill_level, goal, motivation, user_type)
               VALUES (?, ?, 'web', ?, 'student')""",
            [str(uid), level, motivation],
        )
        conn.commit()
        conn.close()

        res = client.get(f"/api/classroom/lessons?user_id={uid}", headers=headers)
        assert res.status_code == 200, res.text
        lessons = res.json()["lessons"]
        trending_lessons = [
            l for l in lessons if l.get("module") == "trending_ai" or l.get("track") == "trending_ai"
        ]
        assert len(trending_lessons) >= 50, (
            f"Expected >=50 trending_ai lessons for {level}, got {len(trending_lessons)}"
        )
        assert all(l.get("recommended") is True for l in trending_lessons), (
            f"Expected all trending_ai lessons recommended=True for {level}"
        )


# ---------------------------------------------------------------------------
# 2. Vaathiyaar Active Learning: /code-review & /teach-back
# ---------------------------------------------------------------------------


def test_code_review_auth_and_validation(app_env):
    client, _ = app_env
    unauth = client.post("/api/classroom/code-review", json={"code": "x = 1"})
    assert unauth.status_code == 401

    _, headers = _register_user(client, username="reviewer_val")
    empty_res = client.post("/api/classroom/code-review", json={"code": "   "}, headers=headers)
    assert empty_res.status_code == 422

    huge_res = client.post("/api/classroom/code-review", json={"code": "x = 1\n" * 4000}, headers=headers)
    assert huge_res.status_code == 422


def test_code_review_pythonic_vs_antipatterns_and_latency(app_env):
    client, _ = app_env
    _, headers = _register_user(client, username="reviewer_ast")

    clean_code = '''
def summarize_scores(scores: list[int], path: str) -> str:
    """Return formatted non-negative score summary."""
    valid = [s * 2 for s in scores if s >= 0]
    with open(path, encoding="utf-8") as handle:
        header = handle.readline().strip()
    return f"{header}: {len(valid)}"
'''
    t0 = time.perf_counter()
    res_clean = client.post(
        "/api/classroom/code-review",
        json={"lesson_id": "comprehensions", "code": clean_code, "challenge_prompt": "Summarize scores"},
        headers=headers,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert res_clean.status_code == 200, res_clean.text
    assert elapsed_ms < 50.0, f"Expected <50ms deterministic review, took {elapsed_ms:.2f}ms"

    clean_body = res_clean.json()
    assert 92 <= clean_body["score"] <= 100
    assert isinstance(clean_body["headline"], str) and clean_body["headline"]
    assert len(clean_body["strengths"]) >= 2
    assert isinstance(clean_body["suggestions"], list)
    assert isinstance(clean_body["pythonic_tip"], str) and clean_body["pythonic_tip"]

    anti_code = '''
def collect(items, flag=True, cache=[]):
    f = open("data.txt")
    out = ""
    res = []
    try:
        if cache == None and flag == True:
            for i in range(len(items)):
                out += str(items[i])
            for x in items:
                res.append(x * 2)
    except:
        pass
    return out, res
'''
    res_anti = client.post(
        "/api/classroom/code-review",
        json={"code": anti_code},
        headers=headers,
    )
    assert res_anti.status_code == 200, res_anti.text
    anti_body = res_anti.json()
    assert 70 <= anti_body["score"] < clean_body["score"]
    joined_suggestions = " ".join(anti_body["suggestions"])
    assert "enumerate" in joined_suggestions
    assert "with open" in joined_suggestions
    assert "except" in joined_suggestions
    assert "Mutable default" in joined_suggestions
    assert "is None" in joined_suggestions

    # Syntax error never crashes endpoint
    res_syntax = client.post(
        "/api/classroom/code-review",
        json={"code": "def broken(:\n    return 1"},
        headers=headers,
    )
    assert res_syntax.status_code == 200
    syn_body = res_syntax.json()
    assert syn_body["score"] == 70
    assert any("SyntaxError" in s for s in syn_body["suggestions"])


def test_teach_back_scoring_signal_and_anti_farming_xp(app_env):
    client, db_file = app_env
    unauth = client.post(
        "/api/classroom/teach-back",
        json={"concept": "generators", "explanation": "Generators yield values lazily one at a time."},
    )
    assert unauth.status_code == 401

    uid, headers = _register_user(client, username="protege_user")
    conn = sqlite3.connect(db_file)
    pts_before = conn.execute("SELECT points FROM users WHERE id = ?", [uid]).fetchone()[0]
    conn.close()

    # Too short -> 422
    short_res = client.post(
        "/api/classroom/teach-back",
        json={"concept": "generators", "explanation": "too short"},
        headers=headers,
    )
    assert short_res.status_code == 422

    # First rich teach-back -> mastered, awards 15 XP
    rich_explanation = (
        "Python generators pause execution and yield one item at a time instead of building "
        "a full list in memory. Because state is suspended on each `yield`, iterating over "
        "`def count_up(n): yield i` uses constant memory even for millions of items."
    )
    res1 = client.post(
        "/api/classroom/teach-back",
        json={
            "concept": "Generators",
            "explanation": rich_explanation,
            "lesson_id": "generators_iterators",
        },
        headers=headers,
    )
    assert res1.status_code == 200, res1.text
    b1 = res1.json()
    assert b1["clarity_score"] == 5
    assert b1["verdict"] == "mastered"
    assert b1["xp_awarded"] == 15
    assert b1["what_landed"]
    assert b1["follow_up_question"]

    # Second teach-back on same concept (different case) -> 0 XP (anti-farming)
    res2 = client.post(
        "/api/classroom/teach-back",
        json={
            "concept": "  generators  ",
            "explanation": rich_explanation,
        },
        headers=headers,
    )
    assert res2.status_code == 200
    assert res2.json()["xp_awarded"] == 0

    # Verify learning_signals recorded teach_back rows and user points increased by exactly 15
    conn = sqlite3.connect(db_file)
    sig_count = conn.execute(
        "SELECT COUNT(*) FROM learning_signals WHERE CAST(user_id AS TEXT) = ? AND signal_type = 'teach_back'",
        [str(uid)],
    ).fetchone()[0]
    pts_after = conn.execute("SELECT points FROM users WHERE id = ?", [uid]).fetchone()[0]
    conn.close()
    assert sig_count == 2
    assert pts_after - pts_before == 15


# ---------------------------------------------------------------------------
# 3. Curated Flagship Learning Paths
# ---------------------------------------------------------------------------


def test_new_flagship_learning_paths_have_verified_lessons(app_env):
    client, _ = app_env
    from paths.definitions import PATHS, PATH_DEFINITIONS

    assert PATHS is PATH_DEFINITIONS
    by_id = {tup[0]: tup for tup in PATH_DEFINITIONS}

    lessons_root = Path(__file__).resolve().parents[1] / "lessons"
    disk_ids = set()
    for fp in lessons_root.rglob("*.json"):
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
            if isinstance(d, dict) and "practice_challenges" in d:
                disk_ids.add(d.get("id") or fp.stem)
        except Exception:
            continue

    expected_paths = {
        "ai_engineering_pro": ("AI Engineering & Production LLMs", 14, 18),
        "autonomous_ai_agents": ("Autonomous AI Agents & Tool Use", 12, 15),
        "modern_python_dl": ("Modern Python & Deep Learning", 14, 16),
    }
    for pid, (title, min_len, max_len) in expected_paths.items():
        assert pid in by_id, f"Missing flagship path {pid}"
        tup = by_id[pid]
        assert tup[1] == title
        seq = json.loads(tup[8])
        assert min_len <= len(seq) <= max_len, f"{pid} has {len(seq)} lessons"
        assert len(seq) == len(set(seq)), f"Duplicate lessons in {pid}"
        missing = [lid for lid in seq if lid not in disk_ids]
        assert not missing, f"{pid} references missing lessons: {missing}"

    res = client.get("/api/paths")
    assert res.status_code == 200
    returned_ids = {p["id"] for p in res.json()["paths"]}
    for pid in expected_paths:
        assert pid in returned_ids


# ---------------------------------------------------------------------------
# 4. Concept Graph Gaps Closed
# ---------------------------------------------------------------------------


def test_closed_concept_graph_gaps():
    links_path = Path(__file__).resolve().parents[1] / "graph" / "concept_links.json"
    links = json.loads(links_path.read_text(encoding="utf-8"))
    gaps = set(links.get("_gaps", []))

    newly_closed = {
        "string_basics",
        "string_formatting",
        "class_methods",
        "abc_module",
        "os_module",
        "sys_module",
        "random_module",
        "deployment",
        "data_pipelines",
        "exploratory_analysis",
        "sklearn_pipelines",
        "dl_project",
        "code_quality",
        "api_automation",
        "sagemaker",
    }
    for cid in newly_closed:
        assert cid in links and len(links[cid]) >= 1, f"Expected {cid} in concept_links.json"
        assert cid not in gaps, f"Expected {cid} removed from _gaps"


# ---------------------------------------------------------------------------
# 5. Adaptive Arcade Scaffolding & Pipeline Fallbacks
# ---------------------------------------------------------------------------


def test_adaptive_compute_scaffold_includes_arcade_session(app_env):
    _, db_file = app_env
    from vaathiyaar.adaptive import _learner_material, compute_scaffold
    from vaathiyaar.profiler import record_signal

    record_signal(
        db_file,
        user_id="4242",
        signal_type="arcade_session",
        topic="bug_hunt",
        value={
            "board": "loops",
            "score": 100,
            "answered": 6,
            "correct": 1,
            "items": [
                {"id": f"q{i}", "topic": "loops", "correct": (i == 0), "misconception": "off-by-one range"}
                for i in range(6)
            ],
        },
    )

    scaffold = compute_scaffold(db_file, "4242")
    assert scaffold["level"] == "high"
    assert any("game answers wrong" in r for r in scaffold["reasons"])

    material = _learner_material(db_file, "4242")
    assert any("off-by-one range" in g for g in material["games"])


def test_pipeline_stage5_populates_fallback_quiz_and_under_the_hood(app_env):
    _, db_file = app_env
    from modules.pipeline import stage_5_assembly
    from vaathiyaar.topic_uth import validate_under_the_hood

    job_id = "job_elev_uth_1"
    conn = sqlite3.connect(db_file)
    conn.execute(
        "INSERT INTO module_generation_jobs (id, user_id, topic, status, trigger) VALUES (?, '1', 'decorators', 'running', 'manual')",
        [job_id],
    )
    conn.commit()
    conn.close()

    outline = {
        "title": "Decorators Deep Dive",
        "track": "python_intermediate",
        "module": "decorators",
        "description": "Wrap functions cleanly with functools.wraps.",
        "objectives": ["Wrap functions cleanly with functools.wraps"],
        "xp_reward": 75,
    }
    narrative = {"en": "Decorators wrap a callable to extend behavior without modifying its body."}
    animation = {"animation_sequence": []}
    challenges = [
        {
            "id": "ch_1",
            "type": "write",
            "instruction": {"en": "Print 'wrapped'"},
            "starter_code": "print('wrapped')",
            "expected_output": "wrapped",
            "hints": {"en": ["Use print"]},
        }
    ]
    lesson_id = stage_5_assembly(job_id, "1", "Decorators", outline, narrative, animation, challenges)
    conn = sqlite3.connect(db_file)
    raw_json = conn.execute("SELECT lesson_data FROM generated_lessons WHERE id = ?", [lesson_id]).fetchone()[0]
    conn.close()
    lesson = json.loads(raw_json)

    assert isinstance(lesson.get("quiz"), list) and len(lesson["quiz"]) >= 1
    q0 = lesson["quiz"][0]
    opts_en = q0["options"]["en"] if isinstance(q0.get("options"), dict) else q0.get("options")
    assert isinstance(opts_en, list) and len(opts_en) >= 3
    assert 0 <= q0.get("correct", -1) < len(opts_en)

    assert isinstance(lesson.get("under_the_hood"), dict)
    problems = validate_under_the_hood(lesson["under_the_hood"])
    assert problems == [], f"Fallback under_the_hood failed validation: {problems}"


# ---------------------------------------------------------------------------
# 6. Public Python Guides API & Verifiable Credentials API
# ---------------------------------------------------------------------------


def test_public_guides_endpoints(app_env):
    client, _ = app_env
    res = client.get("/api/guides")
    assert res.status_code == 200, res.text
    guides = res.json()["guides"]
    assert len(guides) >= 6

    required_keys = {"slug", "title", "description", "reading_minutes", "tags", "updated_at"}
    for g in guides:
        assert required_keys.issubset(g.keys())
        assert isinstance(g["reading_minutes"], int) and g["reading_minutes"] > 0
        assert isinstance(g["tags"], list)

    # Sorted by title lowercase
    titles = [g["title"].lower() for g in guides]
    assert titles == sorted(titles)

    # Fetch single guide
    detail = client.get("/api/guides/minilm-semantic-search-from-scratch")
    assert detail.status_code == 200, detail.text
    dbody = detail.json()
    assert dbody["slug"] == "minilm-semantic-search-from-scratch"
    assert len(dbody["content_markdown"]) > 100

    # Reject path traversal / invalid characters
    bad = client.get("/api/guides/..%2Fsecret")
    assert bad.status_code in (400, 404)
    bad_chars = client.get("/api/guides/UPPER_CASE!")
    assert bad_chars.status_code == 400

    # Unknown valid slug -> 404
    missing = client.get("/api/guides/nonexistent-guide-slug-xyz")
    assert missing.status_code == 404


def test_verifiable_credentials_lifecycle(app_env):
    client, db_file = app_env
    from paths.definitions import PATH_DEFINITIONS

    # Auth required on /mine and /claim
    assert client.get("/api/credentials/mine").status_code == 401
    assert client.post("/api/credentials/claim", json={"kind": "path", "target_id": "ai_agents_builder"}).status_code == 401

    uid, headers = _register_user(client, username="cred_scholar", name="Grace Hopper")

    target_pid = "autonomous_ai_agents"
    target_tup = next(t for t in PATH_DEFINITIONS if t[0] == target_pid)
    lessons = json.loads(target_tup[8])

    # Mark 2 lessons complete -> should appear in in_progress, claim should 400
    conn = sqlite3.connect(db_file)
    for lid in lessons[:2]:
        conn.execute(
            "INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, 50)",
            [str(uid), lid],
        )
    conn.commit()
    conn.close()

    mine_partial = client.get("/api/credentials/mine", headers=headers)
    assert mine_partial.status_code == 200
    mp = mine_partial.json()
    assert mp["issued"] == []
    assert any(p["target_id"] == target_pid and p["lessons_completed"] == 2 for p in mp["in_progress"])

    premature = client.post(
        "/api/credentials/claim",
        json={"kind": "path", "target_id": target_pid},
        headers=headers,
    )
    assert premature.status_code == 400

    unknown = client.post(
        "/api/credentials/claim",
        json={"kind": "path", "target_id": "nonexistent_path_id"},
        headers=headers,
    )
    assert unknown.status_code == 404

    # Complete remaining lessons -> moves to claimable
    conn = sqlite3.connect(db_file)
    for lid in lessons[2:]:
        conn.execute(
            "INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, 50)",
            [str(uid), lid],
        )
    conn.commit()
    conn.close()

    mine_ready = client.get("/api/credentials/mine", headers=headers).json()
    assert any(c["target_id"] == target_pid and c["lessons_completed"] == len(lessons) for c in mine_ready["claimable"])

    # Claim credential
    claim_res = client.post(
        "/api/credentials/claim",
        json={"kind": "path", "target_id": target_pid},
        headers=headers,
    )
    assert claim_res.status_code == 200, claim_res.text
    cred = claim_res.json()
    assert cred["cred_id"].startswith("PYM-")
    assert len(cred["cred_id"].split("-")[-1]) == 8
    assert cred["recipient_name"] == "Grace Hopper"
    assert cred["lessons_completed"] == len(lessons)
    assert cred["issuer"] == "PyMasters"

    # Idempotent re-claim returns exact same cred_id
    reclaim_res = client.post(
        "/api/credentials/claim",
        json={"kind": "path", "target_id": target_pid},
        headers=headers,
    )
    assert reclaim_res.status_code == 200
    assert reclaim_res.json()["cred_id"] == cred["cred_id"]

    # Public verification works without auth and is case-insensitive
    verify_res = client.get(f"/api/credentials/verify/{cred['cred_id'].lower()}")
    assert verify_res.status_code == 200, verify_res.text
    vbody = verify_res.json()
    assert vbody["valid"] is True
    assert vbody["cred_id"] == cred["cred_id"]
    assert vbody["recipient_name"] == "Grace Hopper"
    assert vbody["issuer"] == "PyMasters"
    assert vbody["partner_note"] == "OpenEDG Python Institute Education Partner"

    # Unknown credential returns 404
    assert client.get("/api/credentials/verify/PYM-2026-DEADBEEF").status_code == 404
    assert client.get("/api/credentials/verify/not-a-valid-id").status_code == 404
