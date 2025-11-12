"""Signup page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render signup form."""
    st.write("## Create your account ✨")
    st.caption("Set up your profile to track progress and unlock personalised recommendations.")

    with st.form("signup-form", clear_on_submit=False):
        name = st.text_input("Full name", placeholder="Ada Lovelace")
        email = st.text_input("Email address", placeholder="ada@example.com")
        password = st.text_input("Password", type="password")
        confirm_password = st.text_input("Confirm password", type="password")
        submitted = st.form_submit_button("Create account", use_container_width=True)

    if submitted:
        if not all([name, email, password, confirm_password]):
            st.error("Please complete all fields to continue.")
            return
        if password != confirm_password:
            st.error("Your passwords do not match. Try again.")
            return

        ok, user, message = auth_manager.signup(name=name, email=email, password=password)
        if not ok or not user:
            st.error(message or "Unable to create the account. Please try again later.")
            return

        st.success(f"Welcome aboard, {user['name']}! Redirecting you to the dashboard...")
        st.session_state["current_page"] = "Dashboard"
        rerun()

    st.divider()
    st.info("Already have an account? Head to the **Login** page to sign in.")
