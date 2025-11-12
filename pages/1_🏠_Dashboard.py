"""Primary dashboard page for authenticated users."""
from __future__ import annotations

import streamlit as st

from layouts.dashboard import render_dashboard
from services import AuthService, ModuleService, ProgressService, RecommendationService
from utils.auth import ensure_authenticated
from utils.state import init_session_state


def run() -> None:
    init_session_state()
    auth_service = AuthService()
    user = ensure_authenticated(auth_service)

    module_service = ModuleService()
    progress_service = ProgressService()
    recommendation_service = RecommendationService()

    progress_records = [record.dict() for record in progress_service.list_progress(user["id"])]
    modules = [module.dict() for module in module_service.list_modules()]
    completed_module_ids = [record["module_id"] for record in progress_records if record["completion_pct"] >= 50]
    recommendations = recommendation_service.get_recommendations(
        user_id=user["id"],
        completed_module_ids=completed_module_ids,
    )

    render_dashboard(
        user=user,
        progress=progress_records,
        modules=modules,
        recommendations=recommendations,
    )


if __name__ == "__main__":  # pragma: no cover
    run()
