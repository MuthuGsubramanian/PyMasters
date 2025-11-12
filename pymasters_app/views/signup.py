"""Signup page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(auth_manager: AuthManager) -> None:
    """Render signup form."""
    st.markdown(
        """
        <div class="pm-section-title">Create your PyMasters profile</div>
        <div class="pm-section-subtitle">Unlock adaptive roadmaps, hands-on labs, and an AI tutor tuned to your goals.</div>
        """,
        unsafe_allow_html=True,
    )

    container = st.container()
    with container:
        col_left, col_right = st.columns([0.48, 0.52], gap="large")

        with col_left:
            st.markdown(
                """
                <div class="pm-auth-wrapper" style="background:transparent; padding:0; border:none; box-shadow:none;">
                  <div class="pm-auth-hero">
                    <span class="pm-tag">Launch checklist</span>
                    <h2>Shape your learning OS</h2>
                    <p>Tell us who you are and we will assemble a Python track that blends projects, quizzes, and AI support at the right difficulty.</p>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:0.8rem; margin-top:1.6rem;">
                      <div class="pm-card" style="padding:1rem 1.2rem;">
                        <strong style="display:block;">Live progress dashboard</strong>
                        <span style="color:var(--pm-text-muted); font-size:0.85rem;">Track modules, streaks, and focus time in real-time.</span>
                      </div>
                      <div class="pm-card" style="padding:1rem 1.2rem;">
                        <strong style="display:block;">AI tutor on standby</strong>
                        <span style="color:var(--pm-text-muted); font-size:0.85rem;">Ask questions, debug, and explore topics with conversational guidance.</span>
                      </div>
                    </div>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        with col_right:
            st.markdown("<div class='pm-auth-card'>", unsafe_allow_html=True)
            st.markdown(
                """
                <h3>Tell us about you</h3>
                <p style="color:var(--pm-text-muted); margin-bottom:1.2rem;">We only ask for what we need to personalise your experience. No spam, ever.</p>
                """,
                unsafe_allow_html=True,
            )
            with st.form("signup-form", clear_on_submit=False):
                name = st.text_input("Full name", placeholder="Ada Lovelace")
                email = st.text_input("Email address", placeholder="ada@example.com")
                password = st.text_input("Password", type="password")
                confirm_password = st.text_input("Confirm password", type="password")
                agree_terms = st.checkbox("I agree to the community guidelines and privacy policy", value=True)
                submitted = st.form_submit_button("Create account", use_container_width=True)

            st.markdown(
                """
                <div style="margin-top:1.2rem; color:var(--pm-text-muted); font-size:0.85rem;">
                  Already have an account? Use the <strong>Login</strong> tab to access your personalised studio.
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown("</div>", unsafe_allow_html=True)

    if submitted:
        if not agree_terms:
            st.error("Please accept the community guidelines to continue.")
            return
        if not all([name, email, password, confirm_password]):
            st.error("Please complete all fields to continue.")
            return
        if password != confirm_password:
            st.error("Your passwords do not match. Try again.")
            return

        ok, user, message = auth_manager.signup(name=name, email=email, password=password)
        if not ok or not user:
            st.error(message or "Unable to create the account. Please try again later.")
            return

        st.success(f"Welcome aboard, {user['name']}! Redirecting you to the dashboard...")
        st.session_state["current_page"] = "Dashboard"
        rerun()

    st.markdown(
        """
        <div class="pm-surface" style="margin-top:2.5rem;">
          <div style="display:flex; gap:1.4rem; align-items:center; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
              <strong>Why PyMasters?</strong>
              <p style="margin:0.2rem 0 0; color:var(--pm-text-muted);">We combine human-crafted content with AI guidance to keep you shipping real Python projects.</p>
            </div>
            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <span class="pm-tag">Project-based curriculum</span>
              <span class="pm-tag">Community support</span>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
