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

# Inject a cohesive visual identity inspired by the reference UI.
st.markdown(
    """
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

      :root {
        --pm-bg-primary: #060914;
        --pm-bg-elevated: rgba(15, 23, 42, 0.78);
        --pm-bg-card: rgba(8, 20, 36, 0.9);
        --pm-border: rgba(148, 163, 184, 0.25);
        --pm-border-subtle: rgba(148, 163, 184, 0.12);
        --pm-text-primary: #e2e8f0;
        --pm-text-muted: #94a3b8;
        --pm-accent: #38bdf8;
        --pm-accent-strong: #0ea5e9;
        --pm-radius-lg: 22px;
        --pm-radius-md: 18px;
        --pm-radius-sm: 12px;
        --pm-shadow: 0 25px 65px rgba(15, 23, 42, 0.45);
      }

      html, body, [data-testid="stAppViewContainer"] > .main {
        background: radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.25), transparent 45%),
                    radial-gradient(circle at 85% 5%, rgba(124, 58, 237, 0.18), transparent 40%),
                    linear-gradient(160deg, #020617 0%, #0b1220 55%, #050b18 100%);
        font-family: 'Inter', sans-serif;
        color: var(--pm-text-primary);
      }

      .stApp {
        padding-bottom: 3rem;
        background: transparent;
      }

      [data-testid="stSidebar"] {
        display: none;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: 'Space Grotesk', sans-serif;
        color: var(--pm-text-primary);
        letter-spacing: -0.01em;
      }

      p, label, span, div {
        color: var(--pm-text-primary);
      }

      div.block-container {
        padding: 1.4rem 2.5rem 4rem;
        max-width: 1200px;
        margin: 0 auto;
      }

      .pm-page-wrapper {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0;
      }

      .pm-section-title {
        font-size: 2.1rem;
        margin-bottom: 0.2rem;
      }

      .pm-section-subtitle {
        color: var(--pm-text-muted);
        font-size: 1rem;
        margin-bottom: 1.6rem;
      }

      .pm-metric-card {
        background: linear-gradient(160deg, rgba(14, 116, 144, 0.35), rgba(8, 47, 73, 0.6));
        border-radius: var(--pm-radius-md);
        padding: 1.25rem 1.4rem;
        border: 1px solid var(--pm-border);
        box-shadow: var(--pm-shadow);
      }

      div[data-testid="stMetricDelta"] > div {
        color: var(--pm-text-muted) !important;
      }

      .stMetric > div:last-child {
        font-size: 1.8rem;
        font-weight: 600;
        color: var(--pm-text-primary);
      }

      .pm-card {
        border-radius: var(--pm-radius-lg);
        border: 1px solid var(--pm-border-subtle);
        background: var(--pm-bg-card);
        padding: 1.5rem;
        box-shadow: var(--pm-shadow);
        backdrop-filter: blur(16px);
        transition: transform 0.3s ease, border-color 0.3s ease;
      }

      .pm-card:hover {
        transform: translateY(-4px);
        border-color: rgba(56, 189, 248, 0.35);
      }

      .pm-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        background: rgba(56, 189, 248, 0.18);
        color: #bae6fd;
        font-size: 0.85rem;
        font-weight: 500;
      }

      .pm-status-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.9rem;
        border-radius: 999px;
        font-weight: 600;
        font-size: 0.82rem;
      }

      .pm-auth-card .stForm {
        padding: 0;
        background: transparent;
        border: none;
      }

      .pm-auth-card input, .pm-auth-card textarea {
        border-radius: var(--pm-radius-sm) !important;
        border: 1px solid rgba(148, 163, 184, 0.35) !important;
        background: rgba(15, 23, 42, 0.75) !important;
      }

      .pm-auth-card button,
      .pm-nav button,
      .stButton>button {
        border-radius: 999px !important;
        font-weight: 600 !important;
        letter-spacing: 0.01em;
        background: linear-gradient(140deg, var(--pm-accent), var(--pm-accent-strong)) !important;
        border: none !important;
        color: #03172a !important;
        box-shadow: 0 15px 35px rgba(56, 189, 248, 0.35);
      }

      .pm-nav button {
        width: 100%;
      }

      .pm-nav [data-baseweb="radiogroup"] {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        border: none;
        background: transparent;
      }

      .pm-nav [role="radiogroup"] {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
      }

      .pm-nav [data-baseweb="radio"] {
        margin: 0;
      }

      .pm-nav [data-baseweb="radio"] > label {
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        padding: 0.45rem 1.1rem;
        background: rgba(30, 41, 59, 0.65);
        color: var(--pm-text-primary);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.25s ease;
      }

      .pm-nav [data-baseweb="radio"] > label:hover {
        border-color: rgba(56, 189, 248, 0.4);
      }

      .pm-nav [data-baseweb="radio"][aria-checked="true"] > label {
        background: linear-gradient(140deg, rgba(56, 189, 248, 0.95), rgba(6, 182, 212, 0.95));
        border: none;
        color: #020617;
        box-shadow: 0 18px 40px rgba(56, 189, 248, 0.35);
      }

      .pm-nav [data-baseweb="radio"] > label > div:first-child {
        display: none;
      }

      .pm-auth-wrapper {
        display: flex;
        gap: 3rem;
        align-items: stretch;
        background: rgba(15, 23, 42, 0.55);
        border-radius: var(--pm-radius-lg);
        border: 1px solid var(--pm-border-subtle);
        padding: 2.5rem;
        box-shadow: var(--pm-shadow);
      }

      .pm-auth-hero {
        flex: 1;
        background: linear-gradient(160deg, rgba(56, 189, 248, 0.2), rgba(15, 118, 110, 0.2));
        border-radius: var(--pm-radius-md);
        border: 1px solid rgba(148, 163, 184, 0.2);
        padding: 2rem;
      }

      .pm-auth-hero h2 {
        font-size: 2.2rem;
        margin-bottom: 0.75rem;
      }

      .pm-auth-card {
        flex: 1;
        background: rgba(2, 6, 23, 0.75);
        border-radius: var(--pm-radius-md);
        padding: 2rem 2.4rem;
        border: 1px solid rgba(148, 163, 184, 0.25);
      }

      .pm-auth-card h3 {
        font-size: 1.7rem;
        margin-bottom: 0.4rem;
      }

      .pm-auth-card label {
        font-weight: 500;
        color: var(--pm-text-muted);
      }

      .pm-hero {
        position: relative;
        overflow: hidden;
        border-radius: var(--pm-radius-lg);
        padding: 2.6rem 2.8rem;
        margin-bottom: 2.2rem;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(99, 102, 241, 0.18));
        border: 1px solid rgba(148, 163, 184, 0.25);
        box-shadow: var(--pm-shadow);
      }

      .pm-hero::after {
        content: "";
        position: absolute;
        inset: auto -20% -40% 40%;
        height: 160%;
        background: radial-gradient(circle at center, rgba(59, 130, 246, 0.25), transparent 60%);
        filter: blur(40px);
        opacity: 0.8;
        pointer-events: none;
      }

      .pm-hero h2 {
        font-size: 2.4rem;
        margin-bottom: 0.4rem;
      }

      .pm-hero p {
        color: var(--pm-text-muted);
        font-size: 1.05rem;
        max-width: 640px;
      }

      .pm-hero .pm-tag {
        margin-bottom: 1rem;
      }

      .pm-module-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1.5rem;
      }

      .pm-module-card {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
      }

      .pm-module-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }

      .pm-module-meta {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        color: var(--pm-text-muted);
        font-size: 0.9rem;
      }

      .pm-module-actions {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
      }

      .pm-surface {
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: var(--pm-radius-md);
        padding: 1.6rem;
        box-shadow: var(--pm-shadow);
      }

      .pm-divider {
        border: none;
        height: 1px;
        margin: 1.6rem 0;
        background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.45), transparent);
      }

      .pm-empty-state {
        padding: 2.4rem;
        text-align: center;
        border: 1px dashed rgba(148, 163, 184, 0.35);
        border-radius: var(--pm-radius-md);
        color: var(--pm-text-muted);
        background: rgba(15, 23, 42, 0.35);
      }

      footer {visibility: hidden;}
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

