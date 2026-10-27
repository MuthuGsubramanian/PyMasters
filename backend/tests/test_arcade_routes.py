"""Arcade API: catalog reflects unlocks and pools; sessions deal only learned topics, grade
server-side, respect the shared XP cap, and finish idempotently."""
import importlib
import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402


def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("ARCADE_ENABLED", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    conn = sqlite3.connect(os.environ["DB_PATH"])
    for uid in ("a1", "a2", "a3"):
        conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES (?, ?, 'h', 'A', CURRENT_TIMESTAMP)", [uid, uid])
    for lid in ("lists", "ds_dicts", "variables_intro"):
        conn.execute("INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES ('a1', ?, 10)", [lid])
    conn.execute("INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES ('a2', 'while_loops', 10)")
    conn.commit(); conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _db():
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.row_factory = sqlite3.Row
    return conn


def _bank_index():
    base = os.path.join(os.path.dirname(__file__), "..", "games", "banks")
    out = {}
    for name in os.listdir(base):
        if name.endswith(".json") and not name.startswith("_"):
            for it in json.load(open(os.path.join(base, name), encoding="utf-8")):
                out[it["id"]] = it
    return out


def _start(client, uid, game_id, **body):
    return client.post("/api/arcade/session/start", json={"game_id": game_id, **body}, headers=_headers(uid))


def test_catalog_reflects_unlocks_and_boards(client):
    r = client.get("/api/arcade/catalog", headers=_headers("a1"))
    assert r.status_code == 200, r.text
    body = r.json()
    games = {g["id"]: g for g in body["games"]}
    assert set(games) == {"snakes_ladders", "linked_snake", "code_slingshot"}
    assert games["snakes_ladders"]["unlocked"] and games["linked_snake"]["unlocked"] and not games["code_slingshot"]["unlocked"]
    assert "3 more" in games["code_slingshot"]["milestone"]
    boards = {b["key"]: b for b in games["snakes_ladders"]["boards"]}
    assert boards["lists"]["unlocked"] and boards["dicts"]["unlocked"] and boards["variables"]["unlocked"] and not boards["big_o"]["unlocked"]
    assert body["stage"]["completed"] == 3 and body["stage"]["next"] == {"game": "code_slingshot", "needed": 3}
    assert set(body["newly_unlocked"]) >= {"game:snakes_ladders", "game:linked_snake"}
    # second load: nothing newly unlocked, and one summary notification was written
    again = client.get("/api/arcade/catalog", headers=_headers("a1")).json()
    assert again["newly_unlocked"] == []
    assert _db().execute("SELECT COUNT(*) FROM notifications WHERE user_id = 'a1'").fetchone()[0] == 1


def test_session_start_rejects_locked_game(client):
    r = _start(client, "a1", "code_slingshot")
    assert r.status_code == 403


def test_session_start_rejects_thin_pool_with_next_lesson(client):
    cat = client.get("/api/arcade/catalog", headers=_headers("a2")).json()
    g = next(x for x in cat["games"] if x["id"] == "snakes_ladders")
    assert g["unlocked"] and g["needs_content"] and g["next_lesson"]
    assert _start(client, "a2", "snakes_ladders").status_code == 400          # a board is required
    assert _start(client, "a2", "snakes_ladders", board="loops").status_code == 403   # board stays locked: 3 while_loops items
    conn = _db()
    for lid in ("fileio_reading", "recursion_fundamentals"):                  # 3 drill-backed lessons, ~9 items in all
        conn.execute("INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES ('a2', ?, 10)", [lid])
    conn.commit(); conn.close()
    r = _start(client, "a2", "linked_snake")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "needs_content" and r.json()["detail"]["next_lesson"]


def test_items_only_from_completed_topics_and_private_fields_hidden(client):
    r = _start(client, "a1", "linked_snake")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] and len(body["items"]) == 20
    bank = _bank_index()
    for it in body["items"]:
        assert it["topic"] in {"lists", "ds_dicts", "variables"}
        assert "answer" not in it and "why" not in it and "lesson_id" not in it
        assert bank[it["id"]]["kind"] in {"choice", "line_then_choice", "bin"}


def test_board_session_uses_board_topics(client):
    r = _start(client, "a1", "snakes_ladders", board="dicts")
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 12 and all(i["topic"] == "ds_dicts" for i in r.json()["items"])
    assert _start(client, "a1", "snakes_ladders", board="big_o").status_code == 403


