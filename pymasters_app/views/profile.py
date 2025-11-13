"""Profile management page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(*, auth_manager: AuthManager, user: dict[str, str]) -> None:
    """Render the profile management view."""

    st.markdown(
        """
        <style>
        .pm-profile-grid {display:grid; grid-template-columns:minmax(0, 0.6fr) minmax(0, 0.4fr); gap:2rem;}
        @media (max-width: 1100px) {.pm-profile-grid {grid-template-columns:1fr;}}
        .pm-profile-card {
            padding:2rem;
            border-radius:28px;
            border:1px solid rgba(59,130,246,0.35);
            background:rgba(15,23,42,0.8);
            box-shadow:0 45px 120px -70px rgba(59,130,246,0.85);
        }
        .pm-profile-card h3 {margin-bottom:0.2rem;}
        .pm-profile-card p {color:rgba(148,163,184,0.92);}
        .pm-profile-card form label {font-weight:600; letter-spacing:0.04em;}
        .pm-profile-card form input {
            border-radius:14px !important;
            border:1px solid rgba(148,163,184,0.3);
            background:rgba(2,6,23,0.75);
        }
        .pm-security-card {
            padding:2rem;
            border-radius:28px;
            border:1px solid rgba(16,185,129,0.35);
            background:rgba(6,78,59,0.45);
        }
        .pm-security-chip {
            display:inline-flex;
            align-items:center;
            gap:0.35rem;
            padding:0.25rem 0.9rem;
            border-radius:999px;
            border:1px solid rgba(45,212,191,0.5);
            text-transform:uppercase;
            letter-spacing:0.3em;
            font-size:0.68rem;
            color:#ccfbf1;
        }
        .pm-danger-card {
            margin-top:1.5rem;
            padding:1.5rem;
            border-radius:24px;
            border:1px solid rgba(248,113,113,0.4);
            background:rgba(127,29,29,0.35);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        """
        <div style="margin-bottom:1.2rem;">
            <div class="pm-security-chip">Identity Center</div>
            <h2 style="margin-top:0.6rem;">Profile &amp; Security</h2>
            <p>Maintain your cinematic call-sign, update contact signals, and tighten your password hygiene.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pm-profile-grid'>", unsafe_allow_html=True)

    with st.container():
        st.markdown("<div class='pm-profile-card'>", unsafe_allow_html=True)
        with st.form("profile-form"):
            name = st.text_input("Full name", value=user.get("name", ""))
            username = st.text_input("User ID", value=user.get("username", ""), help="Visible to peers & used for login")
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
        st.markdown("</div>", unsafe_allow_html=True)

    with st.container():
        st.markdown("<div class='pm-security-card'>", unsafe_allow_html=True)
        st.markdown("### Change password", unsafe_allow_html=True)
        with st.form("password-form", clear_on_submit=True):
            current_password = st.text_input("Current password", type="password")
            new_password = st.text_input("New password", type="password")
            confirm_password = st.text_input("Confirm new password", type="password")
            password_submitted = st.form_submit_button("Update password", use_container_width=True)

        if password_submitted:
            if not current_password or not new_password:
                st.error("Please complete all fields.")
            elif new_password != confirm_password:
                st.error("Your new passwords do not match.")
            else:
                ok, message = auth_manager.change_password(
                    user["id"], current_password=current_password, new_password=new_password
                )
                if not ok:
                    st.error(message or "Unable to change the password right now.")
                else:
                    st.success("Password updated successfully.")
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown(
        """
        <div class="pm-danger-card">
            <h4>Danger zone</h4>
            <p>Need to sign out everywhere? Use the <strong>Sign out</strong> control in the global header to invalidate all sessions.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

