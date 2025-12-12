"""Client for the on-prem OpenAI-compatible Local AI service with fallback mocking."""
from __future__ import annotations

import random
import time
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


def _mock_response(endpoint: str, payload: Any) -> Any:
    """Generate a realistic mock response when the AI service is unreachable."""
    time.sleep(0.8)  # Simulate network latency
    
    if "chat/completions" in endpoint:
        messages = payload.get("messages", [])
        last_msg = messages[-1]["content"] if messages else ""
        
        # Simple heuristic responses
        if "async" in last_msg.lower():
            content = (
                "To implement this with `asyncio`, you'll need to define your function with "
                "`async def` and use `await` for any IO-bound operations.\n\n"
                "Here is a quick pattern:\n"
                "```python\n"
                "import asyncio\n\n"
                "async def main():\n"
                "    print('Hello ...')\n"
                "    await asyncio.sleep(1)\n"
                "    print('... World!')\n\n"
                "asyncio.run(main())\n"
                "```"
            )
        elif "list" in last_msg.lower() or "comprehension" in last_msg.lower():
            content = (
                "List comprehensions are a concise way to create lists. "
                "Syntax: `[expression for item in iterable if condition]`.\n\n"
                "Example:\n"
                "```python\n"
                "squares = [x**2 for x in range(10) if x % 2 == 0]\n"
                "```"
            )
        elif "explain" in last_msg.lower():
            content = (
                "Certainly! Conceptually, this topic revolves around efficient data handling in Python. "
                "The core idea is to leverage built-in structures to minimize overhead. "
                "Let me know if you want a specific code example!"
            )
        else:
            content = (
                f"I'm the PyMasters AI Instructor (Simulation Mode). I see you're asking about: "
                f"'{last_msg[:30]}...'.\n\n"
                "Ensure you have a local LLM running at the configured URL to get real-time dynamic answers. "
                "For now, I recommend checking the **Playground** examples."
            )

        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": content
                    }
                }
            ]
        }
    
    return {"data": "Mock response"}


def _request(method: str, path: str, *, json_payload: Any | None = None, timeout: int = 5) -> Any:
    url = f"{_base_url()}{path}"
    try:
        response = requests.request(method, url, headers=_headers(), json=json_payload, timeout=timeout)
    except requests.RequestException:
        # Fallback to mock if connection fails (e.g. no local LLM running)
        print(f"Warning: Connection to {url} failed. Using mock response.")
        return _mock_response(path, json_payload)

    if response.status_code >= 400:
        # Also mock if we get a server error, to keep the demo alive
        print(f"Warning: AC service returned {response.status_code}. Using mock response.")
        return _mock_response(path, json_payload)

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
    # Reduced timeout for faster fallback
    return _request("POST", "/v1/chat/completions", json_payload=payload, timeout=3)


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
    return _request("POST", "/v1/completions", json_payload=payload, timeout=3)


def create_local_embedding(*, model: str, inputs: Iterable[str]) -> dict[str, Any]:
    """Call /v1/embeddings for a batch of inputs."""
    payload = {
        "model": model,
        "input": list(inputs),
    }
    return _request("POST", "/v1/embeddings", json_payload=payload)
