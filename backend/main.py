from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import uvicorn
from contextlib import asynccontextmanager
import time
import uuid
import random

# --- Database Setup ---
import os
import re
import json
import requests
from dotenv import load_dotenv
load_dotenv()
DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

# Allowed characters for a NEW username (enforced on create only). Excludes '@'
# and whitespace so a username can never resemble an email address.
_USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

# --- Route imports ---
from routes.language import router as language_router
from routes.profile import router as profile_router
from routes.classroom import router as classroom_router
from routes.playground import router as playground_router
from routes.notifications import router as notifications_router
from routes.modules import router as modules_router
from routes.graph import router as graph_router
from routes.messages import router as messages_router
from routes.paths import router as paths_router
from routes.trending import router as trending_router
from routes.organizations import router as org_router
from routes.challenges import router as challenges_router
from routes.reference import router as reference_router
from routes.admin import router as admin_router
from routes.social_studio import router as social_studio_router
from routes.podcasts import router as podcasts_router
from routes.review import router as review_router
from routes.voice import router as voice_router
from routes.social import router as social_router, ensure_social_tables
from routes.org_challenges import router as org_challenges_router, ensure_org_challenge_tables
from routes.oauth import router as oauth_router, ensure_oauth_tables
from routes.github_oauth import router as github_oauth_router
from routes.discovery import router as discovery_router
from routes.payments import router as payments_router, ensure_payments_table
from routes.telemetry import router as telemetry_router, ensure_telemetry_tables, record_login
from routes.semantic import router as semantic_router
from routes.organizations import ensure_org_audit_table, ensure_org_entitlement_schema
from routes.org_requests import router as org_requests_router, ensure_org_requests_table
from routes.org_curriculum import router as org_curriculum_router, ensure_org_curriculum_tables
from routes.support import router as support_router, ensure_support_tables
from routes.tutor_sessions import router as tutor_sessions_router, ensure_tutor_session_tables
from routes.platform_settings import router as platform_settings_router, ensure_platform_settings_table
from auth import create_access_token, get_current_user_id, _current_token_version


# Seed Data: Tutorials & Quizzes (kept for /api/content/* backward compatibility)
CONTENT_MAP = {
    "module_1": {
        "id": "module_1",
        "title": "Python Basics: Variables & Types",
        "description": "Master the atoms of Python: Strings, Integers, and Floats.",
        "content": "## Variables in Python\nPython is dynamically typed. You don't need to declare types!\n\n```python\nx = 10\nname = 'PyMaster'\npi = 3.14\n```\n\n### String Formatting\nUse f-strings for cleaner code:\n```python\nprint(f'Hello {name}')\n```",
        "xp_reward": 50,
        "next_unlock": "module_2",
        "quiz": [
            {"q": "What is the output of print(10 // 3)?", "options": ["3.33", "3", "3.0", "10"], "correct": 1},
            {"q": "Which symbol starts a comment?", "options": ["//", "/*", "#", "--"], "correct": 2},
        ]
    },
    "module_2": {
        "id": "module_2",
        "title": "Control Flow: If & Loops",
        "description": "Learn how to direct the flow of your program.",
        "content": "## Conditionals\nUse `if`, `elif`, and `else` to make decisions.\n\n```python\nif score > 50:\n    print('Pass')\nelse:\n    print('Try Again')\n```\n\n## Loops\nIterate over sequences:\n```python\nfor i in range(5):\n    print(i)\n```",
        "xp_reward": 100,
        "next_unlock": "module_3",
        "quiz": [
            {"q": "How do you start a for loop?", "options": ["foreach x in y:", "for x in y:", "loop x in y", "range(x)"], "correct": 1},
            {"q": "What keyword breaks a loop?", "options": ["stop", "exit", "break", "return"], "correct": 2},
        ]
    },
    "module_3": {
        "id": "module_3",
        "title": "Data Structures: Lists & Dicts",
        "description": "Store and organize data efficiently.",
        "content": "## Lists\nOrdered, mutable collections.\n```python\nitems = [1, 2, 'apple']\nitems.append(4)\n```\n\n## Dictionaries\nKey-value pairs for fast lookups.\n```python\nuser = {'name': 'Neo', 'level': 99}\nprint(user['name'])\n```",
        "xp_reward": 150,
        "next_unlock": "module_4",
        "quiz": [
            {"q": "Are tuples mutable?", "options": ["Yes", "No"], "correct": 1},
            {"q": "How to get keys from dict d?", "options": ["d.keys()", "d.list()", "d.all()", "keys(d)"], "correct": 0},
        ]
    },
    "module_4": {
        "id": "module_4",
        "title": "Advanced: Async & APIs",
        "description": "Modern Python concurrency and networking.",
        "content": "## AsyncIO\nAsynchronous I/O for high-performance apps.\n```python\nimport asyncio\n\nasync def main():\n    print('Hello')\n    await asyncio.sleep(1)\n    print('World')\n```",
        "xp_reward": 300,
        "next_unlock": None,
        "quiz": [
            {"q": "Which keyword defines an async function?", "options": ["def async", "async def", "await def", "coroutine"], "correct": 1},
            {"q": "What does await do?", "options": ["Pauses execution", "Stops the program", "Runs in parallel", "Threads it"], "correct": 0},
        ]
    }
}

