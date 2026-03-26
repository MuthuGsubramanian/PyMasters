import pytest
import sqlite3
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    os.environ["DB_PATH"] = path
    import importlib
    import backend.main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO users (id, username, password_hash, name, email, whatsapp) VALUES (1, 'test', 'hash', 'Test', 'test@example.com', '+1234567890')")
    conn.commit()
    conn.close()
    return path


def test_create_notification(db_path):
    from backend.notifications.dispatcher import create_notification
    notif_id = create_notification(
        user_id=1,
        notif_type="module_ready",
        title="Lesson Ready!",
        message="Your Decorators lesson is ready",
        link="/dashboard/classroom",
    )
    assert notif_id is not None
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT * FROM notifications WHERE id = ?", [notif_id]).fetchone()
    assert row is not None
    conn.close()


def test_create_notification_queues_deliveries(db_path):
    from backend.notifications.dispatcher import create_notification
    notif_id = create_notification(
        user_id=1,
        notif_type="module_ready",
        title="Lesson Ready!",
        message="Your Decorators lesson is ready",
        link="/dashboard/classroom",
    )
    conn = sqlite3.connect(db_path)
    deliveries = conn.execute(
        "SELECT * FROM notification_deliveries WHERE notification_id = ?", [notif_id]
    ).fetchall()
    # Should queue email and whatsapp deliveries (user has both)
    assert len(deliveries) == 2
    conn.close()
