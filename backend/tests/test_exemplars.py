"""Golden-exemplar layer (vaathiyaar/exemplars.py, 2026-10-26)."""

import json
import sqlite3

import pytest

from vaathiyaar import exemplars

PERSONA = "You are Vaathiyaar.\n## Username Personalization\n- ALWAYS address…\nLesson ID: lists_intro"
JUNK = json.dumps({"message": "I couldn't reach the AI server right now, but I noticed your code ran correctly!"})


def _db(tmp_path, rows):
    p = str(tmp_path / "t.db")
    c = sqlite3.connect(p)
    c.execute("CREATE TABLE training_data (id TEXT PRIMARY KEY, input_text TEXT, output_text TEXT, "
              "profile_json TEXT, context_json TEXT, quality_score REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    for i, (inp, out, lesson, q) in enumerate(rows):
        c.execute("INSERT INTO training_data (id,input_text,output_text,profile_json,context_json,quality_score) VALUES (?,?,?,?,?,?)",
                  [str(i), inp, out, "{}", json.dumps({"lesson_id": lesson}), q])
    c.commit(); c.close()
    exemplars.invalidate_cache()
    return p


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.setattr(exemplars, "EXEMPLARS_ENABLED", True)
    exemplars.invalidate_cache()


def test_junk_fallback_outputs_are_never_selected(tmp_path):
    db = _db(tmp_path, [
        ("how do python lists work", JUNK, "lists_intro", 0.85),
        ("explain python lists please", json.dumps({"message": "A list is an ordered, mutable sequence…"}), "lists_intro", 0.9),
    ])
    picks = exemplars.select_exemplars(db, "what is a python list", lesson_id="lists_intro")
    assert [p["output"][:6] for p in picks] == ["A list"]


def test_is_junk_output_detects_breather_and_malformed():
    assert exemplars.is_junk_output(JUNK)
    assert exemplars.is_junk_output('{"message": "Vaathiyaar is taking a quick breather"}')
    assert exemplars.is_junk_output("{not json")
    assert not exemplars.is_junk_output('{"message": "Use enumerate() to get index and value."}')
    assert not exemplars.is_junk_output("plain text answer about dicts")


def test_unrelated_rows_are_skipped_rather_than_forced(tmp_path):
    db = _db(tmp_path, [("regex lookahead question", json.dumps({"message": "Lookahead is (?=…)"}), "regex_basics", 0.9)])
    assert exemplars.select_exemplars(db, "how do I sort a dict by value") == []
    assert exemplars.exemplar_block(db, "how do I sort a dict by value") == ""


def test_same_lesson_bonus_and_k_limit(tmp_path):
    rows = [(f"question about loops number {i}", json.dumps({"message": f"answer {i}"}), "for_loops", 0.8) for i in range(6)]
    rows.append(("question about loops from another lesson", json.dumps({"message": "other"}), "while_loops", 0.95))
    db = _db(tmp_path, rows)
    picks = exemplars.select_exemplars(db, "question about loops", lesson_id="for_loops", k=3)
    assert len(picks) == 3 and all(p["lesson_id"] == "for_loops" for p in picks)


def test_enrich_messages_only_touches_tutor_persona(tmp_path):
    db = _db(tmp_path, [("python list append", json.dumps({"message": "append() adds one item to the end."}), "lists_intro", 0.9)])
    tutor = [{"role": "system", "content": PERSONA}, {"role": "user", "content": "how does list append work"}]
    out = exemplars.enrich_messages(tutor, db)
    assert "## Golden Examples" in out[0]["content"] and "append() adds one item" in out[0]["content"]
    assert out[1:] == tutor[1:] and "## Golden Examples" not in tutor[0]["content"]  # input not mutated
    # Second pass is idempotent.
    assert exemplars.enrich_messages(out, db)[0]["content"].count("## Golden Examples") == 1
    # Generation-pipeline style prompt (no persona marker) is left alone.
    gen = [{"role": "system", "content": "Return JSON lesson for topic X"}, {"role": "user", "content": "list append"}]
    assert exemplars.enrich_messages(gen, db) is gen


def test_missing_table_or_db_is_silent(tmp_path):
    assert exemplars.exemplar_block(str(tmp_path / "nope.db"), "python lists") == ""


def test_disabled_flag_short_circuits(tmp_path, monkeypatch):
    db = _db(tmp_path, [("python list append", json.dumps({"message": "append()…"}), "lists_intro", 0.9)])
    monkeypatch.setattr(exemplars, "EXEMPLARS_ENABLED", False)
    assert exemplars.exemplar_block(db, "python list append") == ""
