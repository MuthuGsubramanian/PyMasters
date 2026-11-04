"""Under the hood: example_code picking, the per-lesson heap-trace route (auth, caching, 404) and
POST /api/playground/trace `mode`."""
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402
from vaathiyaar.lesson_code import example_code  # noqa: E402


# ---------- example_code ----------

def test_execution_visualizer_code_comes_first():
    lesson = {"animation_sequence": [
        {"type": "CodeStepper", "steps": [{"line": "y = 2"}]},
        {"type": "ExecutionVisualizer", "code": "x = 1\n"},
    ]}
    assert example_code(lesson) == "x = 1\n"


def test_execution_visualizer_props_form():
    lesson = {"animation_sequence": [{"type": "ExecutionVisualizer", "props": {"code": "a = [1]"}}]}
    assert example_code(lesson) == "a = [1]"


def test_code_stepper_code_then_joined_steps():
    assert example_code({"animation_sequence": [{"type": "CodeStepper", "code": "z = 3"}]}) == "z = 3"
    lesson = {"animation_sequence": [{"type": "CodeStepper", "steps": [
        {"line": "a = 1"}, {"code": "b = a"}, "c = b"]}]}
    assert example_code(lesson) == "a = 1\nb = a\nc = b"


def test_non_python_stepper_and_missing_code():
    assert example_code({"animation_sequence": [{"type": "CodeStepper", "language": "sql", "code": "SELECT 1"}]}) is None
    assert example_code({"animation_sequence": [{"type": "Terminal", "lines": ["hi"]}]}) is None
    assert example_code({"animation_sequence": []}) is None
    assert example_code({}) is None


# ---------- routes ----------

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
    import sqlite3
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) "
                 "VALUES ('u1', 'u1', 'h', 'U', CURRENT_TIMESTAMP)")
    conn.commit(); conn.close()
    import routes.classroom as classroom
    classroom._uth_cache.clear()
    classroom._uth_limiter._calls.clear()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _fake_trace(calls):
    def fake(code, timeout=10, mode="steps"):
        calls.append((code, mode))
        return {"steps": [{"line": 1, "frames": [], "objects": {}, "events": []}], "stdout": "", "error": None}
    return fake


def _lesson(code="a = [1]\nb = a\n"):
    return {"id": "fake", "track": "python_fundamentals",
            "animation_sequence": [{"type": "ExecutionVisualizer", "code": code}] if code else []}


def test_route_requires_auth(client):
    assert client.get("/api/classroom/lesson/lists/under-the-hood").status_code in (401, 403)


def test_route_returns_trace_with_code_and_caches(client, monkeypatch):
    import routes.classroom as classroom
    import vaathiyaar.tracer as tracer
    calls = []
    monkeypatch.setattr(tracer, "trace_code", _fake_trace(calls))
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson())
    r1 = client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1"))
    assert r1.status_code == 200
    body = r1.json()
    assert body["code"] == "a = [1]\nb = a\n"
    step = body["steps"][0]
    assert {"frames", "objects", "events"} <= set(step)
    assert calls == [("a = [1]\nb = a\n", "heap")]
    r2 = client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1"))
    assert r2.status_code == 200 and r2.json() == body
    assert len(calls) == 1                      # second call served from the cache


def test_cache_is_keyed_by_code_and_bounded(client, monkeypatch):
    import routes.classroom as classroom
    import vaathiyaar.tracer as tracer
    calls = []
    monkeypatch.setattr(tracer, "trace_code", _fake_trace(calls))
    current = {"code": "x = 1"}
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson(current["code"]))
    monkeypatch.setattr(classroom, "_UTH_CACHE_MAX", 2)
    for code in ("x = 1", "x = 2", "x = 3", "x = 1"):
        current["code"] = code
        assert client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code == 200
    assert len(calls) == 4                      # changed code re-runs; oldest entry was evicted
    assert len(classroom._uth_cache) == 2


