"""Login page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render the login form."""
    st.markdown(
        """
        <div class="pm-section-title">Welcome back 👋</div>
        <div class="pm-section-subtitle">Sign in to resume your adaptive Python path and pick up exactly where you left off.</div>
        """,
        unsafe_allow_html=True,
    )

    container = st.container()
    with container:
        col_left, col_right = st.columns([0.55, 0.45], gap="large")

        with col_left:
            st.markdown(
                """
                <div class="pm-auth-wrapper" style="background:transparent; padding:0; border:none; box-shadow:none;">
                  <div class="pm-auth-hero">
                    <span class="pm-tag">Personalised roadmap</span>
                    <h2>Rejoin your learning flow</h2>
                    <p>Daily insights, spaced repetition prompts, and hands-on labs keep you in the zone. PyMasters adapts to your pace so you can master concepts faster.</p>
                    <ul style="margin:1.6rem 0 0; padding-left:1.1rem; color:rgba(226,232,240,0.8); line-height:1.6;">
                      <li>See how your streak compares with the global cohort</li>
                      <li>Jump straight into unfinished notebooks and labs</li>
                      <li>Get fresh AI tutor nudges tailored to your progress</li>
                    </ul>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        with col_right:
            st.markdown("<div class='pm-auth-card'>", unsafe_allow_html=True)
            st.markdown(
                """
                <h3>Sign in to your studio</h3>
                <p style="color:var(--pm-text-muted); margin-bottom:1.2rem;">Use your email and password to continue. Two-factor prompts will appear automatically when enabled.</p>
                """,
                unsafe_allow_html=True,
            )
            with st.form("login-form", clear_on_submit=False):
                email = st.text_input("Email address", placeholder="you@example.com")
                password = st.text_input("Password", type="password")
                remember_me = st.checkbox("Keep me signed in on this device", value=True)
                submitted = st.form_submit_button("Sign in", use_container_width=True)
                st.session_state["remember_me"] = remember_me

            st.markdown(
                """
                <div style="margin-top:1.2rem; color:var(--pm-text-muted); font-size:0.85rem;">
                  Trouble signing in? Reach out to <a href="mailto:support@pymasters.ai" style="color:#38bdf8; text-decoration:none;">support@pymasters.ai</a> for a quick reset.
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown("</div>", unsafe_allow_html=True)

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
        <div class="pm-surface" style="margin-top:2.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <strong>New to PyMasters?</strong>
              <p style="margin:0.2rem 0 0; color:var(--pm-text-muted);">Create a free account from the <em>Sign Up</em> tab to unlock personalised journeys and the AI tutor.</p>
            </div>
            <div>
              <span class="pm-tag">60s onboarding</span>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
