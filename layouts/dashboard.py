"""Dashboard layout orchestrating the overview experience."""
from __future__ import annotations

from typing import Iterable

import plotly.express as px
import streamlit as st

from components import (
    render_auth_header,
    render_progress_card,
    render_recommendation_carousel,
)


def render_dashboard(
    *,
    user: dict,
    progress: Iterable[dict],
    modules: Iterable[dict],
    recommendations: Iterable[dict],
) -> None:
    """Render the authenticated dashboard experience."""

    render_auth_header(user)

    col1, col2, col3 = st.columns(3)
    progress_list = list(progress)
    module_map = {module["id"]: module for module in modules}

    total_completion = sum(item["completion_pct"] for item in progress_list) / max(len(progress_list), 1)
    streak_days = 5  # placeholder for demonstration

    with col1:
        render_progress_card(
            title="Overall completion",
            completion_pct=total_completion,
            subtitle="Your blended learning journey",
            streak_days=streak_days,
        )
    with col2:
        render_progress_card(
            title="Lessons completed",
            completion_pct=round(total_completion * 0.8),
            subtitle="Keep the streak alive!",
        )
    with col3:
        render_progress_card(
            title="Practice score",
            completion_pct=72,
            subtitle="Weekly coding challenge",
        )

    st.markdown("---")
    st.subheader("Recommended next steps")
    render_recommendation_carousel(recommendations)

    st.markdown("---")
    st.subheader("Time spent per module")
    chart_data = [
        {
            "Module": module_map.get(item["module_id"], {}).get("title", "Unknown"),
            "Progress": item["completion_pct"],
        }
        for item in progress_list
    ]
    if chart_data:
        fig = px.bar(chart_data, x="Module", y="Progress", color="Module", range_y=(0, 100))
        fig.update_layout(
            plot_bgcolor="rgba(15,23,42,0.2)",
            paper_bgcolor="rgba(15,23,42,0.0)",
            font_color="#f8fafc",
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Complete your first lesson to unlock analytics!")
