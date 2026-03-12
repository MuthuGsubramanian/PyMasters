"""Minimal tab navigation component for PyMasters."""
from __future__ import annotations

from typing import Iterable, Optional

import streamlit as st


def render_tab_nav(*, pages: Iterable[str], current_page: str) -> Optional[str]:
    """Render a minimal horizontal tab navigation bar.

    Parameters
    ----------
    pages:
        Ordered sequence of page names to display as tabs.
    current_page:
        The name of the currently active page.

    Returns
    -------
    str | None
        The selected page name if the selection changed, otherwise ``None``.
    """
    page_list = list(pages)
    current_index = page_list.index(current_page) if current_page in page_list else 0

    st.markdown("<div class='ob-tab-nav'>", unsafe_allow_html=True)
    selection = st.radio(
        "Navigation",
        page_list,
        horizontal=True,
        label_visibility="collapsed",
        index=current_index,
        key="ob-tab-nav",
    )
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='ob-divider'></div>", unsafe_allow_html=True)

    return selection if selection != current_page else None
