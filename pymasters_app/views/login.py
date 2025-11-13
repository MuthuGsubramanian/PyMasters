"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render a cinematic landing page with a streamlined login form."""

    st.markdown(
        """
        <style>
        .pm-landing-grid {
            display:grid;
            grid-template-columns:minmax(0, 0.6fr) minmax(0, 0.4fr);
            gap:2.5rem;
            margin-top:1.5rem;
        }
        @media (max-width: 1100px) {
            .pm-landing-grid {grid-template-columns:1fr;}
        }
        .pm-landing-hero {
            padding:2.5rem;
            border-radius:36px;
            background:linear-gradient(145deg, rgba(8,47,73,0.75), rgba(2,6,23,0.65));
            border:1px solid rgba(56,189,248,0.35);
            box-shadow:0 55px 160px -80px rgba(56,189,248,0.85);
            position:relative;
            overflow:hidden;
        }
        .pm-landing-hero::after {
            content:"";
            position:absolute;
            inset:0;
            pointer-events:none;
            background:radial-gradient(circle at 12% 20%, rgba(59,130,246,0.45), transparent 55%);
            opacity:0.6;
        }
        .pm-hero-badge {
            display:inline-flex;
            align-items:center;
            gap:0.4rem;
            padding:0.35rem 0.95rem;
            border-radius:999px;
            border:1px solid rgba(94,234,212,0.45);
            background:rgba(15,118,110,0.18);
            letter-spacing:0.28em;
            text-transform:uppercase;
            font-size:0.72rem;
            color:#99f6e4;
        }
        .pm-landing-hero h1 {
            font-size:3rem;
            line-height:1.05;
            margin:1.4rem 0 0.8rem;
        }
        .pm-landing-hero h1 span {
            color:#38bdf8;
            text-shadow:0 0 35px rgba(56,189,248,0.55);
        }
        .pm-hero-subcopy {
            font-size:1.05rem;
            color:rgba(241,245,249,0.85);
            max-width:620px;
        }
        .pm-hero-cards {
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:1rem;
            margin-top:2rem;
        }
        .pm-hero-card {
            padding:1.1rem 1.3rem;
            border-radius:22px;
            border:1px solid rgba(148,163,184,0.25);
            background:rgba(15,23,42,0.65);
            box-shadow:0 25px 60px -40px rgba(8,145,178,0.65);
        }
        .pm-hero-card strong {
            display:block;
            font-size:1.6rem;
            color:#f8fafc;
            font-family:'Orbitron', 'Inter', sans-serif;
        }
        .pm-hero-card span {
            display:block;
            text-transform:uppercase;
            letter-spacing:0.3em;
            font-size:0.72rem;
            color:rgba(148,163,184,0.85);
            margin-top:0.35rem;
        }
        .pm-hero-cta {
            margin-top:2.2rem;
            display:flex;
            flex-wrap:wrap;
            gap:0.75rem;
        }
        .pm-hero-cta a {
            padding:0.65rem 1.45rem;
            border-radius:999px;
            text-transform:uppercase;
            letter-spacing:0.32em;
            font-size:0.74rem;
            font-weight:600;
            border:1px solid rgba(148,163,184,0.35);
            color:#e2e8f0;
        }
        .pm-hero-cta a.primary {
            border:none;
            color:#020617;
            background:linear-gradient(120deg, rgba(56,189,248,0.95), rgba(192,132,252,0.85));
            box-shadow:0 25px 65px -32px rgba(56,189,248,0.95);
        }
        .pm-auth-card {
            position:relative;
            padding:2.4rem;
            border-radius:32px;
            border:1px solid rgba(56,189,248,0.35);
            background:linear-gradient(160deg, rgba(15,23,42,0.92), rgba(2,6,23,0.88));
            box-shadow:0 45px 90px -60px rgba(8,145,178,0.8);
        }
        .pm-auth-card::after {
            content:"";
            position:absolute;
            inset:0;
            pointer-events:none;
            background:radial-gradient(circle at 0% 0%, rgba(56,189,248,0.45), transparent 55%);
            opacity:0.45;
        }
        .pm-auth-card h2 {
            font-size:2rem;
            margin-bottom:0.45rem;
        }
        .pm-auth-card p {color:rgba(226,232,240,0.8);}
        .pm-auth-card small {
            text-transform:uppercase;
            letter-spacing:0.28em;
            color:rgba(148,163,184,0.9);
        }
        .pm-login-meta {
            margin:1.4rem 0 1.8rem;
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:0.85rem;
        }
        .pm-login-chip {
            border-radius:18px;
            padding:0.65rem 0.85rem;
            border:1px solid rgba(148,163,184,0.22);
            background:rgba(15,23,42,0.75);
            font-size:0.8rem;
            color:rgba(148,163,184,0.9);
        }
        .pm-feature-grid {
            margin-top:2rem;
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:1.1rem;
        }
        .pm-feature-card {
            padding:1.35rem;
            border-radius:22px;
            border:1px solid rgba(59,130,246,0.25);
            background:rgba(15,23,42,0.7);
            min-height:180px;
            box-shadow:0 35px 95px -60px rgba(59,130,246,0.75);
        }
        .pm-feature-card h3 {
            font-size:1.05rem;
            margin-bottom:0.45rem;
        }
        .pm-feature-card p {
            font-size:0.9rem;
            color:rgba(226,232,240,0.85);
        }
        .pm-auth-card form label {font-weight:600; letter-spacing:0.05em;}
        .pm-auth-card form input {
            border-radius:14px !important;
            background:rgba(2,6,23,0.75);
            border:1px solid rgba(148,163,184,0.35);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pm-landing-grid'>", unsafe_allow_html=True)

    hero_col, form_col = st.columns([0.6, 0.4])

    with hero_col:
        st.markdown(
            """
            <div class="pm-landing-hero">
                <div class="pm-hero-badge">Immersive learning OS</div>
                <h1>Command your <span>Python journey</span> with cinematic clarity.</h1>
                <p class="pm-hero-subcopy">
                    Adaptive cohorts, AI copilots, and production-grade sandboxes converge into one
                    beautiful timeline. Sign in to continue exactly where you left off.
                </p>
                <div class="pm-hero-cards">
                    <div class="pm-hero-card"><strong>+210</strong><span>hands-on missions</span></div>
                    <div class="pm-hero-card"><strong>12ms</strong><span>feedback latency</span></div>
                    <div class="pm-hero-card"><strong>Global</strong><span>talent network</span></div>
                </div>
                <div class="pm-hero-cta">
                    <a class="primary" href="#">Preview experience</a>
                    <a href="#">Watch lab tour</a>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <div class="pm-auth-card">
                <small>Encrypted portal</small>
                <h2>Access mission control</h2>
                <p>Use your personal call-sign (e.g. <strong>Thor11</strong>) or the email/phone linked to your profile.</p>
            """,
            unsafe_allow_html=True,
        )

        st.markdown(
            """
            <div class="pm-login-meta">
                <div class="pm-login-chip">SAML security &amp; anomaly guard</div>
                <div class="pm-login-chip">Biometric-ready sessions</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login-form", clear_on_submit=False):
            identifier = st.text_input(
                "User ID, email, or phone",
                placeholder="Thor11 / you@example.com / +1 555 123 4567",
            )
            password = st.text_input(
                "Password",
                type="password",
                placeholder="••••••••",
            )
            st.checkbox("Keep me signed in on this device", value=True, key="pm-login-remember")
            submitted = st.form_submit_button("Enter workspace", use_container_width=True)

        if submitted:
            if not identifier or not password:
                st.error("Please provide both your unique user ID (or email/phone) and password.")
                return

            user = auth_manager.login(identifier=identifier, password=password)
            if not user:
                st.error("We couldn't find an account that matches those credentials.")
                return

            st.success(f"Welcome back, {user['name']}! Redirecting to your dashboard…")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            """
            <div class="pm-auth-footnote">
                Prefer to experience the immersive onboarding? Switch to the <strong>Sign Up</strong> view — email and phone are optional.
            </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown(
        """
        <div class="pm-feature-grid">
            <div class="pm-feature-card">
                <h3>Intelligent cohorts</h3>
                <p>Curate squads by skill, timezone, or goal. Each card surfaces mission health in real time.</p>
            </div>
            <div class="pm-feature-card">
                <h3>Generative studio</h3>
                <p>Spin up image &amp; video sandboxes without leaving the dashboard. Outputs auto-sync to your history.</p>
            </div>
            <div class="pm-feature-card">
                <h3>Pulse analytics</h3>
                <p>Beautiful learning telemetry cards reveal progress velocity and focus hotspots instantly.</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

