"""Dashboard page for authenticated users."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils import helpers
from utils.streamlit_helpers import rerun


STATUS_LABELS = {
    "not_started": ("Not started", "#cbd5f5"),
    "in_progress": ("In progress", "#facc15"),
    "completed": ("Completed", "#22c55e"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard view."""
    modules_collection = db["learning_modules"]
    progress_collection = db["progress"]

    helpers.seed_learning_modules(modules_collection)
    modules = helpers.get_learning_modules(modules_collection)
    progress_map = helpers.get_progress_by_user(progress_collection, user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)

    st.write("## Dashboard")
    st.caption("Review your progress and continue your personalised learning path.")

    metrics = st.columns(3)
    metrics[0].metric("Learning modules", summary["total_modules"])
    metrics[1].metric("In progress", summary["in_progress"])
    metrics[2].metric("Completed", summary["completed"])

    st.markdown("### Continue your journey")

    for module in modules:
        with st.container():
            st.markdown(
                f"""
                <div style="background:rgba(15,23,42,0.55); padding:1.2rem 1.4rem; border-radius:18px; border:1px solid rgba(148,163,184,0.2); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="margin-bottom:0.4rem;">{module['title']}</h3>
                            <p style="margin:0; color:#cbd5f5; max-width:720px;">{module['description']}</p>
                            <div style="margin-top:0.6rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
                                {''.join(f'<span style=\"background:rgba(56,189,248,0.18); color:#bae6fd; padding:0.35rem 0.75rem; border-radius:999px; font-size:0.85rem;\">{tag}</span>' for tag in module.get('tags', []))}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:#94a3b8; font-size:0.85rem;">{module['estimated_minutes']} min • {module['difficulty'].title()}</div>
                            {render_status_chip(progress_map.get(module['id'], {'status': 'not_started'})['status'])}
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        action_cols = st.columns(3)
        if action_cols[0].button("Start", key=f"start-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="in_progress")
            st.toast(f"Marked {module['title']} as in progress.")
            rerun()
        if action_cols[1].button("Completed", key=f"complete-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="completed")
            st.toast(f"Marked {module['title']} as completed. 🎉")
            rerun()
        if action_cols[2].button("Reset", key=f"reset-{module['id']}"):
            helpers.upsert_progress(progress_collection, user_id=user["id"], module_id=module["id"], status="not_started")
            st.toast(f"Reset progress for {module['title']}")
            rerun()

        st.divider()


def render_status_chip(status: str) -> str:
    label, color = STATUS_LABELS.get(status, STATUS_LABELS["not_started"])
    return (
        f"<span style='display:inline-block; margin-top:0.5rem; padding:0.3rem 0.75rem; background:{color}; color:#0f172a; border-radius:999px; font-weight:600; font-size:0.8rem;'>{label}</span>"
    )
