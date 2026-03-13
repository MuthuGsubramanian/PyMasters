from __future__ import annotations

import streamlit as st

from pymasters_app.utils import helpers
from pymasters_app.utils.activity import log_activity, get_recent_activity
from pymasters_app.utils.leaderboard import get_leaderboard
from pymasters_app.utils.db import get_database
from utils.streamlit_helpers import rerun


STATUS_PILLS = {
    "not_started": ("Queued", "ob-pill ob-pill-queued"),
    "in_progress": ("In progress", "ob-pill ob-pill-progress"),
    "completed": ("Completed", "ob-pill ob-pill-completed"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard view with Obsidian Terminal design."""

    if db is None:
        db = get_database()

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

        action_cols = st.columns([1, 1, 1, 3])
        with action_cols[0]:
            if st.button("Start", key=f"start-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="in_progress",
                )
                st.toast(f"Marked {module['title']} as in progress.")
                log_activity(db, user["id"], "started_module", module["title"])
                rerun()

        with action_cols[1]:
            if st.button("Complete", key=f"complete-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="completed",
                )
                st.toast(f"Marked {module['title']} as completed.")
                log_activity(db, user["id"], "completed_module", module["title"])
                rerun()

        with action_cols[2]:
            if st.button("Reset", key=f"reset-{module['id']}"):
                helpers.upsert_progress(
                    progress_collection,
                    user_id=user["id"],
                    module_id=module["id"],
                    status="not_started",
                )
                st.toast(f"Reset progress for {module['title']}")
                log_activity(db, user["id"], "reset_module", module["title"])
                rerun()

    # --- Activity feed ---
    with st.expander("Recent activity"):
        activities = get_recent_activity(db, user["id"])
        if not activities:
            st.markdown(
                '<p style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--text-muted);">No activity yet.</p>',
                unsafe_allow_html=True,
            )
        else:
            for act in activities:
                ts = act.get("created_at")
                ts_str = ts.strftime("%Y-%m-%d %H:%M") if ts else ""
                action = act.get("action", "").replace("_", " ").title()
                detail = act.get("detail", "")
                st.markdown(
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
                    '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>'
                    f'<span style="font-size:12px;color:var(--text-secondary);">{action}</span>'
                    f'<span style="font-size:11px;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{detail}</span>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--text-muted);white-space:nowrap;">{ts_str}</span>'
                    '</div>',
                    unsafe_allow_html=True,
                )

    # --- Leaderboard ---
    with st.expander("Leaderboard"):
        leaders = get_leaderboard(db)
        if not leaders:
            st.markdown(
                '<p style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--text-muted);">No completions yet. Be the first!</p>',
                unsafe_allow_html=True,
            )
        else:
            for rank, entry in enumerate(leaders, 1):
                is_current = entry["user_id"] == user.get("id")
                bg = "var(--accent-glow)" if is_current else "transparent"
                accent = "var(--accent)" if is_current else "var(--text-secondary)"
                st.markdown(
                    f'<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:6px;background:{bg};margin-bottom:4px;">'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:16px;font-weight:700;color:{accent};min-width:28px;">#{rank}</span>'
                    f'<span style="font-size:13px;color:var(--text-primary);flex:1;">{entry["username"]}</span>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:var(--accent);">{entry["completed_count"]}</span>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--text-muted);text-transform:uppercase;">completed</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
