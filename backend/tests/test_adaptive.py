"""Adaptive intelligence (vaathiyaar/adaptive.py, 2026-10-27): scaffolding from implicit
signals, learner-note distillation, versioned tutor insights with regression rollback,
lesson health, prompt rendering, and the admin/learner endpoints."""

import importlib
import json
import os
import sqlite3
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def env(tmp_path, monkeypatch):
    db = str(tmp_path / "adaptive.db")
    monkeypatch.setenv("DB_PATH", db)
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "ops-token-abc")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import auth as auth_module
    import routes.admin as admin_mod
    importlib.reload(auth_module)
    importlib.reload(admin_mod)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from vaathiyaar import adaptive
    adaptive.invalidate_insights_cache()
    return {"db": db, "client": TestClient(main_mod.app), "adaptive": adaptive}


def _seed_user(db, user_id="u1"):
    conn = sqlite3.connect(db)
    conn.execute("INSERT OR IGNORE INTO users (id, username, password_hash, name, email, created_at, points, unlocked_modules, "
                 "preferred_language, onboarding_completed) VALUES (?, ?, 'x', 'Test', ?, CURRENT_TIMESTAMP, 0, '[]', 'en', 1)",
                 [user_id, user_id, f"{user_id}@example.com"])
    conn.commit()
    conn.close()


def _signal(db, user_id, stype, topic, value, when="+0 seconds"):
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
                 [os.urandom(8).hex(), user_id, stype, topic, json.dumps(value), when])
    conn.commit()
    conn.close()


def _pair(db, user_id, student, tutor, quality, when="+0 seconds"):
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO training_data (id, input_text, output_text, profile_json, context_json, quality_score, created_at) "
                 "VALUES (?, ?, ?, ?, '{}', ?, datetime('now', ?))",
                 [os.urandom(8).hex(), student, json.dumps({"message": tutor}), json.dumps({"user_id": user_id}), quality, when])
    conn.commit()
    conn.close()


def _mastery(db, user_id, topic, level, struggles=0):
    conn = sqlite3.connect(db)
    conn.execute("INSERT OR REPLACE INTO user_mastery (user_id, topic, mastery_level, attempts, avg_time_seconds, last_practiced, struggle_count) "
                 "VALUES (?, ?, ?, 3, 10, CURRENT_TIMESTAMP, ?)", [user_id, topic, level, struggles])
    conn.commit()
    conn.close()


# ── loop 1: scaffolding ─────────────────────────────────────────────────────

def test_scaffolding_defaults_to_medium_without_signal(env):
    sc = env["adaptive"].scaffolding_for(env["db"], "nobody")
    assert sc["level"] == "medium"
    assert sc["recent_fail_rate"] is None


def test_scaffolding_high_after_failed_attempts_and_frustration(env):
    db = env["db"]
    for ok in (False, False, True, False):
        _signal(db, "u1", "code_evaluation", "loops", {"success": ok, "lesson_id": "loops_1"})
    _signal(db, "u1", "profile_update", "loops", {"emotion_signal": "frustrated", "struggle_detected": True})
    _signal(db, "u1", "profile_update", "loops", {"emotion_signal": "confused", "struggle_detected": True})
    sc = env["adaptive"].scaffolding_for(db, "u1")
    assert sc["level"] == "high"
    assert any("failed" in r for r in sc["reasons"])
    assert any("frustration" in r for r in sc["reasons"])


def test_scaffolding_low_for_confident_passing_learner(env):
    db = env["db"]
    for _ in range(4):
        _signal(db, "u2", "code_evaluation", "functions", {"success": True, "lesson_id": "fn_1"})
    _signal(db, "u2", "profile_update", "functions", {"emotion_signal": "confident", "struggle_detected": False})
    _mastery(db, "u2", "functions", 0.9)
    sc = env["adaptive"].scaffolding_for(db, "u2")
    assert sc["level"] == "low"
    assert "functions" in sc["strong_topics"]


# ── prompt rendering ────────────────────────────────────────────────────────

def test_prompt_blocks_render_all_three_sections(env):
    blocks = env["adaptive"].prompt_blocks({
        "scaffolding": {"level": "high", "reasons": ["3 of the last 4 code attempts failed"]},
        "notes": [{"kind": "misconception", "note": "Confuses append with concatenation"}],
        "insights": ["Lead with a question when the learner pastes an error"],
    })
    text = "\n".join(blocks)
    assert "Scaffolding level: HIGH" in text
    assert "What You Already Know About This Student" in text and "append with concatenation" in text
    assert "Teaching Insights Learned From Past Sessions" in text and "Lead with a question" in text


