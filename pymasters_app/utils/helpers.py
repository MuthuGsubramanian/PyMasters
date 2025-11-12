"""Helper utilities for page rendering and data access."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import streamlit as st

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "seed" / "modules.json"


def seed_learning_modules(collection: Any) -> None:
    """Ensure the learning modules collection contains baseline content."""
    if collection.estimated_document_count() > 0:
        return

    if not DATA_PATH.exists():
        return

    payload: Iterable[dict[str, Any]] = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    now = datetime.utcnow()
    for module in payload:
        module.setdefault("created_at", now)
        module.setdefault("updated_at", now)
    if payload:
        collection.insert_many(payload)


@st.cache_data(ttl=300, show_spinner=False)
def get_learning_modules(collection: Any) -> list[dict[str, Any]]:
    """Return all learning modules ordered by difficulty and title."""
    cursor = collection.find().sort([("difficulty", 1), ("title", 1)])
    modules = [serialize_module(document) for document in cursor]
    return modules


def serialize_module(document: dict[str, Any]) -> dict[str, Any]:
    """Convert Mongo document into a serializable dictionary."""
    return {
        "id": str(document.get("_id")),
        "title": document.get("title", ""),
        "description": document.get("description", ""),
        "difficulty": document.get("difficulty", "beginner"),
        "estimated_minutes": document.get("estimated_minutes", 15),
        "tags": document.get("tags", []),
        "updated_at": document.get("updated_at"),
    }


def get_progress_by_user(collection: Any, user_id: str) -> dict[str, dict[str, Any]]:
    """Return a mapping of module_id to progress details for a user."""
    cursor = collection.find({"user_id": user_id})
    progress_map = {}
    for document in cursor:
        module_id = document.get("module_id")
        if module_id:
            progress_map[module_id] = {
                "status": document.get("status", "not_started"),
                "updated_at": document.get("updated_at"),
            }
    return progress_map


def upsert_progress(collection: Any, *, user_id: str, module_id: str, status: str) -> None:
    """Update or create a progress entry."""
    collection.update_one(
        {"user_id": user_id, "module_id": module_id},
        {
            "$set": {
                "status": status,
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {
                "created_at": datetime.utcnow(),
            },
        },
        upsert=True,
    )


def summarize_progress(modules: Iterable[dict[str, Any]], progress: dict[str, dict[str, Any]]) -> dict[str, int]:
    """Compute summary statistics for dashboard metrics."""
    total_modules = len(list(modules))
    completed = sum(1 for record in progress.values() if record.get("status") == "completed")
    in_progress = sum(1 for record in progress.values() if record.get("status") == "in_progress")
    return {
        "total_modules": total_modules,
        "completed": completed,
        "in_progress": in_progress,
    }
