"""Generative Studio page using Hugging Face Inference API.

Allows users to generate images or videos by providing a prompt and model name.
Stores generation metadata in MongoDB for auditing and future retrieval.
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any

import streamlit as st

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
    st.markdown(
        """
        <div class="pm-section-title">Generative Studio</div>
        <div class="pm-section-subtitle">Create cinematic visuals and rapid concept art with Hugging Face models tuned for ideation.</div>
        """,
        unsafe_allow_html=True,
    )

    db = get_database()

    st.markdown("<div class='pm-card' style='padding:2rem; margin-bottom:1.6rem;'>", unsafe_allow_html=True)
    st.markdown(
        """
        <h3 style="margin-bottom:0.3rem;">Craft your next concept</h3>
        <p style="color:var(--pm-text-muted); margin-bottom:1.2rem;">Describe what you want to see and the studio will render it with state-of-the-art diffusion or video synthesis models.</p>
        """,
        unsafe_allow_html=True,
    )
    with st.form("gen_form"):
        col1, col2 = st.columns([0.68, 0.32], gap="large")
        with col1:
            prompt = st.text_area(
                "Prompt",
                value="A futuristic python robot teaching code in a neon-lit lab",
                height=140,
            )
        with col2:
            task = st.selectbox("Task", ["Image", "Video"], index=0)
            if task == "Image":
                default_model = "black-forest-labs/FLUX.1-dev"
            else:
                default_model = "damo-vilab/text-to-video-ms-1.7b"
            model = st.text_input("HF model", value=default_model)
            guidance = st.slider("Guidance scale", 1.0, 20.0, 8.0, 0.5)

        submitted = st.form_submit_button("Generate", use_container_width=True)
    st.markdown("</div>", unsafe_allow_html=True)

    if submitted:
        if not prompt.strip():
            st.warning("Please enter a descriptive prompt.")
            return

        try:
            with st.spinner("Contacting Hugging Face… this can take a bit the first time."):
                if task == "Image":
                    img = generate_image(prompt=prompt, model=model)
                    file_path = _save_bytes(img.bytes, ".png")
                    st.image(img.bytes, caption=f"{model}", use_column_width=True)
                    mime = img.mime_type
                else:
                    vid = generate_video(prompt=prompt, model=model)
                    # assume mp4 or octet-stream
                    file_path = _save_bytes(vid.bytes, ".mp4")
                    st.video(vid.bytes)
                    mime = vid.mime_type

            # persist metadata
            db["generations"].insert_one(
                {
                    "user_id": user.get("_id") if user else None,
                    "user_email": user.get("email") if user else None,
                    "task": task.lower(),
                    "model": model,
                    "prompt": prompt,
                    "guidance_scale": guidance,
                    "mime_type": mime,
                    "file_path": file_path,
                    "created_at": datetime.utcnow(),
                }
            )

            st.success("Generation saved to history.")
        except HuggingFaceError as e:
            st.error(str(e))
        except Exception as e:
            st.exception(e)

    with st.expander("Recent generations", expanded=False):
        rows = (
            db["generations"]
            .find({}, {"prompt": 1, "task": 1, "model": 1, "created_at": 1, "guidance_scale": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            st.markdown(
                """
                <div class="pm-card" style="padding:1rem 1.2rem; margin-bottom:0.8rem;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                    <div>
                      <div style="font-weight:600;">{task}</div>
                      <div style="color:var(--pm-text-muted); font-size:0.85rem;">{model}</div>
                    </div>
                    <div style="text-align:right; color:var(--pm-text-muted); font-size:0.8rem;">{created:%Y-%m-%d %H:%M}</div>
                  </div>
                  <div style="margin-top:0.6rem; color:var(--pm-text-muted); font-size:0.85rem;">{prompt}</div>
                </div>
                """.format(
                    task=row.get("task", "image").title(),
                    model=row.get("model", ""),
                    prompt=row.get("prompt", "")[:120] + ("…" if len(row.get("prompt", "")) > 120 else ""),
                    created=row.get("created_at"),
                ),
                unsafe_allow_html=True,
            )

