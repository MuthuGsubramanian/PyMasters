"""Authentication utilities for the Streamlit app."""
from __future__ import annotations

import streamlit as st

from services.auth_service import AuthService
from utils.state import get_user, set_user


def render_login(auth_service: AuthService) -> None:
    """Render login/signup forms."""

    st.subheader("Sign in to continue")
    with st.form("login-form", clear_on_submit=False):
        email = st.text_input("Email", placeholder="you@pymasters.net")
        password = st.text_input("Password", type="password")
        submit = st.form_submit_button("Sign in")

    if submit:
        user = auth_service.authenticate(email=email, password=password)
        if not user:
            st.error("Invalid credentials. Try `pymasters` as the password for demo accounts.")
        else:
            set_user(user.dict())
            st.experimental_rerun()

    st.caption("Don't have an account yet? Reach out to our team for beta access.")


def ensure_authenticated(auth_service: AuthService) -> dict:
    """Ensure a user is authenticated, otherwise display the login form."""

    user = get_user()
    if user:
        return user

    render_login(auth_service)
    st.stop()
