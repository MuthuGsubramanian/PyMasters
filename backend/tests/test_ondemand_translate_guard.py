"""
Guards for the on-demand lesson-translation wrapper in routes/classroom.py
(2026-07-08). Design: lesson loads NEVER block on the LLM — a cache hit is
served, a miss returns None (English fallback) and warms the cache in a
background thread. The feature must be killable via env and never raise into
the lesson-load path.
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("JWT_SECRET", "ci-gate-secret-long-enough-for-validation-abcdef")

from routes import classroom


def test_env_kill_switch_disables_translation(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr("vaathiyaar.translator.get_cached_translation",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not run")))
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "0")
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") is None


def test_cache_hit_is_served_without_warming(monkeypatch):
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "1")
    monkeypatch.setattr("vaathiyaar.translator.get_cached_translation",
                        lambda db, lid, lang, field, txt: "[ta] cached")
    warmed = {"n": 0}
    monkeypatch.setattr("vaathiyaar.translator.translate_and_cache",
                        lambda *a, **k: warmed.__setitem__("n", warmed["n"] + 1))
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") == "[ta] cached"
    time.sleep(0.05)
    assert warmed["n"] == 0  # no background work when already cached


def test_cache_miss_returns_none_and_warms_in_background(monkeypatch):
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "1")
    monkeypatch.setattr("vaathiyaar.translator.get_cached_translation",
                        lambda *a, **k: None)
    warmed = {"n": 0}
    def fake_tac(db, lid, lang, field, txt):
        warmed["n"] += 1
    monkeypatch.setattr("vaathiyaar.translator.translate_and_cache", fake_tac)
    # Miss → English fallback (None) immediately …
    assert classroom._ondemand_translate("db", "les_miss", "ta", "story", "hi") is None
    # … and the cache warms in the background.
    for _ in range(50):
        if warmed["n"] >= 1:
            break
        time.sleep(0.02)
    assert warmed["n"] == 1


def test_never_raises(monkeypatch):
    monkeypatch.setenv("LESSON_TRANSLATION_ONDEMAND", "1")
    def boom(*a, **k):
        raise RuntimeError("cache read exploded")
    monkeypatch.setattr("vaathiyaar.translator.get_cached_translation", boom)
    assert classroom._ondemand_translate("db", "les1", "ta", "story", "hi") is None
