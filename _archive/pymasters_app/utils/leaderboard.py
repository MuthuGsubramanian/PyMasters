"""Leaderboard utilities for PyMasters."""
from __future__ import annotations

from typing import Any


def get_leaderboard(db: Any, limit: int = 10) -> list[dict[str, Any]]:
    """Build leaderboard from progress data.

    Aggregates completed modules per user, joins with user names,
    and returns sorted by completed count descending.
    """
    # Get all completed progress entries
    progress_docs = list(db["progress"].find({"status": "completed"}))

    # Count completions per user_id
    user_counts: dict[str, int] = {}
    for doc in progress_docs:
        uid = doc.get("user_id", "")
        if uid:
            user_counts[uid] = user_counts.get(uid, 0) + 1

    if not user_counts:
        return []

    # Get usernames
    from bson import ObjectId
    user_ids = list(user_counts.keys())
    object_ids = []
    for uid in user_ids:
        try:
            object_ids.append(ObjectId(uid))
        except Exception:
            pass

    users = {}
    if object_ids:
        for user_doc in db["users"].find({"_id": {"$in": object_ids}}, {"username": 1, "name": 1}):
            users[str(user_doc["_id"])] = user_doc.get("name") or user_doc.get("username", "Unknown")

    # Build leaderboard
    entries = []
    for uid, count in user_counts.items():
        entries.append({
            "user_id": uid,
            "username": users.get(uid, "Unknown"),
            "completed_count": count,
        })

    entries.sort(key=lambda x: x["completed_count"], reverse=True)
    return entries[:limit]
