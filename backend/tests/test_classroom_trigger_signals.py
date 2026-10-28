"""
The AI-inferred module generation trigger (modules/trigger_engine.py) has two
halves: struggle detection (2+ code_evaluation failures — already wired into
/evaluate) and interest detection (3+ chat_question signals on the same
topic). Nothing in the codebase ever recorded a 'chat_question' signal, so
interest detection could never fire. /api/classroom/chat/stream — the
primary chat path the real Classroom UI calls — also never recorded the
'profile_update' signal at all (only the lesser-used /chat endpoint did),
so most real chat traffic wasn't feeding the adaptive-learning signal table.

These tests pin both endpoints to: record 'profile_update' and
'chat_question' signals, and call check_triggers, whenever the AI response
names a topic_practiced.
"""

import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import routes.classroom as classroom
from auth import get_current_user_id

app = FastAPI()
app.include_router(classroom.router)
app.dependency_overrides[get_current_user_id] = lambda: "u1"
client = TestClient(app)


@pytest.fixture(autouse=True)
def no_db(monkeypatch):
    monkeypatch.setattr(classroom, "get_student_profile", lambda *a, **k: None)
    monkeypatch.setattr(classroom, "record_training_pair", lambda *a, **k: None)


@pytest.fixture
def captured_signals(monkeypatch):
    calls = {"record_signal": [], "check_triggers": []}

    def fake_record_signal(db_path, user_id, signal_type, topic, value, session_id=None):
        calls["record_signal"].append({"user_id": user_id, "signal_type": signal_type, "topic": topic})

    def fake_check_triggers(user_id, signal_type, topic, value):
        calls["check_triggers"].append({"user_id": user_id, "signal_type": signal_type, "topic": topic})
        return {"triggered": False, "job_id": None, "reason": None}

    monkeypatch.setattr(classroom, "record_signal", fake_record_signal)
    monkeypatch.setattr(classroom, "check_triggers", fake_check_triggers)
    return calls


def test_chat_records_chat_question_signal_and_checks_triggers(monkeypatch, captured_signals):
    def fake_call_vaathiyaar(*a, **k):
        return {
            "message": "Closures capture variables, not values.",
            "phase": "chat",
            "profile_update": {"topic_practiced": "closures"},
        }
    monkeypatch.setattr(classroom, "call_vaathiyaar", fake_call_vaathiyaar)

    r = client.post("/api/classroom/chat", json={"user_id": "u1", "message": "what are closures?"})

    assert r.status_code == 200, r.text
    signal_types = {c["signal_type"] for c in captured_signals["record_signal"]}
    assert "profile_update" in signal_types
    assert "chat_question" in signal_types
    assert captured_signals["check_triggers"] == [
        {"user_id": "u1", "signal_type": "chat_question", "topic": "closures"}
    ]


def test_chat_stream_records_profile_update_and_chat_question_signals(monkeypatch, captured_signals):
    def fake_vaathiyaar_stream(*a, **k):
        import json
        yield json.dumps({
            "message": "Closures capture variables, not values.",
            "phase": "chat",
            "profile_update": {"topic_practiced": "closures"},
        })
    monkeypatch.setattr(classroom, "vaathiyaar_stream", fake_vaathiyaar_stream)

    r = client.post("/api/classroom/chat/stream", json={"user_id": "u1", "message": "what are closures?"})

    assert r.status_code == 200, r.text
    signal_types = {c["signal_type"] for c in captured_signals["record_signal"]}
    assert "profile_update" in signal_types, "chat/stream never recorded profile_update before this fix"
    assert "chat_question" in signal_types
    assert captured_signals["check_triggers"] == [
        {"user_id": "u1", "signal_type": "chat_question", "topic": "closures"}
    ]


def test_chat_stream_skips_signals_when_no_topic_practiced(monkeypatch, captured_signals):
    def fake_vaathiyaar_stream(*a, **k):
        import json
        yield json.dumps({"message": "Hi there!", "phase": "chat", "profile_update": {"topic_practiced": None}})
    monkeypatch.setattr(classroom, "vaathiyaar_stream", fake_vaathiyaar_stream)

    r = client.post("/api/classroom/chat/stream", json={"user_id": "u1", "message": "hello"})

    assert r.status_code == 200, r.text
    assert captured_signals["record_signal"] == []
    assert captured_signals["check_triggers"] == []
