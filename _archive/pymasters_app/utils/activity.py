"""Activity logging for PyMasters."""
from __future__ import annotations
from datetime import datetime
from typing import Any


def log_activity(db: Any, user_id: str, action: str, detail: str = "") -> None:
    """Log a user activity event."""
    db["activity"].insert_one({
        "user_id": user_id,
        "action": action,
        "detail": detail,
        "created_at": datetime.utcnow(),
    })


def get_recent_activity(db: Any, user_id: str, limit: int = 15) -> list[dict]:
    """Get recent activity for a user."""
    cursor = db["activity"].find(
        {"user_id": user_id},
        {"action": 1, "detail": 1, "created_at": 1}
    ).sort("created_at", -1).limit(limit)
    return list(cursor)
