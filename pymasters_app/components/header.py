"""Header + Top Navigation component for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

import streamlit as st
from streamlit_option_menu import option_menu


def render_header(
    *,
    user: Optional[dict[str, Any]] = None,
    on_logout=None,
    pages: Optional[Iterable[str]] = None,
    current_page: Optional[str] = None,
) -> str | None:
    """Render the application header and optional top navigation.

    Returns the selected page when pages are provided, otherwise None.
    """
    st.markdown(
        """
        <style>
        .pm-nav { display:flex; align-items:center; justify-content:space-between; padding: 0.75rem 0.5rem; gap:1rem; }
        .pm-brand {display:flex; align-items:center; gap:0.75rem;}
        .pm-brand .logo {font-size:1.75rem}
        .pm-brand .title {margin:0; line-height:1}
        .pm-meta {text-align:right;}
        </style>
        """,
        unsafe_allow_html=True,
    )

    selected: Optional[str] = None
    with st.container():
        col1, col2 = st.columns([0.7, 0.3])
        with col1:
            st.markdown(
                """
                <div class=\"pm-nav\">
                    <div class=\"pm-brand\">
                        <div class=\"logo\">🧠</div>
                        <div>
                            <h2 class=\"title\">PyMasters</h2>
                            <div style=\"color:#64748b;\">Next‑gen Python learning studio</div>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        with col2:
            if user:
                st.markdown(
                    f"""
                    <div class=\"pm-meta\">
                        <div style=\"font-weight:600;\">{user['name']}</div>
                        <div style=\"color:#64748b; font-size:0.85rem;\">{user.get('role', 'learner').title()}</div>
                        <div style=\"color:#94a3b8; font-size:0.75rem;\">{datetime.utcnow():%b %d, %Y %H:%M UTC}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if on_logout:
                    st.button("Sign out", key="header-logout", on_click=on_logout)
            else:
                st.info("Create an account or sign in to unlock personalized content.")

    if pages:
        page_list = list(pages)
        selected = option_menu(
            None,
            page_list,
            icons=["speedometer", "robot", "palette", "person-badge", "box-arrow-right"][: len(page_list)],
            menu_icon="cast",
            default_index=page_list.index(current_page) if current_page in page_list else 0,
            orientation="horizontal",
            styles={
                "container": {"padding": "0.2rem 0", "background-color": "transparent"},
                "nav-link": {"font-size": "1rem", "margin": "0 0.35rem", "border-radius": "12px"},
                "nav-link-selected": {"background-color": "#38bdf8", "color": "#0f172a"},
            },
        )
    st.markdown("---")
    return selected

