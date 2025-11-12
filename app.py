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
    :root {
        color-scheme: dark;
    }
    .stApp {
        background: radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 55%),
                    linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.85));
    }
    .hero {
        padding: 3.5rem 3rem;
        border-radius: 28px;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(30, 64, 175, 0.4));
        border: 1px solid rgba(148, 163, 184, 0.25);
        position: relative;
        overflow: hidden;
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.55);
    }
    .hero::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at top right, rgba(125, 211, 252, 0.4), transparent 45%);
        opacity: 0.6;
        pointer-events: none;
    }
    .hero h1 {
        font-size: 3.2rem;
        margin-bottom: 1rem;
        color: #e0f2fe;
    }
    .hero p {
        max-width: 640px;
        font-size: 1.15rem;
        color: rgba(226, 232, 240, 0.9);
    }
    .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }
    .feature-card {
        padding: 1.5rem;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(56, 189, 248, 0.2);
        backdrop-filter: blur(12px);
    }
    .feature-card h3 {
        color: #bae6fd;
    }
    .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        background: rgba(14, 165, 233, 0.18);
        color: #bae6fd;
        font-size: 0.9rem;
        margin-bottom: 1.5rem;
    }
    .cta-button {
        width: 100%;
        border-radius: 18px !important;
        padding: 0.85rem 1.5rem !important;
        font-weight: 600;
    }
    .module-card {
        padding: 1.25rem 1.5rem;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(148, 163, 184, 0.18);
    }
    </style>
    """,
    unsafe_allow_html=True,
)

with st.container():
    st.markdown("<div class='hero'>", unsafe_allow_html=True)
    st.markdown("<div class='pill'>🚀 Level up your Python skills</div>", unsafe_allow_html=True)
    st.markdown("<h1>PyMasters</h1>", unsafe_allow_html=True)
    st.markdown(
        """<p>Interactive Python mastery crafted for developers who crave progress. Real-time code execution, curated learning paths, and analytics-driven recommendations—all powered by Streamlit.</p>""",
        unsafe_allow_html=True,
    )

    cta_col, auth_col = st.columns([3, 2], gap="large")

    with cta_col:
        st.markdown("### What will you build today?")
        st.write(
            "Design a personalised learning sprint, pair practice sessions with code challenges, "
            "and turn insights into momentum with our progress analytics dashboard."
        )
        for label, helper in [
            ("🧪 Run a code experiment", "Launch the sandbox"),
            ("🧭 Explore learning paths", "Browse modules"),
            ("📈 Review progress", "Open analytics"),
        ]:
            if st.button(label, key=helper, use_container_width=True):
                st.experimental_set_query_params(action=helper)
    with auth_col:
        if user:
            st.success(f"Welcome back, {user['name']}! Explore the dashboard or pick a new challenge.")
        else:
            render_login(auth_service)

    st.markdown("</div>", unsafe_allow_html=True)

st.markdown("---")

module_service = ModuleService()
modules = [module.dict() for module in module_service.list_modules()]

module_count = len(modules)
average_minutes = int(sum(module["estimated_minutes"] for module in modules) / module_count)
difficulty_levels = sorted({module["difficulty"] for module in modules})

metric_col1, metric_col2, metric_col3 = st.columns(3)
metric_col1.metric("Active learning paths", f"{module_count}")
metric_col2.metric("Avg. completion time", f"{average_minutes} min")
metric_col3.metric("Daily exercises", "25+ curated")

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

st.markdown("---")
st.subheader("Learning paths tailored to your momentum")

tabs = st.tabs([f"{difficulty.title()}" for difficulty in difficulty_levels])
for tab, difficulty in zip(tabs, difficulty_levels):
    with tab:
        filtered_modules = [module for module in modules if module["difficulty"] == difficulty]
        for module in filtered_modules:
            with st.container():
                st.markdown("<div class='module-card'>", unsafe_allow_html=True)
                st.markdown(f"#### {module['title']}")
                st.write(module["description"])
                chip_str = " ".join(f"`{tag}`" for tag in module["tags"])
                st.caption(f"Difficulty: {module['difficulty']} · {module['estimated_minutes']} minutes")
                if chip_str:
                    st.caption(chip_str)
                st.markdown("</div>", unsafe_allow_html=True)
            st.divider()

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
