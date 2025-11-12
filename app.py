"""PyMasters Streamlit application entrypoint."""
from __future__ import annotations

import streamlit as st

from components import render_recommendation_carousel
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
module_service = ModuleService()
modules = [module.model_dump() for module in module_service.list_modules()]

module_count = len(modules)
average_minutes = (
    int(sum(module["estimated_minutes"] for module in modules) / module_count)
    if module_count
    else 0
)
difficulty_levels = sorted({module["difficulty"] for module in modules}) if modules else []

st.markdown(
    """
    <style>
    :root {
        color-scheme: dark;
    }
    div[data-testid="stSidebar"] {
        display: none;
    }
    .stApp {
        background: radial-gradient(circle at 15% 20%, rgba(56, 189, 248, 0.14), transparent 55%),
                    radial-gradient(circle at 85% 10%, rgba(59, 130, 246, 0.12), transparent 45%),
                    linear-gradient(160deg, rgba(12, 19, 35, 0.95), rgba(15, 23, 42, 0.9));
        font-family: "Inter", "SF Pro Display", sans-serif;
    }
    .page-shell {
        padding: 2.5rem clamp(1.5rem, 5vw, 3.5rem) 4rem;
        max-width: 1280px;
        margin: 0 auto;
    }
    .top-nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 1.75rem;
        gap: 1rem;
    }
    .brand {
        font-size: 1.2rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #e2e8f0;
        text-transform: uppercase;
    }
    .nav-links {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }
    .nav-links span {
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.25);
        color: rgba(226, 232, 240, 0.9);
        font-size: 0.85rem;
    }
    .landing-hero {
        position: relative;
        padding: clamp(2.4rem, 5vw, 3.5rem);
        border-radius: 32px;
        background: linear-gradient(145deg, rgba(14, 116, 144, 0.38), rgba(15, 118, 110, 0.18));
        border: 1px solid rgba(94, 234, 212, 0.18);
        box-shadow: 0 30px 80px rgba(14, 165, 233, 0.18);
        display: grid;
        gap: clamp(2rem, 4vw, 3.5rem);
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    }
    .landing-hero::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle at 30% 20%, rgba(125, 211, 252, 0.35), transparent 50%);
        pointer-events: none;
        opacity: 0.6;
    }
    .hero-copy {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 1.3rem;
        color: rgba(226, 232, 240, 0.95);
    }
    .hero-pill {
        align-self: flex-start;
        padding: 0.5rem 1.15rem;
        border-radius: 999px;
        background: rgba(20, 184, 166, 0.22);
        color: #99f6e4;
        font-size: 0.85rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .hero-title {
        margin: 0;
        font-size: clamp(2.6rem, 5vw, 3.8rem);
        color: #ecfeff;
    }
    .hero-body {
        margin: 0;
        font-size: 1.1rem;
        max-width: 640px;
        line-height: 1.6;
        color: rgba(226, 232, 240, 0.9);
    }
    .hero-highlights {
        margin: 0;
        padding-left: 0;
        list-style: none;
        display: grid;
        gap: 0.75rem;
    }
    .hero-highlights li {
        display: flex;
        align-items: flex-start;
        gap: 0.65rem;
    }
    .hero-highlights li::before {
        content: "✦";
        color: #a5f3fc;
        margin-top: 0.1rem;
    }
    .hero-actions {
        margin-top: 0.75rem;
    }
    .hero-actions .stButton>button {
        border-radius: 16px;
        padding: 0.9rem 1.4rem;
        font-weight: 600;
        border: 1px solid rgba(56, 189, 248, 0.45);
        background: rgba(12, 74, 110, 0.55);
        color: #e0f2fe;
        transition: transform 0.2s ease, background 0.2s ease;
    }
    .hero-actions .stButton>button:hover {
        transform: translateY(-2px);
        background: rgba(56, 189, 248, 0.35);
    }
    .hero-panel {
        position: relative;
        z-index: 1;
        background: rgba(15, 23, 42, 0.92);
        border-radius: 28px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        padding: 1.8rem 1.6rem;
        box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.1);
    }
    .hero-panel .stTabs {
        margin-top: 1rem;
    }
    .data-grid {
        margin-top: 2.5rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.35rem;
    }
    .data-card,
    .spotlight-card,
    .pillar-card,
    .ops-card {
        position: relative;
        padding: 1.6rem;
        border-radius: 22px;
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid rgba(94, 234, 212, 0.2);
        color: rgba(226, 232, 240, 0.9);
        box-shadow: 0 24px 52px rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        min-height: 180px;
    }
    .data-card strong {
        display: block;
        font-size: 2.1rem;
        color: #ecfeff;
    }
    .data-card span {
        color: rgba(148, 163, 184, 0.85);
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .spotlights,
    .pillar-grid,
    .ops-grid {
        margin-top: 1.75rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.35rem;
    }
    .spotlight-card h3,
    .pillar-card h3,
    .ops-card h3 {
        margin: 0;
        color: #bae6fd;
        font-size: 1.15rem;
    }
    .ops-card ul {
        padding-left: 1.05rem;
        margin: 0;
        display: grid;
        gap: 0.35rem;
    }
    .curriculum-filter {
        margin: 2.75rem 0 1.25rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    .curriculum-filter span {
        color: rgba(226, 232, 240, 0.85);
        font-size: 0.95rem;
    }
    .module-board {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1.35rem;
        width: 100%;
    }
    .module-card {
        padding: 1.6rem;
        border-radius: 22px;
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid rgba(148, 163, 184, 0.22);
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        min-height: 220px;
        transition: transform 0.25s ease, border-color 0.25s ease;
    }
    .module-card:hover {
        transform: translateY(-6px);
        border-color: rgba(56, 189, 248, 0.35);
    }
    .module-card h4 {
        margin: 0;
        color: #f8fafc;
        font-size: 1.15rem;
    }
    .module-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9rem;
        color: rgba(148, 163, 184, 0.85);
    }
    .badge {
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.18);
        border: 1px solid rgba(59, 130, 246, 0.35);
        color: #bfdbfe;
        font-size: 0.8rem;
    }
    .goal-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        background: rgba(45, 212, 191, 0.18);
        color: #99f6e4;
        border: 1px solid rgba(94, 234, 212, 0.28);
        font-size: 0.78rem;
        margin: 0.2rem 0.25rem 0 0;
    }
    .recommendation-panel {
        margin-top: 1.5rem;
        padding: 1.75rem 1.5rem;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .footer-note {
        margin-top: 3rem;
        color: rgba(148, 163, 184, 0.75);
        text-align: center;
        font-size: 0.9rem;
    }
    @media (max-width: 1100px) {
        .landing-hero {
            grid-template-columns: 1fr;
        }
        .hero-actions .stButton>button {
            width: 100%;
        }
        .pillar-grid,
        .ops-grid {
            grid-template-columns: 1fr;
        }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown("<div class='page-shell'>", unsafe_allow_html=True)

st.markdown(
    """
    <header class='top-nav'>
        <div class='brand'>PyMasters</div>
        <div class='nav-links'>
            <span>Curriculum</span>
            <span>Progress</span>
            <span>Community</span>
        </div>
    </header>
    """,
    unsafe_allow_html=True,
)

with st.container():
    st.markdown("<section class='landing-hero'>", unsafe_allow_html=True)
    hero_left, hero_right = st.columns((7, 5), gap="large")

    with hero_left:
        st.markdown(
            """
            <div class='hero-copy'>
                <div class='hero-pill'>New · Adaptive Python studio</div>
                <h1 class='hero-title'>Design your next Python breakthrough</h1>
                <p class='hero-body'>Orchestrate projects, coaching, and code reviews from a single adaptive workspace. PyMasters evolves with your goals, whether you're building automations, APIs, or AI-driven tooling.</p>
                <ul class='hero-highlights'>
                    <li>Blueprints that translate theory into shipping-ready artifacts.</li>
                    <li>Guided retros and analytics that keep teams aligned.</li>
                    <li>Community labs designed for pair programming and mentorship.</li>
                </ul>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("<div class='hero-actions'>", unsafe_allow_html=True)
        primary_cta, secondary_cta = st.columns(2, gap="medium")
        with primary_cta:
            if st.button("Start guided tour", key="cta_tour", use_container_width=True):
                st.experimental_set_query_params(section="tour")
        with secondary_cta:
            if st.button("Browse curriculum", key="cta_curriculum", use_container_width=True):
                st.experimental_set_query_params(section="curriculum")
        st.markdown("</div>", unsafe_allow_html=True)

    with hero_right:
        st.markdown("<div class='hero-panel'>", unsafe_allow_html=True)
        if user:
            st.success(
                f"Welcome back, {user['name']}! Continue your streak or launch a new sprint.",
                icon="✨",
            )
            st.metric("Active journeys", f"{module_count}")
            st.metric("Average sprint", f"{average_minutes} min" if average_minutes else "n/a")
        else:
            render_login(auth_service)
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("</section>", unsafe_allow_html=True)

stats_html = f"""
<section class='data-grid'>
    <div class='data-card'>
        <span>Learning paths</span>
        <strong>{module_count}</strong>
        <p>Modular sprints curated by senior mentors.</p>
    </div>
    <div class='data-card'>
        <span>Avg. sprint time</span>
        <strong>{average_minutes if average_minutes else '––'} min</strong>
        <p>Designed for production-friendly delivery windows.</p>
    </div>
    <div class='data-card'>
        <span>Live sessions</span>
        <strong>3 / week</strong>
        <p>Workshops, office hours, and code clinics.</p>
    </div>
    <div class='data-card'>
        <span>Playbooks</span>
        <strong>12</strong>
        <p>Security-reviewed templates for service deployments.</p>
    </div>
</section>
"""
st.markdown(stats_html, unsafe_allow_html=True)

st.markdown("### Why teams choose PyMasters")
st.caption("A modern delivery pipeline for Python learning, complete with analytics, coaching, and production-grade tooling.")

platform_pillars = [
    (
        "Adaptive workspaces",
        "Spin up focused sandboxes with preloaded datasets, tests, and scaffolding tailored to each learning path.",
    ),
    (
        "Delivery cadences",
        "Weekly checkpoints, async retros, and pair-programming prompts keep momentum visible and measurable.",
    ),
    (
        "Insightful analytics",
        "Understand how code quality, velocity, and retention trend over time with exportable dashboards.",
    ),
    (
        "Community accelerators",
        "Access curated guilds, lightning talks, and challenge ladders that expand your network while you learn.",
    ),
]

pillar_html = "<div class='pillar-grid'>"
for title, description in platform_pillars:
    pillar_html += (
        "<div class='pillar-card'>"
        f"<h3>{title}</h3>"
        f"<p>{description}</p>"
        "</div>"
    )
pillar_html += "</div>"
st.markdown(pillar_html, unsafe_allow_html=True)

st.markdown("### Built for production teams")
st.caption("Operations-friendly guardrails keep security, observability, and governance front of mind.")

ops_cards = [
    (
        "Secure by default",
        "Role-based access, secrets management, and ephemeral sandboxes keep codebases isolated.",
        ["SAML/SSO ready", "SOC2-aligned controls"],
    ),
    (
        "Observability hooks",
        "Export metrics to your preferred stack with traceable run histories and audit trails.",
        ["Ship logs to Datadog", "Webhook automations"],
    ),
    (
        "Enterprise rollout",
        "Provision workspaces programmatically with Terraform-ready modules and CLI tooling.",
        ["Immutable environments", "API-first provisioning"],
    ),
]

ops_html = "<div class='ops-grid'>"
for title, description, bullets in ops_cards:
    list_html = "".join(f"<li>{bullet}</li>" for bullet in bullets)
    ops_html += (
        "<div class='ops-card'>"
        f"<h3>{title}</h3>"
        f"<p>{description}</p>"
        f"<ul>{list_html}</ul>"
        "</div>"
    )
ops_html += "</div>"
st.markdown(ops_html, unsafe_allow_html=True)

st.markdown("### Choose your next build cycle")
st.caption("Filter by focus level to see where you and your team should invest the next sprint.")

if not modules:
    st.info("Modules are loading. Refresh the page to explore learning paths.")
else:
    difficulty_options = ["All levels"] + [difficulty.title() for difficulty in difficulty_levels]
    selected_difficulty = st.radio(
        "Select difficulty",
        difficulty_options,
        horizontal=True,
        label_visibility="collapsed",
        index=0,
        key="difficulty-filter",
    )

    if selected_difficulty == "All levels":
        filtered_modules = modules
    else:
        normalized = selected_difficulty.lower()
        filtered_modules = [
            module for module in modules if module["difficulty"].lower() == normalized
        ]

    if not filtered_modules:
        st.info("No modules match that focus just yet. Check back soon!")
    else:
        module_summary = (
            "<div class='curriculum-filter'><span>"
            f"{len(filtered_modules)} modules ready with real briefs and starter repos."
            "</span></div>"
        )
        st.markdown(module_summary, unsafe_allow_html=True)
        module_html = "<div class='module-board'>"
        for module in filtered_modules:
            tag_html = "".join(f"<span class='goal-chip'>{tag}</span>" for tag in module["tags"])
            module_html += (
                "<div class='module-card'>"
                f"<h4>{module['title']}</h4>"
                f"<p>{module['description']}</p>"
                f"<div class='module-meta'><span>{module['difficulty'].title()} track</span>"
                f"<span class='badge'>{module['estimated_minutes']} min</span></div>"
                f"<div>{tag_html}</div>"
                "</div>"
            )
        module_html += "</div>"
        st.markdown(module_html, unsafe_allow_html=True)

if user:
    st.markdown("### Personalized focus board")
    st.caption("Based on your completions, here are the next challenges to keep the streak alive.")
    progress_service = ProgressService()
    recommendation_service = RecommendationService()
    progress_records = [record.model_dump() for record in progress_service.list_progress(user["id"])]
    completed_module_ids = [record["module_id"] for record in progress_records]
    recommendations = recommendation_service.get_recommendations(
        user_id=user["id"], completed_module_ids=completed_module_ids
    )
    st.markdown("<div class='recommendation-panel'>", unsafe_allow_html=True)
    render_recommendation_carousel(recommendations)
    st.markdown("</div>", unsafe_allow_html=True)
else:
    st.info("Sign in or create an account to unlock personalised recommendations and progress tracking.")

st.markdown(
    """
    <div class='footer-note'>
        PyMasters ships with a production-ready deployment playbook. Connect your identity provider, plug in your observability stack, and onboard teams in hours.
    </div>
    """,
    unsafe_allow_html=True,
)

st.markdown("</div>", unsafe_allow_html=True)
