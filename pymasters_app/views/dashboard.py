from __future__ import annotations

import streamlit as st

from pymasters_app.utils import helpers
from utils.streamlit_helpers import rerun


STATUS_PILLS = {
    "not_started": ("Queued", "ob-pill ob-pill-queued"),
    "in_progress": ("In progress", "ob-pill ob-pill-progress"),
    "completed": ("Completed", "ob-pill ob-pill-completed"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard view with Obsidian Terminal design."""

    modules_collection = db["learning_modules"]
    progress_collection = db["progress"]

    helpers.seed_learning_modules(modules_collection)
    modules = helpers.get_learning_modules(modules_collection)
    progress_map = helpers.get_progress_by_user(progress_collection, user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)

    # --- Welcome row ---
    name = user.get("name") or user.get("username")
    in_progress_count = summary["in_progress"]
    completed_count = summary["completed"]

    if in_progress_count or completed_count:
        parts = []
        if in_progress_count:
            parts.append(f"{in_progress_count} in progress")
        if completed_count:
            parts.append(f"{completed_count} completed")
        caption = " · ".join(parts)
    else:
        caption = "Ready to start"

    st.markdown(
        f"""
        <h3 style="font-family:'JetBrains Mono',monospace; font-size:22px; margin-bottom:4px;">
            Welcome back, {name}.
        </h3>
        <p style="font-family:'JetBrains Mono',monospace; font-size:13px; color:var(--text-muted); margin-top:0;">
            {caption}
        </p>
        """,
        unsafe_allow_html=True,
    )

    # --- Divider ---
    st.markdown("<div class='ob-divider'></div>", unsafe_allow_html=True)

    # --- Metrics row ---
    metrics = [
        ("Total Modules", summary["total_modules"], "var(--text-primary)"),
        ("In Progress", summary["in_progress"], "var(--warning)"),
        ("Completed", summary["completed"], "var(--accent)"),
    ]

    col1, col2, col3 = st.columns(3)
    for col, (label, value, color) in zip([col1, col2, col3], metrics):
        with col:
            st.markdown(
                f"""
                <div class="ob-card">
                    <div style="font-family:'JetBrains Mono',monospace; font-size:28px; font-weight:700; color:{color};">
                        {value}
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted);">
                        {label}
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    # --- Modules section ---
    st.markdown("#### Your modules")

    for module in modules:
        status = progress_map.get(module["id"], {"status": "not_started"}).get("status", "not_started")
        pill_label, pill_class = STATUS_PILLS.get(status, STATUS_PILLS["not_started"])

        tags_html = "".join(
            f"""<span style="background:var(--accent-glow); color:var(--accent); font-family:'JetBrains Mono',monospace; font-size:10px; padding:2px 8px; border-radius:4px;">{tag}</span>"""
            for tag in module.get("tags", [])
        )

        st.markdown(
            f"""
            <div class="ob-card" style="margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
                    <div>
                        <div style="color:var(--text-primary); font-size:14px; font-weight:600; margin-bottom:4px;">
                            {module['title']}
                        </div>
                        <div style="color:var(--text-secondary); font-size:12px; margin-bottom:8px;">
                            {module['description']}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                            {tags_html}
                        </div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-muted); margin-bottom:6px;">
                            {module['estimated_minutes']} min · {module['difficulty'].title()}
                        </div>
                        <span class="{pill_class}">{pill_label}</span>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        action_cols = st.columns(3)
        with action_cols[0]:
            st.markdown("<div class='ob-btn-secondary'>", unsafe_allow_html=True)
            if st.button("Start", key=f"start-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="in_progress",
                )
                st.toast(f"Marked {module['title']} as in progress.")
                rerun()
            st.markdown("</div>", unsafe_allow_html=True)

        with action_cols[1]:
            st.markdown("<div class='ob-btn-secondary'>", unsafe_allow_html=True)
            if st.button("Complete", key=f"complete-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="completed",
                )
                st.toast(f"Marked {module['title']} as completed.")
                rerun()
            st.markdown("</div>", unsafe_allow_html=True)

        with action_cols[2]:
            st.markdown("<div class='ob-btn-secondary'>", unsafe_allow_html=True)
            if st.button("Reset", key=f"reset-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="not_started",
                )
                st.toast(f"Reset progress for {module['title']}")
                rerun()
            st.markdown("</div>", unsafe_allow_html=True)
