"""
Guards for the on-demand lesson-translation wrapper in routes/classroom.py
(2026-07-08). The feature must be killable via env and must never raise into
the lesson-load path.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("JWT_SECRET", "ci-gate-secret-long-enough-for-validation-abcdef")

from routes import classroom


def test_env_kill_switch_disables_translation(monkeypatch):
    called = {"n": 0}
    def fake(*a, **k):
        called["n"] += 1
        return "SHOULD NOT BE USED"
    monkeypatch.setattr("vaathiyaar.translator.translate_and_cache", fake)
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "0")
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") is None
    assert called["n"] == 0


def test_enabled_delegates_to_translator(monkeypatch):
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "1")
    monkeypatch.setattr("vaathiyaar.translator.translate_and_cache",
                        lambda db, lid, lang, field, txt: f"[{lang}]{txt}")
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") == "[ta]hi"


def test_never_raises(monkeypatch):
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "1")
    def boom(*a, **k):
        raise RuntimeError("provider exploded")
    monkeypatch.setattr("vaathiyaar.translator.translate_and_cache", boom)
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") is None