def test_prompt_blocks_empty_when_no_context(env):
    assert env["adaptive"].prompt_blocks({}) == []


def test_system_prompt_includes_adaptive_sections(env):
    from vaathiyaar.modelfile import build_system_prompt
    prompt = build_system_prompt({"username": "asha", "adaptive": {
        "scaffolding": {"level": "low", "reasons": ["4 of the last 4 attempts passed"]},
        "notes": [{"kind": "preference", "note": "Likes cricket analogies"}],
        "insights": [],
    }})
    assert "Scaffolding level: LOW" in prompt
    assert "cricket analogies" in prompt


def test_student_profile_carries_adaptive_context(env):
    from vaathiyaar.profiler import save_onboarding, get_student_profile
    _seed_user(env["db"], "u3")
    save_onboarding(env["db"], "u3", {"motivation": "career", "prior_experience": "none", "known_languages": "",
                                       "learning_style": "visual", "goal": "job", "time_commitment": "1h",
                                       "preferred_language": "en"})
    profile = get_student_profile(env["db"], "u3")
    assert profile is not None
    assert profile["adaptive"]["scaffolding"]["level"] in ("high", "medium", "low")


# ── loop 2: learner notes ───────────────────────────────────────────────────

def test_distill_learner_stores_notes_and_replaces_old_ones(env):
    db, ad = env["db"], env["adaptive"]
    for i in range(4):
        _pair(db, "u1", f"why does my loop print twice {i}", "Because the print is inside the loop body.", 0.4)
    _signal(db, "u1", "code_evaluation", "loops", {"success": False, "lesson_id": "loops_1"})

    def fake_llm(messages, options):
        assert "loop print twice" in messages[-1]["content"]
        return json.dumps([
            {"kind": "misconception", "note": "Puts print() inside the loop when a single summary line is wanted", "evidence": "4 turns", "weight": 0.9},
            {"kind": "bogus", "note": "should be dropped"},
            {"kind": "preference", "note": "x"},  # too short → dropped
        ])
    first = ad.distill_learner(db, "u1", fake_llm)
    assert first == {"user_id": "u1", "notes": 1}
    notes = ad.learner_notes(db, "u1")
    assert len(notes) == 1 and notes[0]["kind"] == "misconception"

    second = ad.distill_learner(db, "u1", lambda m, o: json.dumps([
        {"kind": "strength", "note": "Reads tracebacks carefully now", "evidence": "fixed the loop on the 2nd try", "weight": 0.6},
        {"kind": "context", "note": "A note without evidence is dropped", "evidence": ""},
    ]))
    assert second["notes"] == 1
    notes = ad.learner_notes(db, "u1")
    assert [n["kind"] for n in notes] == ["strength"]  # old note deactivated, not duplicated


def test_distill_learner_skips_thin_material_and_junk_output(env):
    db, ad = env["db"], env["adaptive"]
    assert "skipped" in ad.distill_learner(db, "ghost", lambda m, o: "[]")
    for i in range(3):
        _signal(db, "u5", "lesson_viewed", "x", {"i": i})
    assert "skipped" in ad.distill_learner(db, "u5", lambda m, o: "Sorry, I cannot help with that.")
    assert ad.learner_notes(db, "u5") == []


def test_learner_can_delete_a_note(env):
    db, ad = env["db"], env["adaptive"]
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO learner_notes (id, user_id, kind, note) VALUES ('n1', 'u1', 'context', 'Uses VS Code')")
    conn.commit(); conn.close()
    assert ad.delete_learner_note(db, "u1", "n1") is True
    assert ad.delete_learner_note(db, "u1", "n1") is False  # already inactive
    assert ad.delete_learner_note(db, "other", "n1") is False
    assert ad.learner_notes(db, "u1") == []


# ── loop 3: tutor insights + regression rollback ────────────────────────────

def _seed_outcomes(db, good=5, bad=5):
    for i in range(good):
        _pair(db, f"g{i}", "my code fails", "Look at line 3: the colon is missing. Try again and tell me what prints.", 0.8)
    for i in range(bad):
        _pair(db, f"b{i}", "my code fails", "Here is the complete solution: ...", 0.4)


