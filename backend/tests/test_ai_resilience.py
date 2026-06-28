"""
Tests for Vaathiyaar AI resilience: provider fallback chain + graceful
degradation when all providers fail (e.g. Ollama weekly-cap 502).

These tests do NOT make live API calls — they register fake in-memory
providers via the engine's provider registry and force success/failure.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar import engine
from vaathiyaar.engine import (
    VaathiyaarUnavailable,
    FRIENDLY_UNAVAILABLE,
    complete,
    stream,
    call_vaathiyaar,
)


@pytest.fixture
def fake_providers(monkeypatch):
    """Register fake complete/stream providers and let a test pick the order
    via VAATHIYAAR_PROVIDERS. Auto-reverted by monkeypatch."""
    def ok(text):
        return lambda messages, options: text

    def boom(msg="provider exploded"):
        def _raise(messages, options):
            raise RuntimeError(msg)
        return _raise

    # complete providers
    monkeypatch.setitem(engine._PROVIDER_COMPLETE, "ok", ok("PRIMARY"))
    monkeypatch.setitem(engine._PROVIDER_COMPLETE, "ok2", ok("FALLBACK"))
    monkeypatch.setitem(engine._PROVIDER_COMPLETE, "boom", boom())
    monkeypatch.setitem(engine._PROVIDER_COMPLETE, "boom2", boom("also dead"))

    # stream providers
    def ok_stream(text):
        def _gen(messages, options):
            for ch in text:
                yield ch
        return _gen

    def boom_stream(messages, options):
        raise RuntimeError("stream exploded")
        yield  # pragma: no cover — makes this a generator

    monkeypatch.setitem(engine._PROVIDER_STREAM, "ok", ok_stream("hello"))
    monkeypatch.setitem(engine._PROVIDER_STREAM, "boom", boom_stream)
    return monkeypatch


class TestCompleteFallback:
    def test_returns_first_provider_output(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "ok,ok2")
        assert complete([], {}) == "PRIMARY"

    def test_falls_back_when_first_provider_fails(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "boom,ok2")
        assert complete([], {}) == "FALLBACK"

    def test_raises_unavailable_when_all_providers_fail(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "boom,boom2")
        with pytest.raises(VaathiyaarUnavailable):
            complete([], {})

    def test_unknown_provider_names_are_skipped(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "nope,ok")
        assert complete([], {}) == "PRIMARY"


class TestCallVaathiyaarGraceful:
    def test_raises_unavailable_not_raw_vendor_error(self, fake_providers):
        # Simulate the live Ollama weekly-cap: the only provider raises.
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "boom")
        with pytest.raises(VaathiyaarUnavailable):
            call_vaathiyaar("hello")

    def test_friendly_message_is_learner_safe(self):
        # No raw vendor text / no stack-trace noise in the learner-facing string.
        assert "usage limit" not in FRIENDLY_UNAVAILABLE.lower()
        assert len(FRIENDLY_UNAVAILABLE) > 10


class TestGeminiProvider:
    """The Vertex Gemini fallback provider — pure mapping + registration.
    The live network call is verified against prod after deploy."""

    def test_gemini_registered_as_a_provider(self):
        assert "gemini" in engine._PROVIDER_COMPLETE
        assert "gemini" in engine._PROVIDER_STREAM

    def test_split_extracts_system_instruction(self):
        system, contents = engine._split_messages_for_gemini([
            {"role": "system", "content": "You are Vaathiyaar."},
            {"role": "user", "content": "hi"},
        ])
        assert system == "You are Vaathiyaar."
        assert contents == [{"role": "user", "parts": [{"text": "hi"}]}]

    def test_split_maps_assistant_role_to_model(self):
        system, contents = engine._split_messages_for_gemini([
            {"role": "user", "content": "q1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "q2"},
        ])
        assert system == ""
        assert contents == [
            {"role": "user", "parts": [{"text": "q1"}]},
            {"role": "model", "parts": [{"text": "a1"}]},
            {"role": "user", "parts": [{"text": "q2"}]},
        ]

    def test_active_providers_splits_on_any_separator(self, monkeypatch):
        # gcloud --set-env-vars is comma-delimited, so prod uses "ollama+gemini".
        for raw, expected in [
            ("ollama+gemini", ["ollama", "gemini"]),
            ("ollama,gemini", ["ollama", "gemini"]),
            ("ollama gemini", ["ollama", "gemini"]),
            ("ollama", ["ollama"]),
        ]:
            monkeypatch.setenv("VAATHIYAAR_PROVIDERS", raw)
            assert engine._active_providers() == expected

    def test_multiple_system_messages_are_concatenated(self):
        system, _ = engine._split_messages_for_gemini([
            {"role": "system", "content": "A"},
            {"role": "system", "content": "B"},
            {"role": "user", "content": "hi"},
        ])
        assert "A" in system and "B" in system


class TestPipelineGraceful:
    def test_job_failure_message_is_friendly_not_raw(self, monkeypatch):
        from modules import pipeline

        captured = {}
        monkeypatch.setattr(pipeline, "_lang_directive", lambda *a, **k: "")

        def boom(*a, **k):
            raise VaathiyaarUnavailable(detail="you have reached your weekly usage limit")
        monkeypatch.setattr(pipeline, "stage_1_outline", boom)

        def capture(job_id, status, stage_data=None, error=None):
            captured["status"] = status
            captured["error"] = error
        monkeypatch.setattr(pipeline, "_update_job_status", capture)

        with pytest.raises(VaathiyaarUnavailable):
            pipeline.run_pipeline("job1", "u1", "decorators")

        assert captured["status"] == "failed"
        assert "usage limit" not in (captured["error"] or "").lower()
        assert captured["error"] == FRIENDLY_UNAVAILABLE


class TestStreamFallback:
    def test_streams_tokens_from_first_provider(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "ok")
        assert "".join(stream([], {})) == "hello"

    def test_falls_back_to_complete_when_stream_provider_fails(self, fake_providers):
        # 'boom' stream fails before yielding; 'ok2' has only a complete impl
        # → stream() should yield ok2's full text once.
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "boom,ok2")
        assert "".join(stream([], {})) == "FALLBACK"

    def test_raises_unavailable_when_all_fail(self, fake_providers):
        fake_providers.setenv("VAATHIYAAR_PROVIDERS", "boom,boom2")
        with pytest.raises(VaathiyaarUnavailable):
            list(stream([], {}))
