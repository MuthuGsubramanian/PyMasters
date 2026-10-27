"""Play API: rounds are scored server-side, finish is idempotent, catalog recommends.

Uses the `_fixture` bank registered as a throwaway game so the tests never depend on
real content.
"""
import importlib
import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import auth as auth_module  # noqa: E402

FIXTURE_GAME = {
    "id": "_fixture", "title": "Fixture", "blurb": "test only", "kind": "bank", "levels": 6,
    "bank": "_fixture_bank", "items_per_round": 3, "topics": ["variables", "lists", "for_loops", "fx_only_topic"],
}


def _headers(uid):
    return {"Authorization": f"Bearer {auth_module.create_access_token(uid)}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("JWT_SECRET", "test-secret-long-enough-for-validation-12345")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("PLAY_ENABLED", raising=False)
    import main as main_mod
    importlib.reload(main_mod)
    main_mod.init_db()
    from games import catalog
    monkeypatch.setitem(catalog.GAMES, "_fixture", FIXTURE_GAME)
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('p1','p1','h','P', CURRENT_TIMESTAMP)")
    conn.execute("INSERT INTO users (id, username, password_hash, name, created_at) VALUES ('p2','p2','h','Q', CURRENT_TIMESTAMP)")
    conn.commit(); conn.close()
    from fastapi.testclient import TestClient
    return TestClient(main_mod.app)


def _db():
    conn = sqlite3.connect(os.environ["DB_PATH"])
    conn.row_factory = sqlite3.Row
    return conn


def _answers_for(items, correct_ids):
    """Build responses from the fixture bank's known keys (tests may read the private file)."""
    bank = {i["id"]: i for i in json.load(open(os.path.join(os.path.dirname(__file__), "..", "games", "banks", "_fixture_bank.json"), encoding="utf-8"))}
    out = {}
    for it in items:
        key = bank[it["id"]]
        if it["id"] in correct_ids:
            out[it["id"]] = key["answer"]
        else:
            out[it["id"]] = "definitely wrong" if key["kind"] != "line_then_choice" else [9, 9]
    return out


def _start(client, uid="p1", **body):
    r = client.post("/api/play/round/start", json={"game_id": "_fixture", **body}, headers=_headers(uid))
    assert r.status_code == 200, r.text
    return r.json()


def test_start_hides_answers(client):
    r = _start(client, level=1)
    assert r["game_id"] == "_fixture" and r["level"] == 1 and len(r["items"]) == 3
    for it in r["items"]:
        assert "answer" not in it and "why" not in it and "misconception" not in it and "lesson_id" not in it


def test_finish_scores_and_awards(client):
    r = _start(client, level=1)
    ids = [i["id"] for i in r["items"]]
    responses = _answers_for(r["items"], set(ids[:2]))  # 2 of 3 right
    f = client.post("/api/play/round/finish", json={"round_id": r["round_id"], "responses": responses,
                                                  "item_ms": {i: 4000 for i in ids}}, headers=_headers("p1"))
    assert f.status_code == 200, f.text
    body = f.json()
    assert body["correct"] == 2 and body["max_score"] >= 3
    assert body["xp"] == round(5 + 20 * body["score"] / body["max_score"])
    assert len(body["reveal"]) == 3 and all("why" in x and "answer" in x for x in body["reveal"])
    assert body["next_level"] in (1, 2)
    conn = _db()
    assert conn.execute("SELECT points FROM users WHERE id='p1'").fetchone()[0] == body["xp"]
    sig = conn.execute("SELECT topic, value FROM learning_signals WHERE user_id='p1' AND signal_type='game_round'").fetchall()
    assert len(sig) == 1 and sig[0]["topic"] == "_fixture"
    val = json.loads(sig[0]["value"])
    assert val["score"] == body["score"] and len(val["items"]) == 3 and "misconception" in val["items"][0]
    mastery = {r["topic"]: r for r in conn.execute("SELECT topic, mastery_level, attempts FROM user_mastery WHERE user_id='p1'")}
    assert mastery and all(m["attempts"] == 0 for m in mastery.values())
    assert any(abs(m["mastery_level"]) > 0 for m in mastery.values())
    streak = conn.execute("SELECT current_streak FROM user_streaks WHERE user_id='p1'").fetchone()
    assert streak and streak[0] == 1
    conn.close()


def test_finish_is_idempotent(client):
    r = _start(client, level=1)
    ids = [i["id"] for i in r["items"]]
    payload = {"round_id": r["round_id"], "responses": _answers_for(r["items"], set(ids)), "item_ms": {i: 3000 for i in ids}}
    a = client.post("/api/play/round/finish", json=payload, headers=_headers("p1")).json()
    b = client.post("/api/play/round/finish", json=payload, headers=_headers("p1")).json()
    assert a == b and a["xp"] > 0
    conn = _db()
    assert conn.execute("SELECT points FROM users WHERE id='p1'").fetchone()[0] == a["xp"]
    assert conn.execute("SELECT COUNT(*) FROM learning_signals WHERE signal_type='game_round'").fetchone()[0] == 1
    conn.close()


def test_finish_other_user_403(client):
    r = _start(client, level=1)
    f = client.post("/api/play/round/finish", json={"round_id": r["round_id"], "responses": {}, "item_ms": {}}, headers=_headers("p2"))
    assert f.status_code == 403
    assert client.post("/api/play/round/finish", json={"round_id": "nope", "responses": {}, "item_ms": {}}, headers=_headers("p1")).status_code == 404


def test_daily_second_attempt_409(client):
    r = _start(client, mode="daily")
    assert r["mode"] == "daily"
    ids = [i["id"] for i in r["items"]]
    client.post("/api/play/round/finish", json={"round_id": r["round_id"], "responses": _answers_for(r["items"], set(ids)),
                                              "item_ms": {i: 3000 for i in ids}}, headers=_headers("p1"))
    again = client.post("/api/play/round/start", json={"game_id": "_fixture", "mode": "daily"}, headers=_headers("p1"))
    assert again.status_code == 409
    # another user can still play today's daily, and gets the same items
    other = _start(client, uid="p2", mode="daily")
    assert [i["id"] for i in other["items"]] == ids


def test_catalog_for_new_user(client):
    r = client.get("/api/play/catalog", headers=_headers("p1"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is True and body["xp_cap"] == 150 and body["today_xp"] == 0
    games = {g["id"]: g for g in body["games"]}
    assert "_fixture" in games and games["_fixture"]["suggested_level"] == 1 and games["_fixture"]["rounds"] == 0
    assert games["_fixture"]["daily_done"] is False and games["_fixture"]["best_score"] is None
    assert body["recommendations"] == []


def test_catalog_recommends_weak_topic(client):
    conn = _db()
    # a topic only the fixture game teaches; one graded Classroom attempt is not enough
    conn.execute("INSERT INTO user_mastery (user_id, topic, mastery_level, attempts) VALUES ('p1','fx_only_topic',0.3,2)")
    conn.execute("INSERT INTO user_mastery (user_id, topic, mastery_level, attempts) VALUES ('p1','variables',0.1,1)")
    conn.commit(); conn.close()
    body = client.get("/api/play/catalog", headers=_headers("p1")).json()
    recs = body["recommendations"]
    assert len(recs) == 1 and recs[0]["game_id"] == "_fixture" and recs[0]["topic"] == "fx_only_topic"
    assert "Classroom" in recs[0]["reason"]


def test_unknown_game_404_and_start_unknown_round(client):
    r = client.post("/api/play/round/start", json={"game_id": "nope"}, headers=_headers("p1"))
    assert r.status_code == 404


def test_disabled_flag_503(client, monkeypatch):
    monkeypatch.setenv("PLAY_ENABLED", "0")
    r = client.get("/api/play/catalog", headers=_headers("p1"))
    assert r.status_code == 503 and r.json()["detail"] == "Play is paused"


def test_fast_round_earns_no_xp(client):
    r = _start(client, level=1)
    ids = [i["id"] for i in r["items"]]
    f = client.post("/api/play/round/finish", json={"round_id": r["round_id"], "responses": _answers_for(r["items"], set(ids)),
                                                  "item_ms": {i: 500 for i in ids}}, headers=_headers("p1")).json()
    assert f["correct"] == 3 and f["xp"] == 0


def test_stats_after_round(client):
    r = _start(client, level=1)
    ids = [i["id"] for i in r["items"]]
    client.post("/api/play/round/finish", json={"round_id": r["round_id"], "responses": _answers_for(r["items"], set(ids[:1])),
                                              "item_ms": {i: 3000 for i in ids}}, headers=_headers("p1"))
    s = client.get("/api/play/stats", headers=_headers("p1")).json()
    assert s["rounds_30d"] == 1 and s["play_days_streak"] == 1
    assert sum(v["total"] for v in s["accuracy_by_topic"].values()) == 3
    assert sum(v["correct"] for v in s["accuracy_by_topic"].values()) == 1
    assert "_fixture" in s["best"]
