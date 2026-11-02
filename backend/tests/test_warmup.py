"""5-minute warm-up: question selection and server-side grading (2026-11-02)."""
import sqlite3

import pytest
from fastapi import HTTPException

import routes.review as review

LESSONS = {
    f"l{i}": {"title": {"en": f"Lesson {i}"}, "quiz": [
        {"q": {"en": f"Q{i}a"}, "options": {"en": ["w", "r"]}, "correct": 1},
        {"q": {"en": f"Q{i}b"}, "options": {"en": ["r", "w"]}, "correct": 0},
    ]} for i in range(4)
}
LESSONS["noquiz"] = {"title": "No quiz"}


@pytest.fixture()
def db(tmp_path, monkeypatch):
    path = tmp_path / "w.db"
    conn = sqlite3.connect(path)
    conn.execute("""CREATE TABLE user_mastery (user_id TEXT, topic TEXT, mastery_level REAL, attempts INTEGER,
                    avg_time_seconds REAL, last_practiced TIMESTAMP, struggle_count INTEGER, PRIMARY KEY (user_id, topic))""")
    rows = [("u1", "l0", 0.9, "2026-01-01 00:00:00"), ("u1", "l1", 0.8, "2026-10-01 00:00:00"),
            ("u1", "l2", 0.3, "2026-01-01 00:00:00"),  # not learned yet -> excluded
            ("u1", "noquiz", 0.9, "2026-01-01 00:00:00"), ("u2", "l3", 0.9, "2026-01-01 00:00:00")]
    conn.executemany("INSERT INTO user_mastery VALUES (?, ?, ?, 1, 0, ?, 0)", rows)
    conn.commit()
    conn.close()
    monkeypatch.setenv("DB_PATH", str(path))
    monkeypatch.setattr(review, "_load_lesson_from_dir", lambda t: LESSONS.get(t))
    return path


def test_warmup_uses_only_learned_lessons_with_quizzes_and_hides_answers(db):
    qs = review.warmup(caller="u1")["questions"]
    assert {q["topic"] for q in qs} == {"l0", "l1"}
    assert len(qs) == 4  # two lessons x two questions, capped at WARMUP_SIZE
    assert all("correct" not in q for q in qs)
    assert all(isinstance(q["options"], list) and q["q"] for q in qs)


def test_warmup_empty_for_new_learner(db):
    assert review.warmup(caller="nobody")["questions"] == []


def test_answer_grades_and_reschedules(db):
    assert review.warmup_answer({"id": "l0:0", "choice": 1}, caller="u1") == {"correct": True, "correct_index": 1}
    assert review.warmup_answer({"id": "l1:1", "choice": 1}, caller="u1")["correct"] is False
    conn = sqlite3.connect(db)
    l0 = conn.execute("SELECT last_practiced FROM user_mastery WHERE user_id='u1' AND topic='l0'").fetchone()[0]
    l1 = conn.execute("SELECT struggle_count FROM user_mastery WHERE user_id='u1' AND topic='l1'").fetchone()[0]
    other = conn.execute("SELECT last_practiced FROM user_mastery WHERE user_id='u2'").fetchone()[0]
    conn.close()
    assert not l0.startswith("2026-01-01")
    assert l1 == 1
    assert other.startswith("2026-01-01")  # only the caller's own rows change


@pytest.mark.parametrize("body,code", [({"id": "l0", "choice": 1}, 400), ({"id": "l0:x", "choice": 1}, 400),
                                       ({"id": "l0:0", "choice": "1"}, 400), ({"id": "l0:9", "choice": 0}, 404),
                                       ({"id": "../etc:0", "choice": 0}, 404)])
def test_answer_rejects_bad_input(db, body, code):
    with pytest.raises(HTTPException) as e:
        review.warmup_answer(body, caller="u1")
    assert e.value.status_code == code


def test_completed_lessons_count_as_learned(db):
    """Production had completions but mastery <= 0.27, so warm-up and review were always empty."""
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE lesson_completions (user_id TEXT, lesson_id TEXT, completed_at TIMESTAMP, xp_awarded INTEGER)")
    conn.execute("INSERT INTO lesson_completions VALUES ('u3', 'l2', '2026-01-01 00:00:00', 50)")
    conn.execute("INSERT INTO user_mastery VALUES ('u3', 'l2', 0.2, 1, 0, '2026-01-01 00:00:00', 0)")
    conn.execute("INSERT INTO lesson_completions VALUES ('u3', 'l3', datetime('now'), 50)")  # just finished
    conn.commit()
    conn.close()
    assert {q["topic"] for q in review.warmup(caller="u3")["questions"]} == {"l2", "l3"}
    due = review.due_reviews(user_id="u3", caller="u3")
    assert [d["topic"] for d in due["due"]] == ["l2"] and due["tracked"] == 2   # fresh completion not due yet
    assert review.warmup_answer({"id": "l2:0", "choice": 1}, caller="u3")["correct"] is True
    assert review.due_reviews(user_id="u3", caller="u3")["total_due"] == 0       # correct recall resets the clock
