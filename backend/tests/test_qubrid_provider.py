"""
Tests for the Qubrid fallback provider (OpenAI-compatible chat completions,
added 2026-07-02). No live API calls — requests.post is monkeypatched.

Pins:
  • "qubrid" is registered in both provider registries.
  • VAATHIYAAR_PROVIDERS="ollama+gemini+qubrid" activates it (gcloud-safe "+").
  • _qubrid_complete parses the OpenAI response shape and strips <think> blocks.
  • Missing QUBRID_API_KEY raises (so the chain fails over instead of hanging).
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import requests

from vaathiyaar import engine


class _FakeResp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload

    def iter_lines(self, decode_unicode=True):
        for choice_delta in self._payload.get("_stream", []):
            yield "data: " + json.dumps(
                {"choices": [{"delta": choice_delta}]}
            )
        yield "data: [DONE]"


def _openai_body(content):
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


def test_qubrid_registered_in_both_registries():
    assert "qubrid" in engine._PROVIDER_COMPLETE
    assert "qubrid" in engine._PROVIDER_STREAM


def test_active_providers_parses_plus_separated_chain(monkeypatch):
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "ollama+gemini+qubrid")
    assert engine._active_providers() == ["ollama", "gemini", "qubrid"]


def test_qubrid_complete_parses_openai_shape(monkeypatch):
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "test-key")
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None, stream=False):
        captured.update(url=url, headers=headers, body=json)
        return _FakeResp(_openai_body('{"message": "hi"}'))

    monkeypatch.setattr(requests, "post", fake_post)
    out = engine._qubrid_complete([{"role": "user", "content": "x"}], {})
    assert out == '{"message": "hi"}'
    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["body"]["model"] == engine.QUBRID_MODEL
    assert captured["body"]["stream"] is False


def test_qubrid_complete_strips_think_block(monkeypatch):
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "test-key")
    monkeypatch.setattr(
        requests, "post",
        lambda *a, **k: _FakeResp(_openai_body("<think>reasoning…</think>ANSWER")),
    )
    out = engine._qubrid_complete([{"role": "user", "content": "x"}], {})
    assert out == "ANSWER"


def test_qubrid_complete_raises_without_key(monkeypatch):
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "")
    with pytest.raises(RuntimeError):
        engine._qubrid_complete([{"role": "user", "content": "x"}], {})


def test_qubrid_empty_content_raises_so_chain_fails_over(monkeypatch):
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "test-key")
    monkeypatch.setattr(requests, "post", lambda *a, **k: _FakeResp(_openai_body("")))
    with pytest.raises(ValueError):
        engine._qubrid_complete([{"role": "user", "content": "x"}], {})


def test_qubrid_stream_yields_content_and_skips_reasoning(monkeypatch):
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "test-key")
    payload = {
        "_stream": [
            {"reasoning_content": "thinking…"},
            {"content": "Hel"},
            {"content": "lo"},
            {},
        ]
    }
    monkeypatch.setattr(requests, "post", lambda *a, **k: _FakeResp(payload))
    tokens = list(engine._qubrid_stream([{"role": "user", "content": "x"}], {}))
    assert tokens == ["Hel", "lo"]


def test_complete_falls_back_to_qubrid_when_earlier_providers_fail(monkeypatch):
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "boomx+qubrid")

    def _raise(messages, options):
        raise RuntimeError("primary dead")

    monkeypatch.setitem(engine._PROVIDER_COMPLETE, "boomx", _raise)
    monkeypatch.setattr(engine, "QUBRID_API_KEY", "test-key")
    monkeypatch.setattr(requests, "post", lambda *a, **k: _FakeResp(_openai_body("RESCUED")))
    assert engine.complete([{"role": "user", "content": "x"}], {}) == "RESCUED"
