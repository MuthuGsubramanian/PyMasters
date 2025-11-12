"""Header + Custom Top Navigation component for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

import streamlit as st


def render_header(
    *,
    user: Optional[dict[str, Any]] = None,
    on_logout=None,
    pages: Optional[Iterable[str]] = None,
    current_page: Optional[str] = None,

) -> str | None:
    """Render the application header with a next-gen navigation bar.

    Returns the selected page when pages are provided, otherwise None.
    """
    st.markdown(
        """
        <style>
        .pm-toolbar {
            position:sticky;
            top:0;
            z-index:60;
            backdrop-filter: blur(14px);
            border-bottom:1px solid rgba(148,163,184,0.16);
            padding:0.75rem 0 0.35rem;
            background:linear-gradient(120deg, rgba(2,6,23,0.82), rgba(15,23,42,0.78));
            box-shadow:0 20px 45px -35px rgba(15,118,110,0.45);
        }
        .pm-toolbar::after {
            content:"";
            position:absolute;
            inset:0;
            background:radial-gradient(circle at 10% 0%, rgba(56,189,248,0.18), transparent 55%);
            pointer-events:none;
            opacity:0.85;
        }
        .pm-navwrap {display:flex; align-items:center; justify-content:space-between; gap:2rem; position:relative; z-index:1;}
        .pm-brand {display:flex; align-items:center; gap:0.85rem;}
        .pm-brand .logo {
            width:46px;
            height:46px;
            border-radius:16px;
            background:linear-gradient(135deg, rgba(56,189,248,0.95), rgba(192,132,252,0.9));
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:1.55rem;
            box-shadow:0 18px 38px -25px rgba(56,189,248,0.9);
        }
        .pm-brand .title {margin:0; line-height:1.1; font-size:1.4rem; letter-spacing:0.08em; text-transform:uppercase;}
        .pm-brand .subtitle {color:#7dd3fc; font-size:0.8rem; letter-spacing:0.3em; text-transform:uppercase;}
        .pm-meta-chip {
            display:inline-flex;
            align-items:center;
            gap:0.35rem;
            padding:0.25rem 0.8rem;
            border-radius:999px;
            border:1px solid rgba(56,189,248,0.35);
            background:rgba(8,47,73,0.55);
            font-size:0.68rem;
            letter-spacing:0.18em;
            color:#bae6fd;
        }
        .pm-nav {width:100%;}
        .pm-nav [role="radiogroup"] {
            display:flex;
            justify-content:center;
            gap:0.55rem;
            flex-wrap:wrap;
        }
        .pm-nav label {margin-bottom:0; cursor:pointer;}
        .pm-nav label > div {
            position:relative;
            display:flex;
            align-items:center;
        }
        .pm-nav label input {display:none;}
        .pm-nav label span {
            display:flex;
            align-items:center;
            justify-content:center;
            padding:0.48rem 1.5rem;
            border-radius:999px;
            background:rgba(15,23,42,0.72);
            border:1px solid rgba(148,163,184,0.28);
            color:rgba(226,232,240,0.72);
            text-transform:uppercase;
            font-size:0.76rem;
            letter-spacing:0.32em;
            font-weight:600;
            transition:all 0.25s ease-in-out;
            box-shadow:0 16px 38px -28px rgba(56,189,248,0.75);
            min-width:110px;
        }
        .pm-nav label:hover span {
            border-color:rgba(56,189,248,0.58);
            color:#e0f2fe;
            box-shadow:0 20px 50px -30px rgba(56,189,248,0.85);
        }
        .pm-nav label input:checked + span {
            background:linear-gradient(135deg, rgba(56,189,248,0.95), rgba(192,132,252,0.85));
            color:#020617;
            border-color:rgba(56,189,248,0.85);
            box-shadow:0 25px 65px -35px rgba(56,189,248,0.9);
        }
        .pm-tools {display:flex; flex-direction:column; gap:0.65rem; align-items:flex-end;}
        .pm-tools [data-testid="stTextInput"] > div > div {
            background:rgba(15,23,42,0.85);
            border-radius:999px;
            border:1px solid rgba(148,163,184,0.28);
            box-shadow:inset 0 0 0 1px rgba(12,74,110,0.35);
        }
        .pm-tools [data-testid="stTextInput"] input {
            color:rgba(226,232,240,0.92);
            padding:0.55rem 1.15rem;
            font-size:0.85rem;
        }
        .pm-tools [data-testid="stTextInput"] input::placeholder {color:rgba(148,163,184,0.75); letter-spacing:0.14em; text-transform:uppercase;}
        .pm-user-card {
            display:flex;
            flex-direction:column;
            align-items:flex-end;
            text-align:right;
            background:linear-gradient(150deg, rgba(8,47,73,0.7), rgba(15,23,42,0.65));
            padding:0.65rem 0.9rem;
            border-radius:18px;
            border:1px solid rgba(56,189,248,0.25);
            box-shadow:0 15px 45px -35px rgba(56,189,248,0.85);
        }
        .pm-user-card .name {font-weight:700; color:#f8fafc; letter-spacing:0.04em;}
        .pm-user-card .role {font-size:0.8rem; color:rgba(148,163,184,0.85); text-transform:uppercase; letter-spacing:0.24em;}
        .pm-user-card .time {font-size:0.72rem; color:rgba(148,163,184,0.65); margin-top:0.2rem;}
        .pm-user-card.guest {align-items:flex-start; text-align:left; padding:0.8rem 1rem;}
        .pm-user-card.guest strong {color:#f8fafc;}
        .pm-divider {margin:0.65rem auto 1.2rem; width:100%; height:1px; background:linear-gradient(90deg, transparent, rgba(56,189,248,0.45), transparent);}
        </style>
        """,
        unsafe_allow_html=True,
    )

    selected: Optional[str] = None
    with st.container():
        st.markdown("<div class='pm-toolbar'>", unsafe_allow_html=True)
        brand_col, nav_col, tools_col = st.columns([0.26, 0.44, 0.30])
        with brand_col:
            st.markdown(
                """
                <div class="pm-navwrap">
                    <div class="pm-brand">
                        <div class="logo">🧠</div>
                        <div>
                            <div class="pm-meta-chip">Next-Gen Python</div>
                            <h3 class="title">PyMasters</h3>
                            <div class="subtitle">AI enhanced learning studio</div>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        with nav_col:
            if pages:
                page_list = list(pages)
                current_index = (
                    page_list.index(current_page)
                    if current_page in page_list
                    else 0
                )
                with st.container():
                    st.markdown("<div class='pm-nav'>", unsafe_allow_html=True)
                    selection = st.radio(
                        "Primary navigation",
                        page_list,
                        horizontal=True,
                        label_visibility="collapsed",
                        index=current_index,
                        key="pm-nav",
                    )
                    st.markdown("</div>", unsafe_allow_html=True)
                if selection != current_page:
                    selected = selection
            else:
                st.markdown("<div class='pm-nav'></div>", unsafe_allow_html=True)
        with tools_col:
            st.markdown("<div class='pm-tools'>", unsafe_allow_html=True)
            search_query = st.text_input(
                "Search PyMasters",
                key="pm-search",
                placeholder="Search",
                label_visibility="collapsed",
            )
            if search_query:
                st.caption(f"Intelligent search coming soon: **{search_query}**")
            if user:
                st.markdown(
                    f"""
                    <div class="pm-user-card">
                        <div class="name">{user['name']}</div>
                        <div class="role">{user.get('role', 'learner').title()}</div>
                        <div class="time">{datetime.utcnow():%b %d, %Y · %H:%M UTC}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if on_logout:
                    st.button(
                        "Sign out",
                        key="header-logout",
                        on_click=on_logout,
                        use_container_width=True,
                    )
            else:
                st.markdown(
                    """
                    <div class="pm-user-card guest">
                        <strong>You're exploring as a guest.</strong><br/>
                        Sign in to sync progress across personalised tutor sessions.
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='pm-divider'></div>", unsafe_allow_html=True)
    return selected