def init_db():
    print(f"Initializing Database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    try:
        # Wait up to 10s for a competing writer instead of failing a migration
        # instantly on "database is locked" (notably under Litestream/WAL).
        conn.execute("PRAGMA busy_timeout = 10000")
        cursor = conn.cursor()

        # Schema Migration: Add gamification columns if they don't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                password_hash TEXT,
                name TEXT,
                created_at TIMESTAMP
            )
        """)

        # Check/Add extra columns manually
        cursor.execute("PRAGMA table_info(users)")
        columns = cursor.fetchall()
        col_names = [c[1] for c in columns]

        if 'points' not in col_names:
            print("Migrating DB: Adding points column")
            cursor.execute("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0")

        if 'unlocked_modules' not in col_names:
            print("Migrating DB: Adding unlocked_modules column")
            cursor.execute("ALTER TABLE users ADD COLUMN unlocked_modules TEXT DEFAULT '[\"module_1\"]'")

        if 'preferred_language' not in col_names:
            print("Migrating DB: Adding preferred_language column")
            cursor.execute("ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en'")

        if 'onboarding_completed' not in col_names:
            print("Migrating DB: Adding onboarding_completed column")
            cursor.execute("ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0")

        if 'playground_prompts_used' not in col_names:
            print("Migrating DB: Adding playground_prompts_used column")
            cursor.execute("ALTER TABLE users ADD COLUMN playground_prompts_used INTEGER DEFAULT 0")

        if 'email' not in col_names:
            print("Migrating DB: Adding email column")
            cursor.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")

        if 'whatsapp' not in col_names:
            print("Migrating DB: Adding whatsapp column")
            cursor.execute("ALTER TABLE users ADD COLUMN whatsapp TEXT DEFAULT ''")

        if 'linkedin_url' not in col_names:
            print("Migrating DB: Adding social profile columns")
            cursor.execute("ALTER TABLE users ADD COLUMN linkedin_url TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE users ADD COLUMN github_url TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE users ADD COLUMN twitter_url TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE users ADD COLUMN website_url TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''")

        if 'account_type' not in col_names:
            print("Migrating DB: Adding account_type column")
            cursor.execute("ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT 'individual'")

        if 'is_blocked' not in col_names:
            print("Migrating DB: Adding is_blocked column")
            cursor.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")

        if 'plan' not in col_names:
            print("Migrating DB: Adding plan column")
            cursor.execute("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'")

        # Manual plan assignment by super admin (2026-07-02): who assigned,
        # when, and until when the plan is valid. NULL expiry = no expiry.
        if 'plan_assigned_at' not in col_names:
            print("Migrating DB: Adding plan_assigned_at column")
            cursor.execute("ALTER TABLE users ADD COLUMN plan_assigned_at TEXT")
        if 'plan_expires_at' not in col_names:
            print("Migrating DB: Adding plan_expires_at column")
            cursor.execute("ALTER TABLE users ADD COLUMN plan_expires_at TEXT")

        if 'is_super_admin' not in col_names:
            print("Migrating DB: Adding is_super_admin column")
            cursor.execute("ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0")
        if 'token_version' not in col_names:
            print("Migrating DB: Adding token_version column")
            cursor.execute("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                used INTEGER DEFAULT 0
            )
        """)

        # Create user_profiles table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                motivation TEXT,
                prior_experience TEXT,
                known_languages TEXT,
                learning_style TEXT,
                goal TEXT,
                time_commitment TEXT,
                preferred_language TEXT,
                skill_level TEXT,
                diagnostic_score REAL,
                onboarding_completed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migrate user_profiles: add user_type
        cursor.execute("PRAGMA table_info(user_profiles)")
        profile_columns = cursor.fetchall()
        profile_col_names = [c[1] for c in profile_columns]
        if 'user_type' not in profile_col_names:
            print("Migrating DB: Adding user_type column to user_profiles")
            cursor.execute("ALTER TABLE user_profiles ADD COLUMN user_type TEXT DEFAULT ''")

        # Create learning_signals table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_signals (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                signal_type TEXT,
                topic TEXT,
                value TEXT,
                session_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create user_mastery table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_mastery (
                user_id TEXT,
                topic TEXT,
                mastery_level REAL,
                attempts INTEGER,
                avg_time_seconds REAL,
                last_practiced TIMESTAMP,
                struggle_count INTEGER,
                PRIMARY KEY (user_id, topic)
            )
        """)

        # Cache of on-demand lesson translations (see vaathiyaar/translator.py).
        # Keyed by (lesson_id, lang, field); source_hash lets us invalidate a
        # cached translation when the English source lesson changes.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_translations (
                lesson_id TEXT,
                lang TEXT,
                field TEXT,
                content TEXT,
                source_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (lesson_id, lang, field)
            )
        """)

        # Create training_data table for fine-tuning pipeline
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS training_data (
                id TEXT PRIMARY KEY,
                input_text TEXT,
                output_text TEXT,
                profile_json TEXT,
                context_json TEXT,
                quality_score REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── Notification tables ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link TEXT,
                metadata TEXT,
                read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                notification_id INTEGER NOT NULL REFERENCES notifications(id),
                channel TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                sent_at TIMESTAMP,
                error_message TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_preferences (
                user_id INTEGER NOT NULL REFERENCES users(id),
                channel TEXT NOT NULL,
                type TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                quiet_hours_start TEXT,
                quiet_hours_end TEXT,
                PRIMARY KEY (user_id, channel, type)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_deliveries_notification ON notification_deliveries(notification_id)")

        # ── Module generation tables ──────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS module_generation_jobs (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                topic TEXT NOT NULL,
                trigger TEXT NOT NULL,
                trigger_detail TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                current_stage_data TEXT,
                result_lesson_id TEXT,
                error_message TEXT,
                priority INTEGER NOT NULL DEFAULT 2,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS generated_lessons (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                job_id TEXT REFERENCES module_generation_jobs(id),
                topic TEXT NOT NULL,
                track TEXT,
                lesson_data TEXT NOT NULL,
                trigger TEXT,
                trigger_detail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gen_jobs_user ON module_generation_jobs(user_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gen_jobs_status ON module_generation_jobs(status, priority)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gen_lessons_user ON generated_lessons(user_id)")

        # ── Playground conversation history ─────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playground_conversations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT DEFAULT 'New conversation',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playground_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES playground_conversations(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pg_conv_user ON playground_conversations(user_id, updated_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pg_msg_conv ON playground_messages(conversation_id, created_at)")
        # learning_signals is the hottest, unbounded-growth table: filtered by
        # user_id/created_at in ~15 dashboard + trigger-engine queries (some
        # correlated-per-row), previously with NO index → full table scans that
        # grow super-linearly and lengthen read-lock windows. These two cover the
        # user+recency and user+type+topic access patterns.
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ls_user_created ON learning_signals(user_id, created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ls_user_type_topic ON learning_signals(user_id, signal_type, topic)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_completions (
                user_id TEXT NOT NULL,
                lesson_id TEXT NOT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                xp_awarded INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, lesson_id)
            )
        """)

        # ── Knowledge Graph tables ────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS concept_edges (
                from_concept TEXT NOT NULL REFERENCES concepts(id),
                to_concept TEXT NOT NULL REFERENCES concepts(id),
                relationship TEXT NOT NULL DEFAULT 'requires',
                weight REAL DEFAULT 1.0,
                PRIMARY KEY (from_concept, to_concept)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_concepts (
                lesson_id TEXT NOT NULL,
                concept_id TEXT NOT NULL REFERENCES concepts(id),
                role TEXT NOT NULL DEFAULT 'teaches',
                depth TEXT DEFAULT 'moderate',
                PRIMARY KEY (lesson_id, concept_id, role)
            )
        """)

        # ── Learning Paths tables ─────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_paths (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                difficulty_start TEXT,
                difficulty_end TEXT,
                category TEXT,
                estimated_hours INTEGER,
                lesson_sequence TEXT NOT NULL,
                concepts_covered TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_learning_paths (
                user_id TEXT NOT NULL,
                path_id TEXT NOT NULL REFERENCES learning_paths(id),
                status TEXT DEFAULT 'active',
                current_position INTEGER DEFAULT 0,
                adapted_sequence TEXT,
                skipped_lessons TEXT,
                inserted_lessons TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP,
                completed_at TIMESTAMP,
                PRIMARY KEY (user_id, path_id)
            )
        """)

        # ── User settings table ────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY,
                bio TEXT,
                voice_enabled BOOLEAN DEFAULT 0,
                voice_speed REAL DEFAULT 1.0,
                voice_name TEXT DEFAULT '',
                auto_play_animations BOOLEAN DEFAULT 1,
                hint_level INTEGER DEFAULT 2,
                daily_goal TEXT DEFAULT '30min',
                difficulty_preference TEXT DEFAULT 'intermediate',
                updated_at TIMESTAMP
            )
        """)

        # ── User streaks table ─────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_streaks (
                user_id TEXT PRIMARY KEY,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                last_active_date TEXT
            )
        """)

        # ── Vaathiyaar proactive messages ─────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_vaathiyaar_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT NOT NULL,
                action_data TEXT,
                delivered BOOLEAN DEFAULT 0,
                dismissed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── Challenge submissions table ──────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS challenge_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                challenge_id TEXT NOT NULL,
                code TEXT NOT NULL,
                passed INTEGER DEFAULT 0,
                xp_awarded INTEGER DEFAULT 0,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, challenge_id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_challenge_sub_user ON challenge_submissions(user_id)")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lesson_insertions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                path_id TEXT,
                lesson_id TEXT NOT NULL,
                position INTEGER,
                reason TEXT NOT NULL,
                concept_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS path_adaptation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                path_id TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                lesson_affected TEXT,
                concept_trigger TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson ON lesson_concepts(lesson_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lesson_concepts_concept ON lesson_concepts(concept_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_paths_user ON user_learning_paths(user_id, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pending_msgs_user ON pending_vaathiyaar_messages(user_id, delivered)")

        # ── Organization tables ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'other',
                domain TEXT DEFAULT '',
                logo_url TEXT DEFAULT '',
                description TEXT DEFAULT '',
                settings TEXT DEFAULT '{}',
                plan TEXT DEFAULT 'free',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_members (
                org_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                department TEXT DEFAULT '',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                invited_by TEXT DEFAULT '',
                PRIMARY KEY (org_id, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_invites (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                token TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                used INTEGER DEFAULT 0,
                used_by TEXT DEFAULT ''
            )
        """)

        # ── Institutional console: group tags ─────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_member_groups (
                org_id     TEXT NOT NULL,
                user_id    TEXT NOT NULL,
                group_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (org_id, user_id, group_name)
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_omg_org_group ON org_member_groups(org_id, group_name)"
        )

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_audit (
                id          TEXT PRIMARY KEY,
                actor_id    TEXT NOT NULL,
                actor_name  TEXT,
                action      TEXT NOT NULL,
                target_type TEXT,
                target_id   TEXT,
                detail      TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_type, target_id)")

        # One-time, idempotent backfill: seed group tags from existing department values
        cursor.execute("""
            INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name)
            SELECT org_id, user_id, TRIM(department)
            FROM org_members
            WHERE department IS NOT NULL AND TRIM(department) != ''
        """)

        # Migrate: add description column to organizations if missing
        org_cols = [r[1] for r in cursor.execute("PRAGMA table_info(organizations)").fetchall()]
        if 'description' not in org_cols:
            print("Migrating DB: Adding description column to organizations")
            cursor.execute("ALTER TABLE organizations ADD COLUMN description TEXT DEFAULT ''")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_org_members_role ON org_members(org_id, role)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_org_invites_token ON org_invites(token)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites(email)")

        # ── Org profiles (onboarding answers for org admins) ──────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_profiles (
                org_id TEXT PRIMARY KEY,
                org_size TEXT DEFAULT '',
                learner_profile TEXT DEFAULT '',
                skill_level TEXT DEFAULT '',
                learning_focus TEXT DEFAULT '',
                structure_preference TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Community + competition + OAuth tables (Aug-launch features)
        # ROOT CAUSE of the historical "Community/OAuth table init: database is
        # locked" failures: init_db's own connection holds an open write
        # transaction here, so each ensure_*'s fresh connection blocked ~5s and
        # then failed. Commit FIRST to release the lock, then run each ensure_*
        # independently (one failure must not skip the rest — that silently
        # blocked ensure_telemetry_tables in prod on 2026-07-02).
        conn.commit()
        for _ensure in (ensure_social_tables, ensure_org_challenge_tables,
                        ensure_oauth_tables, ensure_payments_table,
                        ensure_telemetry_tables, ensure_support_tables,
                        ensure_tutor_session_tables, ensure_platform_settings_table,
                        ensure_org_audit_table, ensure_org_requests_table,
                        ensure_org_curriculum_tables, ensure_org_entitlement_schema):
            try:
                _ensure(DB_PATH)
            except Exception as e:
                print(f"Table init {getattr(_ensure, '__name__', _ensure)}: {e}")

        # Bootstrap admin, ONLY on a truly empty DB (rare: first-ever boot with no
        # GCS replica and no baked-in seed). Never a hardcoded password — that put a
        # well-known 'admin'/'admin123' super-user into production. Use a random,
        # strong password printed ONCE to stdout (visible only in the boot logs), or
        # a value pinned via BOOTSTRAP_ADMIN_PASSWORD for deterministic ops setup.
        # It is seeded as super-admin because the reserved-email registration block
        # means this is the only path to admin access on a brand-new database.
        cursor.execute("SELECT count(*) FROM users")
        existing = cursor.fetchone()[0]
        if existing == 0:
            import secrets
            pinned = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
            bootstrap_pw = pinned or secrets.token_urlsafe(18)
            hashed = hash_pw(bootstrap_pw)
            cursor.execute(
                "INSERT INTO users (id, username, password_hash, name, created_at, points, "
                "unlocked_modules, preferred_language, onboarding_completed, is_super_admin) "
                "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, ?, ?, 1)",
                [str(uuid.uuid4()), "admin", hashed, "Administrator", json.dumps(["module_1"]), "en", 0]
            )
            if pinned:
                print("[bootstrap] Seeded 'admin' super-user from BOOTSTRAP_ADMIN_PASSWORD (env).")
            else:
                # SECURITY: never print the generated password — Cloud Run captures
                # stdout into Cloud Logging, so logging the credential exposes it to
                # anyone with Logging Viewer for the log-retention window. Set
                # BOOTSTRAP_ADMIN_PASSWORD to seed a known password deterministically;
                # otherwise this random one is unrecoverable (use the owner's
                # SUPER_ADMIN_EMAILS account or the forgot-password flow instead).
                print("[bootstrap] Seeded 'admin' super-user with a RANDOM password "
                      "(not logged). Set BOOTSTRAP_ADMIN_PASSWORD to control it, or "
                      "sign in via a SUPER_ADMIN_EMAILS account.")

        # Commit schema + migrations BEFORE seeding. The seed routines open their
        # own connections; if the outer write transaction is still open they hit
        # "database is locked" (notably under Litestream/WAL in production) and the
        # seed is silently skipped — which kept new learning paths / graph concepts
        # from ever reaching the prod DB.
        conn.commit()

        # Seed knowledge graph concepts
        try:
            from graph.concepts import seed_concepts
            seed_concepts(DB_PATH)
        except Exception as e:
            print(f"Graph seed: {e}")

        # Seed lesson→concept links (idempotent, INSERT OR IGNORE). Without
        # these rows the mastery overlay / frontier / gap detection all compute
        # on an empty join — the adaptive layer silently reported 0.0 mastery
        # for every user (found 2026-07-02: lesson_concepts had 0 rows).
        try:
            from graph.seed_links import seed_lesson_concepts
            added = seed_lesson_concepts(DB_PATH)
            if added:
                print(f"Lesson-concept seed: +{added} links")
        except Exception as e:
            print(f"Lesson-concept seed: {e}")

        # Seed learning paths
        try:
            from paths.definitions import seed_paths
            seed_paths(DB_PATH)
        except Exception as e:
            print(f"Paths seed: {e}")

        # Resolve SUPER_ADMIN_EMAILS into the is_super_admin column. This runs on
        # every boot, before any admin request is served, so the real owner
        # accounts are always authorized even though require_super_admin no longer
        # trusts email/username strings at request time.
        #
        # Matches on EMAIL or USERNAME. Username-matching is required because the
        # founder's own legacy account has username == the reserved email with a
        # BLANK email column (created in the break-glass era), so an email-only
        # match would leave the owner locked out of admin. It is SAFE here even
        # though request-time authorization must never trust a username: register()
        # now forbids '@' in usernames AND rejects reserved identifiers, so no NEW
        # account can ever have a username equal to a reserved email. Only the
        # pre-existing owner account can match — this is a one-way legacy heal, not
        # a self-service escalation path.
        try:
            from routes.admin import SUPER_ADMINS
            if SUPER_ADMINS:
                placeholders = ",".join("?" for _ in SUPER_ADMINS)
                cursor.execute(
                    f"UPDATE users SET is_super_admin = 1 "
                    f"WHERE lower(email) IN ({placeholders}) "
                    f"OR lower(username) IN ({placeholders})",
                    list(SUPER_ADMINS) + list(SUPER_ADMINS),
                )
                conn.commit()
        except Exception as e:
            print(f"Super-admin resolve: {e}")

    except Exception as e:
        # Loud, grep-able failure with a traceback — a half-applied migration must
        # not vanish behind a one-line print (Cloud Logging flags [FATAL]/severity).
        import traceback
        print(f"[FATAL] DB Init Error: {e}\n{traceback.format_exc()}")
    finally:
        conn.close()

# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Keep init_db in a daemon thread so uvicorn can bind the port quickly
    # and Cloud Run's startup probe passes. The brief schema-migration race
    # is much less harmful than a deploy that times out waiting on init_db.
    # The /register hardening (clean 4xx + try/except around hash_pw and
    # the DB writes) is what actually fixes the user-reported 500, not this.
    #
    # 2026-07-27: init_db now runs SYNCHRONOUSLY before serving. Previously it ran
    # in a daemon thread so uvicorn bound the port fast, but that let cold-start
    # requests hit tables/columns before migrations finished (500s), and a failed
    # migration was a silent print. init_db is fast (~1-2s, idempotent) and its
    # connection sets busy_timeout, so it can't hang on a lock; the genuinely slow
    # work — the semantic-index model build below — stays in its own daemon thread.
    import threading
    try:
        init_db()
    except Exception as e:
        import traceback
        print(f"[FATAL] init_db failed before serving: {e}\n{traceback.format_exc()}")

    # Sandbox egress self-test (Cloud Run only) — logs whether user code can reach
    # the metadata server. Background so it never delays readiness.
    if os.environ.get("K_SERVICE"):
        def _egress_probe():
            try:
                from vaathiyaar.execution import egress_self_test
                egress_self_test()
            except Exception as e:
                print(f"[sandbox] egress self-test skipped: {e}")
        threading.Thread(target=_egress_probe, daemon=True).start()
    # Semantic curriculum index (vector search / related lessons) builds in
    # its own daemon thread; endpoints report ready:false until it finishes.
    # Auto-start only where the real model should load (Cloud Run sets
    # K_SERVICE) or when explicitly asked — never implicitly under pytest.
    # SEMANTIC_AUTOSTART=0 is the ops kill switch (gcloud run services update
    # --set-env-vars SEMANTIC_AUTOSTART=0) in case the model build ever
    # destabilizes an instance — the endpoints then stay ready:false forever,
    # which every consumer already treats as "feature absent".
    if os.environ.get("SEMANTIC_AUTOSTART") != "0" and (
            os.environ.get("K_SERVICE") or os.environ.get("SEMANTIC_AUTOSTART") == "1"):
        try:
            from semantic.store import get_index
            get_index().ensure_started()
        except Exception as e:
            print(f"Semantic index startup skipped: {e}")
    yield

