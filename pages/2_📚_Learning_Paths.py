"""Learning paths page."""
from __future__ import annotations

import streamlit as st

from layouts.learning_module import render_learning_paths
from services import AuthService, ModuleService
from utils.auth import ensure_authenticated
from utils.state import init_session_state


def run() -> None:
    init_session_state()
    auth_service = AuthService()
    ensure_authenticated(auth_service)

    module_service = ModuleService()
    render_learning_paths(
        modules=[module.dict() for module in module_service.list_modules()],
        lessons=[lesson.dict() for lesson in module_service.list_lessons()],
        exercises=[exercise.dict() for exercise in module_service.list_exercises()],
    )


if __name__ == "__main__":  # pragma: no cover
    run()
