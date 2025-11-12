"""Dashboard page for authenticated users."""
from __future__ import annotations

from typing import Any

import streamlit as st

from pymasters_app.utils import helpers
from utils.streamlit_helpers import rerun

STATUS_LABELS: dict[str, tuple[str, str, str, str]] = {
    "not_started": ("Not started", "rgba(148, 163, 184, 0.25)", "#e2e8f0", "⏳"),
    "in_progress": ("In progress", "rgba(250, 204, 21, 0.25)", "#fde68a", "🚀"),
    "completed": ("Completed", "rgba(34, 197, 94, 0.22)", "#bbf7d0", "🏁"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard view."""
    modules_collection = db["learning_modules"]
    progress_collection = db["progress"]

    helpers.seed_learning_modules(modules_collection)
    modules = helpers.get_learning_modules(modules_collection)
    progress_map = helpers.get_progress_by_user(progress_collection, user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)

    total_modules = max(summary["total_modules"], 1)
    completion_rate = round((summary["completed"] / total_modules) * 100)
    active_modules = summary["in_progress"]
    next_focus = _next_module(modules, progress_map)

    st.markdown(
        f"""
        <div class=\"pm-hero\">
          <span class=\"pm-tag\">Hi {user.get('name', 'there')}</span>
          <h2>You're {completion_rate}% of the way to finishing your track</h2>
          <p>Keep building momentum with focused sessions. PyMasters curates the exact lessons, labs, and tutor prompts you need next.</p>
          <div style=\"margin-top:1.6rem; display:flex; gap:1.4rem; flex-wrap:wrap;\">
            <div class=\"pm-card\" style=\"padding:1.1rem 1.4rem; min-width:220px;\">
              <div style=\"color:var(--pm-text-muted); font-size:0.85rem;\">Next focus</div>
              <div style=\"font-weight:600; font-size:1.05rem;\">{next_focus['title'] if next_focus else 'Explore any module'}</div>
            </div>
            <div class=\"pm-card\" style=\"padding:1.1rem 1.4rem; min-width:220px;\">
              <div style=\"color:var(--pm-text-muted); font-size:0.85rem;\">Active modules</div>
              <div style=\"font-weight:600; font-size:1.05rem;\">{active_modules}</div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    metric_cols = st.columns(3)
    metric_defs: list[tuple[str, Any, str]] = [
        ("Learning modules", summary["total_modules"], "Total curated lessons"),
        ("In progress", summary["in_progress"], "Active modules this week"),
        ("Completed", summary["completed"], "Celebrated milestones"),
    ]
    for col, (label, value, caption) in zip(metric_cols, metric_defs):
        with col:
            st.markdown(
                f"""
                <div class=\"pm-card pm-metric-card\">
                  <div style=\"color:var(--pm-text-muted); font-size:0.9rem;\">{label}</div>
                  <div style=\"font-size:2rem; font-weight:700; margin-top:0.2rem;\">{value}</div>
                  <div style=\"color:var(--pm-text-muted); font-size:0.8rem; margin-top:0.4rem;\">{caption}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown(
        """
        <div class=\"pm-section-title\" style=\"margin-top:2rem;\">Continue your journey</div>
        <div class=\"pm-section-subtitle\">Pick a module to deep dive, or mark milestones as you complete them.</div>
        """,
        unsafe_allow_html=True,
    )

    if not modules:
        st.markdown(
            "<div class='pm-empty-state'>No modules found. Add new learning content from the admin dashboard.</div>",
            unsafe_allow_html=True,
        )
        return

    for chunk_start in range(0, len(modules), 2):
        row_cols = st.columns(2, gap="large")
        for offset, col in enumerate(row_cols):
            index = chunk_start + offset
            if index >= len(modules):
                continue
            module = modules[index]
            with col:
                _render_module_card(
                    module=module,
                    progress_collection=progress_collection,
                    progress_map=progress_map,
                    user=user,
                )


def _render_module_card(*, module: dict[str, Any], progress_collection, progress_map, user: dict[str, str]) -> None:
    status = progress_map.get(module["id"], {}).get("status", "not_started")
    st.markdown("<div class='pm-card pm-module-card'>", unsafe_allow_html=True)
    st.markdown(
        f"""
        <div class=\"pm-module-header\">
          <div>
            <h3 style=\"margin-bottom:0.35rem;\">{module['title']}</h3>
            <p style=\"margin:0; color:var(--pm-text-muted);\">{module['description']}</p>
            <div style=\"margin-top:0.6rem; display:flex; gap:0.4rem; flex-wrap:wrap;\">
              {''.join(f'<span class=\"pm-tag\">{tag}</span>' for tag in module.get('tags', []))}
            </div>
          </div>
          <div style=\"text-align:right;\">
            <div class=\"pm-module-meta\">
              <span>{module['estimated_minutes']} min</span>
              <span>{module['difficulty'].title()}</span>
            </div>
            {render_status_chip(status)}
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    action_cols = st.columns(3)
    if action_cols[0].button("Start", key=f"start-{module['id']}"):
        helpers.upsert_progress(
            progress_collection,
            user_id=user["id"],
            module_id=module["id"],
            status="in_progress",
        )
        st.toast(f"Marked {module['title']} as in progress.")
        rerun()
    if action_cols[1].button("Completed", key=f"complete-{module['id']}"):
        helpers.upsert_progress(
            progress_collection,
            user_id=user["id"],
            module_id=module["id"],
            status="completed",
        )
        st.toast(f"Marked {module['title']} as completed.")
        rerun()
    if action_cols[2].button("Reset", key=f"reset-{module['id']}"):
        helpers.upsert_progress(
            progress_collection,
            user_id=user["id"],
            module_id=module["id"],
            status="not_started",
        )
        st.toast(f"Reset progress for {module['title']}")
        rerun()

    st.markdown("</div>", unsafe_allow_html=True)


def render_status_chip(status: str) -> str:
    label, bg, text, icon = STATUS_LABELS.get(status, STATUS_LABELS["not_started"])
    return f"<span class='pm-status-chip' style='background:{bg}; color:{text};'>{icon}<span>{label}</span></span>"


def _next_module(modules: list[dict[str, Any]], progress_map: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """Return the next module the learner should focus on."""
    for module in modules:
        status = progress_map.get(module["id"], {}).get("status")
        if status != "completed":
            return module
    return modules[0] if modules else None