app = FastAPI(title="PyMasters API", lifespan=lifespan)

# Mount routers
app.include_router(language_router)
app.include_router(profile_router)
app.include_router(classroom_router)
app.include_router(playground_router)
app.include_router(notifications_router)
app.include_router(modules_router)
app.include_router(graph_router)
app.include_router(messages_router)
app.include_router(paths_router)
app.include_router(trending_router)
app.include_router(org_router)
app.include_router(challenges_router)
app.include_router(reference_router)
app.include_router(admin_router)
app.include_router(social_studio_router)
app.include_router(podcasts_router)
app.include_router(review_router)
app.include_router(voice_router)
app.include_router(social_router)
app.include_router(org_challenges_router)
app.include_router(telemetry_router)
app.include_router(semantic_router)
app.include_router(oauth_router)
app.include_router(github_oauth_router)
app.include_router(discovery_router)
app.include_router(payments_router)
app.include_router(support_router)
app.include_router(tutor_sessions_router)
app.include_router(platform_settings_router)
app.include_router(org_requests_router)
app.include_router(org_curriculum_router)

# --- CORS ---
# NB: no "*" here. With allow_credentials=True, a wildcard makes Starlette echo
# ANY caller's Origin back with Access-Control-Allow-Credentials, defeating the
# same-origin policy for credentialed requests. Only explicit origins are allowed.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://www.pymasters.net",
    "https://pymasters.net",
    "http://localhost:80",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth rate limiting (Phase 5) ---
