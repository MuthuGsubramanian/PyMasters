"""The deterministic `stub` AI provider used by the CI scenario tests (2026-11-03).

It lets the end-to-end suites exercise every tutor feature without API keys, and it must never answer real
learners: it refuses to run in production.
"""
import importlib
import json

import pytest


def _engine(monkeypatch, env=None):
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "stub")
    monkeypatch.delenv("PYMASTERS_ENV", raising=False)
    monkeypatch.delenv("K_SERVICE", raising=False)
    for k, v in (env or {}).items():
        monkeypatch.setenv(k, v)
    import vaathiyaar.engine as e
    return importlib.reload(e)


MSG = [{"role": "user", "content": "What is a list?"}]


def test_stub_complete_returns_tutor_json(monkeypatch):
    e = _engine(monkeypatch)
    out = e.complete(MSG, {})
    assert json.loads(out)["message"] == "Stub tutor reply."
    assert e.parse_vaathiyaar_response(out)["message"] == "Stub tutor reply."


def test_stub_reply_satisfies_explainer_contract(monkeypatch):
    e = _engine(monkeypatch)
    from routes.classroom import _sanitize_explain
    data = _sanitize_explain(json.loads(e.complete(MSG, {})), "lists")
    assert data["title"] and len(data["steps"]) >= 3


def test_stub_stream_yields_multiple_chunks(monkeypatch):
    e = _engine(monkeypatch)
    chunks = list(e.stream(MSG, {}))
    assert len(chunks) >= 3
    assert "Stub tutor reply." in "".join(chunks)


def test_stub_refused_in_production(monkeypatch):
    e = _engine(monkeypatch, {"PYMASTERS_ENV": "production"})
    with pytest.raises(e.VaathiyaarUnavailable):
        e.complete(MSG, {})
    with pytest.raises(e.VaathiyaarUnavailable):
        list(e.stream(MSG, {}))


def test_stub_refused_on_cloud_run(monkeypatch):
    e = _engine(monkeypatch, {"K_SERVICE": "pymasters"})
    with pytest.raises(e.VaathiyaarUnavailable):
        e.complete(MSG, {})
