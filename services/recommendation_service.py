"""Recommendation service integration."""
from __future__ import annotations

from typing import Iterable, List

from api.recommendation_api import fetch_recommendations


class RecommendationService:
    """Thin wrapper around the recommendation API client."""

    def get_recommendations(self, *, user_id: int, completed_module_ids: Iterable[int]) -> List[dict]:
        return fetch_recommendations(user_id=user_id, completed_module_ids=completed_module_ids)