# Unauthenticated auth endpoints are keyed on client IP. NOTE: this limiter is
# IN-PROCESS; it is only effective while the service runs as a single instance
# (min=max=1, see cloud-run.tf). If it ever scales horizontally, move this to a
# shared store (Redis/Memorystore) or it becomes trivially bypassable per-instance.
from ratelimit import SlidingWindowRateLimiter as _SWRL

_login_ip_limiter = _SWRL(max_calls=15, window_seconds=60)
_register_ip_limiter = _SWRL(max_calls=8, window_seconds=300)
_forgot_ip_limiter = _SWRL(max_calls=5, window_seconds=900)
# Per-username failed-login lockout: after this many failures within the window a
# username is refused (even with the correct password) until the window elapses.
_login_fail_limiter = _SWRL(max_calls=5, window_seconds=300)


def _client_ip(request) -> str:
    """Best-effort client IP; first hop of X-Forwarded-For (Cloud Run appends it)."""
    if request is None:
        return "unknown"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return (request.client.host if request.client else None) or "unknown"


def _enforce_ip_limit(limiter, request, what: str) -> None:
    key = _client_ip(request)
    if not limiter.allow(key):
        wait = max(1, limiter.retry_after(key))
        raise HTTPException(status_code=429, detail=f"Too many {what}. Try again in {wait}s.",
                            headers={"Retry-After": str(wait)})

# --- Models ---
class UserRegister(BaseModel):
    username: str
    password: str
    name: Optional[str] = "Learner"
    email: Optional[str] = ""
    account_type: Optional[str] = "individual"
    # Organization signup (only used when account_type == "organization").
    # Sent atomically so we never end up with a user row but no org.
    organization_name: Optional[str] = None
    organization_type: Optional[str] = None      # school | university | enterprise | other
    organization_domain: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    user_id: Optional[str] = None  # ignored — identity comes from the JWT
    current_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    identifier: str  # username or email

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class QuizSubmission(BaseModel):
    user_id: str
    module_id: str
    score: int # percentage or raw score 

# --- Helper: Auth ---
import hashlib
import hmac
# Call bcrypt directly rather than through passlib: passlib 1.7.x reads
# `bcrypt.__about__.__version__` which bcrypt 4.x removed, and its fallback
# rejects ANY input (including short passwords) with a 72-byte error during
# version probing. The bcrypt library's own hashpw/checkpw are stable.
try:
    import bcrypt as _bcrypt_lib
    _HAS_BCRYPT = True
except Exception:  # pragma: no cover - bcrypt is a declared dependency
    _HAS_BCRYPT = False


def _legacy_sha256(password: str) -> str:
    return hashlib.sha256((password or "").encode("utf-8")).hexdigest()


def _bcrypt_input(password: str) -> bytes:
    # bcrypt has a hard 72-byte limit and 4.x raises instead of auto-truncating.
    return (password or "").encode("utf-8")[:72]


def hash_pw(password: str) -> str:
    """Hash a NEW password with bcrypt (salted, slow). Falls back to sha256 only if
    bcrypt is unavailable (it is a declared dependency, so this is defensive)."""
    if _HAS_BCRYPT:
        try:
            return _bcrypt_lib.hashpw(_bcrypt_input(password), _bcrypt_lib.gensalt(rounds=12)).decode("utf-8")
        except Exception as e:  # pragma: no cover - defensive against backend issues
            print(f"[hash_pw] bcrypt hashing failed ({e!r}); falling back to sha256")
    return _legacy_sha256(password)


