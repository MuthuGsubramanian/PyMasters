"""Helpers for Streamlit session state management."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

import streamlit as st


@dataclass
class AppState:
    user: Dict[str, Any] | None
    authenticated: bool


def init_session_state() -> AppState:
    """Ensure required keys exist in Streamlit session state."""

    if "user" not in st.session_state:
        st.session_state.user = None
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    return AppState(user=st.session_state.user, authenticated=st.session_state.authenticated)


def set_user(user: dict | None) -> None:
    st.session_state.user = user
    st.session_state.authenticated = bool(user)


def get_user() -> dict | None:
    return st.session_state.get("user")
