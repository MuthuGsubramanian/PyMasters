"""Caching helpers to centralize Streamlit cache usage."""
from __future__ import annotations

import streamlit as st


@st.cache_data(show_spinner=False)
def cached_json_loader(path: str) -> dict:
    """Cache JSON file loading for faster page loads."""

    import json

    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)
