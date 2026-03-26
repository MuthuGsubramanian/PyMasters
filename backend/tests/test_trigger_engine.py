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
    conn.execute("INSERT INTO users (id, username, password_hash, name) VALUES (1, 'test', 'hash', 'Test')")
    conn.execute("INSERT INTO user_profiles (user_id, skill_level) VALUES (1, 'beginner')")
    conn.commit()
    conn.close()
    return path


def test_struggle_detection_triggers(db_path):
    from backend.modules.trigger_engine import check_triggers
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id) VALUES ('s1', 1, 'code_evaluation', 'closures', '{\"success\": false}', 'sess1')")
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id) VALUES ('s2', 1, 'code_evaluation', 'closures', '{\"success\": false}', 'sess1')")
    conn.commit()
    conn.close()

    result = check_triggers(user_id=1, signal_type="code_evaluation", topic="closures", value={"success": False})
    assert result["triggered"] is True
    assert "struggle" in result["reason"].lower()


def test_no_trigger_on_single_failure(db_path):
    from backend.modules.trigger_engine import check_triggers
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id) VALUES ('s1', 1, 'code_evaluation', 'closures', '{\"success\": false}', 'sess1')")
    conn.commit()
    conn.close()

    result = check_triggers(user_id=1, signal_type="code_evaluation", topic="closures", value={"success": False})
    assert result["triggered"] is False


def test_no_duplicate_generation(db_path):
    from backend.modules.trigger_engine import check_triggers
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id) VALUES ('s1', 1, 'code_evaluation', 'closures', '{\"success\": false}', 'sess1')")
    conn.execute("INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id) VALUES ('s2', 1, 'code_evaluation', 'closures', '{\"success\": false}', 'sess1')")
    conn.execute("INSERT INTO module_generation_jobs (id, user_id, topic, trigger, status, priority) VALUES ('j1', 1, 'closures', 'ai_recommended', 'completed', 2)")
    conn.commit()
    conn.close()

    result = check_triggers(user_id=1, signal_type="code_evaluation", topic="closures", value={"success": False})
    assert result["triggered"] is False
