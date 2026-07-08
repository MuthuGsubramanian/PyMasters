"""
Tests for the lesson translation + cache layer (2026-07-08). Covers the pure
message builder, the source-hash invalidation, and the cache-first round trip
with the actual LLM call monkeypatched out (no network in unit tests).
"""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar import translator


def test_message_builder_preserves_code_instruction():
    msgs = translator.build_translation_messages("## Hi\n`x = 1`", "ta", kind="story")
    assert msgs[0]["role"] == "system"
    assert "Tamil" in msgs[0]["content"]
    assert "code" in msgs[0]["content"].lower()
    assert msgs[1]["content"] == "## Hi\n`x = 1`"


def test_message_builder_kinds_differ():
    story = translator.build_translation_messages("x", "te", kind="story")[0]["content"]
    title = translator.build_translation_messages("x", "te", kind="title")[0]["content"]
    assert story != title
    assert "Telugu" in story


def test_translate_text_english_is_identity(monkeypatch):
    # Never calls the model for English.
    called = {"n": 0}
    monkeypatch.setattr(translator, "translate_text", translator.translate_text)
    assert translator.translate_text("hello", "en") == "hello"


def test_story_preserves_code_fences_verbatim(monkeypatch):
    # Only prose chunks reach the model; code fences pass through untouched.
    monkeypatch.setattr(translator, "_translate_chunk",
                        lambda text, lang, kind: "TRANSLATED")
    src = "Intro prose.\n\n```python\nname = 'PyMaster'\nage = 25\n```\n\nMore prose."
    out = translator.translate_text(src, "ta", kind="story")
    assert "```python\nname = 'PyMaster'\nage = 25\n```" in out
    assert out.count("```") == 2
    assert "TRANSLATED" in out


def test_story_multiple_code_blocks_all_preserved(monkeypatch):
    monkeypatch.setattr(translator, "_translate_chunk", lambda t, l, k: "X")
    src = "a\n```\nc1\n```\nb\n```\nc2\n```\nd"
    out = translator.translate_text(src, "ta", kind="story")
    assert out.count("```") == 4
    assert "c1" in out and "c2" in out


def test_source_hash_changes_with_content():
    assert translator.source_hash("a") != translator.source_hash("b")
    assert translator.source_hash("a") == translator.source_hash("a")


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "t.db")
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE lesson_translations (
            lesson_id TEXT, lang TEXT, field TEXT, content TEXT, source_hash TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (lesson_id, lang, field)
        )
    """)
    conn.commit()
    conn.close()
    return path


def test_cache_roundtrip_and_hit(db, monkeypatch):
    calls = {"n": 0}
    def fake_translate(text, lang, kind="story"):
        calls["n"] += 1
        return f"[{lang}] {text}"
    monkeypatch.setattr(translator, "translate_text", fake_translate)

    out1 = translator.translate_and_cache(db, "les1", "ta", "story", "Hello world")
    assert out1 == "[ta] Hello world"
    assert calls["n"] == 1
    # Second call hits cache — no new translation.
    out2 = translator.translate_and_cache(db, "les1", "ta", "story", "Hello world")
    assert out2 == "[ta] Hello world"
    assert calls["n"] == 1


def test_cache_invalidated_when_source_changes(db, monkeypatch):
    monkeypatch.setattr(translator, "translate_text",
                        lambda t, l, kind="story": f"T:{t}")
    translator.translate_and_cache(db, "les1", "ta", "story", "v1")
    # Source text changed → stale cache ignored, re-translated.
    out = translator.translate_and_cache(db, "les1", "ta", "story", "v2")
    assert out == "T:v2"
    assert translator.get_cached_translation(db, "les1", "ta", "story", "v2") == "T:v2"
    assert translator.get_cached_translation(db, "les1", "ta", "story", "v1") is None


def test_translation_failure_returns_none_not_raises(db, monkeypatch):
    def boom(text, lang, kind="story"):
        raise RuntimeError("provider down")
    monkeypatch.setattr(translator, "translate_text", boom)
    assert translator.translate_and_cache(db, "les1", "ta", "story", "hi") is None


def test_english_and_empty_skip(db):
    assert translator.translate_and_cache(db, "les1", "en", "story", "hi") is None
    assert translator.translate_and_cache(db, "les1", "ta", "story", "") is None
