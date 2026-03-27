"""
messages.py — FastAPI APIRouter for Vaathiyaar proactive messages.
Prefix: /api/messages
"""

import os
import sqlite3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/messages", tags=["messages"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


@router.get("/pending/{user_id}")
def get_pending_messages(user_id: str):
    """Get all undelivered, undismissed proactive messages for a user."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT id, message, message_type, action_data, created_at
        FROM pending_vaathiyaar_messages
        WHERE user_id = ? AND delivered = 0 AND dismissed = 0
        ORDER BY created_at DESC
        """,
        [user_id],
    ).fetchall()

    # Mark as delivered
    if rows:
        conn.execute(
            "UPDATE pending_vaathiyaar_messages SET delivered = 1 WHERE user_id = ? AND delivered = 0 AND dismissed = 0",
            [user_id],
        )
        conn.commit()

    conn.close()
    return {"messages": [dict(r) for r in rows]}


@router.post("/{message_id}/dismiss")
def dismiss_message(message_id: int):
    """Mark a proactive message as dismissed."""
    conn = sqlite3.connect(DB_PATH)
    result = conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"success": True}


class MessageAction(BaseModel):
    action: str  # start_now, add_to_path


@router.post("/{message_id}/action")
def message_action(message_id: int, body: MessageAction):
    """Record that user took an action on a proactive message."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    msg = conn.execute(
        "SELECT * FROM pending_vaathiyaar_messages WHERE id = ?", [message_id]
    ).fetchone()

    if not msg:
        conn.close()
        raise HTTPException(status_code=404, detail="Message not found")

    conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()

    return {"success": True, "action": body.action, "action_data": msg["action_data"]}
