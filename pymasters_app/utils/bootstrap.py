"""Bootstrap utilities for MongoDB (or local fallback) collections and indexes."""
from __future__ import annotations

from typing import Any


def ensure_collections(db: Any) -> None:
    """Create required collections and indexes if missing."""
    # Users
    if "users" not in db.list_collection_names():
        db.create_collection("users")
    db["users"].create_index("email", unique=True, sparse=True)
    db["users"].create_index("username_normalized", unique=True)
    db["users"].create_index("phone_normalized", unique=True, sparse=True)

    # Tutor sessions
    if "tutor_sessions" not in db.list_collection_names():
        db.create_collection("tutor_sessions")
    db["tutor_sessions"].create_index([("user_id", 1), ("created_at", -1)])

    # Generations
    if "generations" not in db.list_collection_names():
        db.create_collection("generations")
    db["generations"].create_index([("user_id", 1), ("created_at", -1)])

    # Modules/progress may already exist via seed; add helpful indexes
    if "progress" in db.list_collection_names():
        db["progress"].create_index([("user_id", 1), ("module_id", 1)])

