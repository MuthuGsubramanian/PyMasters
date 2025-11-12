"""Header + Custom Top Navigation component for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

import streamlit as st


def _slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def render_header(
    *,
    user: Optional[dict[str, Any]] = None,
    on_logout=None,
    pages: Optional[Iterable[str]] = None,
    current_page: Optional[str] = None,
) -> str | None:
    """Render the application header and a pill-style top navigation.

    Returns the selected page when pages are provided, otherwise None.
    """
    st.markdown(
        """
        <style>
        .pm-toolbar {position:sticky; top:0; z-index:50; backdrop-filter: blur(8px);
            border-bottom:1px solid rgba(148,163,184,0.18); padding: 0.6rem 0;}
        .pm-navwrap {display:flex; align-items:center; justify-content:space-between;}
        .pm-brand {display:flex; align-items:center; gap:0.6rem;}
        .pm-brand .logo {font-size:1.4rem}
        .pm-brand .title {margin:0; line-height:1}
        .pm-user {text-align:right;}
        .pm-pills {display:flex; gap:0.4rem; flex-wrap:wrap;}
        .pm-pill {border:1px solid rgba(148,163,184,0.28); background:rgba(2,6,23,0.6);
            color:#e2e8f0; padding:0.35rem 0.85rem; border-radius:999px; font-weight:600;}
        .pm-pill.active {background:#38bdf8; color:#0f172a; border-color:#38bdf8}
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
                <div class="pm-toolbar">
                  <div class="pm-navwrap">
                    <div class="pm-brand">
                      <div class="logo">🧠</div>
                      <div>
                        <h3 class="title">PyMasters</h3>
                        <div style="color:#64748b;">Adaptive Python learning studio</div>
                      </div>
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
                    <div class="pm-user">
                      <div style="font-weight:600;">{user['name']}</div>
                      <div style="color:#64748b; font-size:0.85rem;">{user.get('role', 'learner').title()}</div>
                      <div style="color:#94a3b8; font-size:0.75rem;">{datetime.utcnow():%b %d, %Y %H:%M UTC}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if on_logout:
                    st.button("Sign out", key="header-logout", on_click=on_logout)
            else:
                st.info("Create an account or sign in to unlock personalized content.")

    # Custom nav pills (buttons)
    if pages:
        page_list = list(pages)
        st.write("")
        nav_cols = st.columns(len(page_list))
        for i, page in enumerate(page_list):
            is_active = page == current_page
            label = f"{page}"
            with nav_cols[i]:
                if st.button(label, key=f"nav-{_slug(page)}", use_container_width=True):
                    selected = page
                # Render a hidden pill to let CSS apply active state (visual only)
                st.markdown(
                    f"<div class='pm-pills'><span class='pm-pill {'active' if is_active else ''}' style='display:none'>{label}</span></div>",
                    unsafe_allow_html=True,
                )
    st.markdown("---")
    return selected

