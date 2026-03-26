from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import sqlite3
import os
import json

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


class PreferenceUpdate(BaseModel):
    user_id: int
    channel: str
    type: str
    enabled: bool
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None


@router.get("")
async def get_notifications(
    user_id: int = Query(...),
    unread_only: bool = Query(False),
    limit: int = Query(20),
    offset: int = Query(0),
):
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row

    where = "WHERE user_id = ?"
    params = [user_id]
    if unread_only:
        where += " AND read = 0"

    rows = conn.execute(
        f"SELECT * FROM notifications {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    unread_count = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0",
        [user_id],
    ).fetchone()[0]

    conn.close()

    notifications = []
    for r in rows:
        notifications.append({
            "id": r["id"],
            "type": r["type"],
            "title": r["title"],
            "message": r["message"],
            "link": r["link"],
            "metadata": json.loads(r["metadata"]) if r["metadata"] else None,
            "read": bool(r["read"]),
            "created_at": r["created_at"],
        })

    return {"notifications": notifications, "unread_count": unread_count}


@router.put("/{notification_id}/read")
async def mark_read(notification_id: int, user_id: int = Query(...)):
    conn = sqlite3.connect(_get_db_path())
    cursor = conn.execute(
        "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?",
        [notification_id, user_id],
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Notification not found")
    conn.close()
    return {"success": True}


@router.patch("/read-all")
async def mark_all_read(user_id: int = Query(...)):
    conn = sqlite3.connect(_get_db_path())
    conn.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
        [user_id],
    )
    conn.commit()
    conn.close()
    return {"success": True}


@router.get("/preferences")
async def get_preferences(user_id: int = Query(...)):
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM notification_preferences WHERE user_id = ?",
        [user_id],
    ).fetchall()
    conn.close()
    prefs = [dict(r) for r in rows]
    return {"preferences": prefs}


@router.put("/preferences")
async def update_preferences(data: PreferenceUpdate):
    conn = sqlite3.connect(_get_db_path())
    conn.execute(
        """INSERT INTO notification_preferences (user_id, channel, type, enabled, quiet_hours_start, quiet_hours_end)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, channel, type) DO UPDATE SET
             enabled = excluded.enabled,
             quiet_hours_start = excluded.quiet_hours_start,
             quiet_hours_end = excluded.quiet_hours_end""",
        [data.user_id, data.channel, data.type, int(data.enabled), data.quiet_hours_start, data.quiet_hours_end],
    )
    conn.commit()
    conn.close()
    return {"success": True}
