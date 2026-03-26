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

        cursor.execute(
            "INSERT INTO users (id, username, password_hash, name, created_at, points, unlocked_modules, preferred_language, onboarding_completed) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?, 'en', 0)",
            [user_id, user.username, hashed, user.name, default_unlocks]
        )
        conn.commit()
        return {"id": user_id, "username": user.username, "name": user.name, "points": 0, "unlocked": ["module_1"], "onboarding_completed": False}
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
            "SELECT id, name, points, unlocked_modules, onboarding_completed FROM users WHERE username = ? AND password_hash = ?",
            [user.username, hashed]
        )
        record = cursor.fetchone()

        if not record:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        unlocks = json.loads(record[3]) if record[3] else ["module_1"]
        return {
            "id": record[0],
            "name": record[1],
            "username": user.username,
            "points": record[2] or 0,
            "unlocked": unlocks,
            "onboarding_completed": bool(record[4]),
            "token": f"mock-jwt-{record[0]}"
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
    """Update user points and unlock next module."""
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

        # Calculate new state
        new_points = current_points + module["xp_reward"]

        updates = []
        next_mod = module["next_unlock"]
        if next_mod and next_mod not in current_unlocks:
            current_unlocks.append(next_mod)
            updates.append(f"Unlocked {CONTENT_MAP[next_mod]['title']}")

        # Commit
        cursor.execute(
            "UPDATE users SET points = ?, unlocked_modules = ? WHERE id = ?",
            [new_points, json.dumps(current_unlocks), sub.user_id]
        )
        conn.commit()

        return {
            "success": True,
            "new_points": new_points,
            "unlocked": current_unlocks,
            "message": "Module Completed!"
        }
    finally:
        conn.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
