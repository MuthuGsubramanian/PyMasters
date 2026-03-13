"""Activity feed and leaderboard API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Request

from pymasters_app.utils.activity import get_recent_activity
from pymasters_app.utils.leaderboard import get_leaderboard

router = APIRouter(prefix="/api", tags=["social"])


@router.get("/activity")
async def activity(request: Request):
    db = request.app.state.db
    user = request.state.user
    items = get_recent_activity(db, user["id"])
    result = []
    for act in items:
        ts = act.get("created_at")
        result.append({
            "action": act.get("action", ""),
            "detail": act.get("detail", ""),
            "created_at": ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None,
        })
    return {"activity": result}


@router.get("/leaderboard")
async def leaderboard(request: Request):
    db = request.app.state.db
    leaders = get_leaderboard(db)
    return {"leaderboard": leaders}
