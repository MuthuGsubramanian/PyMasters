"""PyMasters Streamlit application entrypoint."""
from __future__ import annotations

import streamlit as st

from pymasters_app.components.header import render_header
from pymasters_app.components.sidebar import render_sidebar
from pymasters_app.pages import dashboard, login, profile, signup
from pymasters_app.utils.auth import AuthManager
from pymasters_app.utils.db import get_database
from utils.streamlit_helpers import rerun

st.set_page_config(
    page_title="PyMasters · Learn Python the modern way",
    page_icon="🐍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inject global styles for a modern UI.
st.markdown(
    """
    <style>
    body {background-color:#020617;}
    .stApp {background:radial-gradient(circle at 15% 20%, rgba(56,189,248,0.15), transparent 55%),
            linear-gradient(140deg, #0b1220, #020617);} 
    h1, h2, h3, h4 {color:#e2e8f0;}
    p, label, span, div {color:#cbd5f5;}
    .stMetric {background:rgba(15,23,42,0.65); border-radius:16px; padding:1rem; border:1px solid rgba(148,163,184,0.12);} 
    .stForm {background:rgba(15,23,42,0.65); padding:2rem; border-radius:20px; border:1px solid rgba(148,163,184,0.2);} 
    button[kind="primary"], .stButton>button {border-radius:12px; font-weight:600;}
    </style>
    """,
    unsafe_allow_html=True,
)


def _init_session_state() -> None:
    if "current_page" not in st.session_state:
        st.session_state["current_page"] = "Dashboard"


_init_session_state()
db = get_database()
auth_manager = AuthManager(db)
auth_manager.ensure_super_admin()
user = auth_manager.get_current_user()

public_pages = ("Login", "Sign Up")
private_pages = ("Dashboard", "Profile", "Log out")

if not user and st.session_state.get("current_page") not in public_pages:
    st.session_state["current_page"] = "Login"

if user:
    selected_page = render_sidebar(pages=private_pages, current_page=st.session_state["current_page"], user_name=user["name"])
else:
    selected_page = render_sidebar(pages=public_pages, current_page=st.session_state["current_page"], user_name=None)

if selected_page != st.session_state["current_page"]:
    st.session_state["current_page"] = selected_page


if st.session_state["current_page"] == "Log out":
    auth_manager.logout()
    st.session_state["current_page"] = "Login"
    rerun()

user = auth_manager.get_current_user()
render_header(user=user, on_logout=auth_manager.logout)

page = st.session_state["current_page"]

if page == "Login":
    login.render(auth_manager)
elif page == "Sign Up":
    signup.render(auth_manager)
elif page == "Profile":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        profile.render(auth_manager=auth_manager, user=user)
else:
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        dashboard.render(db=db, user=user)
