"""AI-based Python Tutor using Hugging Face text generation.

Provides a terminal-style chat interface where learners can ask questions and
receive rich visual explanations. Sessions are stored in MongoDB for continuity.
"""
from __future__ import annotations

import html as html_mod
from datetime import datetime
from typing import Any

import streamlit as st
import requests

from pymasters_app.utils.db import get_database
from pymasters_app.utils.tutor_parser import parse_tutor_response
from config.settings import settings
from pymasters_app.utils.secrets import get_secret


HF_API_BASE = "https://api-inference.huggingface.co/models"


def _headers() -> dict[str, str]:
    token = settings.huggingfacehub_api_token or get_secret("HUGGINGFACEHUB_API_TOKEN")
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
    "Prefer standard library solutions. When code is unsafe, warn clearly.\n\n"
    "FORMAT your responses using these markers for rich visual rendering:\n"
    "- Use ```python ... ``` for code examples\n"
    "- Use :::concept TERM | EXPLANATION ::: for key definitions\n"
    "- Use :::steps STEP1 | STEP2 | STEP3 ::: for step-by-step breakdowns\n"
    "- Use :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 ::: for comparison tables\n"
    "Keep explanations concise and visual."
)


def render(*, auth_manager, user: dict[str, Any]) -> None:
    st.markdown("### AI Tutor")
    st.caption("Chat with a Python mentor. Responses include visual explanations.")

    db = get_database()
    sessions = db["tutor_sessions"]

    default_model = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    with st.expander("Settings"):
        model = st.text_input("HF chat model", value=default_model)
        col_t1, col_t2 = st.columns(2)
        with col_t1:
            temperature = st.slider("Creativity", 0.0, 1.5, 0.4, 0.1)
        with col_t2:
            max_tokens = st.slider("Max new tokens", 64, 2048, 512, 64)

    # Terminal window header
    st.markdown(
        '<div class="ob-card" style="'
        "padding: 8px 16px; "
        "border-bottom: none; "
        "border-radius: 10px 10px 0 0; "
        "display: flex; "
        "align-items: center; "
        "gap: 8px;"
        '">'
        # Three dots
        '<div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>'
        '<div style="width:8px;height:8px;border-radius:50%;background:#eab308;"></div>'
        '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>'
        # Label
        '<span style="'
        "font-family: 'JetBrains Mono', monospace; "
        "font-size: 10px; "
        "color: var(--text-muted); "
        "margin-left: 8px;"
        '">pymasters-tutor</span>'
        "</div>",
        unsafe_allow_html=True,
    )

    # Session state
    if "tutor_messages" not in st.session_state:
        st.session_state.tutor_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

    # Render chat history
    for msg in st.session_state.tutor_messages:
        if msg["role"] == "user":
            with st.chat_message("user"):
                escaped = html_mod.escape(msg["content"])
                st.markdown(
                    '<div style="'
                    "font-family: 'JetBrains Mono', monospace; "
                    "font-size: 13px; "
                    "color: var(--accent);"
                    f'">&#9656; {escaped}</div>',
                    unsafe_allow_html=True,
                )
        elif msg["role"] == "assistant":
            with st.chat_message("assistant"):
                st.markdown(
                    parse_tutor_response(msg["content"]),
                    unsafe_allow_html=True,
                )

    if prompt := st.chat_input("Ask me anything about Python..."):
        st.session_state.tutor_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            escaped = html_mod.escape(prompt)
            st.markdown(
                '<div style="'
                "font-family: 'JetBrains Mono', monospace; "
                "font-size: 13px; "
                "color: var(--accent);"
                f'">&#9656; {escaped}</div>',
                unsafe_allow_html=True,
            )

        # Build concatenated prompt for HF text-generation interface
        text_prompt = "\n\n".join(
            f"{m['role'].upper()}: {m['content']}"
            for m in st.session_state.tutor_messages
            if m["role"] != "system"
        )
        full_prompt = SYSTEM_PROMPT + "\n\n" + text_prompt + "\n\nASSISTANT:"

        with st.spinner("Thinking..."):
            try:
                reply = _chat_completion(
                    model=model, prompt=full_prompt, temperature=temperature, max_new_tokens=max_tokens
                )
            except Exception as e:
                reply = f"Sorry, I ran into a problem: {e}"

        st.session_state.tutor_messages.append({"role": "assistant", "content": reply})
        with st.chat_message("assistant"):
            st.markdown(
                parse_tutor_response(reply),
                unsafe_allow_html=True,
            )

        # Persist session
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

    with st.expander("Recent sessions"):
        rows = (
            sessions.find({}, {"model": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            ts = row.get("created_at")
            model_name = row.get("model", "unknown")
            ts_str = ts.strftime("%Y-%m-%d %H:%M") if ts else "unknown"
            st.markdown(
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>'
                '<span style="font-size:13px;color:var(--text-secondary);">'
                f"{ts_str} &mdash; {html_mod.escape(model_name)}"
                "</span>"
                "</div>",
                unsafe_allow_html=True,
            )
