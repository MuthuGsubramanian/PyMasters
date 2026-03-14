"""Analytics page."""
from __future__ import annotations

import streamlit as st

from layouts.analytics import render_analytics
from services import AuthService, ProgressService
from utils.auth import ensure_authenticated
from utils.state import init_session_state


def run() -> None:
    init_session_state()
    auth_service = AuthService()
    user = ensure_authenticated(auth_service)

    progress_service = ProgressService()
    progress_records = [record.dict() for record in progress_service.list_progress(user["id"])]
    render_analytics(progress=progress_records)


if __name__ == "__main__":  # pragma: no cover
    run()
