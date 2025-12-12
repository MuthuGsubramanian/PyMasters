"""Header component that shows the authenticated user's context."""
from __future__ import annotations

from typing import Optional

import streamlit as st


def render_auth_header(user: Optional[dict]) -> None:
    """Render the sticky dashboard header with user context."""

    st.markdown(
        """
        <style>
        .pymasters-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.5rem 1rem;
            background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
            border-radius: 12px;
            border: 1px solid rgba(56, 189, 248, 0.3);
            margin-bottom: 1.5rem;
        }
        .pymasters-header h2 {
            margin: 0;
            color: #38bdf8;
        }
        .pymasters-header .user-meta {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .pymasters-header .avatar {
            width: 42px;
            height: 42px;
            border-radius: 999px;
            background: #38bdf8;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #0f172a;
            font-weight: 700;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    with st.container():
        st.markdown("<div class='pymasters-header'>", unsafe_allow_html=True)
        st.markdown("<h2>PyMasters Learning Hub</h2>", unsafe_allow_html=True)

        if user:
            initials = "".join(part[0].upper() for part in user["name"].split())
            with st.container():
                col1, col2 = st.columns([0.2, 0.8])
                with col1:
                    st.markdown(
                        f"<div class='avatar'>{initials}</div>",
                        unsafe_allow_html=True,
                    )
                with col2:
                    st.markdown(
                        f"""
                        <div class='user-meta'>
                            <div>
                                <div><strong>{user['name']}</strong></div>
                                <div style='color:#cbd5f5;font-size:0.85rem;'>
                                    {user.get('skill_level', 'Learner')} · {user.get('email', '')}
                                </div>
                            </div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                    st.button("Sign out", key="logout-button", on_click=_logout)
        else:
            st.write("Sign in to personalize your experience.")
        st.markdown("</div>", unsafe_allow_html=True)


def _logout() -> None:
    """Clear the Streamlit session state when a user signs out."""

    for key in ("user", "authenticated", "progress_cache"):
        if key in st.session_state:
            del st.session_state[key]
