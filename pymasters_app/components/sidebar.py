"""Sidebar navigation component."""
from __future__ import annotations

from typing import Iterable

import streamlit as st
from streamlit_option_menu import option_menu


def render_sidebar(*, pages: Iterable[str], current_page: str, user_name: str | None = None) -> str:
    """Render the navigation sidebar and return the selected page."""
    with st.sidebar:
        page_list = list(pages)
        st.markdown(
            """
            <style>
            [data-testid="stSidebar"] > div:first-child {
                background: linear-gradient(180deg, #0f172a, #020617);
                padding: 1.5rem 1rem;
            }
            .sidebar-title {
                color: #e2e8f0;
                font-weight: 600;
                font-size: 1.1rem;
                margin-bottom: 1.5rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }
            .option-menu .nav-link {
                border-radius: 12px;
                margin-bottom: 0.35rem;
                transition: background 0.3s ease;
                font-weight: 500;
            }
            .option-menu .nav-link:hover {
                background: rgba(148, 163, 184, 0.18);
            }
            .option-menu .nav-link.active {
                background: rgba(14, 165, 233, 0.35) !important;
                color: #0f172a !important;
            }
            </style>
            """,
            unsafe_allow_html=True,
        )
        if user_name:
            st.markdown(
                f"<div class='sidebar-title'>Hello, {user_name.split()[0]}</div>",
                unsafe_allow_html=True,
            )
        else:
            st.markdown("<div class='sidebar-title'>Welcome to PyMasters</div>", unsafe_allow_html=True)

        selected = option_menu(
            "",
            page_list,
            icons=["speedometer", "journal-code", "person-badge", "box-arrow-right"][: len(page_list)],
            menu_icon="cast",
            default_index=page_list.index(current_page) if current_page in page_list else 0,
            orientation="vertical",
            styles={
                "container": {"padding": "0", "background-color": "transparent"},
                "nav-link": {"font-size": "1rem", "text-align": "left", "margin": "0.2rem 0"},
                "nav-link-selected": {"background-color": "#38bdf8"},
            },
        )
    return selected
