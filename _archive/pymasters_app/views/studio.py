"""Generative Studio page using Hugging Face Inference API.

Allows users to generate images or videos by providing a prompt and model name.
Stores generation metadata in DuckDB for auditing and future retrieval.
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any

import streamlit as st

from pymasters_app.utils.activity import log_activity
from pymasters_app.utils.db import get_database
from services.huggingface_service import (
    HuggingFaceError,
    generate_image,
    generate_video,
)


GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)


def _save_bytes(data: bytes, suffix: str) -> str:
    ts = int(time.time())
    path = GENERATED_DIR / f"gen_{ts}{suffix}"
    path.write_bytes(data)
    return str(path)


def render(*, user: dict[str, Any]) -> None:
    # ── Header ────────────────────────────────────────────────────────────────
    st.markdown("### Studio")
    st.caption("Generate images and videos with AI models.")

    db = get_database()

    # ── Generation form ───────────────────────────────────────────────────────
    with st.form("gen_form"):
        col_left, col_right = st.columns([0.65, 0.35])
        with col_left:
            prompt = st.text_area(
                "Prompt",
                value="A futuristic python robot teaching code in a neon-lit lab",
                height=120,
            )
        with col_right:
            task = st.selectbox("Task", ["Image", "Video"], index=0)
            default_model = (
                "black-forest-labs/FLUX.1-dev"
                if task == "Image"
                else "damo-vilab/text-to-video-ms-1.7b"
            )
            model = st.text_input("Model", value=default_model)

        submitted = st.form_submit_button("Generate", use_container_width=True)

    # ── Generation logic ──────────────────────────────────────────────────────
    if submitted:
        if not prompt.strip():
            st.warning("Please enter a descriptive prompt.")
            return

        try:
            with st.spinner("Contacting Hugging Face… this can take a bit the first time."):
                if task == "Image":
                    img = generate_image(prompt=prompt, model=model)
                    file_path = _save_bytes(img.bytes, ".png")
                    mime = img.mime_type
                    # Preview card
                    st.markdown(
                        '<div class="ob-card" style="padding:12px;">',
                        unsafe_allow_html=True,
                    )
                    st.image(img.bytes, use_column_width=True)
                    truncated = prompt[:80] + ("…" if len(prompt) > 80 else "")
                    st.markdown(
                        f'<p style="font-family:\'JetBrains Mono\',monospace;font-size:10px;" '
                        f'class="text-muted">{model} &mdash; {truncated}</p>',
                        unsafe_allow_html=True,
                    )
                    st.markdown("</div>", unsafe_allow_html=True)
                else:
                    vid = generate_video(prompt=prompt, model=model)
                    file_path = _save_bytes(vid.bytes, ".mp4")
                    mime = vid.mime_type
                    # Preview card
                    st.markdown(
                        '<div class="ob-card" style="padding:12px;">',
                        unsafe_allow_html=True,
                    )
                    st.video(vid.bytes)
                    truncated = prompt[:80] + ("…" if len(prompt) > 80 else "")
                    st.markdown(
                        f'<p style="font-family:\'JetBrains Mono\',monospace;font-size:10px;" '
                        f'class="text-muted">{model} &mdash; {truncated}</p>',
                        unsafe_allow_html=True,
                    )
                    st.markdown("</div>", unsafe_allow_html=True)

            # Persist metadata
            db["generations"].insert_one(
                {
                    "user_id": user.get("id") if user else None,
                    "user_email": user.get("email") if user else None,
                    "task": task.lower(),
                    "model": model,
                    "prompt": prompt,
                    "mime_type": mime,
                    "file_path": file_path,
                    "created_at": datetime.utcnow(),
                }
            )

            st.success("Generation saved to history.")
            log_activity(db, user.get("id", ""), "generation", f"{task}: {prompt[:60]}")
        except HuggingFaceError as e:
            st.error(str(e))
        except Exception as e:
            st.exception(e)

    # ── History ───────────────────────────────────────────────────────────────
    with st.expander("History"):
        rows = list(
            db["generations"]
            .find({}, {"prompt": 1, "task": 1, "model": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )

        if not rows:
            st.markdown(
                '<p style="font-family:\'JetBrains Mono\',monospace;font-size:10px;" '
                'class="text-muted">No generations yet.</p>',
                unsafe_allow_html=True,
            )
        else:
            for row in rows:
                task_val = (row.get("task") or "image").upper()
                pill_class = "accent" if task_val == "IMAGE" else "warning"
                truncated_prompt = (row.get("prompt") or "")[:70]
                if len(row.get("prompt") or "") > 70:
                    truncated_prompt += "…"
                ts = row.get("created_at")
                ts_str = ts.strftime("%Y-%m-%d %H:%M") if ts else "—"

                pill_color = "var(--accent)" if pill_class == "accent" else "var(--warning)"
                st.markdown(
                    f'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg-elevated);color:{pill_color};">{task_val}</span>'
                    f'<span style="font-size:11px;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{truncated_prompt}</span>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--text-muted);white-space:nowrap;">{ts_str}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
