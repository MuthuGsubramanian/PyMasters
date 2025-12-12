"""Dashboard progress card component."""
from __future__ import annotations

from typing import Optional

import streamlit as st


def render_progress_card(
    *,
    title: str,
    completion_pct: float,
    subtitle: Optional[str] = None,
    streak_days: Optional[int] = None,
) -> None:
    """Render an informative progress card with micro-interactions."""

    st.markdown(
        """
        <style>
        .pymasters-card {
            padding: 1.25rem;
            border-radius: 16px;
            background: rgba(30, 41, 59, 0.65);
            border: 1px solid rgba(56, 189, 248, 0.25);
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.45);
            transition: transform 0.3s ease;
        }
        .pymasters-card:hover {
            transform: translateY(-4px);
        }
        .pymasters-card h3 {
            margin-bottom: 0.35rem;
            color: #f8fafc;
        }
        .pymasters-card .subtitle {
            color: #94a3b8;
            font-size: 0.9rem;
        }
        .pymasters-card .progress {
            margin-top: 0.75rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    with st.container():
        st.markdown("<div class='pymasters-card'>", unsafe_allow_html=True)
        st.markdown(f"<h3>{title}</h3>", unsafe_allow_html=True)
        if subtitle:
            st.markdown(f"<div class='subtitle'>{subtitle}</div>", unsafe_allow_html=True)
        st.progress(int(completion_pct))
        if streak_days is not None:
            st.markdown(
                f"<div style='margin-top:0.5rem;color:#38bdf8;'>🔥 {streak_days} day streak</div>",
                unsafe_allow_html=True,
            )
        st.markdown("</div>", unsafe_allow_html=True)
