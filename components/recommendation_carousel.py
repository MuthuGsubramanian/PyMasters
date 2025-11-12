"""Carousel component for personalized recommendations."""
from __future__ import annotations

from typing import Iterable

import streamlit as st


def render_recommendation_carousel(items: Iterable[dict]) -> None:
    """Display recommended modules in a horizontally scrollable layout."""

    items = list(items)
    if not items:
        st.info("No personalized recommendations yet. Complete more lessons to unlock them!")
        return

    st.markdown(
        """
        <style>
        .pymasters-carousel {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(260px, 1fr);
            gap: 1rem;
            overflow-x: auto;
            padding-bottom: 0.5rem;
        }
        .pymasters-carousel::-webkit-scrollbar {
            height: 6px;
        }
        .pymasters-carousel::-webkit-scrollbar-thumb {
            background: rgba(56, 189, 248, 0.55);
            border-radius: 6px;
        }
        .pymasters-carousel-card {
            padding: 1rem;
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.25);
        }
        .pymasters-carousel-card h4 {
            margin-bottom: 0.35rem;
            color: #38bdf8;
        }
        .pymasters-carousel-card p {
            font-size: 0.9rem;
            color: #cbd5f5;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pymasters-carousel'>", unsafe_allow_html=True)
    for item in items:
        st.markdown("<div class='pymasters-carousel-card'>", unsafe_allow_html=True)
        st.markdown(f"<h4>{item['title']}</h4>", unsafe_allow_html=True)
        st.markdown(
            f"<p>{item.get('summary', 'Continue your learning journey with this curated pick.')}</p>",
            unsafe_allow_html=True,
        )
        st.markdown(
            f"<div style='color:#94a3b8;font-size:0.8rem;'>Based on: {item.get('reason', 'recent activity')}</div>",
            unsafe_allow_html=True,
        )
        st.markdown("</div>", unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)
