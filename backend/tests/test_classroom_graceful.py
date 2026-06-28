"""
Route-level graceful degradation: when every AI provider fails (e.g. Ollama
weekly cap), /api/classroom/chat and /chat/stream must degrade to a calm,
learner-facing message — never a raw 502 or an SSE `error` event with vendor text.
"""

import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import routes.classroom as classroom
from vaathiyaar.engine import VaathiyaarUnavailable, FRIENDLY_UNAVAILABLE

app = FastAPI()
app.include_router(classroom.router)
client = TestClient(app)


@pytest.fixture(autouse=True)
def no_db(monkeypatch):
    # Isolate from the DB: no profile lookups, no training-pair writes.
    monkeypatch.setattr(classroom, "get_student_profile", lambda *a, **k: None)
    monkeypatch.setattr(classroom, "record_training_pair", lambda *a, **k: None)


def test_chat_returns_graceful_200_when_ai_unavailable(monkeypatch):
    def boom(*a, **k):
        raise VaathiyaarUnavailable(detail="ollama weekly cap")
    monkeypatch.setattr(classroom, "call_vaathiyaar", boom)

    r = client.post("/api/classroom/chat", json={"user_id": "u1", "message": "hi"})

    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ai_unavailable") is True
    assert body["message"] == FRIENDLY_UNAVAILABLE
    # Defaults so the UI never breaks on a missing key.
    assert "phase" in body and "profile_update" in body


def test_chat_does_not_leak_raw_vendor_text(monkeypatch):
    def boom(*a, **k):
        raise VaathiyaarUnavailable(detail="you have reached your weekly usage limit")
    monkeypatch.setattr(classroom, "call_vaathiyaar", boom)

    r = client.post("/api/classroom/chat", json={"user_id": "u1", "message": "hi"})

    assert "usage limit" not in r.text.lower()


def test_chat_stream_emits_friendly_done_not_error(monkeypatch):
    def boom_stream(*a, **k):
        raise VaathiyaarUnavailable(detail="ollama weekly cap")
        yield  # pragma: no cover — generator marker
    monkeypatch.setattr(classroom, "vaathiyaar_stream", boom_stream)

    r = client.post("/api/classroom/chat/stream", json={"user_id": "u1", "message": "hi"})

    assert r.status_code == 200, r.text
    text = r.text
    assert '"error"' not in text          # no raw SSE error event
    assert "usage limit" not in text.lower()
    assert "ai_unavailable" in text       # graceful done flag
    assert "breather" in text             # fragment of FRIENDLY_UNAVAILABLE