def test_route_404_without_example_code_or_lesson(client, monkeypatch):
    import routes.classroom as classroom
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson(None))
    assert client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code == 404
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: None)
    assert client.get("/api/classroom/lesson/nope/under-the-hood", headers=_headers("u1")).status_code == 404


def test_route_blocks_expired_trial(client, monkeypatch):
    import routes.classroom as classroom
    import access
    from fastapi import HTTPException

    def expired(db, uid):
        raise HTTPException(status_code=402, detail="trial ended")
    monkeypatch.setattr(access, "assert_learning_access", expired)
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson())
    assert client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code == 402


def test_playground_trace_mode_passthrough(client, monkeypatch):
    import vaathiyaar.tracer as tracer
    calls = []
    monkeypatch.setattr(tracer, "trace_code", _fake_trace(calls))
    h = _headers("u1")
    assert client.post("/api/playground/trace", json={"code": "x = 1"}, headers=h).status_code == 200
    assert client.post("/api/playground/trace", json={"code": "x = 1", "mode": "steps"}, headers=h).status_code == 200
    assert client.post("/api/playground/trace", json={"code": "x = 1", "mode": "heap"}, headers=h).status_code == 200
    assert calls == [("x = 1", "steps"), ("x = 1", "steps"), ("x = 1", "heap")]
    assert client.post("/api/playground/trace", json={"code": "x = 1", "mode": "bogus"}, headers=h).status_code == 400


def test_cache_hits_do_not_consume_the_limit_but_misses_do(client, monkeypatch):
    import routes.classroom as classroom
    import vaathiyaar.tracer as tracer
    calls = []
    monkeypatch.setattr(tracer, "trace_code", _fake_trace(calls))
    monkeypatch.setattr(classroom, "_uth_limiter", classroom.SlidingWindowRateLimiter(max_calls=2, window_seconds=60))
    current = {"code": "x = 0"}
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson(current["code"]))
    h = _headers("u1")
    get = lambda: client.get("/api/classroom/lesson/fake/under-the-hood", headers=h)
    for _ in range(5):                           # one miss, four free hits
        assert get().status_code == 200
    assert len(calls) == 1
    current["code"] = "x = 1"
    assert get().status_code == 200              # second miss
    current["code"] = "x = 2"
    r = get()                                    # third miss is over the limit
    assert r.status_code == 429 and "Try again in" in r.json()["detail"]
    current["code"] = "x = 0"
    assert get().status_code == 200              # cached entries still served


def test_concurrent_cold_requests_run_one_trace(client, monkeypatch):
    import threading
    import time
    import routes.classroom as classroom
    import vaathiyaar.tracer as tracer
    calls = []

    def slow(code, timeout=10, mode="steps"):
        calls.append(code)
        time.sleep(0.4)
        return {"steps": [], "stdout": "", "error": None}
    monkeypatch.setattr(tracer, "trace_code", slow)
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson())
    codes = []

    def hit():
        codes.append(client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code)
    threads = [threading.Thread(target=hit) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert codes == [200] * 4 and len(calls) == 1
    assert not classroom._uth_inflight


def test_transient_run_error_is_not_cached(client, monkeypatch):
    import routes.classroom as classroom
    import vaathiyaar.tracer as tracer
    calls = []

    def flaky(code, timeout=10, mode="steps"):
        calls.append(code)
        return {"steps": [], "stdout": "", "error": {"type": "RunError", "message": "busy", "line": None}}
    monkeypatch.setattr(tracer, "trace_code", flaky)
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: _lesson())
    for _ in range(2):
        assert client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code == 200
    assert len(calls) == 2 and not classroom._uth_cache


def test_enterprise_lesson_is_403_without_access(client, monkeypatch):
    import routes.classroom as classroom
    from access import ENTERPRISE_TRACKS
    lesson = {**_lesson(), "track": next(iter(ENTERPRISE_TRACKS))}
    monkeypatch.setattr(classroom, "_load_lesson_from_dir", lambda lid, *a, **k: lesson)
    assert client.get("/api/classroom/lesson/fake/under-the-hood", headers=_headers("u1")).status_code == 403
