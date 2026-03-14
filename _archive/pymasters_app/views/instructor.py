"\"\"Tiered AI instructor view driven by the local AI service.\"\"\""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import streamlit as st

from config.settings import settings
from services.local_ai_service import (
    LocalAIError,
    create_local_chat_completion,
)


SYSTEM_PROMPT = (
    "You are PyMasters Sensei, a passionate senior Python mentor. "
    "Teach concepts with clear steps, runnable examples, and practical exercises. "
    "Offer context on why/when to use a technique, and warn about common pitfalls."
)


@dataclass(frozen=True)
class Track:
    slug: str
    title: str
    summary: str
    topics: tuple[str, ...]


TRACKS: tuple[Track, ...] = (
    Track(
        slug="foundations",
        title="Core Foundations",
        summary="Absolute essentials to build confidence with Python syntax and tooling.",
        topics=(
            "Variables and data structures",
            "Control flow patterns",
            "Functions and modules",
            "Working with files & context managers",
            "Debugging strategies",
        ),
    ),
    Track(
        slug="craftsmanship",
        title="Craftsmanship & Testing",
        summary="Write production-grade Python with tests, packaging, and performance in mind.",
        topics=(
            "Test-driven development with pytest",
            "Packaging projects (pyproject.toml, poetry, pip)",
            "Error handling patterns",
            "Type hints and static analysis",
            "Performance profiling",
        ),
    ),
    Track(
        slug="ai-workflows",
        title="AI & Automation",
        summary="Blend Python with data pipelines and local AI capabilities.",
        topics=(
            "Vectorizing documents with local embeddings",
            "Streaming chat completions",
            "Automating notebooks and scripts",
            "Building CLI copilots",
            "Secure prompt engineering",
        ),
    ),
)


def _teach(topic: str, depth: str) -> str:
    """Ask the local AI instructor to teach the requested topic."""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Create a {depth} tutorial for: {topic}. "
                "Structure it as: 1) context, 2) step-by-step, 3) runnable snippets, 4) practice ideas."
            ),
        },
    ]
    response = create_local_chat_completion(
        model=settings.local_ai_default_model,
        messages=messages,
        temperature=0.35,
        max_tokens=800,
    )
    choice = response.get("choices", [{}])[0]
    if "message" in choice and "content" in choice["message"]:
        return choice["message"]["content"]
    return str(response)


def render(*, auth_manager, user: dict[str, str]) -> None:  # noqa: D401
    st.subheader("AI Instructor")
    st.caption("Browse curated Python paths and ask the on-prem instructor to deep dive on any topic.")

    st.markdown(
        """
        <style>
        .pm-track-card {
            padding:1.5rem;
            border-radius:28px;
            border:1px solid rgba(56,189,248,0.35);
            background:rgba(15,23,42,0.78);
            box-shadow:0 35px 90px -65px rgba(14,165,233,0.65);
            margin-bottom:1.2rem;
        }
        .pm-track-card h3 {margin-bottom:0.35rem;}
        .pm-topic-pill {
            display:inline-block;
            margin:0.25rem 0.35rem 0 0;
            padding:0.35rem 0.8rem;
            border-radius:999px;
            background:rgba(56,189,248,0.15);
            color:#bae6fd;
            font-size:0.85rem;
            letter-spacing:0.05em;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    col_l, col_r = st.columns([0.6, 0.4], gap="large")

    with col_l:
        st.markdown("### Guided tracks")
        for track in TRACKS:
            with st.container():
                st.markdown("<div class='pm-track-card'>", unsafe_allow_html=True)
                st.markdown(f"#### {track.title}", unsafe_allow_html=True)
                st.markdown(track.summary)
                st.markdown(
                    "".join(f"<span class='pm-topic-pill'>{topic}</span>" for topic in track.topics),
                    unsafe_allow_html=True,
                )
                st.markdown("</div>", unsafe_allow_html=True)

    with col_r:
        st.markdown("### Ask the instructor")
        topic = st.text_input("Topic or question", placeholder="Explain context managers with real-world examples")
        depth = st.selectbox("Detail level", ("concise briefing", "lesson plan", "deep dive with exercises"), index=1)
        ask = st.button("Teach me", use_container_width=True, type="primary", disabled=not topic.strip())

        if ask and topic.strip():
            with st.spinner("Teaching in progress..."):
                try:
                    answer = _teach(topic.strip(), depth)
                except LocalAIError as exc:
                    answer = f"Local AI instructor is unavailable: {exc}"
                st.write(answer)

    st.markdown("### Quickstart labs")
    lab_col1, lab_col2, lab_col3 = st.columns(3)
    labs = [
        ("Build a CLI timer", "Parse args, run timers, emit desktop notifications."),
        ("Data diary", "Log experiments into DuckDB and summarize trends."),
        ("Prompt sandbox", "Compare prompts against the local AI model in a structured grid."),
    ]
    for col, lab in zip((lab_col1, lab_col2, lab_col3), labs):
        with col:
            st.markdown(
                f"""
                <div class='pm-track-card' style="padding:1rem;">
                    <strong>{lab[0]}</strong>
                    <p style="margin-top:0.4rem;">{lab[1]}</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