def test_answer_grades_and_partial_credit_is_wrong_for_the_game(client):
    body = _start(client, "a1", "snakes_ladders", board="lists").json()
    bank = _bank_index()
    sid = body["session_id"]
    first = body["items"][0]
    key = bank[first["id"]]
    right = key["answer"]
    r = client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": first["id"], "response": right, "ms": 2500}, headers=_headers("a1")).json()
    assert r["correct"] is True and r["why"] and r["lesson_id"] and r["answer"] == right
    # idempotent: answering again returns the stored reveal unchanged
    r2 = client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": first["id"], "response": "nonsense", "ms": 1}, headers=_headers("a1")).json()
    assert r2 == r
    ltc = next((i for i in body["items"] if bank[i["id"]]["kind"] == "line_then_choice"), None)
    if ltc:
        line, fix = bank[ltc["id"]]["answer"]
        r3 = client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": ltc["id"], "response": [line, (fix + 1) % 3], "ms": 2000}, headers=_headers("a1")).json()
        assert r3["correct"] is False and r3["score"] == 1 and r3["max"] == 3


def test_questions_batch_never_repeats(client):
    body = _start(client, "a1", "linked_snake").json()
    more = client.post("/api/arcade/session/questions", json={"session_id": body["session_id"]}, headers=_headers("a1")).json()
    ids = [i["id"] for i in body["items"]] + [i["id"] for i in more["items"]]
    assert len(more["items"]) > 0 and len(ids) == len(set(ids))


def test_finish_awards_xp_once_and_is_idempotent(client):
    body = _start(client, "a1", "snakes_ladders", board="lists").json()
    bank = _bank_index()
    sid = body["session_id"]
    for it in body["items"][:6]:
        client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": it["id"], "response": bank[it["id"]]["answer"], "ms": 2500}, headers=_headers("a1"))
    r = client.post("/api/arcade/session/finish", json={"session_id": sid, "score": 1234}, headers=_headers("a1")).json()
    assert r["answered"] == 6 and r["correct"] == 6 and r["xp"] > 0 and r["xp_capped"] is False and r["best"] is True
    again = client.post("/api/arcade/session/finish", json={"session_id": sid, "score": 99}, headers=_headers("a1")).json()
    assert again == r
    row = _db().execute("SELECT score, xp, finished_at FROM arcade_sessions WHERE id = ?", [sid]).fetchone()
    assert row["score"] == 1234 and row["xp"] == r["xp"] and row["finished_at"]
    assert _db().execute("SELECT COUNT(*) FROM xp_awards WHERE user_id = 'a1' AND source = 'game'").fetchone()[0] == 1
    sig = _db().execute("SELECT signal_type FROM learning_signals WHERE user_id = 'a1' AND signal_type = 'arcade_session'").fetchone()
    assert sig is not None
    # a worse later session is not a new best
    body2 = _start(client, "a1", "snakes_ladders", board="lists").json()
    r2 = client.post("/api/arcade/session/finish", json={"session_id": body2["session_id"], "score": 10}, headers=_headers("a1")).json()
    assert r2["best"] is False and r2["xp"] == 0          # nothing answered → no XP


def test_finish_respects_shared_cap(client):
    conn = _db()
    conn.execute("INSERT INTO xp_awards (user_id, source, ref, amount) VALUES ('a1', 'game', 'earlier', 150)")
    conn.commit(); conn.close()
    body = _start(client, "a1", "snakes_ladders", board="lists").json()
    bank = _bank_index()
    it = body["items"][0]
    client.post("/api/arcade/session/answer", json={"session_id": body["session_id"], "item_id": it["id"], "response": bank[it["id"]]["answer"], "ms": 2500}, headers=_headers("a1"))
    r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 5}, headers=_headers("a1")).json()
    assert r["xp"] == 0 and r["xp_capped"] is True
    assert _db().execute("SELECT finished_at FROM arcade_sessions WHERE id = ?", [body["session_id"]]).fetchone()[0]


def test_other_users_session_is_forbidden(client):
    body = _start(client, "a1", "linked_snake").json()
    r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 1}, headers=_headers("a3"))
    assert r.status_code == 403


def test_arcade_disabled_flag(client, monkeypatch):
    monkeypatch.setenv("ARCADE_ENABLED", "0")
    assert client.get("/api/arcade/catalog", headers=_headers("a1")).status_code == 503


