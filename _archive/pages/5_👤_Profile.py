"""Profile management page."""
from __future__ import annotations

import streamlit as st

from layouts.profile import render_profile
from services import AuthService
from utils.auth import ensure_authenticated
from utils.state import init_session_state


def run() -> None:
    init_session_state()
    auth_service = AuthService()
    user = ensure_authenticated(auth_service)
    render_profile(user=user)


if __name__ == "__main__":  # pragma: no cover
    run()
