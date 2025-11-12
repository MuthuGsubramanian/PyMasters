"""Authentication utilities for the Streamlit app."""
from __future__ import annotations

import streamlit as st

from services.auth_service import AuthService
from utils.state import get_user, set_user


def render_login(auth_service: AuthService) -> None:
    """Render login and signup forms side-by-side."""

    st.subheader("Access your workspace")
    login_tab, signup_tab = st.tabs(["Sign in", "Create account"])

    with login_tab:
        with st.form("login-form", clear_on_submit=False):
            email = st.text_input("Email", placeholder="you@pymasters.net")
            password = st.text_input("Password", type="password")
            submit = st.form_submit_button("Sign in")

        if submit:
            user = auth_service.authenticate(email=email, password=password)
            if not user:
                st.error(
                    "Invalid credentials. Try `pymasters` as the password for demo accounts."
                )
            else:
                set_user(user.model_dump())
                st.experimental_rerun()

    with signup_tab:
        with st.form("signup-form", clear_on_submit=False):
            name = st.text_input("Full name", placeholder="Ada Lovelace")
            email = st.text_input("Email address", placeholder="you@pymasters.net")
            password = st.text_input("Password", type="password")
            skill_level = st.selectbox(
                "Skill level",
                ("Beginner", "Intermediate", "Advanced"),
                index=1,
            )
            learning_goals = st.multiselect(
                "Focus areas",
                [
                    "Automation",
                    "Data pipelines",
                    "APIs",
                    "AI assistants",
                    "Testing",
                ],
            )
            submit_signup = st.form_submit_button("Create my account")

        if submit_signup:
            if not password:
                st.error("Please choose a password to secure your account.")
            else:
                try:
                    user = auth_service.create_user(
                        name=name,
                        email=email,
                        password=password,
                        skill_level=skill_level,
                        learning_goals=learning_goals,
                    )
                except ValueError as error:
                    st.error(str(error))
                else:
                    set_user(user.model_dump())
                    st.success("Account created! You're now signed in.")
                    st.experimental_rerun()

    st.caption("Test accounts use `pymasters` as the password. Create your own to explore.")


def ensure_authenticated(auth_service: AuthService) -> dict:
    """Ensure a user is authenticated, otherwise display the login form."""

    user = get_user()
    if user:
        return user

    render_login(auth_service)
    st.stop()
