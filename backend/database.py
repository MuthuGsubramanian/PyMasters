"""
database.py — Shared SQLite connection helper and schema initialization for
verifiable learner credentials (`user_credentials`).
"""

import os
import sqlite3


def get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def ensure_credentials_table(db_path: str | None = None) -> None:
    """Create `user_credentials` table and indexes idempotently."""
    target = db_path or get_db_path()
    conn = sqlite3.connect(target, timeout=10.0)
    try:
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_credentials (
                cred_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                target_id TEXT NOT NULL,
                title TEXT NOT NULL,
                recipient_name TEXT NOT NULL,
                lessons_completed INTEGER NOT NULL,
                issued_at TEXT NOT NULL,
                UNIQUE(user_id, kind, target_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id)"
        )
        conn.commit()
    finally:
        conn.close()
