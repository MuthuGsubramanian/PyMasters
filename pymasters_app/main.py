"""PyMasters Streamlit application entrypoint (modern layout)."""
from __future__ import annotations

import streamlit as st

from pymasters_app.components.header import render_header
from pymasters_app.views import dashboard, login, profile, signup
from pymasters_app.views import studio, tutor
from pymasters_app.utils.auth import AuthManager
from pymasters_app.utils.db import get_database
from pymasters_app.utils.bootstrap import ensure_collections
from utils.streamlit_helpers import rerun


st.set_page_config(
    page_title="PyMasters — Learn Python the modern way",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Inject global styles for a modern UI and hide default sidebar.
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600&family=Inter:wght@400;500;600;700&display=swap');

    :root {
        --pm-bg-dark: #05091a;
        --pm-bg-darker: #020617;
        --pm-primary: #38bdf8;
        --pm-primary-soft: rgba(56, 189, 248, 0.18);
        --pm-accent: #c084fc;
        --pm-text-strong: #f8fafc;
        --pm-text-muted: #94a3b8;
    }

    [data-testid="stSidebar"] {display:none;}
    body {background-color:var(--pm-bg-darker); font-family:'Inter', sans-serif;}
    .stApp {
        background:
            radial-gradient(circle at 12% 18%, rgba(56,189,248,0.22), transparent 55%),
            radial-gradient(circle at 88% 12%, rgba(192,132,252,0.2), transparent 50%),
            linear-gradient(135deg, #0b1220 0%, #020617 65%, #010314 100%);
        color:var(--pm-text-muted);
        font-family:'Inter', sans-serif;
    }
    .stApp::before {
        content:"";
        position:fixed;
        inset:0;
        pointer-events:none;
        background:
            radial-gradient(30% 40% at 20% 20%, rgba(56,189,248,0.12), transparent 80%),
            radial-gradient(28% 38% at 75% 15%, rgba(192,132,252,0.12), transparent 80%),
            radial-gradient(45% 60% at 50% 110%, rgba(14,116,144,0.25), transparent 85%);
        z-index:0;
    }
    .block-container {padding-top:1.5rem; position:relative; z-index:1;}
    h1, h2, h3, h4 {color:var(--pm-text-strong); font-family:'Orbitron', 'Inter', sans-serif; letter-spacing:0.02em;}
    p, label, span, div {color:var(--pm-text-muted);}
    .stMetric {
        background:rgba(15,23,42,0.65);
        border-radius:18px;
        padding:1.2rem 1.4rem;
        border:1px solid rgba(148,163,184,0.18);
        box-shadow:0 18px 45px -20px rgba(59,130,246,0.55);
    }
    .stForm {
        background:linear-gradient(145deg, rgba(15,23,42,0.95), rgba(2,6,23,0.85));
        padding:2.2rem;
        border-radius:24px;
        border:1px solid rgba(148,163,184,0.28);
        box-shadow:0 25px 60px -35px rgba(14,165,233,0.65);
    }
    .stForm label {font-weight:600; color:var(--pm-text-strong); letter-spacing:0.03em;}
    .stForm input, .stForm textarea {
        background:rgba(15,23,42,0.85);
        border-radius:12px;
        border:1px solid rgba(148,163,184,0.35);
        color:var(--pm-text-strong);
    }
    .stButton>button {
        border-radius:999px;
        font-weight:600;
        letter-spacing:0.04em;
        border:1px solid transparent;
        background:linear-gradient(135deg, rgba(56,189,248,0.95), rgba(192,132,252,0.85));
        color:#020617;
        box-shadow:0 18px 40px -22px rgba(14,165,233,0.95);
        transition:all 0.25s ease-in-out;
    }
    .stButton>button:hover {
        transform:translateY(-1px);
        box-shadow:0 28px 65px -30px rgba(192,132,252,0.85);
    }
    .stButton>button:focus-visible {
        outline:2px solid rgba(56,189,248,0.55);
        outline-offset:3px;
    }
    .pm-auth-card {
        background:linear-gradient(160deg, rgba(15,23,42,0.92), rgba(2,6,23,0.88));
        border-radius:26px;
        border:1px solid rgba(56,189,248,0.25);
        box-shadow:0 35px 90px -45px rgba(56,189,248,0.95);
        padding:2.4rem 2.1rem 2rem;
        position:relative;
        overflow:hidden;
    }
    .pm-auth-card::before {
        content:"";
        position:absolute;
        inset:0;
        background:radial-gradient(circle at -10% -10%, rgba(56,189,248,0.4), transparent 50%);
        opacity:0.45;
        pointer-events:none;
    }
    .pm-auth-card h2 {font-family:'Orbitron', 'Inter', sans-serif; font-size:1.75rem; margin-bottom:0.8rem;}
    .pm-auth-card p {color:var(--pm-text-muted); margin-bottom:1.2rem;}
    .pm-auth-card .pm-auth-meta {display:flex; align-items:center; gap:0.45rem; color:var(--pm-text-muted); font-size:0.85rem;}
    </style>
    """,
    unsafe_allow_html=True,
)


def _init_session_state() -> None:
    if "current_page" not in st.session_state:
        st.session_state["current_page"] = "Dashboard"


_init_session_state()

# Database + auth with graceful failure if Mongo is unreachable
try:
    db = get_database()
    ensure_collections(db)
    auth_manager = AuthManager(db)
    auth_manager.ensure_super_admin()
    user = auth_manager.get_current_user()
except Exception as exc:
    st.error(
        "Database connection failed. Set MONGODB_URI (and MONGODB_DB) and ensure your IP is allowed."
    )
    st.caption("Tip: On Streamlit Cloud, add them under st.secrets.")
    st.stop()

public_pages = ("Login", "Sign Up")
private_pages = ("Dashboard", "AI Tutor", "Studio", "Profile", "Log out")

if not user and st.session_state.get("current_page") not in public_pages:
    st.session_state["current_page"] = "Login"

# Render header with top navigation (replaces sidebar)
nav_pages = private_pages if user else public_pages
selected_page = render_header(
    user=user,
    on_logout=auth_manager.logout,
    pages=nav_pages,
    current_page=st.session_state["current_page"],
)
if selected_page and selected_page != st.session_state["current_page"]:
    st.session_state["current_page"] = selected_page

if st.session_state["current_page"] == "Log out":
    auth_manager.logout()
    st.session_state["current_page"] = "Login"
    rerun()

user = auth_manager.get_current_user()

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
elif page == "AI Tutor":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        tutor.render(auth_manager=auth_manager, user=user)
elif page == "Studio":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        studio.render(user=user)
else:
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        dashboard.render(db=db, user=user)

