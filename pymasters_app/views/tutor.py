"""AI-based Python Tutor using local and Hugging Face text generation."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

import requests
import streamlit as st

from config.settings import settings
from pymasters_app.utils.db import get_database
from pymasters_app.utils.secrets import get_secret
from services.local_ai_service import (
    LocalAIError,
    create_local_chat_completion,
    list_local_models,
)


HF_API_BASE = "https://api-inference.huggingface.co/models"
SYSTEM_PROMPT = (
    "You are PyMasters, a friendly senior Python tutor. "
    "Explain step-by-step, show minimal runnable examples, and suggest tests. "
    "Prefer standard library solutions. When code is unsafe, warn clearly."
)


@st.cache_data(ttl=180, show_spinner=False)
def _fetch_local_models() -> list[str]:
    """Fetch available local models (cached for a short period)."""

    try:
        entries = list_local_models()
    except LocalAIError:
        return []

    models: list[str] = []
    for entry in entries:
        if isinstance(entry, dict):
            model_id = entry.get("id") or entry.get("name")
            if model_id:
                models.append(str(model_id))
    return models


def _hf_headers() -> dict[str, str]:
    token = settings.huggingfacehub_api_token or get_secret("HUGGINGFACEHUB_API_TOKEN")
    if not token:
        raise RuntimeError("Missing HUGGINGFACEHUB_API_TOKEN for tutor.")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _hf_chat_completion(model: str, prompt: str, temperature: float, max_new_tokens: int) -> str:
    payload = {
        "inputs": prompt,
        "parameters": {
            "temperature": float(temperature),
            "max_new_tokens": int(max_new_tokens),
            "return_full_text": False,
        },
    }
    url = f"{HF_API_BASE}/{model}"
    resp = requests.post(url, headers=_hf_headers(), json=payload, timeout=120)
    if resp.status_code == 503:
        return "The selected Hugging Face model is warming up. Please try again in a few seconds."
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise RuntimeError(f"HF error: {resp.status_code} {detail}")

    try:
        data = resp.json()
    except Exception:
        return resp.text

    if isinstance(data, list) and data and "generated_text" in data[0]:
        return data[0]["generated_text"]
    if isinstance(data, dict) and "generated_text" in data:
        return data["generated_text"]
    return str(data)


def _local_messages() -> list[dict[str, str]]:
    return [
        {"role": message["role"], "content": message["content"]}
        for message in st.session_state.tutor_messages
        if message["role"] in {"system", "user", "assistant"}
    ]


def _extract_local_reply(payload: Any) -> str:
    if not isinstance(payload, dict):
        return str(payload)

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        choice = choices[0]
        if isinstance(choice, dict):
            message = choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, list):
                    pieces = []
                    for segment in content:
                        if isinstance(segment, dict):
                            if "text" in segment:
                                pieces.append(str(segment["text"]))
                            elif "type" in segment and segment["type"] == "text":
                                pieces.append(str(segment.get("text", "")))
                    if pieces:
                        return "".join(pieces).strip()
                elif isinstance(content, str):
                    return content.strip()
            if "text" in choice:
                return str(choice["text"]).strip()
    if "output" in payload:
        return str(payload["output"]).strip()
    return str(payload)


def _local_chat_reply(model: str, temperature: float, max_tokens: int) -> str:
    response = create_local_chat_completion(
        model=model,
        messages=_local_messages(),
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return _extract_local_reply(response)


def _build_hf_prompt() -> str:
    text_prompt = "\n\n".join(
        f"{message['role'].upper()}: {message['content']}"
        for message in st.session_state.tutor_messages
        if message["role"] != "system"
    )
    return SYSTEM_PROMPT + "\n\n" + text_prompt + "\n\nASSISTANT:"


def render(*, auth_manager, user: dict[str, Any]) -> None:
    st.subheader("AI Python Tutor")
    st.caption("Chat with a Python mentor powered by your local models or Hugging Face endpoints.")

    db = get_database()
    sessions = db["tutor_sessions"]

    provider_labels = ["Local LLM", "Hugging Face"]
    default_local_model = settings.local_ai_default_model or "local-llm"
    default_hf_model = "mistralai/Mixtral-8x7B-Instruct-v0.1"

    with st.expander("Tutor Settings", expanded=False):
        provider_label = st.radio("Model provider", provider_labels, horizontal=True, index=0)
        provider = "local" if provider_label == "Local LLM" else "huggingface"

        model: str
        if provider == "local":
            col_refresh, col_input = st.columns([0.3, 0.7])
            with col_refresh:
                if st.button("Refresh models", help="Re-run the /v1/models request."):
                    _fetch_local_models.clear()  # type: ignore[attr-defined]
            with col_input:
                options = _fetch_local_models()
                if options:
                    index = options.index(default_local_model) if default_local_model in options else 0
                    model = st.selectbox("Local model", options, index=index)
                else:
                    model = st.text_input("Local model", value=default_local_model)
        else:
            model = st.text_input("HF chat model", value=default_hf_model)

        col_t1, col_t2 = st.columns(2)
        with col_t1:
            temperature = st.slider("Creativity", 0.0, 1.5, 0.4, 0.1)
        with col_t2:
            max_tokens = st.slider("Max new tokens", 64, 2048, 512, 64)

    if "tutor_messages" not in st.session_state:
        st.session_state.tutor_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

    for msg in st.session_state.tutor_messages:
        if msg["role"] == "user":
            st.chat_message("user").write(msg["content"])
        elif msg["role"] == "assistant":
            st.chat_message("assistant").write(msg["content"])

    if prompt := st.chat_input("Ask me anything about Python…"):
        st.session_state.tutor_messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)

        with st.spinner("Thinking…"):
            try:
                if provider == "local":
                    reply = _local_chat_reply(model, temperature=temperature, max_tokens=max_tokens)
                else:
                    reply = _hf_chat_completion(
                        model=model,
                        prompt=_build_hf_prompt(),
                        temperature=temperature,
                        max_new_tokens=max_tokens,
                    )
            except LocalAIError as exc:
                reply = f"Local AI error: {exc}"
            except Exception as exc:  # pragma: no cover - runtime safeguard
                reply = f"Sorry, I ran into a problem: {exc}"

        st.session_state.tutor_messages.append({"role": "assistant", "content": reply})
        st.chat_message("assistant").write(reply)

        sessions.insert_one(
            {
                "user_id": user.get("_id") if user else None,
                "user_email": user.get("email") if user else None,
                "provider": provider,
                "model": model,
                "temperature": float(temperature),
                "max_new_tokens": int(max_tokens),
                "messages": st.session_state.tutor_messages[-6:],
                "created_at": datetime.utcnow(),
            }
        )

    with st.expander("Recent tutor history", expanded=False):
        rows = (
            sessions.find({}, {"model": 1, "created_at": 1, "provider": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            provider_name = row.get("provider", "local" if "local" in (row.get("model") or "") else "hf")
            st.markdown(
                f"- {row.get('created_at'):%Y-%m-%d %H:%M} – {provider_name.upper()} – {row.get('model')}"
            )
