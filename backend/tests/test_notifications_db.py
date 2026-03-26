import pytest
import sqlite3
import tempfile
import os
import sys

# Ensure the backend package root is on the path so we can import main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    os.environ["DB_PATH"] = path
    # Re-import to pick up the new DB_PATH env var
    import importlib
    import main as main_module
    importlib.reload(main_module)
    main_module.init_db()
    return path


def test_notifications_table_exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'")
    assert cursor.fetchone() is not None
    conn.close()


def test_notification_deliveries_table_exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_deliveries'")
    assert cursor.fetchone() is not None
    conn.close()


def test_notification_preferences_table_exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_preferences'")
    assert cursor.fetchone() is not None
    conn.close()


def test_insert_notification(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("""
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES (1, 'module_ready', 'New Lesson!', 'Your Decorators lesson is ready', '/dashboard/classroom')
    """)
    conn.commit()
    row = conn.execute("SELECT * FROM notifications WHERE user_id = 1").fetchone()
    assert row is not None
    conn.close()