def test_distill_insights_versions_rules(env):
    db, ad = env["db"], env["adaptive"]
    assert "skipped" in ad.distill_insights(db, lambda m, o: "[]")  # no contrast yet
    _seed_outcomes(db)
    rules = [{"rule": f"Rule number {i} about pacing and questions", "evidence": "pattern"} for i in range(4)]
    r1 = ad.distill_insights(db, lambda m, o: json.dumps(rules))
    assert r1["version"] == 1 and r1["rules"] == 4
    assert ad.active_insights(db) == [r["rule"] for r in rules]
    r2 = ad.distill_insights(db, lambda m, o: json.dumps(rules[:3]))
    assert r2["version"] == 2
    assert len(ad.active_insights(db)) == 3
    assert "skipped" in ad.distill_insights(db, lambda m, o: json.dumps(rules[:2]))  # <3 rules → rejected, v2 stays
    assert ad.adaptive_status(db)["insights"]["active_version"] == 2


def test_regression_check_rolls_back_a_bad_version(env):
    db, ad = env["db"], env["adaptive"]
    conn = sqlite3.connect(db)
    # v1 lived from -20d; v2 went live 5 days ago and outcomes collapsed afterwards.
    for i in range(3):
        conn.execute("INSERT INTO tutor_insights (id, version, rule, active, created_at) VALUES (?, 1, ?, 0, datetime('now','-20 days'))", [f"a{i}", f"old rule {i}"])
        conn.execute("INSERT INTO tutor_insights (id, version, rule, active, created_at) VALUES (?, 2, ?, 1, datetime('now','-5 days'))", [f"b{i}", f"new rule {i}"])
    conn.commit(); conn.close()
    for i in range(25):
        _pair(db, "x", "q", "a", 0.8, when="-9 days")   # before v2: 100% good
    for i in range(25):
        _pair(db, "x", "q", "a", 0.4, when="-2 days")   # after v2: 0% good
    res = ad.check_insights_regression(db)
    assert res["checked"] and res["rolled_back"] and res["restored_version"] == 1
    assert ad.active_insights(db) == ["old rule 0", "old rule 1", "old rule 2"]


def test_regression_check_needs_enough_data(env):
    db, ad = env["db"], env["adaptive"]
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO tutor_insights (id, version, rule, active, created_at) VALUES ('c1', 1, 'r', 1, datetime('now','-5 days'))")
    conn.commit(); conn.close()
    _pair(db, "x", "q", "a", 0.8, when="-9 days")
    _pair(db, "x", "q", "a", 0.4, when="-2 days")
    res = ad.check_insights_regression(db)
    assert res["checked"] and not res.get("rolled_back")
    assert ad.active_insights(db) == ["r"]


# ── loop 4 + orchestration + endpoints ──────────────────────────────────────

def test_lesson_health_flags_low_pass_rate(env):
    db, ad = env["db"], env["adaptive"]
    for ok in (False, False, False, True):
        _signal(db, "u1", "code_evaluation", "recursion", {"success": ok, "lesson_id": "rec_1"})
    for ok in (True, True):
        _signal(db, "u2", "code_evaluation", "strings", {"success": ok, "lesson_id": "str_1"})
    rows = ad.lesson_health(db)
    assert rows[0]["lesson_id"] == "rec_1" and rows[0]["flag"] == "revise" and rows[0]["pass_rate"] == 0.25
    assert [r["lesson_id"] for r in rows if r["lesson_id"] == "str_1"][0] == "str_1"


def test_learning_cycle_logs_a_run_and_handles_llm_failure(env):
    db, ad = env["db"], env["adaptive"]
    for i in range(3):
        _pair(db, "u1", "q", "a", 0.4)
    _seed_outcomes(db)

    def exploding(messages, options):
        raise RuntimeError("provider down")
    summary = ad.run_learning_cycle(db, llm=exploding)
    assert summary["active_learners"] >= 1
    assert any("insights" in e for e in summary["errors"]) or summary["insights"] is None
    status = ad.adaptive_status(db)
    assert status["recent_runs"][0]["kind"] == "learning_cycle"
    dry = ad.run_learning_cycle(db, llm=exploding, dry_run=True)
    assert dry["dry_run"] and dry["insights"] is None and dry["learners"] == []


