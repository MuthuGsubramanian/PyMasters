"""Analytics layout for progress visualisations."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st


def render_analytics(*, progress: list[dict], activity_log: list[dict] | None = None) -> None:
    """Render analytics tabs for the learner."""

    st.title("Learning Analytics")
    st.caption("Dive into your learning patterns, streaks, and achievements.")

    if not progress:
        st.info("Analytics unlock once you start a module. Head over to Learning Paths!")
        return

    df = pd.DataFrame(progress)
    st.subheader("Module completion timeline")

    if "last_accessed" in df.columns:
        timeline_df = df.sort_values("last_accessed")
        fig = px.line(
            timeline_df,
            x="last_accessed",
            y="completion_pct",
            color="module_id",
            markers=True,
            labels={"completion_pct": "Completion %", "last_accessed": "Last Accessed"},
        )
        fig.update_layout(
            plot_bgcolor="rgba(15,23,42,0.2)",
            paper_bgcolor="rgba(15,23,42,0.0)",
            font_color="#f8fafc",
        )
        st.plotly_chart(fig, use_container_width=True)

    st.markdown("---")
    st.subheader("Learning streak insights")
    streak_length = max(df["completion_pct"].sum() // 50, 1)
    st.metric("Active streak", f"{int(streak_length)} days", delta="Keep going!")

    st.markdown("---")
    st.subheader("Downloadable progress snapshot")
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    st.download_button(
        "Download CSV report",
        data=csv_bytes,
        file_name="pymasters_progress.csv",
        mime="text/csv",
    )