# ── review fix pass (2026-10-28) ──────────────────────────────────────────────

def test_canvas_games_only_deal_choice_items(client):
    bank = _bank_index()
    for gid in ("linked_snake", "code_slingshot"):
        # code_slingshot stays locked for a1 (3 lessons); unlock it by completing more lessons
        conn = _db()
        for lid in ("for_loops", "conditionals", "functions_basics", "while_loops", "ds_sets", "ds_tuples", "big_o_complexity"):
            conn.execute("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES ('a1', ?, 10)", [lid])
        conn.commit(); conn.close()
        r = _start(client, "a1", gid)
        assert r.status_code == 200, r.text
        kinds = {bank[i["id"]]["kind"] for i in r.json()["items"]}
        assert kinds == {"choice"}, (gid, kinds)


def test_xp_scales_with_questions_answered_and_needs_timing(client):
    body = _start(client, "a1", "snakes_ladders", board="lists").json()
    bank = _bank_index()
    sid = body["session_id"]
    it = body["items"][0]
    client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": it["id"], "response": bank[it["id"]]["answer"], "ms": 2500}, headers=_headers("a1"))
    r = client.post("/api/arcade/session/finish", json={"session_id": sid, "score": 1}, headers=_headers("a1")).json()
    assert 0 < r["xp"] <= 4, r          # one of twelve answered: a sliver, not the full 25
    # answers without timing never earn XP
    body2 = _start(client, "a1", "snakes_ladders", board="lists").json()
    for it2 in body2["items"][:6]:
        client.post("/api/arcade/session/answer", json={"session_id": body2["session_id"], "item_id": it2["id"], "response": bank[it2["id"]]["answer"]}, headers=_headers("a1"))
    r2 = client.post("/api/arcade/session/finish", json={"session_id": body2["session_id"], "score": 1}, headers=_headers("a1")).json()
    assert r2["xp"] == 0 and r2["answered"] == 6


def test_finish_rejects_absurd_scores_and_releases_claim_on_error(client, monkeypatch):
    body = _start(client, "a1", "linked_snake").json()
    r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 10**20}, headers=_headers("a1"))
    assert r.status_code == 422
    import routes.arcade as arcade
    original = arcade.award_xp
    arcade.award_xp = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
    bank = _bank_index()
    it = body["items"][0]
    client.post("/api/arcade/session/answer", json={"session_id": body["session_id"], "item_id": it["id"], "response": bank[it["id"]]["answer"], "ms": 2000}, headers=_headers("a1"))
    try:
        r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 5}, headers=_headers("a1"))
        assert r.status_code == 500
    except RuntimeError:
        pass                                   # TestClient re-raises server exceptions
    finally:
        arcade.award_xp = original
    r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 5}, headers=_headers("a1"))
    assert r.status_code == 200 and r.json()["answered"] == 1      # the claim was released, the retry succeeds


def test_concurrent_answers_both_persist(client):
    import threading
    body = _start(client, "a1", "linked_snake").json()
    sid = body["session_id"]
    items = body["items"][:4]
    def go(it):
        client.post("/api/arcade/session/answer", json={"session_id": sid, "item_id": it["id"], "response": 0, "ms": 2000}, headers=_headers("a1"))
    threads = [threading.Thread(target=go, args=(it,)) for it in items]
    [t.start() for t in threads]; [t.join() for t in threads]
    r = client.post("/api/arcade/session/finish", json={"session_id": sid, "score": 1}, headers=_headers("a1")).json()
    assert r["answered"] == 4


def test_xp_capped_flag_on_partial_cap(client):
    conn = _db()
    conn.execute("INSERT INTO xp_awards (user_id, source, ref, amount) VALUES ('a1', 'game', 'earlier', 145)")
    conn.commit(); conn.close()
    body = _start(client, "a1", "snakes_ladders", board="lists").json()
    bank = _bank_index()
    for it in body["items"]:
        client.post("/api/arcade/session/answer", json={"session_id": body["session_id"], "item_id": it["id"], "response": bank[it["id"]]["answer"], "ms": 2500}, headers=_headers("a1"))
    r = client.post("/api/arcade/session/finish", json={"session_id": body["session_id"], "score": 5}, headers=_headers("a1")).json()
    assert r["xp"] == 5 and r["xp_capped"] is True
