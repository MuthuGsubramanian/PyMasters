"""Client for the on-prem OpenAI-compatible Local AI service."""
from __future__ import annotations

from typing import Any, Iterable, Sequence

import requests

from config.settings import settings
from pymasters_app.utils.secrets import get_secret


class LocalAIError(RuntimeError):
    """Raised when the local AI gateway returns an error."""


def _base_url() -> str:
    base = settings.local_ai_base_url or get_secret("LOCAL_AI_BASE_URL") or "http://localhost:1234"
    return base.rstrip("/")


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = settings.local_ai_api_key or get_secret("LOCAL_AI_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _request(method: str, path: str, *, json_payload: Any | None = None, timeout: int = 120) -> Any:
    url = f"{_base_url()}{path}"
    try:
        response = requests.request(method, url, headers=_headers(), json=json_payload, timeout=timeout)
    except requests.RequestException as exc:  # pragma: no cover - network failure depends on env
        raise LocalAIError(f"Local AI request to {url} failed: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise LocalAIError(f"{method} {path} failed: {response.status_code} {detail}")

    if response.headers.get("content-type", "").startswith("application/json"):
        return response.json()
    return response.content


def list_local_models() -> list[dict[str, Any]]:
    """Return available models from the local AI gateway."""

    payload = _request("GET", "/v1/models")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    if isinstance(payload, list):
        return payload
    return [payload]


def create_local_response(payload: dict[str, Any]) -> dict[str, Any]:
    """Call the generic /v1/responses endpoint."""

    return _request("POST", "/v1/responses", json_payload=payload)


def create_local_chat_completion(
    *,
    model: str,
    messages: Sequence[dict[str, Any]],
    temperature: float = 0.4,
    max_tokens: int = 512,
    stream: bool = False,
) -> dict[str, Any]:
    """Call /v1/chat/completions with OpenAI-compatible parameters."""

    payload = {
        "model": model,
        "messages": list(messages),
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": stream,
    }
    return _request("POST", "/v1/chat/completions", json_payload=payload, timeout=300)


def create_local_completion(
    *,
    model: str,
    prompt: str,
    temperature: float = 0.4,
    max_tokens: int = 512,
) -> dict[str, Any]:
    """Call /v1/completions for legacy completion style models."""

    payload = {
        "model": model,
        "prompt": prompt,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }
    return _request("POST", "/v1/completions", json_payload=payload, timeout=300)


def create_local_embedding(*, model: str, inputs: Iterable[str]) -> dict[str, Any]:
    """Call /v1/embeddings for a batch of inputs."""

    payload = {
        "model": model,
        "input": list(inputs),
    }
    return _request("POST", "/v1/embeddings", json_payload=payload)
