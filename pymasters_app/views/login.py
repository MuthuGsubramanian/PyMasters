"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render the login view with a futuristic hero and glassmorphic form."""

    st.markdown(
        """
        <style>
        .pm-hero-wrapper {
            position:relative;
            padding:1.2rem 0 2.8rem;
        }
        .pm-hero-section {
            display:grid;
            grid-template-columns:minmax(0, 1.05fr) minmax(0, 0.95fr);
            gap:2.6rem;
            align-items:center;
        }
        @media (max-width: 1180px) {
            .pm-hero-section {grid-template-columns:1fr;}
        }
        .pm-hero-copy .eyebrow {
            display:inline-flex;
            align-items:center;
            gap:0.35rem;
            text-transform:uppercase;
            letter-spacing:0.28em;
            font-size:0.75rem;
            color:#38bdf8;
            background:rgba(8,47,73,0.58);
            padding:0.35rem 0.85rem;
            border-radius:999px;
            border:1px solid rgba(56,189,248,0.35);
            box-shadow:0 18px 40px -32px rgba(56,189,248,0.85);
        }
        .pm-hero-copy h1 {
            font-size:3.2rem;
            line-height:1.08;
            margin-top:1.5rem;
            margin-bottom:1rem;
        }
        .pm-hero-copy h1 span {color:#38bdf8; text-shadow:0 0 28px rgba(56,189,248,0.45);}
        .pm-hero-copy p {
            max-width:520px;
            font-size:1.05rem;
            color:rgba(226,232,240,0.82);
        }
        .pm-hero-actions {display:flex; align-items:center; gap:1.15rem; margin-top:1.6rem; flex-wrap:wrap;}
        .pm-hero-actions .primary {
            display:inline-flex;
            align-items:center;
            gap:0.65rem;
            padding:0.65rem 1.6rem;
            border-radius:999px;
            text-transform:uppercase;
            letter-spacing:0.32em;
            font-weight:700;
            font-size:0.75rem;
            color:#020617;
            background:linear-gradient(135deg, rgba(59,130,246,0.95), rgba(192,132,252,0.85));
            text-decoration:none;
            box-shadow:0 25px 65px -32px rgba(59,130,246,0.95);
        }
        .pm-hero-actions .ghost {
            padding:0.55rem 1.4rem;
            border-radius:999px;
            border:1px solid rgba(148,163,184,0.3);
            color:rgba(226,232,240,0.82);
            letter-spacing:0.28em;
            text-transform:uppercase;
            font-size:0.72rem;
            display:inline-flex;
            align-items:center;
            gap:0.45rem;
            background:rgba(15,23,42,0.65);
        }
        .pm-hero-stats {
            margin-top:2.1rem;
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:1.1rem;
            max-width:560px;
        }
        .pm-hero-stats .stat {
            background:linear-gradient(160deg, rgba(8,47,73,0.8), rgba(15,23,42,0.7));
            padding:0.9rem 1rem;
            border-radius:18px;
            border:1px solid rgba(56,189,248,0.25);
            box-shadow:0 22px 55px -40px rgba(56,189,248,0.9);
        }
        .pm-hero-stats .stat strong {
            display:block;
            font-size:1.45rem;
            color:#f8fafc;
            font-family:'Orbitron', 'Inter', sans-serif;
            letter-spacing:0.08em;
        }
        .pm-hero-stats .stat span {font-size:0.78rem; letter-spacing:0.2em; text-transform:uppercase; color:rgba(186,230,253,0.78);}
        .pm-hero-visual {
            position:relative;
            display:flex;
            align-items:center;
            justify-content:center;
        }
        .pm-hero-visual .frame {
            position:relative;
            width:320px;
            height:360px;
            border-radius:30px;
            background:linear-gradient(200deg, rgba(15,23,42,0.9), rgba(2,6,23,0.95));
            border:1px solid rgba(56,189,248,0.35);
            overflow:hidden;
            box-shadow:0 45px 95px -55px rgba(59,130,246,0.95);
        }
        .pm-hero-visual .frame::before {
            content:"";
            position:absolute;
            inset:0;
            background:radial-gradient(circle at 50% 30%, rgba(56,189,248,0.35), transparent 60%);
            opacity:0.85;
        }
        .pm-hero-visual .avatar {
            position:absolute;
            inset:12%;
            background:radial-gradient(circle at 50% 20%, rgba(226,232,240,0.95), rgba(148,163,184,0.15));
            mask:radial-gradient(circle at 50% 30%, rgba(0,0,0,0.02) 28%, rgba(0,0,0,0.55) 75%);
            filter:saturate(1.25);
            border-radius:26px;
            box-shadow:inset 0 -40px 70px -35px rgba(56,189,248,0.75);
        }
        .pm-hero-visual .halo {
            position:absolute;
            width:92%;
            height:92%;
            border-radius:32px;
            inset:4%;
            border:1px dashed rgba(148,163,184,0.35);
            animation:haloOrbit 9s linear infinite;
        }
        .pm-hero-visual .wave {
            position:absolute;
            bottom:-35px;
            left:50%;
            transform:translateX(-50%);
            width:360px;
            height:200px;
            background:radial-gradient(ellipse at center, rgba(56,189,248,0.55), transparent 65%);
            filter:blur(18px);
            opacity:0.6;
        }
        .pm-hero-visual .scanner {
            position:absolute;
            left:15%;
            top:20%;
            width:70%;
            height:2px;
            background:linear-gradient(90deg, transparent, rgba(56,189,248,0.9), transparent);
            animation:scan 5.5s ease-in-out infinite;
        }
        @keyframes scan {
            0%, 100% {transform:translateY(0); opacity:0;}
            10% {opacity:0.85;}
            50% {transform:translateY(180px); opacity:1;}
            90% {opacity:0.1;}
        }
        @keyframes haloOrbit {
            0% {transform:rotate(0deg);} 100% {transform:rotate(360deg);}
        }
        .pm-auth-card .pm-auth-meta {margin-bottom:1rem;}
        .pm-auth-card .pm-auth-meta span {letter-spacing:0.24em; text-transform:uppercase; font-size:0.72rem; color:rgba(148,163,184,0.75);}
        .pm-auth-divider {
            height:1px;
            width:100%;
            background:linear-gradient(90deg, transparent, rgba(56,189,248,0.4), transparent);
            margin:1.2rem 0 1.6rem;
        }
        .pm-auth-footnote {font-size:0.85rem; color:rgba(226,232,240,0.72); margin-top:1.4rem;}
        </style>
        """,
        unsafe_allow_html=True,
    )

    hero_col, form_col = st.columns([0.6, 0.4])

    with hero_col:
        st.markdown(
            """
            <div class="pm-hero-wrapper">
                <div class="pm-hero-section">
                    <div class="pm-hero-copy">
                        <div class="eyebrow">The new</div>
                        <h1>Artificial Intelligence <span>Platform</span></h1>
                        <p>
                            Leverage adaptive lesson plans, generative sandboxes, and mentor-grade insights to
                            accelerate your Python mastery.
                        </p>
                        <div class="pm-hero-actions">
                            <a class="primary" href="#">Read more</a>
                            <div class="ghost">Immersive lab access</div>
                        </div>
                        <div class="pm-hero-stats">
                            <div class="stat">
                                <strong>24/7</strong>
                                <span>AI mentor access</span>
                            </div>
                            <div class="stat">
                                <strong>+180</strong>
                                <span>Interactive projects</span>
                            </div>
                            <div class="stat">
                                <strong>92%</strong>
                                <span>Learner success</span>
                            </div>
                        </div>
                    </div>
                    <div class="pm-hero-visual">
                        <div class="frame">
                            <div class="avatar"></div>
                            <div class="halo"></div>
                            <div class="scanner"></div>
                            <div class="wave"></div>
                        </div>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <div class="pm-auth-card">
                <h2>Welcome back, innovator</h2>
                <p>Sign in to sync your intelligent tutoring threads, adaptive studio workspaces, and real-time analytics.</p>
                <div class="pm-auth-meta"><span>Secure · Encrypted · Personalised</span></div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login-form", clear_on_submit=False):
            email = st.text_input("Email address", placeholder="you@example.com")
            password = st.text_input("Password", type="password", placeholder="Your secret passphrase")
            submitted = st.form_submit_button("Sign in", use_container_width=True)

        st.markdown("<div class='pm-auth-divider'></div>", unsafe_allow_html=True)

        if submitted:
            if not email or not password:
                st.error("Please provide both email and password.")
                return

            user = auth_manager.login(email=email, password=password)
            if not user:
                st.error("We couldn't find an account with those credentials.")
                return

            st.success(f"Welcome back, {user['name']}! Redirecting to your dashboard...")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.markdown(
            """
            <div class="pm-auth-footnote">
                New to PyMasters? Jump over to the <strong>Sign Up</strong> page to create your adaptive learning profile.
            </div>
            """,
            unsafe_allow_html=True,
        )

        st.markdown("</div>", unsafe_allow_html=True)

