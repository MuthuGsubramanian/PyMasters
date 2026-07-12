"""Claude fallback provider for Vaathiyaar (engine.py seam). No network, no
SDK dependency in CI — the client is monkeypatched."""

import types

import pytest

from vaathiyaar import engine


def test_claude_registered_in_provider_registries():
    assert "claude" in engine._PROVIDER_COMPLETE
    assert "claude" in engine._PROVIDER_STREAM


def test_split_messages_maps_roles():
    system, msgs = engine._split_messages_for_claude([
        {"role": "system", "content": "You are Vaathiyaar."},
        {"role": "system", "content": "Reply in JSON."},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "vanakkam"},
        {"role": "user", "content": "teach me loops"},
    ])
    assert system == "You are Vaathiyaar.\n\nReply in JSON."
    assert msgs == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "vanakkam"},
        {"role": "user", "content": "teach me loops"},
    ]


def test_split_messages_never_starts_with_assistant():
    _, msgs = engine._split_messages_for_claude([
        {"role": "assistant", "content": "continuing..."},
    ])
    assert msgs[0]["role"] == "user"


def test_claude_complete_uses_client_and_joins_text(monkeypatch):
    calls = {}

    class FakeBlock:
        type = "text"
        text = "hello from claude"

    class FakeResp:
        content = [FakeBlock()]
        stop_reason = "end_turn"

    class FakeMessages:
        def create(self, **kwargs):
            calls.update(kwargs)
            return FakeResp()

    fake_client = types.SimpleNamespace(messages=FakeMessages())
    monkeypatch.setattr(engine, "_claude_client", lambda: fake_client)

    out = engine._claude_complete(
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}],
        {"num_predict": 777},
    )
    assert out == "hello from claude"
    assert calls["max_tokens"] == 777
    assert calls["system"] == "sys"
    # Opus 4.8 rejects sampling params — the provider must never send them
    assert "temperature" not in calls and "top_p" not in calls and "top_k" not in calls


def test_claude_complete_raises_on_empty(monkeypatch):
    class FakeResp:
        content = []
        stop_reason = "refusal"

    fake_client = types.SimpleNamespace(
        messages=types.SimpleNamespace(create=lambda **kw: FakeResp())
    )
    monkeypatch.setattr(engine, "_claude_client", lambda: fake_client)
    with pytest.raises(ValueError):
        engine._claude_complete([{"role": "user", "content": "hi"}], {})


def test_provider_chain_degrades_gracefully_without_key(monkeypatch):
    """With only 'claude' active and no API key, complete() must raise
    VaathiyaarUnavailable (learner-safe), not a raw exception."""
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "claude")
    monkeypatch.setattr(engine, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(engine, "_claude_client_obj", None)
    with pytest.raises(engine.VaathiyaarUnavailable):
        engine.complete([{"role": "user", "content": "hi"}])
