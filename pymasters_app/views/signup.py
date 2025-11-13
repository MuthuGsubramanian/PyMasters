"""Signup page."""
from __future__ import annotations

import re

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{4,20}$")


def render(auth_manager: AuthManager) -> None:
    """Render an immersive onboarding experience for new users."""

    st.markdown(
        """
        <style>
        .pm-signup-grid {
            display:grid;
            grid-template-columns:minmax(0, 0.42fr) minmax(0, 0.58fr);
            gap:2.2rem;
            margin-top:1.4rem;
        }
        @media (max-width: 1100px) {
            .pm-signup-grid {grid-template-columns:1fr;}
        }
        .pm-signup-hero {
            padding:2.5rem;
            border-radius:32px;
            background:linear-gradient(160deg, rgba(30,64,175,0.25), rgba(15,23,42,0.85));
            border:1px solid rgba(99,102,241,0.35);
            box-shadow:0 55px 160px -85px rgba(99,102,241,0.8);
        }
        .pm-signup-hero h2 {font-size:2.4rem; margin-bottom:0.6rem;}
        .pm-signup-hero p {color:rgba(226,232,240,0.85); font-size:1.05rem;}
        .pm-hero-stack {
            margin-top:2rem;
            display:flex;
            flex-direction:column;
            gap:1rem;
        }
        .pm-hero-card {
            padding:1rem 1.2rem;
            border-radius:20px;
            border:1px solid rgba(148,163,184,0.25);
            background:rgba(15,23,42,0.72);
        }
        .pm-hero-card strong {display:block; font-size:1.1rem; margin-bottom:0.2rem;}
        .pm-hero-card span {font-size:0.88rem; color:rgba(148,163,184,0.9);}
        .pm-form-card {
            padding:2.5rem;
            border-radius:32px;
            border:1px solid rgba(56,189,248,0.35);
            background:linear-gradient(150deg, rgba(8,47,73,0.9), rgba(2,6,23,0.88));
            box-shadow:0 55px 140px -75px rgba(14,165,233,0.85);
        }
        .pm-form-card h3 {font-size:2rem; margin-bottom:0.8rem;}
        .pm-form-card form label {font-weight:600; letter-spacing:0.04em;}
        .pm-form-card form input {
            border-radius:14px !important;
            border:1px solid rgba(148,163,184,0.32);
            background:rgba(2,6,23,0.75);
        }
        .pm-plan-grid {
            margin-top:2rem;
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));
            gap:1rem;
        }
        .pm-plan-card {
            padding:1.15rem 1.3rem;
            border-radius:20px;
            border:1px solid rgba(59,130,246,0.35);
            background:rgba(15,23,42,0.7);
            min-height:180px;
        }
        .pm-plan-card h4 {margin-bottom:0.4rem;}
        .pm-plan-card p {font-size:0.9rem; color:rgba(226,232,240,0.85);}
        .pm-footnote {margin-top:1.2rem; color:rgba(148,163,184,0.95); font-size:0.9rem;}
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pm-signup-grid'>", unsafe_allow_html=True)
    hero_col, form_col = st.columns([0.42, 0.58])

    with hero_col:
        st.markdown(
            """
            <div class="pm-signup-hero">
                <p style="letter-spacing:0.35em; text-transform:uppercase; color:#a5b4fc;">Origin story</p>
                <h2>Craft your PyMasters identity.</h2>
                <p>
                    Choose a cinematic user ID (think <strong>IAmIronMan</strong>) and unlock personalised roadmaps,
                    synced sandboxes, and telemetry-rich dashboards. Email + phone remain optional at every stage.
                </p>
                <div class="pm-hero-stack">
                    <div class="pm-hero-card">
                        <strong>Unified Passport</strong>
                        <span>Use one call-sign across tutor, studio, and analytics.</span>
                    </div>
                    <div class="pm-hero-card">
                        <strong>Privacy-first</strong>
                        <span>Provide email/phone only if you want progress notifications.</span>
                    </div>
                    <div class="pm-hero-card">
                        <strong>Instant progression</strong>
                        <span>Cards surface your missions the moment you land in the dashboard.</span>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <div class="pm-form-card">
                <h3>Secure your access badge</h3>
                <p>All we require is your name, a unique user ID, and a password. Email and phone are optional signals.</p>
            """,
            unsafe_allow_html=True,
        )

        with st.form("signup-form", clear_on_submit=False):
            name = st.text_input("Full name", placeholder="Ada Lovelace")
            username = st.text_input("User ID", placeholder="Thor11", help="4-20 characters. Letters, numbers, dots, dashes.")
            email = st.text_input("Email (optional)", placeholder="ada@example.com")
            phone = st.text_input("Phone (optional)", placeholder="+1 415 555 0111")
            password = st.text_input("Password", type="password", placeholder="Create a strong password")
            confirm_password = st.text_input("Confirm password", type="password", placeholder="Re-enter password")
            submitted = st.form_submit_button("Launch profile", use_container_width=True)

        if submitted:
            if not all([name.strip(), username.strip(), password, confirm_password]):
                st.error("Name, user ID, and password fields are required.")
                return
            if not USERNAME_PATTERN.match(username.strip()):
                st.error("User IDs must be 4-20 characters and can include letters, numbers, dots, underscores, or dashes.")
                return
            if password != confirm_password:
                st.error("Your passwords do not match. Try again.")
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

            st.success(f"Welcome aboard, {user['name']}! Redirecting you to the dashboard…")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            """
            <div class="pm-plan-grid">
                <div class="pm-plan-card">
                    <h4>Velocity card</h4>
                    <p>Shows your streaks, completion rate, and AI tutor insights instantly.</p>
                </div>
                <div class="pm-plan-card">
                    <h4>Studio locker</h4>
                    <p>All generated assets are tucked into a single secure card for quick playback.</p>
                </div>
                <div class="pm-plan-card">
                    <h4>Signal alerts</h4>
                    <p>Enable email/phone alerts later if you want nudges — zero pressure.</p>
                </div>
            </div>
            <div class="pm-footnote">Already have a badge? Switch to the <strong>Login</strong> view.</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("</div>", unsafe_allow_html=True)
