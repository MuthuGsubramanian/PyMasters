"""
Tests for the database schema migration introduced for user profiles,
learning signals, and mastery tracking (Task 1).

Also contains tests for the Vaathiyaar profiler service (Task 3).
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


# ---------------------------------------------------------------------------
# Task 3: Profiler Service Tests
# ---------------------------------------------------------------------------

def _setup_db(db_path: str):
    """
    Create all required tables in a fresh test DuckDB database.

    Note: learning_signals.value is VARCHAR here to support JSON-serialised
    signal payloads as written by profiler.record_signal.
    """
    conn = duckdb.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR PRIMARY KEY,
            username VARCHAR UNIQUE,
            password_hash VARCHAR,
            name VARCHAR,
            created_at TIMESTAMP,
            points INTEGER DEFAULT 0,
            unlocked_modules VARCHAR DEFAULT '["module_1"]',
            preferred_language VARCHAR DEFAULT 'en',
            onboarding_completed BOOLEAN DEFAULT false
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id VARCHAR PRIMARY KEY,
            motivation VARCHAR,
            prior_experience VARCHAR,
            known_languages VARCHAR,
            learning_style VARCHAR,
            goal VARCHAR,
            time_commitment VARCHAR,
            preferred_language VARCHAR,
            skill_level VARCHAR,
            diagnostic_score FLOAT,
            onboarding_completed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS learning_signals (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR,
            signal_type VARCHAR,
            topic VARCHAR,
            value VARCHAR,
            session_id VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_mastery (
            user_id VARCHAR,
            topic VARCHAR,
            mastery_level FLOAT,
            attempts INTEGER,
            avg_time_seconds FLOAT,
            last_practiced TIMESTAMP,
            struggle_count INTEGER,
            PRIMARY KEY (user_id, topic)
        )
    """)
    conn.close()


class TestProfilerService:
    """Tests for vaathiyaar.profiler service functions (Task 3)."""

    def test_save_onboarding(self, tmp_path):
        """save_onboarding should upsert user_profiles and update users table."""
        from vaathiyaar.profiler import save_onboarding

        db_path = str(tmp_path / "profiler_test.duckdb")
        _setup_db(db_path)

        # Insert a user so the UPDATE in save_onboarding has a target row
        conn = duckdb.connect(db_path)
        conn.execute(
            "INSERT INTO users (id, username, name, created_at) VALUES (?, ?, ?, current_timestamp)",
            ["user-001", "tester", "Test User"]
        )
        conn.close()

        data = {
            "motivation": "career",
            "prior_experience": "none",
            "known_languages": "Tamil",
            "learning_style": "visual",
            "goal": "get a job",
            "time_commitment": "1h/day",
            "preferred_language": "ta",
            "skill_level": "beginner",
            "diagnostic_score": 55.0,
        }

        result = save_onboarding(db_path, "user-001", data)

        assert result == {"onboarding_completed": True, "user_id": "user-001"}

        conn = duckdb.connect(db_path)
        row = conn.execute(
            "SELECT motivation, preferred_language, onboarding_completed FROM user_profiles WHERE user_id = 'user-001'"
        ).fetchone()
        assert row is not None
        assert row[0] == "career"
        assert row[1] == "ta"
        assert row[2] is True

        user_row = conn.execute(
            "SELECT preferred_language, onboarding_completed FROM users WHERE id = 'user-001'"
        ).fetchone()
        assert user_row is not None
        assert user_row[0] == "ta"
        assert user_row[1] is True
        conn.close()

    def test_record_signal(self, tmp_path):
        """record_signal should insert exactly one row into learning_signals."""
        from vaathiyaar.profiler import record_signal

        db_path = str(tmp_path / "signal_test.duckdb")
        _setup_db(db_path)

        record_signal(
            db_path,
            user_id="user-002",
            signal_type="quiz_score",
            topic="loops",
            value={"score": 0.85, "attempts": 2},
            session_id="sess-xyz",
        )

        conn = duckdb.connect(db_path)
        rows = conn.execute(
            "SELECT user_id, signal_type, topic, value, session_id FROM learning_signals"
        ).fetchall()
        conn.close()

        assert len(rows) == 1
        row = rows[0]
        assert row[0] == "user-002"
        assert row[1] == "quiz_score"
        assert row[2] == "loops"

        import json
        parsed = json.loads(row[3])
        assert parsed["score"] == pytest.approx(0.85)
        assert row[4] == "sess-xyz"

    def test_update_and_get_mastery(self, tmp_path):
        """update_mastery + get_mastery_map should store and return correct data."""
        from vaathiyaar.profiler import update_mastery, get_mastery_map

        db_path = str(tmp_path / "mastery_test.duckdb")
        _setup_db(db_path)

        update_mastery(db_path, user_id="user-003", topic="functions", level=0.75, time_seconds=45.0)

        mastery = get_mastery_map(db_path, "user-003")
        assert "functions" in mastery
        assert mastery["functions"] == pytest.approx(0.75)
