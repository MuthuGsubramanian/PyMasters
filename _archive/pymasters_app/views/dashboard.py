from __future__ import annotations

import streamlit as st

from pymasters_app.utils import helpers
from utils.streamlit_helpers import rerun


STATUS_LABELS = {
    "not_started": ("Queued", "not_started"),
    "in_progress": ("In progress", "in_progress"),
    "completed": ("Completed", "completed"),
}


def render(*, db, user: dict[str, str]) -> None:
    """Render the dashboard view with immersive cards."""

    modules_collection = db["learning_modules"]
    progress_collection = db["progress"]

    helpers.seed_learning_modules(modules_collection)
    modules = helpers.get_learning_modules(modules_collection)
    progress_map = helpers.get_progress_by_user(progress_collection, user_id=user["id"])
    summary = helpers.summarize_progress(modules, progress_map)

    st.markdown(
        """
        <style>
        .pm-dashboard-hero {
            margin-top:0.5rem;
            padding:2.4rem;
            border-radius:32px;
            border:1px solid rgba(56,189,248,0.35);
            background:linear-gradient(135deg, rgba(15,23,42,0.9), rgba(2,6,23,0.85));
            box-shadow:0 45px 140px -80px rgba(56,189,248,0.85);
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:1.8rem;
        }
        .pm-dashboard-hero h2 {margin-bottom:0.4rem;}
        .pm-dashboard-hero p {color:rgba(148,163,184,0.95);}
        .pm-next-card {
            margin-top:1rem;
            padding:1.2rem 1.4rem;
            border-radius:22px;
            border:1px solid rgba(16,185,129,0.35);
            background:rgba(6,78,59,0.45);
        }
        .pm-metric-grid {
            margin:1.6rem 0 2rem;
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));
            gap:1rem;
        }
        .pm-metric-card {
            padding:1.2rem 1.4rem;
            border-radius:22px;
            border:1px solid rgba(148,163,184,0.25);
            background:rgba(15,23,42,0.78);
            box-shadow:0 30px 80px -60px rgba(15,118,110,0.8);
        }
        .pm-metric-card span {text-transform:uppercase; letter-spacing:0.25em; font-size:0.68rem; color:#bae6fd;}
        .pm-metric-card strong {display:block; font-size:2rem; margin:0.4rem 0; color:#f8fafc;}
        .pm-metric-card p {margin:0; color:rgba(148,163,184,0.95);}
        .pm-module-card {
            position:relative;
            padding:1.6rem 1.8rem;
            border-radius:26px;
            border:1px solid rgba(148,163,184,0.25);
            background:rgba(2,6,23,0.8);
            margin-bottom:1rem;
            box-shadow:0 40px 120px -70px rgba(14,165,233,0.65);
        }
        .pm-module-head {display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;}
        .pm-module-tags {display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.65rem;}
        .pm-tag {
            padding:0.25rem 0.75rem;
            border-radius:999px;
            background:rgba(56,189,248,0.15);
            color:#bae6fd;
            font-size:0.82rem;
            letter-spacing:0.05em;
        }
        .pm-status {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding:0.35rem 0.85rem;
            border-radius:999px;
            text-transform:uppercase;
            letter-spacing:0.24em;
            font-size:0.68rem;
        }
        .pm-status-not_started {background:rgba(148,163,184,0.25); color:#cbd5f5;}
        .pm-status-in_progress {background:rgba(250,204,21,0.2); color:#fde047;}
        .pm-status-completed {background:rgba(34,197,94,0.2); color:#4ade80;}
        </style>
        """,
        unsafe_allow_html=True,
    )

    next_focus = next(
        (module for module in modules if progress_map.get(module["id"], {}).get("status") != "completed"),
        modules[0] if modules else None,
    )
    next_title = next_focus["title"] if next_focus else "Explore the catalog"
    next_meta = (
        f"{next_focus['estimated_minutes']} min · {next_focus['difficulty'].title()}"
        if next_focus
        else "Browse missions"
    )

    st.markdown(
        f"""
        <div class="pm-dashboard-hero">
            <div>
                <p style="letter-spacing:0.35em; text-transform:uppercase; color:#a5f3fc;">Mission control</p>
                <h2>Welcome back, {user.get('name') or user.get('username')}.</h2>
                <p>Your personalised command cards surface progress velocity, ready-to-run modules, and studio drops.</p>
            </div>
            <div class="pm-next-card">
                <strong>Next focus</strong>
                <p style="margin:0.35rem 0 0.15rem; color:#f8fafc;">{next_title}</p>
                <span style="font-size:0.85rem; color:#d1fae5;">{next_meta}</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='pm-metric-grid'>", unsafe_allow_html=True)
    for title, value, caption in [
        ("Learning modules", summary["total_modules"], "curated for your path"),
        ("In progress", summary["in_progress"], "actively running"),
        ("Completed", summary["completed"], "mission victories"),
    ]:
        st.markdown(
            f"""
            <div class="pm-metric-card">
                <span>{title}</span>
                <strong>{value}</strong>
                <p>{caption}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("### Continue your journey")

    for module in modules:
        status = progress_map.get(module["id"], {"status": "not_started"}).get("status", "not_started")
        st.markdown(
            f"""
            <div class="pm-module-card">
                <div class="pm-module-head">
                    <div>
                        <h3>{module['title']}</h3>
                        <p style='margin:0; color:rgba(226,232,240,0.85);'>{module['description']}</p>
                        <div class="pm-module-tags">
                            {''.join(f"<span class='pm-tag'>{tag}</span>" for tag in module.get('tags', []))}
                        </div>
                    </div>
                    <div style='text-align:right;'>
                        <div style='font-size:0.85rem; color:rgba(148,163,184,0.9);'>{module['estimated_minutes']} min · {module['difficulty'].title()}</div>
                        {render_status_chip(status)}
                    </div>
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
        if action_cols[2].button("Reset", key=f"reset-{module['id']}"):
            helpers.upsert_progress(
                progress_collection,
                user_id=user["id"],
                module_id=module["id"],
                status="not_started",
            )
            st.toast(f"Reset progress for {module['title']}")
            rerun()


def render_status_chip(status: str) -> str:
    label, css = STATUS_LABELS.get(status, STATUS_LABELS["not_started"])
    return f"<span class='pm-status pm-status-{css}'>{label}</span>"
