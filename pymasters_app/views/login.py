"""Login page — Obsidian Terminal split layout."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render the login page with the Obsidian Terminal split layout."""

    left_col, right_col = st.columns([0.45, 0.55], gap="large")

    # ------------------------------------------------------------------
    # Left column — Brand panel
    # ------------------------------------------------------------------
    with left_col:
        st.markdown(
            """
            <div class="ob-card ob-grid-bg" style="
                min-height:420px;
                display:flex;
                flex-direction:column;
                justify-content:space-between;
                padding:32px;
            ">
                <!-- Top section -->
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
                        <span style="
                            width:10px;
                            height:10px;
                            border-radius:50%;
                            background:#22c55e;
                            box-shadow:0 0 8px 2px rgba(34,197,94,0.7);
                            display:inline-block;
                            flex-shrink:0;
                        "></span>
                        <span style="
                            font-family:'JetBrains Mono',monospace;
                            text-transform:uppercase;
                            letter-spacing:0.18em;
                            font-size:11px;
                            color:var(--text-muted);
                        ">PYMASTERS</span>
                    </div>

                    <div style="
                        color:var(--text-primary);
                        font-size:22px;
                        font-weight:600;
                        line-height:1.3;
                        margin-bottom:10px;
                    ">Learn Python. Build things. Ship fast.</div>

                    <div style="
                        color:var(--text-muted);
                        font-size:13px;
                        line-height:1.55;
                    ">Your structured Python learning environment — from core syntax to production-ready projects.</div>
                </div>

                <!-- Bottom chips -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:32px;">
                    <span style="
                        background:var(--bg-elevated);
                        border:1px solid var(--border);
                        border-radius:6px;
                        padding:4px 10px;
                        font-family:'JetBrains Mono',monospace;
                        font-size:10px;
                        color:var(--text-muted);
                    ">3 modules</span>
                    <span style="
                        background:var(--bg-elevated);
                        border:1px solid var(--border);
                        border-radius:6px;
                        padding:4px 10px;
                        font-family:'JetBrains Mono',monospace;
                        font-size:10px;
                        color:var(--text-muted);
                    ">AI tutor</span>
                    <span style="
                        background:var(--bg-elevated);
                        border:1px solid var(--border);
                        border-radius:6px;
                        padding:4px 10px;
                        font-family:'JetBrains Mono',monospace;
                        font-size:10px;
                        color:var(--text-muted);
                    ">Studio</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ------------------------------------------------------------------
    # Right column — Sign in form
    # ------------------------------------------------------------------
    with right_col:
        st.markdown("### Sign in")
        st.markdown(
            '<p style="color:var(--text-muted);font-size:13px;margin-top:-8px;">'
            "Welcome back. Enter your credentials to continue."
            "</p>",
            unsafe_allow_html=True,
        )

        with st.form("login-form", clear_on_submit=False):
            identifier = st.text_input(
                "User ID, email, or phone",
                placeholder="Thor11 / you@example.com / +1 555 123 4567",
            )
            password = st.text_input(
                "Password",
                type="password",
                placeholder="••••••••",
            )
            submitted = st.form_submit_button("Sign in", use_container_width=True)

        st.markdown(
            '<p style="color:var(--text-muted);font-size:13px;">'
            "No account? Switch to the <strong>Sign up</strong> tab."
            "</p>",
            unsafe_allow_html=True,
        )

        if submitted:
            if not identifier or not password:
                st.error("Please provide both your identifier and password.")
                return

            user = auth_manager.login(identifier=identifier, password=password)
            if not user:
                st.error("Invalid credentials. Please try again.")
                return

            st.success(f"Welcome back, {user['name']}!")
            st.session_state["current_page"] = "Dashboard"
            rerun()
