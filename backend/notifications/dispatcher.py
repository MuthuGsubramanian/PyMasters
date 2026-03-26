import sqlite3
import json
import os


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


def create_notification(
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
    link: str = None,
    metadata: dict = None,
) -> int:
    """Create an in-app notification and queue external deliveries."""
    conn = sqlite3.connect(_get_db_path())
    cursor = conn.execute(
        """INSERT INTO notifications (user_id, type, title, message, link, metadata)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [user_id, notif_type, title, message, link, json.dumps(metadata) if metadata else None],
    )
    notif_id = cursor.lastrowid

    # Check user's contact info and preferences for external channels
    user = conn.execute(
        "SELECT email, whatsapp FROM users WHERE id = ?", [user_id]
    ).fetchone()

    if user:
        email, whatsapp = user
        # Queue email delivery if user has email
        if email:
            pref = conn.execute(
                "SELECT enabled FROM notification_preferences WHERE user_id = ? AND channel = 'email' AND (type = ? OR type = 'all')",
                [user_id, notif_type],
            ).fetchone()
            # Default to enabled if no preference set
            if pref is None or pref[0]:
                conn.execute(
                    "INSERT INTO notification_deliveries (notification_id, channel, status) VALUES (?, 'email', 'pending')",
                    [notif_id],
                )

        # Queue WhatsApp delivery if user has whatsapp
        if whatsapp:
            pref = conn.execute(
                "SELECT enabled FROM notification_preferences WHERE user_id = ? AND channel = 'whatsapp' AND (type = ? OR type = 'all')",
                [user_id, notif_type],
            ).fetchone()
            if pref is None or pref[0]:
                conn.execute(
                    "INSERT INTO notification_deliveries (notification_id, channel, status) VALUES (?, 'whatsapp', 'pending')",
                    [notif_id],
                )

    conn.commit()
    conn.close()
    return notif_id
