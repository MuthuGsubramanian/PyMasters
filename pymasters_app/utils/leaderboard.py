"""Leaderboard helpers — aggregate completed modules per user."""
from __future__ import annotations

from typing import Any


def get_leaderboard(db: Any, limit: int = 10) -> list[dict]:
    """Return top users ranked by completed module count.

    Uses the progress collection to count completed modules per user,
    then joins with users collection for display names.
    """
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": "$user_id", "completed_count": {"$sum": 1}}},
        {"$sort": {"completed_count": -1}},
        {"$limit": limit},
    ]
    results = list(db["progress"].aggregate(pipeline))

    # Enrich with usernames
    leaderboard = []
    for entry in results:
        user_id = entry["_id"]
        user_doc = db["users"].find_one({"_id": user_id}) or db["users"].find_one({"username": user_id})
        username = "Unknown"
        if user_doc:
            username = user_doc.get("name") or user_doc.get("username") or "Unknown"
        leaderboard.append({
            "user_id": user_id,
            "username": username,
            "completed_count": entry["completed_count"],
        })

    return leaderboard
