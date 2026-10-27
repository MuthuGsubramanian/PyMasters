"""Arcade unlock ladder: drill-backed lesson counts unlock games, topic lessons unlock boards,
unlocks are recorded once and notified in-app only (summary on the first batch)."""
import importlib
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    c = sqlite3.connect(os.environ["DB_PATH"])
    for uid in ("u1", "u2", "u3", "u4", "u5"):
        c.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES (?, ?, 'h', 'U', CURRENT_TIMESTAMP)", [uid, uid])
    c.commit(); c.close()
    return os.environ["DB_PATH"]


def conn(db):
    c = sqlite3.connect(db)
    c.row_factory = sqlite3.Row
    return c


def complete(db, uid, lesson_ids):
    c = sqlite3.connect(db)
    for lid in lesson_ids:
        c.execute("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, 10)", [uid, lid])
    c.commit(); c.close()


def test_ladder_thresholds(db):
    from arcade.unlocks import evaluate
    complete(db, "u1", ["variables_intro"])
    assert set(evaluate(conn(db), "u1")) == {"game:snakes_ladders", "board:variables"}
    complete(db, "u1", ["lists", "ds_dicts"])
    keys = evaluate(conn(db), "u1")
    assert "game:linked_snake" in keys and "board:lists" in keys and "board:dicts" in keys
    assert "game:code_slingshot" not in keys
    complete(db, "u1", ["for_loops", "conditionals", "functions_basics"])
    assert "game:code_slingshot" in evaluate(conn(db), "u1")


def test_cloud_lessons_do_not_count(db):
    from arcade.unlocks import evaluate, drill_backed_count
    complete(db, "u2", ["aws_lambda_serverless", "az_synapse_fabric"])
    assert drill_backed_count(conn(db), "u2") == 0
    assert evaluate(conn(db), "u2") == []


def test_board_unlocks_on_any_of_its_lessons_and_only_with_enough_items(db):
    from arcade.unlocks import evaluate, pool_size, BOARDS
    complete(db, "u3", ["ds_sets"])            # one of the Containers board's five topics
    keys = evaluate(conn(db), "u3")
    assert "board:containers" in keys and "board:dicts" not in keys
    assert pool_size("containers") >= 24
    assert pool_size("nonexistent") == 0
    assert set(BOARDS) == {"variables", "lists", "dicts", "loops", "conditionals", "functions", "containers", "big_o"}
    assert "while_loops" in BOARDS["loops"]["lessons"] and "for_loops" in BOARDS["loops"]["lessons"]


def test_evaluate_is_idempotent_and_notifies_once(db):
    from arcade.unlocks import evaluate
    complete(db, "u4", ["lists"])
    first = evaluate(conn(db), "u4")
    second = evaluate(conn(db), "u4")
    assert first and second == []
    rows = conn(db).execute("SELECT title, message, type, link FROM notifications WHERE user_id = ?", ["u4"]).fetchall()
    assert len(rows) == 1 and rows[0]["title"] == "Arcade unlocked" and rows[0]["type"] == "game_unlocked"
    assert "1 game" in rows[0]["message"] and "1 board" in rows[0]["message"]
    assert rows[0]["link"] == "/dashboard/play#arcade"
    assert conn(db).execute("SELECT COUNT(*) FROM notification_deliveries").fetchone()[0] == 0
    assert conn(db).execute("SELECT COUNT(*) FROM arcade_unlocks WHERE user_id = ?", ["u4"]).fetchone()[0] == 2


def test_later_unlock_notifies_individually(db):
    from arcade.unlocks import evaluate
    complete(db, "u5", ["lists"])
    evaluate(conn(db), "u5")
    complete(db, "u5", ["ds_dicts"])
    evaluate(conn(db), "u5")
    titles = [r[0] for r in conn(db).execute("SELECT title FROM notifications WHERE user_id = ? ORDER BY id", ["u5"]).fetchall()]
    assert titles[-1] == "New board unlocked: Dicts"


def test_single_first_unlock_is_not_a_summary(db):
    """One game and no board (a drill-backed lesson whose board pool is thin) → a plain per-key message."""
    from arcade.unlocks import evaluate
    from arcade import unlocks
    unlocks_backup = dict(unlocks.BOARDS)
    try:
        unlocks.BOARDS.clear()
        complete(db, "u2", ["variables_intro"])
        keys = evaluate(conn(db), "u2")
        assert keys == ["game:snakes_ladders"]
        row = conn(db).execute("SELECT title FROM notifications WHERE user_id = ?", ["u2"]).fetchone()
        assert row["title"] == "New game unlocked: Snakes & Ladders"
    finally:
        unlocks.BOARDS.update(unlocks_backup)


def test_classroom_evaluate_returns_unlocked(db, monkeypatch):
    import main as main_mod
    from fastapi.testclient import TestClient
    import routes.classroom as classroom
    monkeypatch.setattr(classroom, "evaluate_code", lambda **kw: {"success": True, "output": "ok", "feedback": "nice"})
    client = TestClient(main_mod.app)
    headers = {"Authorization": f"Bearer {auth_module.create_access_token('u3')}"}
    body = {"user_id": "u3", "code": "print(1)", "expected_output": "1", "lesson_id": "variables_intro", "topic": "variables"}
    r = client.post("/api/classroom/evaluate", json=body, headers=headers)
    assert r.status_code == 200, r.text
    assert "game:snakes_ladders" in r.json()["unlocked"]
    # second completion of the same lesson: nothing new
    r2 = client.post("/api/classroom/evaluate", json=body, headers=headers)
    assert r2.json()["unlocked"] == []


def test_board_unlock_needs_a_playable_pool_for_this_learner(db):
    """functions_basics alone gives too few choice items for a session: no board notification yet."""
    from arcade.unlocks import evaluate
    complete(db, "u2", ["functions_basics"])
    keys = evaluate(conn(db), "u2")
    assert "game:snakes_ladders" in keys and "board:functions" not in keys
    complete(db, "u2", ["functions_args"])
    assert "board:functions" in evaluate(conn(db), "u2")


def test_concurrent_evaluate_notifies_once(db):
    import threading
    from arcade.unlocks import evaluate
    complete(db, "u5", ["lists", "ds_dicts", "variables_intro"])
    def go():
        c = conn(db)
        try:
            evaluate(c, "u5")
        finally:
            c.close()
    ts = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in ts]; [t.join() for t in ts]
    n = conn(db).execute("SELECT COUNT(*) FROM notifications WHERE user_id = 'u5'").fetchone()[0]
    assert n == 1, n
