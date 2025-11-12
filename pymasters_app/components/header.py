"""Header component for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import streamlit as st


def render_header(*, user: dict[str, Any] | None, on_logout) -> None:
    """Render the application header."""
    with st.container():
        col1, col2 = st.columns([3, 1])
        with col1:
            st.markdown(
                """
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="font-size:2.2rem;">🐍</div>
                    <div>
                        <h1 style="margin-bottom:0;">PyMasters</h1>
                        <p style="margin-top:0.2rem; color:#64748b;">Modern Python learning platform</p>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        with col2:
            if user:
                st.markdown(
                    f"""
                    <div style="text-align:right;">
                        <div style="font-weight:600;">{user['name']}</div>
                        <div style="color:#64748b; font-size:0.85rem;">{user.get('role', 'learner').title()}</div>
                        <div style="color:#94a3b8; font-size:0.75rem;">Last updated {datetime.utcnow():%b %d, %Y %H:%M UTC}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                st.button("Sign out", key="header-logout", on_click=on_logout)
            else:
                st.info("Create an account or sign in to unlock personalized content.")
    st.markdown("---")