def verify_pw(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash. Supports bcrypt (current) and legacy
    unsalted sha256 so existing accounts keep working while we migrate them on next login."""
    if not stored_hash:
        return False
    s = str(stored_hash)
    if s.startswith("$2"):  # bcrypt
        if not _HAS_BCRYPT:
            return False
        try:
            return bool(_bcrypt_lib.checkpw(_bcrypt_input(password), s.encode("utf-8")))
        except Exception:
            return False
    return hmac.compare_digest(s, _legacy_sha256(password))

# --- Routes ---

@app.get("/")
def read_root():
    return {"status": "online", "message": "PyMasters Backend is running"}


def _health_payload() -> dict:
    """Shared health body. Reports process liveness (always) plus a fast,
    best-effort DB reachability probe. The DB probe NEVER changes the HTTP
    status: a transient SQLite write-lock must not turn a healthy process into
    a failing liveness check (that would trigger needless container restarts).
    The external uptime watchdog reads `db` to distinguish "process up but DB
    wedged" from a full outage."""
    db_state = "unknown"
    try:
        conn = sqlite3.connect(DB_PATH, timeout=2.0)
        try:
            conn.execute("SELECT 1")
            db_state = "ok"
        finally:
            conn.close()
    except Exception as e:
        db_state = f"error: {type(e).__name__}"
    return {
        "status": "ok",
        "service": "pymasters",
        "db": db_state,
        "time": int(time.time()),
    }


@app.get("/health")
@app.get("/healthz")
@app.get("/api/health")
def health():
    """Liveness/uptime probe. Always 200 while the process can serve requests;
    body carries a best-effort DB signal for the watchdog. Reachable in prod
    via nginx (/health is proxied to the backend, /api/* is proxied too)."""
    return _health_payload()


@app.head("/health")
@app.head("/api/health")
def health_head():
    # HEAD support so lightweight uptime monitors can ping without a body.
    return {}

@app.post("/api/auth/register")
def register(user: UserRegister, request: Request = None):
    # NB: `request` defaults to None so direct unit-test calls
    # (tests/test_register.py) keep working; FastAPI always injects a real
    # Request on HTTP calls, so telemetry is unaffected in production.
    print(f"Register request for: {user.username}")
    _enforce_ip_limit(_register_ip_limiter, request, "signup attempts")
    uname = (user.username or "").strip()
    if not uname:
        raise HTTPException(status_code=422, detail="Username is required.")
    # Constrain the username charset (enforced on CREATE only; existing accounts
    # are unaffected). Excluding '@' means a username can never resemble an email,
    # which is what let a self-registered account impersonate a super-admin.
    if not _USERNAME_RE.match(uname):
        raise HTTPException(
            status_code=422,
            detail="Username may contain only letters, digits, and . _ - (max 64 chars).",
        )
    if not user.password:
        raise HTTPException(status_code=422, detail="Password is required.")

    account_type = "organization" if user.account_type == "organization" else "individual"
    email = (user.email or "").strip()

    # Reject reserved super-admin identifiers on BOTH username and email. Email is
    # unverified and username is user-controlled, so registering either as a
    # reserved address is refused to prevent founder-level account takeover.
    # Note: registration NEVER grants super-admin; that comes solely from the
    # is_super_admin column, resolved from SUPER_ADMIN_EMAILS at startup.
    try:
        from routes.admin import is_reserved_identifier
    except Exception:
        def is_reserved_identifier(*_a):
            return False
    if is_reserved_identifier(uname, email):
        raise HTTPException(status_code=400, detail="This identifier is reserved.")
    onboarding_flag = 0

    # Organization payload. We require the name up-front so org signups can't
    # silently degrade to individual accounts.
    org_name = (user.organization_name or "").strip()
    org_type = (user.organization_type or "other").strip().lower() or "other"
    org_domain = (user.organization_domain or "").strip()
    if account_type == "organization" and not org_name:
        raise HTTPException(status_code=400, detail="Organization name is required for organization signup.")

    # Hash before opening the DB connection so a hashing failure can't leak a
    # half-open transaction. hash_pw never raises in normal operation, but if it
    # ever does we surface it cleanly instead of as a generic 500.
    try:
        hashed = hash_pw(user.password)
    except Exception as e:
        print(f"[register] hash_pw raised: {e!r}")
        raise HTTPException(status_code=500, detail="Could not hash password. Please try again.")

    user_id = str(uuid.uuid4())
    display_name = (user.name or "").strip() or uname
    default_unlocks = json.dumps(["module_1"])

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM users WHERE username = ?", [uname])
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Username already taken")

        cursor.execute(
            "INSERT INTO users (id, username, password_hash, name, email, created_at, points, "
            "unlocked_modules, preferred_language, onboarding_completed, account_type) "
            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 50, ?, 'en', ?, ?)",
            [user_id, uname, hashed, display_name, email, default_unlocks, onboarding_flag, account_type],
        )

        org_info = None
        if account_type == "organization":
            # Lazy schema bootstrap — init_db's nested call can lose to a SQLite
            # write lock on a fresh DB, so we re-run it on the active connection.
            try:
                from routes.organizations import _ensure_org_schema
                _ensure_org_schema(conn)
            except Exception as e:
                print(f"[register] _ensure_org_schema failed: {e!r}")
            org_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO organizations (id, name, type, domain) VALUES (?, ?, ?, ?)",
                [org_id, org_name, org_type, org_domain],
            )
            cursor.execute(
                "INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'super_admin')",
                [org_id, user_id],
            )
            org_info = {
                "id": org_id, "org_id": org_id,
                "name": org_name, "org_name": org_name,
                "type": org_type, "org_type": org_type,
                "domain": org_domain,
                "role": "super_admin",
            }

        conn.commit()

        # Telemetry: first login = signup (background geo, fail-silent).
        record_login(user_id, request)

        # Consume a super-admin-approved student-access request for this email
        # (support flow): grants the 90-day student plan. Fail-silent.
        try:
            from routes.support import apply_approved_access_grant
            apply_approved_access_grant(user_id, email)
        except Exception as e:
            print(f"[register] access-grant check failed: {e!r}")

        return {
            "id": user_id,
            "username": uname,
            "name": display_name,
            "email": email,
            "points": 50,
            "unlocked": ["module_1"],
            "onboarding_completed": bool(onboarding_flag),
            "account_type": account_type,
            "organization": org_info,
            "org": org_info,
            "token": create_access_token(user_id, uname, 0),
        }
    except HTTPException:
        conn.rollback()
        raise
    except sqlite3.IntegrityError as e:
        conn.rollback()
        print(f"[register] integrity error: {e!r}")
        raise HTTPException(status_code=409, detail="Username already taken.")
    except Exception as e:
        conn.rollback()
        print(f"[register] unexpected error: {e!r}")
        raise HTTPException(status_code=500, detail="Registration failed; please try again.")
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(user: UserLogin, request: Request = None):
    # `request` optional for direct unit-test calls; FastAPI injects it on HTTP.
    print(f"Login request for: {user.username}")
    _enforce_ip_limit(_login_ip_limiter, request, "login attempts")
    uname = user.username or ""
    # Per-username lockout: refuse (even a correct password) while the username has
    # too many recent failures. retry_after > 0 only once the window is full.
    _locked_wait = _login_fail_limiter.retry_after(uname)
    if _locked_wait > 0:
        raise HTTPException(status_code=429,
                            detail=f"Too many failed logins for this account. Try again in {_locked_wait}s.",
                            headers={"Retry-After": str(_locked_wait)})
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        # Fetch by username, then verify (supports bcrypt + legacy sha256).
        cursor.execute(
            "SELECT id, name, points, unlocked_modules, onboarding_completed, account_type, password_hash, email FROM users WHERE username = ?",
            [user.username]
        )
        record = cursor.fetchone()

        if not record or not verify_pw(user.password, record[6]):
            _login_fail_limiter.allow(uname)  # record the failure toward lockout
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Successful auth: clear this username's failed-login counter.
        _login_fail_limiter.reset(uname)

        # Transparent upgrade: re-hash legacy (non-bcrypt) passwords with bcrypt on login.
        if record[6] and not str(record[6]).startswith("$2"):
            try:
                cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash_pw(user.password), record[0]])
                conn.commit()
            except Exception:
                pass

        # Blocked users cannot sign in (super admin can suspend access).
        blocked_row = cursor.execute("SELECT COALESCE(is_blocked,0) FROM users WHERE id = ?", [record[0]]).fetchone()
        if blocked_row and blocked_row[0]:
            raise HTTPException(status_code=403, detail="Your access has been suspended. Please contact your administrator.")

        # Check org membership
        org_row = cursor.execute("""
            SELECT o.id, o.name, o.type, om.role, om.department
            FROM org_members om JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = ?
            LIMIT 1
        """, [record[0]]).fetchone()

        org_info = None
        if org_row:
            org_info = {
                "id": org_row[0], "org_id": org_row[0],
                "name": org_row[1], "org_name": org_row[1],
                "type": org_row[2], "org_type": org_row[2],
                "role": org_row[3],
                "department": org_row[4] or ""
            }

        unlocks = json.loads(record[3]) if record[3] else ["module_1"]

        # Telemetry: login event + coarse geo (background thread, fail-silent).
        record_login(record[0], request)

        return {
            "id": record[0],
            "name": record[1],
            "username": user.username,
            # `email` was returned by /api/auth/register but omitted here, so the
            # stored session (pm_user) had no usable email after a normal login —
            # e.g. the Razorpay checkout prefill on /dashboard/upgrade came up
            # empty. Additive optional field; register already returns it.
            "email": record[7] or "",
            "points": record[2] or 0,
            "unlocked": unlocks,
            "onboarding_completed": bool(record[4]),
            "account_type": record[5] or "individual",
            "token": create_access_token(record[0], user.username, _current_token_version(record[0])),
            "org": org_info
        }
    finally:
        conn.close()

