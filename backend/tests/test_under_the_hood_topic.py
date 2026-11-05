"""Under the hood, "How it works" tab: the optional lesson field `under_the_hood` (a step-by-step explainer of
the topic itself). Validator rules mirror ~/pymasters-ops/content/validate_uth_topic.py; every lesson that has
the field must pass, and the lesson payload must carry it to the frontend."""
import copy
import importlib
import json
import os
import pathlib
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402
from vaathiyaar.topic_uth import CONSUMES, validate_under_the_hood  # noqa: E402

LESSONS = pathlib.Path(__file__).resolve().parent.parent / "lessons"

BODY = "Python keeps every object in memory with three things: an identity, a type and a value you can read."

GOOD = {
    "summary": "Every Python value is an object; names are only labels that point at objects.",
    "steps": [
        {"title": "Objects", "body": BODY,
         "visual": {"type": "ConceptMap", "props": {"nodes": [{"label": "object", "children": ["id", "type"]}]}}},
        {"title": {"en": "Names", "ta": "பெயர்கள்"}, "body": {"en": BODY, "ta": BODY}},
        {"title": "Aliases", "body": BODY,
         "visual": {"type": "TerminalOutput", "props": {"lines": [">>> a is b", "True"], "title": "Same object"}}},
        {"title": "Refcounts", "body": BODY},
    ],
    "takeaway": "Names point at objects; `is` checks identity and `==` checks value.",
}


def _lesson_files():
    for f in sorted(LESSONS.rglob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(d, dict) and "under_the_hood" in d:
            yield f, d


# ---------- every authored under_the_hood is valid ----------

@pytest.mark.parametrize("path,lesson", list(_lesson_files()) or [pytest.param(None, None, marks=pytest.mark.skip)],
                         ids=lambda v: v.stem if isinstance(v, pathlib.Path) else "")
def test_every_lesson_under_the_hood_validates(path, lesson):
    assert validate_under_the_hood(lesson["under_the_hood"]) == [], path


def test_sample_lesson_has_topic_content():
    d = json.loads((LESSONS / "python_internals" / "how_python_objects_work.json").read_text(encoding="utf-8"))
    assert "under_the_hood" in d
    assert validate_under_the_hood(d["under_the_hood"]) == []
    assert 2 <= sum(1 for s in d["under_the_hood"]["steps"] if s.get("visual")) <= 3


# ---------- validator rules ----------

def test_good_object_is_valid():
    assert validate_under_the_hood(GOOD) == []


def test_not_an_object():
    assert validate_under_the_hood(["x"]) == ["under_the_hood must be an object"]


def test_too_few_steps():
    bad = copy.deepcopy(GOOD)
    bad["steps"] = bad["steps"][:3]
    assert "steps: need 4-7 steps" in validate_under_the_hood(bad)


def test_too_many_steps():
    bad = copy.deepcopy(GOOD)
    bad["steps"] = bad["steps"] * 2
    assert "steps: need 4-7 steps" in validate_under_the_hood(bad)


def test_bad_visual_type():
    bad = copy.deepcopy(GOOD)
    bad["steps"][0]["visual"]["type"] = "StoryCard"
    errs = validate_under_the_hood(bad)
    assert any(e.startswith("steps[0].visual: needs type in") for e in errs), errs


def test_unknown_props():
    bad = copy.deepcopy(GOOD)
    bad["steps"][2]["visual"]["props"]["colour"] = "red"
    assert "steps[2].visual: TerminalOutput does not use props ['colour']" in validate_under_the_hood(bad)


def test_empty_props():
    bad = copy.deepcopy(GOOD)
    bad["steps"][2]["visual"]["props"] = {}
    assert "steps[2].visual: empty props" in validate_under_the_hood(bad)


def test_missing_en():
    bad = copy.deepcopy(GOOD)
    bad["steps"][1]["title"] = {"ta": "பெயர்கள்"}
    assert "steps[1].title: localized object needs an 'en' string" in validate_under_the_hood(bad)


def test_text_length_and_placeholders():
    bad = copy.deepcopy(GOOD)
    bad["summary"] = "short"
    bad["takeaway"] = "TODO write the takeaway for this lesson"
    errs = validate_under_the_hood(bad)
    assert "summary: 5 chars (want 40-280)" in errs
    assert "takeaway: placeholder text" in errs


def test_unknown_keys_and_too_few_visuals():
    bad = copy.deepcopy(GOOD)
    bad["extra"] = 1
    bad["steps"][0]["note"] = "x"
    del bad["steps"][0]["visual"]
    errs = validate_under_the_hood(bad)
    assert "unknown keys ['extra']" in errs
    assert "steps[0]: unknown keys ['note']" in errs
    assert "need at least 2 steps with a visual (have 1)" in errs


def test_consumes_table_matches_ops_validator():
    ops = pathlib.Path.home() / "pymasters-ops" / "content" / "validate_uth_topic.py"
    if not ops.exists():
        pytest.skip("ops validator not on this machine")
    ns = {}
    exec(compile(ops.read_text(encoding="utf-8"), str(ops), "exec"), ns)  # trusted local ops script
    assert ns["CONSUMES"] == CONSUMES


# ---------- lesson payload ----------

def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def test_lesson_payload_carries_under_the_hood(client, monkeypatch):
    import routes.classroom as classroom
    lesson = {"id": "fake", "track": "python_fundamentals", "animation_sequence": [],
              "under_the_hood": copy.deepcopy(GOOD)}
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: copy.deepcopy(lesson))
    body = client.get("/api/classroom/lesson/fake", headers=_headers("u1")).json()
    assert body["under_the_hood"] == GOOD
    # Topic content alone keeps the button; the trace tab needs example code.
    assert body["has_under_the_hood"] is True
    assert body["has_uth_trace"] is False


def test_has_under_the_hood_from_either_source(client, monkeypatch):
    import routes.classroom as classroom
    current = {}
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: copy.deepcopy(current))
    get = lambda: client.get("/api/classroom/lesson/fake", headers=_headers("u1")).json()  # noqa: E731
    current.update({"id": "fake", "track": "python_fundamentals",
                    "animation_sequence": [{"type": "ExecutionVisualizer", "code": "a = 1\n"}]})
    assert (get()["has_under_the_hood"], get()["has_uth_trace"]) == (True, True)
    current["under_the_hood"] = copy.deepcopy(GOOD)
    assert (get()["has_under_the_hood"], get()["has_uth_trace"]) == (True, True)
    current["animation_sequence"] = []
    del current["under_the_hood"]
    assert (get()["has_under_the_hood"], get()["has_uth_trace"]) == (False, False)


def test_real_sample_lesson_payload(client):
    body = client.get("/api/classroom/lesson/how_python_objects_work", headers=_headers("u1")).json()
    assert validate_under_the_hood(body["under_the_hood"]) == []
    assert body["has_under_the_hood"] is True and body["has_uth_trace"] is True
