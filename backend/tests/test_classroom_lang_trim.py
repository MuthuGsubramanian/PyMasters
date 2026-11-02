"""?lang= trims lesson titles/descriptions to that language + English (2026-11-02)."""
import routes.classroom as classroom


def _fake(monkeypatch):
    cached = [{"id": "a", "track": "python_fundamentals", "title": {"en": "A", "ta": "அ", "hi": "ए"},
               "description": {"en": "d", "ta": "த"}}, {"id": "b", "track": "python_fundamentals", "title": "Plain"}]
    monkeypatch.setattr(classroom, "_list_all_lessons", lambda user_id=None: cached)
    return cached


def test_lang_trims_and_leaves_cache_untouched(monkeypatch):
    cached = _fake(monkeypatch)
    r = classroom.list_lessons(user_id=None, lang="ta", authorization=None)
    a = next(l for l in r["lessons"] if l["id"] == "a")
    assert a["title"] == {"en": "A", "ta": "அ"} and a["description"] == {"en": "d", "ta": "த"}
    assert next(l for l in r["lessons"] if l["id"] == "b")["title"] == "Plain"
    assert cached[0]["title"] == {"en": "A", "ta": "அ", "hi": "ए"}       # cache not mutated


def test_no_lang_or_bad_lang_returns_everything(monkeypatch):
    _fake(monkeypatch)
    for lang in (None, "../x"):
        a = next(l for l in classroom.list_lessons(user_id=None, lang=lang, authorization=None)["lessons"] if l["id"] == "a")
        assert set(a["title"]) == {"en", "ta", "hi"}