def test_admin_and_learner_endpoints(env):
    client, db = env["client"], env["db"]
    tok = client.post("/api/admin/service-login", json={"token": "ops-token-abc"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = client.get("/api/admin/vaathiyaar/adaptive", headers=h)
    assert r.status_code == 200 and r.json()["enabled"] is True
    assert client.get("/api/admin/vaathiyaar/lesson-health", headers=h).status_code == 200
    assert client.post("/api/admin/vaathiyaar/learn?dry_run=true", headers=h).json()["dry_run"] is True
    assert client.post("/api/admin/vaathiyaar/insights/42/deactivate", headers=h).status_code == 404
    # learner-facing notes: the ops account can read its own, not someone else's
    me = client.post("/api/admin/service-login", json={"token": "ops-token-abc"}).json()["user_id"]
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO learner_notes (id, user_id, kind, note) VALUES ('n9', ?, 'context', 'Prefers short answers')", [me])
    conn.commit(); conn.close()
    r = client.get(f"/api/profile/{me}/learner-notes", headers=h)
    assert r.status_code == 200 and r.json()["notes"][0]["note"] == "Prefers short answers"
    assert client.get("/api/profile/someone-else/learner-notes", headers=h).status_code in (403, 404)
    assert client.delete(f"/api/profile/{me}/learner-notes/n9", headers=h).status_code == 200
    assert client.get(f"/api/profile/{me}/learner-notes", headers=h).json()["notes"] == []
    assert client.get("/api/admin/vaathiyaar/adaptive").status_code in (401, 403)  # anonymous


def test_feedback_reason_is_recorded_and_reaches_insight_material(env):
    client, db, ad = env["client"], env["db"], env["adaptive"]
    tok = client.post("/api/admin/service-login", json={"token": "ops-token-abc"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO training_data (id, input_text, output_text, profile_json, context_json, quality_score) "
                 "VALUES ('p1', 'help with loops', '{\"message\": \"Here is everything about loops...\"}', '{}', '{}', 0.4)")
    conn.commit(); conn.close()
    r = client.post("/api/classroom/feedback", json={"pair_id": "p1", "helpful": False, "reason": "too_long"}, headers=h)
    assert r.status_code == 200 and r.json()["reason_recorded"] is True
    _seed_outcomes(db, good=4, bad=3)
    captured = {}

    def llm(messages, options):
        captured["prompt"] = messages[-1]["content"]
        return "[]"
    ad.distill_insights(db, llm)
    assert '"learner_said": "too_long"' in captured["prompt"]
    # anonymous feedback still updates quality but cannot attach a reason to a user
    r = client.post("/api/classroom/feedback", json={"pair_id": "p1", "helpful": True, "reason": "x"})
    assert r.status_code == 200 and r.json()["reason_recorded"] is False


def test_contrast_prefers_next_attempt_labels_and_skips_junk(env):
    """Feedback on a failed submission is GOOD when the learner's next attempt (same lesson, <3 h) passes."""
    db, ad = env["db"], env["adaptive"]
    conn = sqlite3.connect(db)
    for i in range(5):
        uid = f"h{i}"
        # tutor reply to a failing attempt, then a passing attempt 10 minutes later
        conn.execute("INSERT INTO training_data (id, input_text, output_text, profile_json, context_json, quality_score, created_at) "
                     "VALUES (?, 'My code for loops fails', ?, ?, ?, 0.4, datetime('now','-2 days'))",
                     [f"good{i}", json.dumps({"message": "Line 2: the loop never increments i. What should change?"}),
                      json.dumps({"user_id": uid}), json.dumps({"lesson_id": "loops_1"})])
        conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, created_at) VALUES (?, ?, 'code_evaluation', 'loops', ?, datetime('now','-2 days','+10 minutes'))",
                     [f"sg{i}", uid, json.dumps({"success": True, "lesson_id": "loops_1"})])
        uid = f"m{i}"
        conn.execute("INSERT INTO training_data (id, input_text, output_text, profile_json, context_json, quality_score, created_at) "
                     "VALUES (?, 'My code for loops fails', ?, ?, ?, 0.4, datetime('now','-2 days'))",
                     [f"poor{i}", json.dumps({"message": "Here is the full corrected program: ..."}),
                      json.dumps({"user_id": uid}), json.dumps({"lesson_id": "loops_1"})])
        conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, created_at) VALUES (?, ?, 'code_evaluation', 'loops', ?, datetime('now','-2 days','+10 minutes'))",
                     [f"sm{i}", uid, json.dumps({"success": False, "lesson_id": "loops_1"})])
    # junk fallback scored 0.8 must never become an example; praise-after-pass is skipped too
    conn.execute("INSERT INTO training_data (id, input_text, output_text, profile_json, context_json, quality_score, created_at) "
                 "VALUES ('junk', 'x', ?, '{}', '{}', 0.8, datetime('now','-1 days'))",
                 [json.dumps({"message": "I couldn't reach the AI server right now, but I noticed your code ran correctly!"})])
    conn.commit(); conn.close()
    good, poor, mode = ad._contrast_examples(db, days=30)
    assert mode == "next_attempt"
    assert len(good) == 5 and all("never increments" in g["tutor"] for g in good)
    assert len(poor) == 5 and all("full corrected" in p["tutor"] for p in poor)
    captured = {}
    ad.distill_insights(db, lambda m, o: captured.setdefault("prompt", m[-1]["content"]) and "[]")
    assert "NEXT attempt on the same lesson passed" in captured["prompt"]
    assert "couldn't reach the AI" not in captured["prompt"]



