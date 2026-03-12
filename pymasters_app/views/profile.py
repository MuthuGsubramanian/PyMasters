"""Profile management page — Obsidian Terminal design."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(*, auth_manager: AuthManager, user: dict[str, str]) -> None:
    """Render the profile management view."""

    # ── Header ────────────────────────────────────────────────────────────────
    st.markdown("### Profile")
    st.caption("Manage your account and security settings.")
    st.divider()

    # ── Two-column layout ─────────────────────────────────────────────────────
    left_col, right_col = st.columns([0.55, 0.45], gap="large")

    # Left — Account details
    with left_col:
        st.markdown("#### Account details")
        with st.form("profile-form"):
            name = st.text_input("Full name", value=user.get("name", ""))
            username = st.text_input(
                "User ID",
                value=user.get("username", ""),
                help="Visible to peers & used for login",
            )
            email = st.text_input("Email (optional)", value=user.get("email", ""))
            phone = st.text_input("Phone (optional)", value=user.get("phone", ""))
            submitted = st.form_submit_button("Save profile", use_container_width=True)

        if submitted:
            ok, message, updated_user = auth_manager.update_profile(
                user["id"],
                name=name,
                username=username,
                email=email or None,
                phone=phone or None,
            )
            if not ok:
                st.error(message or "We couldn't update your profile right now.")
            else:
                st.success("Profile updated successfully.")
                if updated_user:
                    st.session_state["user"] = updated_user
                rerun()

    # Right — Change password
    with right_col:
        st.markdown("#### Change password")
        with st.form("password-form", clear_on_submit=True):
            current_password = st.text_input("Current password", type="password")
            new_password = st.text_input("New password", type="password")
            confirm_password = st.text_input("Confirm new password", type="password")
            password_submitted = st.form_submit_button(
                "Update password", use_container_width=True
            )

        if password_submitted:
            if not current_password or not new_password:
                st.error("Please complete all fields.")
            elif new_password != confirm_password:
                st.error("Your new passwords do not match.")
            else:
                ok, message = auth_manager.change_password(
                    user["id"],
                    current_password=current_password,
                    new_password=new_password,
                )
                if not ok:
                    st.error(message or "Unable to change the password right now.")
                else:
                    st.success("Password updated successfully.")

    # ── Danger zone ───────────────────────────────────────────────────────────
    st.markdown(
        """
        <div class="ob-card" style="border-left:3px solid var(--danger); margin-top:24px;">
            <p style="font-family:'JetBrains Mono',monospace; font-size:13px;
                      color:var(--text-primary); font-weight:600; margin:0 0 4px 0;">
                Danger zone
            </p>
            <p style="font-size:12px; color:var(--text-muted); margin:0 0 12px 0;">
                Signing out will end your current session immediately.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown('<div class="ob-btn-secondary">', unsafe_allow_html=True)
    if st.button("Sign out", key="profile-sign-out"):
        auth_manager.logout()
        st.session_state["current_page"] = "Sign in"
        rerun()
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Settings stub ─────────────────────────────────────────────────────────
    with st.expander("Settings"):
        st.markdown("#### Preferences")
        st.toggle(
            "Dark mode",
            value=True,
            disabled=True,
            help="Obsidian Terminal theme is always dark.",
        )
        hf_token = st.text_input(
            "HuggingFace API token",
            type="password",
            placeholder="hf_...",
            value=st.session_state.get("hf_token", ""),
        )
        if hf_token != st.session_state.get("hf_token", ""):
            st.session_state["hf_token"] = hf_token
            st.toast("HuggingFace token saved for this session.")

        st.markdown("#### Notifications")
        st.checkbox(
            "Email notifications",
            disabled=True,
            help="Coming soon",
        )
        st.checkbox(
            "Progress reminders",
            disabled=True,
            help="Coming soon",
        )
