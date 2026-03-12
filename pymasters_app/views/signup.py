"""Signup page."""
from __future__ import annotations

import re

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{4,20}$")


def render(auth_manager: AuthManager) -> None:
    """Render the signup page with the Obsidian Terminal split layout."""

    left_col, right_col = st.columns([0.42, 0.58], gap="large")

    # ------------------------------------------------------------------
    # Left column — Brand panel
    # ------------------------------------------------------------------
    with left_col:
        st.markdown(
            """
            <div class="ob-card ob-grid-bg" style="
                min-height: 520px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 32px;
            ">
                <!-- Top section -->
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 24px;">
                        <div style="
                            width: 10px;
                            height: 10px;
                            border-radius: 50%;
                            background: #22c55e;
                            box-shadow: 0 0 8px #22c55e, 0 0 16px #22c55e88;
                            flex-shrink: 0;
                        "></div>
                        <span style="
                            font-family: monospace;
                            text-transform: uppercase;
                            letter-spacing: 0.2em;
                            font-size: 13px;
                            color: var(--ob-text-primary, #e2e8f0);
                        ">PYMASTERS</span>
                    </div>

                    <p style="
                        color: var(--ob-text-primary, #e2e8f0);
                        font-size: 22px;
                        font-weight: 600;
                        margin: 0 0 10px 0;
                        line-height: 1.35;
                    ">Create your account.<br>Start building.</p>

                    <p style="
                        color: var(--ob-text-muted, #94a3b8);
                        font-size: 13px;
                        margin: 0;
                        line-height: 1.6;
                    ">
                        A unique user ID is all it takes. Email and phone are entirely optional —
                        add them whenever you like.
                    </p>
                </div>

                <!-- Bottom info cards -->
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 32px;">
                    <div class="ob-card" style="padding: 12px 16px;">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Privacy-first</div>
                        <div style="color: var(--ob-text-muted, #94a3b8); font-size: 13px;">
                            Email and phone are always optional.
                        </div>
                    </div>
                    <div class="ob-card" style="padding: 12px 16px;">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Instant access</div>
                        <div style="color: var(--ob-text-muted, #94a3b8); font-size: 13px;">
                            Start learning the moment you sign up.
                        </div>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ------------------------------------------------------------------
    # Right column — Form
    # ------------------------------------------------------------------
    with right_col:
        st.markdown("### Create account")
        st.caption("All we need is a name, user ID, and password.")

        with st.form("signup-form", clear_on_submit=False):
            name = st.text_input("Full name", placeholder="Ada Lovelace")
            username = st.text_input(
                "User ID",
                placeholder="Thor11",
                help="4-20 characters. Letters, numbers, dots, underscores, or dashes.",
            )
            email = st.text_input("Email (optional)", placeholder="ada@example.com")
            phone = st.text_input("Phone (optional)", placeholder="+1 415 555 0111")
            password = st.text_input(
                "Password", type="password", placeholder="Create a strong password"
            )
            confirm_password = st.text_input(
                "Confirm password", type="password", placeholder="Re-enter password"
            )
            submitted = st.form_submit_button("Create account", use_container_width=True)

        if submitted:
            if not all([name.strip(), username.strip(), password, confirm_password]):
                st.error("Name, user ID, and password fields are required.")
                return
            if not USERNAME_PATTERN.match(username.strip()):
                st.error(
                    "User IDs must be 4-20 characters and can include letters, "
                    "numbers, dots, underscores, or dashes."
                )
                return
            if password != confirm_password:
                st.error("Your passwords do not match. Try again.")
                return

            ok, user, message = auth_manager.signup(
                name=name,
                username=username,
                password=password,
                email=email or None,
                phone=phone or None,
            )
            if not ok or not user:
                st.error(message or "Unable to create the account. Please try again later.")
                return

            st.success(f"Welcome aboard, {user['name']}! Redirecting you to the dashboard…")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            "<p style='color: var(--ob-text-muted, #94a3b8); font-size: 13px; margin-top: 12px;'>"
            "Already have an account? Switch to the <strong>Sign in</strong> tab.</p>",
            unsafe_allow_html=True,
        )
