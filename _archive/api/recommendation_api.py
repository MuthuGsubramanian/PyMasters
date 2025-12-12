"""Recommendation service client for PyMasters."""
from __future__ import annotations

from typing import Iterable


def fetch_recommendations(*, user_id: int, completed_module_ids: Iterable[int]) -> list[dict]:
    """Return stub recommendations derived from recent activity."""

    pool = [
        {
            "module_id": 2,
            "title": "Data Science Toolkit",
            "reason": "You enjoyed working with data-heavy lessons.",
        },
        {
            "module_id": 3,
            "title": "Automation with FastAPI",
            "reason": "Build on your automation streak with modern APIs.",
        },
    ]

    recommendations = []
    for candidate in pool:
        if candidate["module_id"] not in set(completed_module_ids):
            recommendations.append({**candidate, "summary": "Next best step crafted for you."})
    return recommendations
