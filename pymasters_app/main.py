"""PyMasters Streamlit application entrypoint."""
from __future__ import annotations

import streamlit as st

from pymasters_app.styles import OBSIDIAN_CSS
from pymasters_app.components.tab_nav import render_tab_nav
from pymasters_app.views import dashboard, login, profile, signup
from pymasters_app.views import studio, tutor, playground
from pymasters_app.utils.auth import AuthManager
from pymasters_app.utils.db import get_database
from pymasters_app.utils.bootstrap import ensure_collections


st.set_page_config(
    page_title="PyMasters",
    page_icon="▸",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(OBSIDIAN_CSS, unsafe_allow_html=True)


def _init_session_state() -> None:
    if "current_page" not in st.session_state:
        st.session_state["current_page"] = "Dashboard"


_init_session_state()


def _initialize_database_and_auth() -> tuple[object, AuthManager]:
    try:
        db = get_database()
    except Exception as exc:  # pragma: no cover
        st.error("Database connection failed. Check MONGODB_URI and ensure your IP is allowed.")
        st.exception(exc)
        st.stop()

    if getattr(db, "is_local", False):
        st.toast("Using local datastore — data persists only on this machine.", icon="💾")

    try:
        ensure_collections(db)
        auth_manager = AuthManager(db)
        auth_manager.ensure_super_admin()
    except Exception as exc:  # pragma: no cover
        st.error("Failed to initialize application state. Check the logs.")
        st.exception(exc)
        st.stop()

    return db, auth_manager


db, auth_manager = _initialize_database_and_auth()
user = auth_manager.get_current_user()

public_pages = ("Sign in", "Sign up")
private_pages = ("Dashboard", "Tutor", "Studio", "Playground", "Profile")

if not user and st.session_state.get("current_page") not in public_pages:
    st.session_state["current_page"] = "Sign in"

nav_pages = private_pages if user else public_pages
selected_page = render_tab_nav(
    pages=nav_pages,
    current_page=st.session_state["current_page"],
)
if selected_page and selected_page != st.session_state["current_page"]:
    st.session_state["current_page"] = selected_page

user = auth_manager.get_current_user()
page = st.session_state["current_page"]

if page == "Sign in":
    login.render(auth_manager)
elif page == "Sign up":
    signup.render(auth_manager)
elif page == "Profile":
    if not user:
        st.warning("Sign in to continue.")
        login.render(auth_manager)
    else:
        profile.render(auth_manager=auth_manager, user=user)
elif page == "Tutor":
    if not user:
        st.warning("Sign in to continue.")
        login.render(auth_manager)
    else:
        tutor.render(auth_manager=auth_manager, user=user)
elif page == "Studio":
    if not user:
        st.warning("Sign in to continue.")
        login.render(auth_manager)
    else:
        studio.render(user=user)
elif page == "Playground":
    if not user:
        st.warning("Sign in to continue.")
        login.render(auth_manager)
    else:
        playground.render(user=user)
else:
    if not user:
        st.warning("Sign in to continue.")
        login.render(auth_manager)
    else:
        dashboard.render(db=db, user=user)
