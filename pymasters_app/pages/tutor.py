"""AI-based Python Tutor using Hugging Face text generation.

Provides a chat interface where learners can ask questions and receive
guided explanations. Sessions are stored in MongoDB for continuity.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import streamlit as st
import requests

from pymasters_app.utils.db import get_database
from config.settings import settings


HF_API_BASE = "https://api-inference.huggingface.co/models"


def _headers() -> dict[str, str]:
    token = settings.huggingfacehub_api_token
    if not token:
        raise RuntimeError("Missing HUGGINGFACEHUB_API_TOKEN for tutor.")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _chat_completion(model: str, prompt: str, temperature: float, max_new_tokens: int) -> str:
    payload = {
        "inputs": prompt,
        "parameters": {
            "temperature": float(temperature),
            "max_new_tokens": int(max_new_tokens),
            "return_full_text": False,
        },
    }
    url = f"{HF_API_BASE}/{model}"
    resp = requests.post(url, headers=_headers(), json=payload, timeout=120)
    if resp.status_code == 503:
        # model warming up
        return "The selected model is warming up. Please try again in a few seconds."
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
    # Unified extraction across server responses
    if isinstance(data, list) and data and "generated_text" in data[0]:
        return data[0]["generated_text"]
    if isinstance(data, dict) and "generated_text" in data:
        return data["generated_text"]
    return str(data)


SYSTEM_PROMPT = (
    "You are PyMasters, a friendly senior Python tutor. "
    "Explain step-by-step, show minimal runnable examples, and suggest tests. "
    "Prefer standard library solutions. When code is unsafe, warn clearly."
)


def render(*, auth_manager, user: dict[str, Any]) -> None:
    st.subheader("AI Python Tutor")
    st.caption("Chat with a Python mentor powered by open models on Hugging Face.")

    db = get_database()
    sessions = db["tutor_sessions"]

    default_model = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    with st.sidebar:
        st.markdown("#### Tutor Settings")
        model = st.text_input("HF chat model", value=default_model)
        temperature = st.slider("Creativity", 0.0, 1.5, 0.4, 0.1)
        max_tokens = st.slider("Max new tokens", 64, 2048, 512, 64)

    # session state
    if "tutor_messages" not in st.session_state:
        st.session_state.tutor_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

    # history
    for msg in st.session_state.tutor_messages:
        if msg["role"] == "user":
            st.chat_message("user").write(msg["content"])
        elif msg["role"] == "assistant":
            st.chat_message("assistant").write(msg["content"])

    if prompt := st.chat_input("Ask me anything about Python…"):
        st.session_state.tutor_messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)

        # build concatenated prompt for HF text-generation interface
        text_prompt = "\n\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in st.session_state.tutor_messages
            if m["role"] != "system"
        )
        full_prompt = SYSTEM_PROMPT + "\n\n" + text_prompt + "\n\nASSISTANT:"

        with st.spinner("Thinking…"):
            try:
                reply = _chat_completion(
                    model=model, prompt=full_prompt, temperature=temperature, max_new_tokens=max_tokens
                )
            except Exception as e:
                reply = f"Sorry, I ran into a problem: {e}"

        st.session_state.tutor_messages.append({"role": "assistant", "content": reply})
        st.chat_message("assistant").write(reply)

        # persist
        sessions.insert_one(
            {
                "user_id": user.get("_id") if user else None,
                "user_email": user.get("email") if user else None,
                "model": model,
                "temperature": float(temperature),
                "max_new_tokens": int(max_tokens),
                "messages": st.session_state.tutor_messages[-4:],  # last turn for brevity
                "created_at": datetime.utcnow(),
            }
        )

    with st.expander("Recent tutor history", expanded=False):
        rows = (
            sessions.find({}, {"model": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            st.markdown(f"- {row.get('created_at'):%Y-%m-%d %H:%M} — {row.get('model')}")

