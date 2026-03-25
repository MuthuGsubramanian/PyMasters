from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import duckdb
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
DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.duckdb"))

# --- Route imports ---
from routes.language import router as language_router
from routes.profile import router as profile_router
from routes.classroom import router as classroom_router

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
    conn = duckdb.connect(DB_PATH)
    try:
        # Schema Migration: Add gamification columns if they don't exist
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR PRIMARY KEY,
                username VARCHAR UNIQUE,
                password_hash VARCHAR,
                name VARCHAR,
                created_at TIMESTAMP
            )
        """)

        # Check/Add extra columns manually since DuckDB ALTER TABLE IF NOT EXISTS is tricky
        columns = conn.execute("DESCRIBE users").fetchall()
        col_names = [c[0] for c in columns]

        if 'points' not in col_names:
            print("Migrating DB: Adding points column")
            conn.execute("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0")

        if 'unlocked_modules' not in col_names:
            print("Migrating DB: Adding unlocked_modules column")
            conn.execute("ALTER TABLE users ADD COLUMN unlocked_modules VARCHAR DEFAULT '[\"module_1\"]'")

        if 'preferred_language' not in col_names:
            print("Migrating DB: Adding preferred_language column")
            conn.execute("ALTER TABLE users ADD COLUMN preferred_language VARCHAR DEFAULT 'en'")

        if 'onboarding_completed' not in col_names:
            print("Migrating DB: Adding onboarding_completed column")
            conn.execute("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT false")

        # Create user_profiles table
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

        # Create learning_signals table
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

        # Create user_mastery table
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

        # Create a test user if empty
        existing = conn.execute("SELECT count(*) FROM users").fetchone()[0]
        if existing == 0:
            print("Seeding default admin user...")
            hashed = hash_pw("admin123")
            conn.execute(
                "INSERT INTO users (id, username, password_hash, name, created_at, points, unlocked_modules, preferred_language, onboarding_completed) VALUES (?, ?, ?, ?, current_timestamp, 0, ?, ?, ?)",
                [str(uuid.uuid4()), "admin", hashed, "Administrator", json.dumps(["module_1"]), "en", False]
            )

    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        conn.close()

# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="PyMasters API", lifespan=lifespan)

# Mount routers
app.include_router(language_router)
app.include_router(profile_router)
app.include_router(classroom_router)

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
    conn = duckdb.connect(DB_PATH)
    try:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", [user.username]).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        
        user_id = str(uuid.uuid4())
        hashed = hash_pw(user.password)
        # Initialize with module_1 unlocked
        default_unlocks = json.dumps(["module_1"])
        
        conn.execute("INSERT INTO users VALUES (?, ?, ?, ?, current_timestamp, 0, ?)", 
                     [user_id, user.username, hashed, user.name, default_unlocks])
        return {"id": user_id, "username": user.username, "name": user.name, "points": 0, "unlocked": ["module_1"]}
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(user: UserLogin):
    print(f"Login request for: {user.username}")
    conn = duckdb.connect(DB_PATH)
    try:
        hashed = hash_pw(user.password)
        # Fetch basic info + points + unlocks
        record = conn.execute(
            "SELECT id, name, points, unlocked_modules FROM users WHERE username = ? AND password_hash = ?", 
            [user.username, hashed]
        ).fetchone()
        
        if not record:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        unlocks = json.loads(record[3]) if record[3] else ["module_1"]
        return {
            "id": record[0], 
            "name": record[1], 
            "username": user.username, 
            "points": record[2] or 0,
            "unlocked": unlocks,
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
    
    conn = duckdb.connect(DB_PATH)
    try:
        # Get current state
        row = conn.execute("SELECT points, unlocked_modules FROM users WHERE id = ?", [sub.user_id]).fetchone()
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
        conn.execute(
            "UPDATE users SET points = ?, unlocked_modules = ? WHERE id = ?", 
            [new_points, json.dumps(current_unlocks), sub.user_id]
        )
        
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
