"""Signup page."""
from __future__ import annotations

import re

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{4,20}$")

SIGNUP_STYLES = """
<style>
.pm-signup-hero, .pm-signup-form {margin-top:1.3rem; border-radius:30px; border:1px solid rgba(99,102,241,0.35); padding:2.2rem;}
.pm-signup-hero {background:linear-gradient(160deg, rgba(30,64,175,0.28), rgba(15,23,42,0.85)); box-shadow:0 55px 160px -85px rgba(99,102,241,0.8);}
.pm-signup-hero h2 {font-size:2.35rem; margin-bottom:0.55rem;}
.pm-signup-hero p {color:rgba(226,232,240,0.88); font-size:1.02rem;}
.pm-hero-stack {margin-top:1.8rem; display:flex; flex-direction:column; gap:0.95rem;}
.pm-hero-card {padding:1rem 1.15rem; border-radius:20px; border:1px solid rgba(148,163,184,0.25); background:rgba(15,23,42,0.72);}
.pm-hero-card strong {display:block; font-size:1.05rem; margin-bottom:0.2rem;}
.pm-hero-card span {font-size:0.88rem; color:rgba(148,163,184,0.9);}
.pm-signup-form {border:1px solid rgba(56,189,248,0.35); background:linear-gradient(150deg, rgba(8,47,73,0.9), rgba(2,6,23,0.88)); box-shadow:0 55px 140px -75px rgba(14,165,233,0.85);}
form[data-testid="stForm"][aria-label="signup-form"] label {font-weight:600; letter-spacing:0.03em;}
form[data-testid="stForm"][aria-label="signup-form"] input {border-radius:14px !important; border:1px solid rgba(148,163,184,0.32); background:rgba(2,6,23,0.75);}
.pm-plan-grid {margin-top:1.9rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0.95rem;}
.pm-plan-card {padding:1.1rem 1.2rem; border-radius:20px; border:1px solid rgba(59,130,246,0.35); background:rgba(15,23,42,0.7); min-height:170px;}
.pm-plan-card h4 {margin-bottom:0.3rem;}
.pm-plan-card p {font-size:0.9rem; color:rgba(226,232,240,0.85);}
.pm-footnote {margin-top:1.1rem; color:rgba(148,163,184,0.95); font-size:0.9rem;}
</style>
"""


def render(auth_manager: AuthManager) -> None:
    """Render an immersive onboarding experience for new users."""

    st.markdown(SIGNUP_STYLES, unsafe_allow_html=True)

    hero_col, form_col = st.columns([0.44, 0.56], gap="large")

    with hero_col:
        st.markdown(
            """
            <section class="pm-signup-hero">
                <p style="letter-spacing:0.32em; text-transform:uppercase; color:#a5b4fc;">Start learning Python</p>
                <h2>Create your PyMasters ID.</h2>
                <p>
                    A single sign-in unlocks the AI Instructor, the Tutor, the Playground, and your curated Python roadmaps.
                    We only need a name, user ID, and password to get you coding quickly.
                </p>
                <div class="pm-hero-stack">
                    <div class="pm-hero-card">
                        <strong>AI-first learning</strong>
                        <span>Ask for hints, tests, or refactors while you write Python.</span>
                    </div>
                    <div class="pm-hero-card">
                        <strong>One workspace</strong>
                        <span>Progress, drafts, and lab history stay synced across every tool.</span>
                    </div>
                    <div class="pm-hero-card">
                        <strong>Optional signals</strong>
                        <span>Add email or phone later if you want reminders—never required to learn.</span>
                    </div>
                </div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <section class="pm-signup-form">
                <h3>Secure your access badge</h3>
                <p>Keep it simple: name, PyMasters ID, and a password. Email and phone are optional and only used for nudges.</p>
            </section>
            """,
            unsafe_allow_html=True,
        )

        st.info(
            "Your PyMasters ID is the single credential for login. Email and phone stay optional until you decide to add them.",
            icon="ℹ️",
        )

        with st.form("signup-form", clear_on_submit=False):
            name = st.text_input("Full name", placeholder="Ada Lovelace")
            username = st.text_input(
                "User ID",
                placeholder="e.g. pythonista7",
                help="4-20 characters. Letters, numbers, dots, underscores, or dashes.",
            )
            email = st.text_input("Email (optional)", placeholder="ada@example.com")
            phone = st.text_input("Phone (optional)", placeholder="+1 415 555 0111")
            password = st.text_input("Password", type="password", placeholder="Create a strong password")
            confirm_password = st.text_input("Confirm password", type="password", placeholder="Re-enter password")
            submitted = st.form_submit_button("Launch profile", use_container_width=True)

        if submitted:
            errors = []
            if not all([name.strip(), username.strip(), password, confirm_password]):
                errors.append("Name, user ID, and password fields are required.")
            if username and not USERNAME_PATTERN.match(username.strip()):
                errors.append(
                    "User IDs must be 4-20 characters and can include letters, numbers, dots, underscores, or dashes."
                )
            if password != confirm_password:
                errors.append("Your passwords do not match. Try again.")

            if errors:
                for message in errors:
                    st.error(message)
                return

            ok, user, message = auth_manager.signup(
                name=name,
                username=username,
                password=password,
                email=email or None,
                phone=phone or None,
            )
            if not ok or not user:
                st.error(message or "Unable to create the account. Please try again later.")
                return

            st.success(f"Welcome aboard, {user['name']}! Redirecting you to the dashboard...")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            """
            <div class="pm-plan-grid">
                <div class="pm-plan-card">
                    <h4>Guided path</h4>
                    <p>Follow a Python path that adapts as you complete labs and lessons.</p>
                </div>
                <div class="pm-plan-card">
                    <h4>AI Tutor</h4>
                    <p>Request examples, bug hunts, or practice drills from the Tutor in natural language.</p>
                </div>
                <div class="pm-plan-card">
                    <h4>Playground</h4>
                    <p>Experiment with snippets immediately after you learn a concept—no extra setup.</p>
                </div>
            </div>
            <div class="pm-footnote">Already have a badge? Switch to the <strong>Login</strong> view.</div>
            """,
            unsafe_allow_html=True,
        )