@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, caller: str = Depends(get_current_user_id)):
    """Change the AUTHENTICATED user's password (identity from the JWT, not the body)."""
    if not req.new_password or len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        row = cursor.execute("SELECT password_hash, username FROM users WHERE id = ?", [caller]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not verify_pw(req.current_password, row[0]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        # Revoke all outstanding sessions on password change: like reset-password
        # (see below), changing the password must stop any previously-issued JWT
        # (including a stolen one) from validating. Bump token_version — the same
        # revocation primitive admin revoke_sessions/block_user/reset_password use.
        # Unlike reset, the caller IS authenticated here, so we mint and return a
        # fresh token (additive optional response field) that the frontend stores;
        # the caller's own session continues seamlessly while every other session
        # of this account is signed out on its next request.
        cursor.execute(
            "UPDATE users SET password_hash = ?, token_version = COALESCE(token_version,0)+1 WHERE id = ?",
            [hash_pw(req.new_password), caller],
        )
        conn.commit()
        new_tv = cursor.execute(
            "SELECT COALESCE(token_version,0) FROM users WHERE id = ?", [caller]
        ).fetchone()[0]
        return {"ok": True, "token": create_access_token(caller, row[1], new_tv)}
    finally:
        conn.close()

@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest, request: Request = None):
    """Email a password-reset link. Always returns ok (doesn't leak account existence)."""
    _enforce_ip_limit(_forgot_ip_limiter, request, "password-reset requests")
    import secrets as _secrets
    from datetime import datetime, timedelta
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        ident = (req.identifier or "").strip()
        row = cursor.execute(
            "SELECT id, name, username, email FROM users WHERE username = ? OR email = ?",
            [ident, ident],
        ).fetchone()
        if row:
            token = _secrets.token_urlsafe(32)
            now = datetime.utcnow()
            cursor.execute(
                "INSERT INTO password_resets (token, user_id, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
                [token, row[0], now.isoformat(), (now + timedelta(hours=1)).isoformat()],
            )
            conn.commit()
            to_email = (row[3] or "").strip() or (row[2] if "@" in (row[2] or "") else "")
            if to_email:
                try:
                    from notifications.email_sender import send_email, build_reset_email, APP_BASE_URL
                    link = f"{APP_BASE_URL}/reset-password/{token}"
                    text, html = build_reset_email(row[1], link)
                    import threading
                    threading.Thread(target=send_email, args=(to_email, "Reset your PyMasters password", text, html), daemon=True).start()
                except Exception as e:
                    print(f"[forgot-password] email error: {e}")
    finally:
        conn.close()
    return {"ok": True, "message": "If an account exists for that username/email, a reset link has been sent."}

@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    """Complete a password reset using a valid, unexpired token."""
    if not req.new_password or len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    from datetime import datetime
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        row = cursor.execute(
            "SELECT user_id, expires_at, used FROM password_resets WHERE token = ?", [req.token]
        ).fetchone()
        if not row or row[2]:
            raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used.")
        if row[1] and datetime.fromisoformat(row[1]) < datetime.utcnow():
            raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")
        # Revoke all outstanding sessions on password reset: a reset is a security-recovery
        # action (lost/compromised account), so any previously-issued JWT (including a stolen
        # one) must stop validating. Bumping token_version reuses the same revocation primitive
        # as admin revoke_sessions/block_user. Safe here because reset is UNAUTHENTICATED: the
        # user re-authenticates via /login afterward (ResetPassword.jsx redirects to /login and
        # login() re-reads token_version), so no legitimate in-flight session is disrupted.
        cursor.execute(
            "UPDATE users SET password_hash = ?, token_version = COALESCE(token_version,0) + 1 WHERE id = ?",
            [hash_pw(req.new_password), row[0]],
        )
        cursor.execute("UPDATE password_resets SET used = 1 WHERE token = ?", [req.token])
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.get("/api/content/modules")
def get_modules():
    """Return all available modules (lightweight metadata)."""
    return [
        {
            "id": k, 
            "title": v["title"], 
            "desc": v["description"], 
            "reward": v["xp_reward"]
        } 
        for k, v in CONTENT_MAP.items()
    ]

@app.get("/api/content/module/{module_id}")
def get_module_detail(module_id: str):
    """Return full content and quiz for a module."""
    if module_id not in CONTENT_MAP:
        raise HTTPException(status_code=404, detail="Module not found")
    return CONTENT_MAP[module_id]

@app.post("/api/content/complete")
def complete_module(sub: QuizSubmission, caller: str = Depends(get_current_user_id)):
    """Update user points and unlock next module. XP awarded only once per module.

    IDOR guard: this endpoint WRITES XP, module unlocks and streaks for the
    body-supplied user_id, so the acting user must be derived from the verified
    JWT (auth.py convention) — otherwise any anonymous caller could inflate any
    user's XP / fabricate streaks. Mirrors routes/classroom.py::evaluate.
    str-normalized compare: users.id is INTEGER for legacy accounts.
    """
    if str(sub.user_id) != str(caller):
        raise HTTPException(status_code=403, detail="Forbidden")
    if sub.module_id not in CONTENT_MAP:
        raise HTTPException(status_code=404, detail="Module not found")

    module = CONTENT_MAP[sub.module_id]

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        # Get current state
        cursor.execute("SELECT points, unlocked_modules FROM users WHERE id = ?", [sub.user_id])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        current_points = row[0] or 0
        current_unlocks = json.loads(row[1]) if row[1] else []

        # Check if already completed — only award XP once per module
        existing = cursor.execute(
            "SELECT 1 FROM lesson_completions WHERE user_id = ? AND lesson_id = ?",
            [sub.user_id, sub.module_id],
        ).fetchone()

        xp_earned = 0
        if not existing:
            xp_earned = module["xp_reward"]
            current_points += xp_earned
            cursor.execute(
                "INSERT INTO lesson_completions (user_id, lesson_id, xp_awarded) VALUES (?, ?, ?)",
                [sub.user_id, sub.module_id, xp_earned],
            )
            cursor.execute(
                "UPDATE users SET points = ? WHERE id = ?",
                [current_points, sub.user_id],
            )

        # Unlock next module regardless of XP (retake should still unlock)
        updates = []
        next_mod = module["next_unlock"]
        if next_mod and next_mod not in current_unlocks:
            current_unlocks.append(next_mod)
            updates.append(f"Unlocked {CONTENT_MAP[next_mod]['title']}")
            cursor.execute(
                "UPDATE users SET unlocked_modules = ? WHERE id = ?",
                [json.dumps(current_unlocks), sub.user_id],
            )

        # Record daily learning activity so streaks actually accrue. Completing
        # (or retaking) a module is a learning activity, so touch the streak
        # regardless of whether XP was awarded this time. Never disrupts the
        # completion flow: touch_streak swallows its own errors and returns None.
        from streaks import touch_streak
        touch_streak(conn, sub.user_id)

        conn.commit()

        return {
            "success": True,
            "new_points": current_points,
            "xp_earned": xp_earned,
            "unlocked": current_unlocks,
            "already_completed": existing is not None,
            "message": "Module Completed!" if not existing else "Module already completed — no XP awarded.",
        }
    finally:
        conn.close()

@app.get("/api/content/completions/{user_id}")
def get_completions(user_id: str, caller: str = Depends(get_current_user_id)):
    """Return all completed lesson/module IDs for a user.

    IDOR guard: completion history is private per-user learning data; derive
    the acting user from the verified JWT and refuse cross-user reads (403).
    """
    if str(user_id) != str(caller):
        raise HTTPException(status_code=403, detail="Forbidden")
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT lesson_id, completed_at, xp_awarded FROM lesson_completions WHERE user_id = ? ORDER BY completed_at DESC",
            [user_id],
        ).fetchall()
    finally:
        conn.close()

    return {
        "completions": [
            {"lesson_id": r[0], "completed_at": r[1], "xp_awarded": r[2]}
            for r in rows
        ]
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
