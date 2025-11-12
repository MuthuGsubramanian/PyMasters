"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager


def render(auth_manager: AuthManager) -> None:
    """Render the login form."""
    st.write("## Welcome back 👋")
    st.caption("Sign in to access your personalised Python learning journey.")

    with st.form("login-form", clear_on_submit=False):
        email = st.text_input("Email address", placeholder="you@example.com")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Sign in", use_container_width=True)

    if submitted:
        if not email or not password:
            st.error("Please provide both email and password.")
            return

        user = auth_manager.login(email=email, password=password)
        if not user:
            st.error("We couldn't find an account with those credentials.")
            return

        st.success(f"Welcome back, {user['name']}! Redirecting to your dashboard...")
        st.session_state["current_page"] = "Dashboard"
        st.experimental_rerun()

    st.divider()
    st.info("New to PyMasters? Jump over to the **Sign Up** page to create your free account.")
