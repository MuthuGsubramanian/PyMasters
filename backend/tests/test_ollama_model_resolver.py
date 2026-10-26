"""Self-healing Ollama model resolver (engine.py, added 2026-10-26).

Background: Ollama Cloud retired `qwen3.5:397b` on 2026-09-25 and the ollama
provider failed on every call for a month ("...was retired... Try
glm-5.3-flash:cloud") while nothing surfaced it. These tests pin the behaviour
that prevents a repeat: catalogue-aware model choice, one-shot retry on a
retired-model error, and operator-visible health.  No network: the Ollama
client is faked.
"""

import pytest

from vaathiyaar import engine


class _FakeClient:
    def __init__(self, catalogue, retired=()):
        self.catalogue = list(catalogue)
        self.retired = set(retired)
        self.calls = []

    def list(self):
        return {"models": [{"model": m} for m in self.catalogue]}

    def chat(self, model, messages, stream=False, **kw):
        self.calls.append(model)
        if model in self.retired:
            raise Exception(f"{model} was retired on September 25, 2026. Try glm-5.3-flash:cloud")
        if stream:
            return iter([{"message": {"content": "hel"}}, {"message": {"content": "lo"}}])
        return {"message": {"content": f"ok from {model}"}}


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    engine._model_state.update({"model": None, "checked_at": 0.0, "available": None,
                                "banned": set(), "last_error": ""})
    engine._provider_health.clear()
    yield


def _use(monkeypatch, client, configured="qwen3.5", candidates="glm-5.3-flash,gpt-oss:120b"):
    monkeypatch.setattr(engine, "get_ollama_client", lambda: client)
    monkeypatch.setattr(engine, "OLLAMA_MODEL", configured)
    monkeypatch.setattr(engine, "OLLAMA_MODEL_CANDIDATES", candidates)


def test_norm_model_ignores_cloud_and_latest_suffixes():
    assert engine._norm_model("glm-5.3-flash:cloud") == "glm-5.3-flash"
    assert engine._norm_model("GPT-OSS:120b") == "gpt-oss:120b"
    assert engine._norm_model("x:latest") == "x"


def test_resolver_prefers_configured_model_when_catalogue_has_it(monkeypatch):
    _use(monkeypatch, _FakeClient(["qwen3.5", "glm-5.3-flash"]))
    assert engine.resolve_ollama_model(force=True) == "qwen3.5"


def test_resolver_falls_to_first_available_candidate_when_configured_is_gone(monkeypatch):
    _use(monkeypatch, _FakeClient(["gpt-oss:120b", "glm-5.3-flash"]))
    assert engine.resolve_ollama_model(force=True) == "glm-5.3-flash"


def test_resolver_keeps_configured_model_when_catalogue_unreachable(monkeypatch):
    class Boom:
        def list(self):
            raise RuntimeError("503")
    _use(monkeypatch, Boom())
    assert engine.resolve_ollama_model(force=True) == "qwen3.5"
    assert "503" in engine.provider_health()["ollama"]["catalogue_error"]


def test_resolver_caches_until_refresh_window(monkeypatch):
    client = _FakeClient(["qwen3.5"])
    _use(monkeypatch, client)
    engine.resolve_ollama_model(force=True)
    client.catalogue = ["glm-5.3-flash"]  # catalogue changes…
    assert engine.resolve_ollama_model() == "qwen3.5"  # …but cached answer holds
    assert engine.resolve_ollama_model(force=True) == "glm-5.3-flash"


def test_complete_retries_once_on_retired_model_and_bans_it(monkeypatch):
    # Catalogue still lists the retired name (stale listing) — the error must drive the switch.
    client = _FakeClient(["qwen3.5", "glm-5.3-flash"], retired={"qwen3.5"})
    _use(monkeypatch, client)
    out = engine._ollama_complete([{"role": "user", "content": "hi"}], {})
    assert out == "ok from glm-5.3-flash"
    assert client.calls == ["qwen3.5", "glm-5.3-flash"]
    assert "qwen3.5" in engine.provider_health()["ollama"]["banned"]
    # Next call goes straight to the healthy model — no second failure.
    engine._ollama_complete([{"role": "user", "content": "hi"}], {})
    assert client.calls[-1] == "glm-5.3-flash"


def test_stream_retries_once_on_retired_model(monkeypatch):
    client = _FakeClient(["qwen3.5", "glm-5.3-flash"], retired={"qwen3.5"})
    _use(monkeypatch, client)
    tokens = list(engine._ollama_stream([{"role": "user", "content": "hi"}], {}))
    assert tokens == ["hel", "lo"]
    assert client.calls == ["qwen3.5", "glm-5.3-flash"]


def test_non_retirement_errors_are_not_retried(monkeypatch):
    class Flaky(_FakeClient):
        def chat(self, model, messages, stream=False, **kw):
            self.calls.append(model)
            raise Exception("429 weekly usage limit reached")
    client = Flaky(["qwen3.5", "glm-5.3-flash"])
    _use(monkeypatch, client)
    with pytest.raises(Exception):
        engine._ollama_complete([{"role": "user", "content": "hi"}], {})
    assert client.calls == ["qwen3.5"]
    h = engine.provider_health()["health"]["ollama"]
    assert h["error_count"] == 1 and "429" in h["last_error"]


def test_all_candidates_retired_raises_after_single_retry(monkeypatch):
    client = _FakeClient(["qwen3.5", "glm-5.3-flash", "gpt-oss:120b"],
                         retired={"qwen3.5", "glm-5.3-flash", "gpt-oss:120b"})
    _use(monkeypatch, client)
    with pytest.raises(Exception):
        engine._ollama_complete([{"role": "user", "content": "hi"}], {})
    assert len(client.calls) == 2  # original + exactly one retry, never a loop


def test_provider_health_shape():
    h = engine.provider_health()
    assert set(h) >= {"providers", "health", "ollama", "qubrid", "qubrid2"}
    assert "candidates" in h["ollama"] and isinstance(h["ollama"]["candidates"], list)
