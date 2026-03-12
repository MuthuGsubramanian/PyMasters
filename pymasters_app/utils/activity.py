"""Activity feed helpers for logging and retrieving user actions."""
from __future__ import annotations

from datetime import datetime
from typing import Any


def log_activity(db: Any, user_id: str, action: str, detail: str = "") -> None:
    """Insert an activity event into the activity collection."""
    db["activity"].insert_one({
        "user_id": user_id,
        "action": action,
        "detail": detail,
        "created_at": datetime.utcnow(),
    })


def get_recent_activity(db: Any, user_id: str, limit: int = 20) -> list[dict]:
    """Return recent activity events for a user, newest first."""
    return list(
        db["activity"]
        .find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
