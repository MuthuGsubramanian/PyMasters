"""
Tests for the database schema migration introduced for user profiles,
learning signals, and mastery tracking (Task 1).
"""
import os
import sys
import tempfile
import pytest
import duckdb

# Ensure the backend package root is on the path so we can import main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def make_temp_db():
    """Return a path to a fresh temporary DuckDB database file."""
    fd, path = tempfile.mkstemp(suffix=".duckdb")
    os.close(fd)
    os.unlink(path)  # duckdb will create it; remove the empty placeholder
    return path


def get_table_columns(conn, table_name):
    """Return a list of column names for *table_name*."""
    rows = conn.execute(f"DESCRIBE {table_name}").fetchall()
    return [r[0] for r in rows]


def get_table_names(conn):
    """Return a set of table names present in the database."""
    rows = conn.execute("SHOW TABLES").fetchall()
    return {r[0] for r in rows}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def initialized_db(tmp_path):
    """
    Run init_db() against a fresh temporary database and yield (conn, db_path).
    Overrides DB_PATH via environment variable so main.py uses the temp file.
    """
    db_path = str(tmp_path / "test_pymasters.duckdb")
    original_db_path = os.environ.get("DB_PATH")
    os.environ["DB_PATH"] = db_path

    # Re-import main so DB_PATH is picked up from the environment
    import importlib
    import main as m
    importlib.reload(m)
    m.init_db()

    conn = duckdb.connect(db_path)
    yield conn, db_path

    conn.close()
    if original_db_path is not None:
        os.environ["DB_PATH"] = original_db_path
    else:
        os.environ.pop("DB_PATH", None)


# ---------------------------------------------------------------------------
# Tests: new tables exist
# ---------------------------------------------------------------------------

class TestNewTablesExist:
    def test_user_profiles_table_created(self, initialized_db):
        conn, _ = initialized_db
        tables = get_table_names(conn)
        assert "user_profiles" in tables, "user_profiles table was not created"

    def test_learning_signals_table_created(self, initialized_db):
        conn, _ = initialized_db
        tables = get_table_names(conn)
        assert "learning_signals" in tables, "learning_signals table was not created"

    def test_user_mastery_table_created(self, initialized_db):
        conn, _ = initialized_db
        tables = get_table_names(conn)
        assert "user_mastery" in tables, "user_mastery table was not created"


# ---------------------------------------------------------------------------
# Tests: users table has new columns
# ---------------------------------------------------------------------------

class TestUsersTableColumns:
    def test_preferred_language_column_exists(self, initialized_db):
        conn, _ = initialized_db
        cols = get_table_columns(conn, "users")
        assert "preferred_language" in cols, "preferred_language column missing from users table"

    def test_onboarding_completed_column_exists(self, initialized_db):
        conn, _ = initialized_db
        cols = get_table_columns(conn, "users")
        assert "onboarding_completed" in cols, "onboarding_completed column missing from users table"


# ---------------------------------------------------------------------------
# Tests: user_profiles table schema
# ---------------------------------------------------------------------------

class TestUserProfilesSchema:
    EXPECTED_COLUMNS = [
        "user_id", "motivation", "prior_experience", "known_languages",
        "learning_style", "goal", "time_commitment", "preferred_language",
        "skill_level", "diagnostic_score", "onboarding_completed", "created_at",
    ]

    def test_all_expected_columns_present(self, initialized_db):
        conn, _ = initialized_db
        cols = get_table_columns(conn, "user_profiles")
        for expected in self.EXPECTED_COLUMNS:
            assert expected in cols, f"Column '{expected}' missing from user_profiles"

    def test_can_insert_and_retrieve_row(self, initialized_db):
        conn, _ = initialized_db
        conn.execute("""
            INSERT INTO user_profiles
                (user_id, motivation, prior_experience, known_languages,
                 learning_style, goal, time_commitment, preferred_language,
                 skill_level, diagnostic_score, onboarding_completed)
            VALUES ('u1', 'career', 'none', 'Tamil', 'visual',
                    'get a job', '1h/day', 'ta', 'beginner', 42.5, true)
        """)
        row = conn.execute(
            "SELECT user_id, diagnostic_score, onboarding_completed FROM user_profiles WHERE user_id = 'u1'"
        ).fetchone()
        assert row is not None
        assert row[0] == "u1"
        assert row[1] == pytest.approx(42.5)
        assert row[2] is True


# ---------------------------------------------------------------------------
# Tests: learning_signals table schema
# ---------------------------------------------------------------------------

class TestLearningSignalsSchema:
    EXPECTED_COLUMNS = [
        "id", "user_id", "signal_type", "topic", "value", "session_id", "created_at",
    ]

    def test_all_expected_columns_present(self, initialized_db):
        conn, _ = initialized_db
        cols = get_table_columns(conn, "learning_signals")
        for expected in self.EXPECTED_COLUMNS:
            assert expected in cols, f"Column '{expected}' missing from learning_signals"

    def test_can_insert_and_retrieve_row(self, initialized_db):
        conn, _ = initialized_db
        conn.execute("""
            INSERT INTO learning_signals (id, user_id, signal_type, topic, value, session_id)
            VALUES ('sig1', 'u1', 'quiz_score', 'loops', 0.85, 'sess-abc')
        """)
        row = conn.execute(
            "SELECT signal_type, value FROM learning_signals WHERE id = 'sig1'"
        ).fetchone()
        assert row is not None
        assert row[0] == "quiz_score"
        assert row[1] == pytest.approx(0.85)


# ---------------------------------------------------------------------------
# Tests: user_mastery table schema
# ---------------------------------------------------------------------------

class TestUserMasterySchema:
    EXPECTED_COLUMNS = [
        "user_id", "topic", "mastery_level", "attempts",
        "avg_time_seconds", "last_practiced", "struggle_count",
    ]

    def test_all_expected_columns_present(self, initialized_db):
        conn, _ = initialized_db
        cols = get_table_columns(conn, "user_mastery")
        for expected in self.EXPECTED_COLUMNS:
            assert expected in cols, f"Column '{expected}' missing from user_mastery"

    def test_composite_primary_key_enforced(self, initialized_db):
        conn, _ = initialized_db
        conn.execute("""
            INSERT INTO user_mastery
                (user_id, topic, mastery_level, attempts, avg_time_seconds, struggle_count)
            VALUES ('u1', 'loops', 0.7, 3, 45.0, 1)
        """)
        with pytest.raises(Exception):
            # Inserting the same (user_id, topic) pair must raise a constraint error
            conn.execute("""
                INSERT INTO user_mastery
                    (user_id, topic, mastery_level, attempts, avg_time_seconds, struggle_count)
                VALUES ('u1', 'loops', 0.9, 5, 30.0, 0)
            """)

    def test_can_insert_and_retrieve_row(self, initialized_db):
        conn, _ = initialized_db
        conn.execute("""
            INSERT INTO user_mastery
                (user_id, topic, mastery_level, attempts, avg_time_seconds, struggle_count)
            VALUES ('u2', 'functions', 0.6, 2, 60.5, 0)
        """)
        row = conn.execute(
            "SELECT mastery_level, attempts FROM user_mastery WHERE user_id = 'u2' AND topic = 'functions'"
        ).fetchone()
        assert row is not None
        assert row[0] == pytest.approx(0.6)
        assert row[1] == 2