# ── game evidence (Learn While You Play) ─────────────────────────────────────

def _game_round(db, user_id, items, when="+0 seconds", game="output_oracle", level=1):
    _signal(db, user_id, "game_round", game,
            {"level": level, "mode": "practice", "score": sum(1 for i in items if i[1]), "max_score": len(items),
             "items": [{"id": f"i{n}", "topic": t, "correct": ok, "misconception": None if ok else mc, "ms": 3000}
                       for n, (t, ok, mc) in enumerate(items)]}, when)


def test_material_summarises_game_rounds(env):
    db = env["db"]
    _game_round(db, "g1", [("variables", False, "int_division"), ("lists", True, None), ("variables", False, "int_division")])
    _game_round(db, "g1", [("for_loops", False, "off_by_one"), ("variables", True, None)])
    mat = env["adaptive"]._learner_material(db, "g1")
    assert mat["games"], mat
    assert any("int_division" in line and "2 misses" in line and "Output Oracle" in line for line in mat["games"]), mat["games"]
    assert all(s["type"] != "game_round" for s in mat["signals"])


def test_scaffolding_game_accuracy_breaks_tie_only(env):
    db = env["db"]
    # medium by default; 2 of 8 game answers right → high
    _game_round(db, "g2", [("variables", False, "a"), ("lists", False, "b"), ("lists", False, "b"), ("variables", True, None)])
    _game_round(db, "g2", [("variables", False, "a"), ("lists", False, "b"), ("lists", False, "b"), ("variables", True, None)])
    sc = env["adaptive"].scaffolding_for(db, "g2")
    assert sc["level"] == "high" and any("game answers wrong" in r for r in sc["reasons"])
    # a Classroom fail streak stays high even when games go perfectly
    for _ in range(3):
        _signal(db, "g3", "code_evaluation", "loops", {"success": False, "lesson_id": "loops_1"})
    _game_round(db, "g3", [("variables", True, None)] * 8)
    sc3 = env["adaptive"].scaffolding_for(db, "g3")
    assert sc3["level"] == "high"
    # medium + 8/8 right → low
    _game_round(db, "g4", [("variables", True, None)] * 8)
    sc4 = env["adaptive"].scaffolding_for(db, "g4")
    assert sc4["level"] == "low" and any("game answers right" in r for r in sc4["reasons"])


def test_game_only_mastery_rows_are_not_weak_topics(env):
    """A learner who merely touched topics in a game (attempts = 0, tiny level) must not be
    flagged 'low mastery' and pushed to high scaffolding."""
    db = env["db"]
    conn = sqlite3.connect(db)
    for t in ("lists", "gradient_descent", "conditionals"):
        conn.execute("INSERT INTO user_mastery (user_id, topic, mastery_level, attempts, struggle_count) VALUES ('g5', ?, 0.06, 0, 0)", [t])
    conn.commit(); conn.close()
    sc = env["adaptive"].scaffolding_for(db, "g5")
    assert sc["level"] == "medium", sc
    assert "lists" not in sc["weak_topics"]


def test_game_summary_skips_unattempted_items(env):
    db = env["db"]
    _game_round(db, "g6", [("gradient_descent", False, "not_attempted"), ("gradient_descent", False, "lr_too_high")], game="gradient_golf")
    mat = env["adaptive"]._learner_material(db, "g6")
    assert any("lr_too_high" in line for line in mat["games"])
    assert not any("not_attempted" in line for line in mat["games"])
