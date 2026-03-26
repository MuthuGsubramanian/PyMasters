import sqlite3
import json
import os
from datetime import datetime


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


from notifications.email_sender import send_email, build_lesson_ready_email
from notifications.whatsapp_sender import send_whatsapp, build_whatsapp_message


def process_pending_deliveries():
    """Process all pending notification deliveries (email/whatsapp)."""
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row

    pending = conn.execute(
        """SELECT d.id, d.notification_id, d.channel, n.type, n.title, n.message, n.link, n.user_id
           FROM notification_deliveries d
           JOIN notifications n ON d.notification_id = n.id
           WHERE d.status = 'pending'
           ORDER BY d.id ASC
           LIMIT 10""",
    ).fetchall()

    for delivery in pending:
        user = conn.execute(
            "SELECT email, whatsapp, preferred_language, name FROM users WHERE id = ?",
            [delivery["user_id"]],
        ).fetchone()

        if not user:
            conn.execute("UPDATE notification_deliveries SET status = 'failed', error_message = 'User not found' WHERE id = ?", [delivery["id"]])
            continue

        success = False
        error = None

        if delivery["channel"] == "email" and user["email"]:
            text, html = build_lesson_ready_email(
                title=delivery["title"],
                topic=delivery["title"],
                reason=delivery["message"],
                link=f"https://pymasters.net{delivery['link'] or '/dashboard/classroom'}",
            )
            success = send_email(user["email"], delivery["title"], text, html)
            if not success:
                error = "SMTP send failed"

        elif delivery["channel"] == "whatsapp" and user["whatsapp"]:
            name = user["name"] or "Student"
            lang = user["preferred_language"] or "en"
            msg = build_whatsapp_message(
                name=name,
                title=delivery["title"],
                reason=delivery["message"],
                link=delivery["link"] or "/dashboard/classroom",
                language=lang,
            )
            success = send_whatsapp(user["whatsapp"], msg)
            if not success:
                error = "Twilio send failed"

        status = "sent" if success else "failed"
        conn.execute(
            "UPDATE notification_deliveries SET status = ?, sent_at = ?, error_message = ? WHERE id = ?",
            [status, datetime.utcnow().isoformat() if success else None, error, delivery["id"]],
        )

    conn.commit()
    conn.close()
