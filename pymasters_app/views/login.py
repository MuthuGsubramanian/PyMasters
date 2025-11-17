"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


LOGIN_STYLES = """
<style>
.pm-login-layout {margin-top:1.5rem;}
.pm-login-hero {
    padding:2.4rem;
    border-radius:32px;
    border:1px solid rgba(56,189,248,0.35);
    background:linear-gradient(150deg, rgba(8,47,73,0.75), rgba(2,6,23,0.72));
    box-shadow:0 45px 140px -90px rgba(56,189,248,0.85);
}
.pm-login-hero h1 {
    font-size:2.65rem;
    line-height:1.1;
    margin:1.1rem 0 0.6rem;
}
.pm-login-hero h1 span {color:#38bdf8;}
.pm-login-hero p {color:rgba(241,245,249,0.9); font-size:1rem;}
.pm-login-hero .pm-hero-badge {
    display:inline-flex;
    padding:0.35rem 0.9rem;
    border-radius:999px;
    border:1px solid rgba(94,234,212,0.4);
    text-transform:uppercase;
    letter-spacing:0.28em;
    font-size:0.72rem;
    color:#bbf7d0;
}
.pm-login-metrics {
    margin-top:1.8rem;
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
    gap:1rem;
}
.pm-login-metric {
    padding:1rem 1.2rem;
    border-radius:20px;
    border:1px solid rgba(148,163,184,0.25);
    background:rgba(15,23,42,0.7);
}
.pm-login-metric strong {
    font-size:1.5rem;
    display:block;
    color:#f8fafc;
}
.pm-login-metric span {
    font-size:0.8rem;
    letter-spacing:0.2em;
    text-transform:uppercase;
    color:rgba(148,163,184,0.85);
}
form[data-testid="stForm"][aria-label="login-form"] {
    padding:2.2rem;
    border-radius:30px;
    border:1px solid rgba(56,189,248,0.35);
    background:linear-gradient(150deg, rgba(15,23,42,0.92), rgba(2,6,23,0.88));
    box-shadow:0 45px 120px -80px rgba(14,165,233,0.7);
}
form[data-testid="stForm"][aria-label="login-form"] label {
    font-weight:600;
    letter-spacing:0.04em;
}
form[data-testid="stForm"][aria-label="login-form"] input {
    border-radius:14px !important;
    border:1px solid rgba(148,163,184,0.35);
    background:rgba(15,23,42,0.75);
}
.pm-login-meta {
    display:flex;
    flex-wrap:wrap;
    gap:0.45rem;
    margin:0.85rem 0 1.1rem;
}
.pm-login-chip {
    padding:0.35rem 0.85rem;
    border-radius:999px;
    border:1px solid rgba(148,163,184,0.35);
    background:rgba(15,23,42,0.8);
    font-size:0.75rem;
    letter-spacing:0.12em;
    color:#e2e8f0;
}
.pm-feature-grid {
    margin-top:2.5rem;
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
    gap:1.2rem;
}
.pm-feature-card {
    padding:1.4rem 1.6rem;
    border-radius:22px;
    border:1px solid rgba(148,163,184,0.25);
    background:rgba(15,23,42,0.82);
    box-shadow:0 35px 90px -70px rgba(8,145,178,0.65);
}
.pm-feature-card h3 {margin-bottom:0.35rem;}
.pm-feature-card p {color:rgba(226,232,240,0.85); font-size:0.92rem;}
</style>
"""


def render(auth_manager: AuthManager) -> None:
    """Render a cinematic landing page with a streamlined login form."""

    st.markdown(LOGIN_STYLES, unsafe_allow_html=True)

    hero_col, form_col = st.columns([0.58, 0.42], gap="large")

    with hero_col:
        st.markdown(
            """
            <section class="pm-login-layout pm-login-hero">
                <div class="pm-hero-badge">Immersive learning OS</div>
                <h1>Command your <span>Python journey</span> with clarity.</h1>
                <p>
                    Adaptive cohorts, AI copilots, and production-grade sandboxes converge into one
                    beautiful timeline. Sign in to continue exactly where you left off.
                </p>
                <div class="pm-login-metrics">
                    <div class="pm-login-metric">
                        <strong>+210</strong>
                        <span>Missions</span>
                    </div>
                    <div class="pm-login-metric">
                        <strong>12 ms</strong>
                        <span>Feedback</span>
                    </div>
                    <div class="pm-login-metric">
                        <strong>Global</strong>
                        <span>Network</span>
                    </div>
                </div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <section class="pm-login-layout">
                <h2>Access mission control</h2>
                <p>Your cinematic user ID (e.g. <strong>Thor11</strong>) is the only credential required.</p>
            </section>
            """,
            unsafe_allow_html=True,
        )

        st.markdown(
            """
            <div class="pm-login-meta">
                <div class="pm-login-chip">SAML ready</div>
                <div class="pm-login-chip">Anomaly guard</div>
                <div class="pm-login-chip">Biometric aware</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login-form", clear_on_submit=False):
            identifier = st.text_input(
                "User ID",
                placeholder="Thor11 / valkyrie",
            )
            password = st.text_input(
                "Password",
                type="password",
                placeholder="Enter your password",
            )
            st.checkbox("Keep me signed in on this device", value=True, key="pm-login-remember")
            submitted = st.form_submit_button("Enter workspace", use_container_width=True)

        if submitted:
            if not identifier or not password:
                st.error("Please provide both your unique user ID and password.")
                return

            user = auth_manager.login(identifier=identifier, password=password)
            if not user:
                st.error("We couldn't find an account with that user ID and password.")
                return

            st.success(f"Welcome back, {user['name']}! Redirecting to your dashboard...")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.caption(
            "Prefer the immersive onboarding? Switch to **Sign Up** – email and phone remain optional."
        )

    st.markdown(
        """
        <div class="pm-feature-grid">
            <div class="pm-feature-card">
                <h3>Intelligent cohorts</h3>
                <p>Curate squads by skill, timezone, or goal. Each card surfaces mission health in real time.</p>
            </div>
            <div class="pm-feature-card">
                <h3>Generative studio</h3>
                <p>Spin up image and video sandboxes without leaving the dashboard. Outputs auto-sync to your history.</p>
            </div>
            <div class="pm-feature-card">
                <h3>Pulse analytics</h3>
                <p>Beautiful learning telemetry cards reveal progress velocity and focus hotspots instantly.</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
