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
          .pm-toolbar-shell {
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(18px);
            background: rgba(6, 12, 24, 0.75);
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
            margin: -1.4rem -2.5rem 1.6rem;
            padding: 1.3rem 2.5rem 1.1rem;
          }

          .pm-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1.5rem;
          }

          .pm-brand {
            display: flex;
            align-items: center;
            gap: 0.9rem;
          }

          .pm-brand .pm-logo {
            font-size: 1.75rem;
            line-height: 1;
          }

          .pm-brand h3 {
            margin: 0;
            font-size: 1.55rem;
          }

          .pm-brand p {
            margin: 0.1rem 0 0;
            color: rgba(226, 232, 240, 0.65);
          }

          .pm-user-card {
            text-align: right;
          }

          .pm-user-card .pm-user-name {
            font-weight: 600;
            font-size: 1rem;
          }

          .pm-user-card .pm-user-meta {
            color: rgba(148, 163, 184, 0.85);
            font-size: 0.82rem;
          }

          .pm-header-cta {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            color: rgba(190, 242, 255, 0.9);
            font-size: 0.9rem;
          }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pm-toolbar-shell'>", unsafe_allow_html=True)
    top_cols = st.columns([0.6, 0.4])
    with top_cols[0]:
        st.markdown(
            """
            <div class="pm-toolbar">
              <div class="pm-brand">
                <div class="pm-logo">🧠</div>
                <div>
                  <h3>PyMasters</h3>
                  <p>AI-guided Python learning studio</p>
                </div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with top_cols[1]:
        if user:
            st.markdown(
                f"""
                <div class="pm-user-card">
                  <div class="pm-header-cta">Learning streak is live · Keep shipping ⚡</div>
                  <div class="pm-user-name">{user['name']}</div>
                  <div class="pm-user-meta">{user.get('role', 'learner').title()} · {datetime.utcnow():%b %d, %Y %H:%M UTC}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if on_logout:
                st.button("Sign out", key="header-logout", on_click=on_logout)
        else:
            st.markdown(
                """
                <div class="pm-user-card" style="text-align:left;">
                  <div class="pm-header-cta">New here?</div>
                  <div style="font-weight:600; font-size:1rem;">Create your account in seconds</div>
                  <div class="pm-user-meta">Personalised paths · Hands-on AI tutor</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    st.markdown("</div>", unsafe_allow_html=True)

    selected: Optional[str] = None
    if pages:
        page_list = list(pages)
        try:
            current_index = page_list.index(current_page) if current_page in page_list else 0
        except ValueError:
            current_index = 0
        nav_key = "pm-nav-private" if user else "pm-nav-public"
        with st.container():
            selected_option = st.radio(
                "Navigation",
                options=page_list,
                index=current_index,
                horizontal=True,
                key=nav_key,
                label_visibility="collapsed",
            )
        if selected_option != current_page:
            selected = selected_option

    st.markdown("<hr class='pm-divider' />", unsafe_allow_html=True)
    return selected

