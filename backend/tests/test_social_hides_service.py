"""The ops/QA service account stays out of public community lists (2026-11-02)."""
import sqlite3

import pytest

import routes.social as social


@pytest.fixture()
def db(tmp_path, monkeypatch):
    path = str(tmp_path / "s.db")
    conn = sqlite3.connect(path)
    conn.execute("""CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, name TEXT, avatar_url TEXT, bio TEXT,
                    points INTEGER, is_blocked INTEGER DEFAULT 0, created_at TIMESTAMP)""")
    conn.execute("CREATE TABLE user_streaks (user_id TEXT, current_streak INTEGER, longest_streak INTEGER, last_active_date TEXT)")
    conn.executemany("INSERT INTO users VALUES (?, ?, ?, '', '', ?, 0, ?)", [
        ("qa", "claude-qa", "QA", 500, "2026-01-01"), ("a", "ada", "Ada", 300, "2026-01-02"), ("b", "bo", "Bo", 100, "2026-01-03")])
    conn.commit()
    conn.close()
    monkeypatch.setattr(social, "DB_PATH", path)
    return path


def test_leaderboard_excludes_service_account(db):
    r = social.global_leaderboard(scope="xp", limit=25, offset=0, org_id=None, caller="b")
    assert [x["username"] for x in r["leaderboard"]] == ["ada", "bo"]
    assert r["total_participants"] == 2
    assert r["me"]["rank"] == 2


def test_member_directory_excludes_service_account(db):
    r = social.list_members(q="", limit=24, offset=0, org_id=None, caller=None)
    names = [m.get("username") for m in r.get("members", r if isinstance(r, list) else [])]
    assert "claude-qa" not in names and {"ada", "bo"} <= set(names)
