from fastapi import FastAPI, HTTPException, Depends, status
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
import json
import requests
from dotenv import load_dotenv
load_dotenv()
DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

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

        # Create a test user if empty
        cursor.execute("SELECT count(*) FROM users")
        existing = cursor.fetchone()[0]
        if existing == 0:
            print("Seeding default admin user...")
            hashed = hash_pw("admin123")
            cursor.execute(
                "INSERT INTO users (id, username, password_hash, name, created_at, points, unlocked_modules, preferred_language, onboarding_completed) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, ?, ?)",
                [str(uuid.uuid4()), "admin", hashed, "Administrator", json.dumps(["module_1"]), "en", 0]
            )

        # Seed knowledge graph concepts
        try:
            from graph.concepts import seed_concepts
            seed_concepts(DB_PATH)
        except Exception as e:
            print(f"Graph seed: {e}")

        # Seed learning paths
        try:
            from paths.definitions import seed_paths
            seed_paths(DB_PATH)
        except Exception as e:
            print(f"Paths seed: {e}")

        conn.commit()

    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        conn.close()

# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    t = threading.Thread(target=init_db, daemon=True)
    t.start()
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

# --- CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://www.pymasters.net",
    "https://pymasters.net",
    "http://localhost:80",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class UserRegister(BaseModel):
    username: str
    password: str
    name: Optional[str] = "Learner"
    account_type: Optional[str] = "individual"

class UserLogin(BaseModel):
    username: str
    password: str

class QuizSubmission(BaseModel):
    user_id: str
    module_id: str
    score: int # percentage or raw score 

# --- Helper: Auth ---
import hashlib

def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# --- Routes ---

@app.get("/")
def read_root():
    return {"status": "online", "message": "PyMasters Backend is running"}

@app.post("/api/auth/register")
def register(user: UserRegister):
    print(f"Register request for: {user.username}")
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", [user.username])
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")

        user_id = str(uuid.uuid4())
        hashed = hash_pw(user.password)
        # Initialize with module_1 unlocked
        default_unlocks = json.dumps(["module_1"])
        account_type = user.account_type if user.account_type in ("individual", "organization") else "individual"

        cursor.execute(
            "INSERT INTO users (id, username, password_hash, name, created_at, points, unlocked_modules, preferred_language, onboarding_completed, account_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 50, ?, 'en', 0, ?)",
            [user_id, user.username, hashed, user.name, default_unlocks, account_type]
        )
        conn.commit()
        return {"id": user_id, "username": user.username, "name": user.name, "points": 50, "unlocked": ["module_1"], "onboarding_completed": False, "account_type": account_type}
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(user: UserLogin):
    print(f"Login request for: {user.username}")
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        hashed = hash_pw(user.password)
        # Fetch basic info + points + unlocks + onboarding status
        cursor.execute(
            "SELECT id, name, points, unlocked_modules, onboarding_completed, account_type FROM users WHERE username = ? AND password_hash = ?",
            [user.username, hashed]
        )
        record = cursor.fetchone()

        if not record:
            raise HTTPException(status_code=401, detail="Invalid credentials")

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
        return {
            "id": record[0],
            "name": record[1],
            "username": user.username,
            "points": record[2] or 0,
            "unlocked": unlocks,
            "onboarding_completed": bool(record[4]),
            "account_type": record[5] or "individual",
            "token": f"mock-jwt-{record[0]}",
            "org": org_info
        }
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
def complete_module(sub: QuizSubmission):
    """Update user points and unlock next module. XP awarded only once per module."""
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
def get_completions(user_id: str):
    """Return all completed lesson/module IDs for a user."""
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
