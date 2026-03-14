"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


LOGIN_STYLES = """
<style>
.pm-login-shell {margin-top:1.2rem;}
.pm-login-hero {
    padding:2.2rem;
    border-radius:28px;
    border:1px solid rgba(56,189,248,0.35);
    background:linear-gradient(155deg, rgba(8,47,73,0.82), rgba(2,6,23,0.85));
    box-shadow:0 45px 140px -90px rgba(56,189,248,0.85);
}
.pm-login-hero h1 {font-size:2.5rem; line-height:1.08; margin:0.9rem 0 0.5rem;}
.pm-login-hero h1 span {color:#38bdf8;}
.pm-login-hero p {color:rgba(241,245,249,0.9); font-size:1rem;}
.pm-login-hero .pm-hero-badge {
    display:inline-flex;
    padding:0.32rem 0.8rem;
    border-radius:999px;
    border:1px solid rgba(94,234,212,0.4);
    text-transform:uppercase;
    letter-spacing:0.28em;
    font-size:0.72rem;
    color:#bbf7d0;
}
.pm-login-grid {display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.9rem; margin-top:1.6rem;}
.pm-login-card {
    padding:1rem 1.1rem;
    border-radius:18px;
    border:1px solid rgba(148,163,184,0.25);
    background:rgba(15,23,42,0.74);
}
.pm-login-card strong {display:block; font-size:1.35rem; color:#f8fafc;}
.pm-login-card span {font-size:0.82rem; letter-spacing:0.18em; text-transform:uppercase; color:rgba(148,163,184,0.85);}
.pm-ai-prompts {margin-top:1.4rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.85rem;}
.pm-ai-prompts .prompt {
    padding:0.85rem 1rem;
    border-radius:16px;
    border:1px solid rgba(148,163,184,0.32);
    background:rgba(2,6,23,0.78);
    color:#e2e8f0;
    font-size:0.9rem;
}
.pm-ai-prompts .prompt code {color:#38bdf8;}
form[data-testid="stForm"][aria-label="login-form"] {
    padding:2.1rem;
    border-radius:28px;
    border:1px solid rgba(56,189,248,0.35);
    background:linear-gradient(150deg, rgba(15,23,42,0.92), rgba(2,6,23,0.88));
    box-shadow:0 45px 120px -80px rgba(14,165,233,0.7);
}
form[data-testid="stForm"][aria-label="login-form"] label {font-weight:600; letter-spacing:0.03em;}
form[data-testid="stForm"][aria-label="login-form"] input {border-radius:14px !important; border:1px solid rgba(148,163,184,0.35); background:rgba(15,23,42,0.75);}
.pm-login-meta {display:flex; flex-wrap:wrap; gap:0.45rem; margin:0.8rem 0 1rem;}
.pm-login-chip {padding:0.35rem 0.85rem; border-radius:999px; border:1px solid rgba(148,163,184,0.35); background:rgba(15,23,42,0.8); font-size:0.75rem; letter-spacing:0.12em; color:#e2e8f0;}
.pm-feature-grid {margin-top:2.2rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.1rem;}
.pm-feature-card {padding:1.25rem 1.35rem; border-radius:20px; border:1px solid rgba(148,163,184,0.25); background:rgba(15,23,42,0.82); box-shadow:0 35px 90px -70px rgba(8,145,178,0.65);}
.pm-feature-card h3 {margin-bottom:0.25rem;}
.pm-feature-card p {color:rgba(226,232,240,0.85); font-size:0.9rem;}
</style>
"""


def render(auth_manager: AuthManager) -> None:
    """Render a focused landing page with clear login guidance."""

    st.markdown(LOGIN_STYLES, unsafe_allow_html=True)

    hero_col, form_col = st.columns([0.56, 0.44], gap="large")

    with hero_col:
        st.markdown(
            """
            <section class="pm-login-shell pm-login-hero">
                <div class="pm-hero-badge">Python mission control</div>
                <h1>Land in a <span>Python-first cockpit</span> powered by AI.</h1>
                <p>
                    Every screen is tuned for Python: concise briefs, runnable practice, and an AI Instructor
                    that answers with code-ready snippets. Log in to pick up the exact lesson or sandbox you paused.
                </p>
                <div class="pm-login-grid">
                    <div class="pm-login-card"><strong>Instant fixes</strong><span>AI Tutor</span></div>
                    <div class="pm-login-card"><strong>Practice labs</strong><span>Playground</span></div>
                    <div class="pm-login-card"><strong>Path clarity</strong><span>Roadmaps</span></div>
                </div>
                <div class="pm-ai-prompts">
                    <div class="prompt">Ask: <code>Explain list comprehensions with 2 examples</code></div>
                    <div class="prompt">Try: <code>Draft a pytest for my function</code></div>
                    <div class="prompt">Explore: <code>What should I learn after dictionaries?</code></div>
                </div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    with form_col:
        st.markdown(
            """
            <section class="pm-login-shell">
                <h2>Sign in to your track</h2>
                <p>Use your PyMasters ID and password. We keep the flow minimal so you can jump straight into Python.</p>
            </section>
            """,
            unsafe_allow_html=True,
        )

        st.markdown(
            """
            <div class="pm-login-meta">
                <div class="pm-login-chip">AI Instructor</div>
                <div class="pm-login-chip">Hands-on Tutor</div>
                <div class="pm-login-chip">Secure workspace</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        with st.form("login-form", clear_on_submit=False):
            identifier = st.text_input(
                "User ID",
                placeholder="e.g. pythonista7",
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

            try:
                user = auth_manager.login(identifier=identifier, password=password)
            except Exception as exc:  # pragma: no cover - defensive guard for UI flow
                st.error("Login failed unexpectedly. Please try again.")
                st.exception(exc)
                return

            if not user:
                st.error("We couldn't find an account with that user ID and password.")
                return

            st.success(f"Welcome back, {user['name']}! Redirecting to your dashboard...")
            st.session_state["current_page"] = "Dashboard"
            rerun()

        st.caption(
            "New to PyMasters? Switch to **Sign Up** to create your ID and meet the AI Instructor."
        )

    st.markdown(
        """
        <div class="pm-feature-grid">
            <div class="pm-feature-card">
                <h3>Guided playlists</h3>
                <p>Short, linked Python lessons that keep context tight and reduce switching costs.</p>
            </div>
            <div class="pm-feature-card">
                <h3>AI answers with code</h3>
                <p>The AI Tutor responds with runnable snippets, tests, and quick refactors tailored to your level.</p>
            </div>
            <div class="pm-feature-card">
                <h3>Playground ready</h3>
                <p>Open the sandbox to validate a concept immediately after learning it—no extra setup.</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
