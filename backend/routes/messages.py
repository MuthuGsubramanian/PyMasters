"""
messages.py — FastAPI APIRouter for Vaathiyaar proactive messages.
Prefix: /api/messages
"""

import os
import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id

router = APIRouter(prefix="/api/messages", tags=["messages"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _require_self(user_id, caller) -> None:
    """IDOR guard (2026-07-02, same pattern as routes/graph.py + routes/paths.py):
    proactive Vaathiyaar messages are per-user private content, and BOTH reads and
    writes here mutate state (GET /pending marks messages delivered; dismiss/action
    hide them). Derive the acting user from the verified JWT and refuse cross-user
    access. str() on both sides because users.id is INTEGER for legacy accounts
    while the JWT sub is always a string."""
    if str(caller) != str(user_id):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/pending/{user_id}")
def get_pending_messages(user_id: str, caller: str = Depends(get_current_user_id)):
    """Get all undelivered, undismissed proactive messages for a user."""
    _require_self(user_id, caller)
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
def dismiss_message(message_id: int, caller: str = Depends(get_current_user_id)):
    """Mark a proactive message as dismissed."""
    conn = sqlite3.connect(DB_PATH)
    owner = conn.execute(
        "SELECT user_id FROM pending_vaathiyaar_messages WHERE id = ?", [message_id]
    ).fetchone()
    if not owner:
        conn.close()
        raise HTTPException(status_code=404, detail="Message not found")
    if str(owner[0]) != str(caller):
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden")
    conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()
    return {"success": True}


class MessageAction(BaseModel):
    action: str  # start_now, add_to_path


@router.post("/{message_id}/action")
def message_action(message_id: int, body: MessageAction, caller: str = Depends(get_current_user_id)):
    """Record that user took an action on a proactive message."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    msg = conn.execute(
        "SELECT * FROM pending_vaathiyaar_messages WHERE id = ?", [message_id]
    ).fetchone()

    if not msg:
        conn.close()
        raise HTTPException(status_code=404, detail="Message not found")
    if str(msg["user_id"]) != str(caller):
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden")

    conn.execute(
        "UPDATE pending_vaathiyaar_messages SET dismissed = 1 WHERE id = ?", [message_id]
    )
    conn.commit()
    conn.close()

    return {"success": True, "action": body.action, "action_data": msg["action_data"]}
