"""PyMasters Streamlit application entrypoint."""
from __future__ import annotations

import streamlit as st

from components import render_recommendation_carousel
from config.settings import settings
from services import AuthService, ModuleService, ProgressService, RecommendationService
from utils.auth import render_login
from utils.state import get_user, init_session_state

st.set_page_config(
    page_title="PyMasters · Learn Python the interactive way",
    page_icon="🐍",
    layout="wide",
)

init_session_state()
auth_service = AuthService()
user = get_user()

st.markdown(
    """
    <style>
    .hero {
        padding: 3rem 2rem;
        border-radius: 24px;
        background: radial-gradient(circle at top left, rgba(56, 189, 248, 0.25), rgba(15, 23, 42, 0.75));
        border: 1px solid rgba(148, 163, 184, 0.25);
    }
    .hero h1 {
        font-size: 3rem;
        margin-bottom: 1rem;
        color: #38bdf8;
    }
    .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }
    .feature-card {
        padding: 1.5rem;
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.2);
    }
    </style>
    """,
    unsafe_allow_html=True,
)

with st.container():
    st.markdown("<div class='hero'>", unsafe_allow_html=True)
    st.markdown("<h1>PyMasters</h1>", unsafe_allow_html=True)
    st.markdown(
        """<p style='font-size:1.2rem;color:#e2e8f0;'>Interactive Python mastery crafted for developers who crave progress."
        " Real-time code execution, curated learning paths, and analytics-driven recommendations—all powered by Streamlit.""",
        unsafe_allow_html=True,
    )

    if user:
        st.success(f"Welcome back, {user['name']}! Explore the dashboard or pick a new challenge.")
    else:
        render_login(auth_service)

    st.markdown("</div>", unsafe_allow_html=True)

st.markdown("## Platform highlights")
st.markdown(
    """
    <div class='feature-grid'>
      <div class='feature-card'>
        <h3>Personalized Journeys</h3>
        <p>Adaptive module sequencing based on your performance and goals.</p>
      </div>
      <div class='feature-card'>
        <h3>Secure Sandbox</h3>
        <p>Execute Python snippets with instant feedback powered by a dedicated sandbox microservice.</p>
      </div>
      <div class='feature-card'>
        <h3>Progress Intelligence</h3>
        <p>Track learning streaks, analytics, and export reports for your portfolio.</p>
      </div>
      <div class='feature-card'>
        <h3>Community Challenges</h3>
        <p>Daily coding quests and leaderboards keep you motivated and accountable.</p>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

module_service = ModuleService()
modules = [module.dict() for module in module_service.list_modules()]

st.markdown("---")
st.subheader("Featured learning paths")
for module in modules:
    with st.container():
        st.markdown(f"### {module['title']} · {module['difficulty']}")
        st.write(module["description"])
        st.caption(f"Estimated time: {module['estimated_minutes']} minutes")

if user:
    st.markdown("---")
    st.subheader("Recommended for you")
    progress_service = ProgressService()
    recommendation_service = RecommendationService()
    progress_records = [record.dict() for record in progress_service.list_progress(user["id"])]
    completed_module_ids = [record["module_id"] for record in progress_records]
    recommendations = recommendation_service.get_recommendations(
        user_id=user["id"], completed_module_ids=completed_module_ids
    )
    render_recommendation_carousel(recommendations)
else:
    st.info("Sign in to unlock personalized recommendations and progress tracking.")

st.markdown("---")
st.caption(
    """
    PyMasters is designed for custom deployments. Configure environment variables via `.env` and connect
    PostgreSQL, Redis, and background workers to enable production-grade workflows.
    """
)
st.caption(f"Environment: {settings.environment.capitalize()}")
