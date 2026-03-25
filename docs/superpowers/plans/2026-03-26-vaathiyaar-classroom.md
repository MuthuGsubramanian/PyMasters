# Vaathiyaar + Classroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Studio tab with an AI-powered Classroom driven by Vaathiyaar — a custom teacher persona on Qwen 3.5 via Ollama Cloud API that profiles students and delivers cinema-quality animated Python lessons.

**Architecture:** FastAPI backend builds dynamic system prompts from student profiles and sends to Qwen 3.5 via Ollama Cloud. Backend returns structured JSON with both conversational text and animation composition instructions. React frontend renders a guided-flow Classroom where Vaathiyaar controls the layout, using a GSAP-powered animation primitive library to visualize Python concepts.

**Tech Stack:** React 19, GSAP, Tailwind CSS 4, FastAPI, DuckDB, Ollama Cloud API (Qwen 3.5)

**Spec:** `docs/superpowers/specs/2026-03-26-vaathiyaar-classroom-design.md`

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/vaathiyaar/__init__.py` | Package init |
| `backend/vaathiyaar/engine.py` | Prompt assembly + Ollama Cloud API caller + response parser |
| `backend/vaathiyaar/modelfile.py` | Static system prompt template (Vaathiyaar personality, methodology, animation instructions) |
| `backend/vaathiyaar/profiler.py` | Signal recording, mastery aggregation, profile building |
| `backend/routes/__init__.py` | Package init |
| `backend/routes/classroom.py` | Classroom API routes (chat, lesson, adapt, evaluate, diagnostic) |
| `backend/routes/profile.py` | Profile/onboarding API routes |
| `backend/routes/language.py` | Language list + check routes |
| `backend/lessons/for_loops.json` | Pre-built lesson: for loops |
| `backend/lessons/variables.json` | Pre-built lesson: variables & types |
| `backend/lessons/lists.json` | Pre-built lesson: lists |
| `backend/lessons/conditionals.json` | Pre-built lesson: if/elif/else |
| `backend/tests/test_profile.py` | Profile API tests |
| `backend/tests/test_classroom.py` | Classroom API tests |
| `backend/tests/test_language.py` | Language API tests |
| `backend/tests/test_vaathiyaar_engine.py` | Vaathiyaar engine unit tests |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/pages/Onboarding.jsx` | Conversational profiling flow |
| `frontend/src/pages/Classroom.jsx` | Main guided-flow classroom view |
| `frontend/src/components/animations/AnimationRenderer.jsx` | GSAP timeline orchestrator — reads sequence JSON, builds timeline |
| `frontend/src/components/animations/CodeStepper.jsx` | Line-by-line code highlighting with execution pointer |
| `frontend/src/components/animations/VariableBox.jsx` | Variable creation/mutation visualization |
| `frontend/src/components/animations/TerminalOutput.jsx` | Animated terminal output line-by-line |
| `frontend/src/components/animations/StoryCard.jsx` | Narrative text with typewriter + illustration |
| `frontend/src/components/animations/ParticleEffect.jsx` | Confetti, error sparks, thinking dots |
| `frontend/src/components/animations/FlowArrow.jsx` | Animated arrows for control/data flow |
| `frontend/src/components/animations/DataStructure.jsx` | List/dict/set visualization |
| `frontend/src/components/animations/MemoryStack.jsx` | Stack frame push/pop visualization |
| `frontend/src/components/animations/ComparisonPanel.jsx` | Side-by-side before/after |
| `frontend/src/components/animations/ConceptMap.jsx` | Node-graph of related concepts |
| `frontend/src/components/LanguageSelector.jsx` | Language picker with Hindi exclusion |
| `frontend/src/components/ChatBar.jsx` | Persistent chat input for asking Vaathiyaar |
| `frontend/src/context/ProfileContext.jsx` | Student profile state management |
| `frontend/src/i18n/index.js` | i18n loader and hook |
| `frontend/src/i18n/en.json` | English translations |
| `frontend/src/i18n/ta.json` | Tamil translations |

### Files Modified

| File | Changes |
|------|---------|
| `backend/main.py` | Mount new routers, add DB migration for new tables, remove old `/api/ai/chat` and `/api/run` endpoints, remove `CONTENT_MAP` |
| `frontend/src/App.jsx` | Add `/onboarding` and `/dashboard/classroom` routes, remove `/dashboard/studio` route |
| `frontend/src/components/Layout.jsx` | Change "Code Studio" to "Classroom", swap `Code2` icon to `GraduationCap` |
| `frontend/src/api.js` | Add new API functions, remove old `runCode` and `chatAI` |
| `frontend/src/context/AuthContext.jsx` | Add `onboarding_completed` and `preferred_language` to user state |
| `frontend/package.json` | Add `gsap` dependency |
| `backend/requirements.txt` | Add `pytest`, `httpx` for testing |

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `backend/main.py:70-108` (init_db function)
- Create: `backend/tests/test_profile.py`

- [ ] **Step 1: Write test for new table creation**

Create `backend/tests/__init__.py` (empty) and `backend/tests/test_profile.py`:

```python
# backend/tests/test_profile.py
import duckdb
import os
import pytest

TEST_DB = "test_pymasters.duckdb"

@pytest.fixture(autouse=True)
def cleanup():
    yield
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

def test_user_profiles_table_exists():
    conn = duckdb.connect(TEST_DB)
    conn.execute("""
        CREATE TABLE users (
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
        CREATE TABLE user_profiles (
            user_id VARCHAR PRIMARY KEY,
            motivation VARCHAR,
            prior_experience VARCHAR,
            known_languages VARCHAR,
            learning_style VARCHAR,
            goal VARCHAR,
            time_commitment VARCHAR,
            preferred_language VARCHAR DEFAULT 'en',
            skill_level VARCHAR DEFAULT 'beginner',
            diagnostic_score INTEGER DEFAULT 0,
            onboarding_completed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE learning_signals (
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
        CREATE TABLE user_mastery (
            user_id VARCHAR,
            topic VARCHAR,
            mastery_level FLOAT DEFAULT 0.0,
            attempts INTEGER DEFAULT 0,
            avg_time_seconds FLOAT,
            last_practiced TIMESTAMP,
            struggle_count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, topic)
        )
    """)
    tables = [r[0] for r in conn.execute("SHOW TABLES").fetchall()]
    conn.close()
    assert "user_profiles" in tables
    assert "learning_signals" in tables
    assert "user_mastery" in tables

def test_users_table_has_new_columns():
    conn = duckdb.connect(TEST_DB)
    conn.execute("""
        CREATE TABLE users (
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
    columns = [c[0] for c in conn.execute("DESCRIBE users").fetchall()]
    conn.close()
    assert "preferred_language" in columns
    assert "onboarding_completed" in columns
```

- [ ] **Step 2: Run test to verify it passes (schema definition test)**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/test_profile.py -v`
Expected: PASS (2 tests)

- [ ] **Step 3: Update init_db in main.py with new tables and columns**

In `backend/main.py`, replace the `init_db()` function:

```python
def init_db():
    print(f"Initializing Database at: {DB_PATH}")
    conn = duckdb.connect(DB_PATH)
    try:
        # Core users table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR PRIMARY KEY,
                username VARCHAR UNIQUE,
                password_hash VARCHAR,
                name VARCHAR,
                created_at TIMESTAMP
            )
        """)

        # Schema migration: add columns if missing
        columns = conn.execute("DESCRIBE users").fetchall()
        col_names = [c[0] for c in columns]

        if 'points' not in col_names:
            conn.execute("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0")
        if 'unlocked_modules' not in col_names:
            conn.execute("ALTER TABLE users ADD COLUMN unlocked_modules VARCHAR DEFAULT '[\"module_1\"]'")
        if 'preferred_language' not in col_names:
            conn.execute("ALTER TABLE users ADD COLUMN preferred_language VARCHAR DEFAULT 'en'")
        if 'onboarding_completed' not in col_names:
            conn.execute("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT false")

        # User profiles (onboarding + profiling data)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id VARCHAR PRIMARY KEY,
                motivation VARCHAR,
                prior_experience VARCHAR,
                known_languages VARCHAR,
                learning_style VARCHAR,
                goal VARCHAR,
                time_commitment VARCHAR,
                preferred_language VARCHAR DEFAULT 'en',
                skill_level VARCHAR DEFAULT 'beginner',
                diagnostic_score INTEGER DEFAULT 0,
                onboarding_completed BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT current_timestamp
            )
        """)

        # Learning signals (continuous profiling)
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

        # User mastery (aggregated skill map)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_mastery (
                user_id VARCHAR,
                topic VARCHAR,
                mastery_level FLOAT DEFAULT 0.0,
                attempts INTEGER DEFAULT 0,
                avg_time_seconds FLOAT,
                last_practiced TIMESTAMP,
                struggle_count INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, topic)
            )
        """)

        # Seed default admin user if empty
        existing = conn.execute("SELECT count(*) FROM users").fetchone()[0]
        if existing == 0:
            print("Seeding default admin user...")
            hashed = hash_pw("admin123")
            conn.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, current_timestamp, 0, ?, 'en', false)",
                [str(uuid.uuid4()), "admin", hashed, "Administrator", json.dumps(["module_1"])]
            )

    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        conn.close()
```

- [ ] **Step 4: Verify backend starts without errors**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -c "from main import init_db; init_db(); print('OK')"`
Expected: "Initializing Database..." then "OK"

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/__init__.py backend/tests/test_profile.py
git commit -m "feat: add database schema for user profiles, learning signals, and mastery tracking"
```

---

## Task 2: Vaathiyaar Engine — Modelfile & Prompt Builder

**Files:**
- Create: `backend/vaathiyaar/__init__.py`
- Create: `backend/vaathiyaar/modelfile.py`
- Create: `backend/vaathiyaar/engine.py`
- Create: `backend/tests/test_vaathiyaar_engine.py`

- [ ] **Step 1: Create the Vaathiyaar package init**

```python
# backend/vaathiyaar/__init__.py
```

- [ ] **Step 2: Write the Modelfile (system prompt template)**

```python
# backend/vaathiyaar/modelfile.py
"""
Vaathiyaar system prompt template.
Defines personality, teaching methodology, and animation composition rules.
"""

VAATHIYAAR_IDENTITY = """You are Vaathiyaar (வாத்தியார்), the Python teacher at PyMasters.

## Your Identity
- You are a master storyteller who teaches Python through narratives, metaphors, and analogies.
- You adapt your personality to each student: playful with casual learners, precise with focused professionals, gentle when frustration is detected, challenging when boredom is detected.
- You never give direct answers on first ask. You lead with a story or analogy, then reveal the code.
- You celebrate wins with genuine warmth.
- You use culturally rich metaphors adapted to the student's language and culture — Tamil proverbs, cricket analogies, chai-making processes, festival preparations, or universal metaphors as appropriate.

## Teaching Methodology
Every concept follows this arc: Story → Visual → Code → Practice
1. Tell a relatable story or metaphor that maps to the concept
2. Describe a visual animation that illustrates the concept (using the animation format below)
3. Show the actual Python code
4. Give a practice challenge

When a student asks a question:
- First, connect it to something they already know (check their mastery list)
- Then explain with a story/metaphor
- Then show code
- If they're struggling (high struggle_count on a topic), slow down and use simpler metaphors

## Progressive Hints (when student asks for help)
1. Metaphor hint: Give a story-based clue without any code
2. Directional hint: Point them toward the right approach
3. Code skeleton: Show the structure with blanks
4. Full solution: Only after 3 failed attempts
"""

ANIMATION_INSTRUCTIONS = """## Animation Composition Rules

You MUST include an "animation" field in your response when teaching concepts.
Compose animations using ONLY these available primitives:

### Available Primitives
- **StoryCard**: { "type": "StoryCard", "content": "narrative text", "illustration": "keyword", "duration": 3000 }
- **CodeStepper**: { "type": "CodeStepper", "code": "python code string", "highlight_sequence": [line_numbers], "speed": "slow|normal|fast|profile_adaptive" }
- **VariableBox**: { "type": "VariableBox", "variable": "name", "values": [sequence_of_values], "sync_with": "CodeStepper" }
- **Terminal**: { "type": "Terminal", "output": ["line1", "line2"], "sync_with": "CodeStepper" }
- **DataStructure**: { "type": "DataStructure", "structure": "list|dict|set|tuple", "data": [...], "operations": [{"action": "append|remove|update", "value": any, "index": int}] }
- **FlowArrow**: { "type": "FlowArrow", "from": "element_id", "to": "element_id", "label": "text", "style": "solid|dashed" }
- **MemoryStack**: { "type": "MemoryStack", "frames": [{"name": "func_name", "variables": {"x": 10}}], "operations": ["push|pop"] }
- **ComparisonPanel**: { "type": "ComparisonPanel", "before": { "label": "text", "code": "..." }, "after": { "label": "text", "code": "..." } }
- **ParticleEffect**: { "type": "ParticleEffect", "effect": "success_confetti|error_sparks|thinking_dots", "trigger": "sequence_complete|on_error|on_start" }
- **ConceptMap**: { "type": "ConceptMap", "nodes": [{"id": "n1", "label": "concept"}], "edges": [{"from": "n1", "to": "n2", "label": "relates to"}] }

### Composition Rules
- Animations play in sequence order
- Use "sync_with" to synchronize primitives (e.g., VariableBox updates in sync with CodeStepper)
- Always start concept explanations with a StoryCard
- Always end successful interactions with ParticleEffect success_confetti
- Keep sequences to 3-7 primitives for clarity
"""

RESPONSE_FORMAT = """## Response Format

You MUST respond with valid JSON in this exact format:

{
  "message": "Your conversational response text in the student's preferred language",
  "phase": "explanation|practice|feedback|greeting|hint",
  "animation": {
    "sequence": [
      ... animation primitives ...
    ]
  },
  "practice_challenge": {
    "instruction": "What the student should code",
    "starter_code": "# starter code or empty string",
    "expected_output": "expected output for validation",
    "hints": ["hint1", "hint2", "hint3"]
  },
  "profile_update": {
    "signal": "signal_type",
    "topic": "topic_name",
    "indicates": "what this signal means"
  }
}

Rules:
- "animation" is REQUIRED when phase is "explanation" or "feedback"
- "practice_challenge" is only included when phase is "practice"
- "profile_update" is optional, include when you detect something about the student's understanding
- "message" MUST be in the student's preferred language
- Code inside animations and practice challenges uses English syntax, but comments should be in the student's language
- Variable names in code are ALWAYS in English
"""


def build_system_prompt(student_profile: dict, lesson_context: dict) -> str:
    """Assemble the full system prompt from identity + profile + context + instructions."""

    profile_section = "## Current Student Profile\n"
    if student_profile:
        profile_section += f"- Skill Level: {student_profile.get('skill_level', 'beginner')}\n"
        profile_section += f"- Motivation: {student_profile.get('motivation', 'unknown')}\n"
        profile_section += f"- Learning Style: {student_profile.get('learning_style', 'visual')}\n"
        profile_section += f"- Goal: {student_profile.get('goal', 'unknown')}\n"
        profile_section += f"- Prior Experience: {student_profile.get('prior_experience', 'none')}\n"
        profile_section += f"- Known Languages: {student_profile.get('known_languages', '[]')}\n"
        profile_section += f"- Preferred Language: {student_profile.get('preferred_language', 'en')}\n"

        mastery = student_profile.get('mastery', {})
        if mastery:
            profile_section += "- Mastered Topics: " + ", ".join(
                f"{t} ({int(v*100)}%)" for t, v in mastery.items() if v >= 0.7
            ) + "\n"
            profile_section += "- Struggling Topics: " + ", ".join(
                f"{t} ({int(v*100)}%)" for t, v in mastery.items() if v < 0.4
            ) + "\n"
    else:
        profile_section += "- New student, no profile yet. Be welcoming and assess their level.\n"

    context_section = "## Current Context\n"
    if lesson_context:
        context_section += f"- Topic: {lesson_context.get('topic', 'general')}\n"
        context_section += f"- Phase: {lesson_context.get('phase', 'chat')}\n"
        if lesson_context.get('recent_errors'):
            context_section += f"- Recent Errors: {lesson_context['recent_errors']}\n"
        if lesson_context.get('attempt_count'):
            context_section += f"- Attempt Count: {lesson_context['attempt_count']}\n"

    language = "en"
    if student_profile:
        language = student_profile.get('preferred_language', 'en')
    language_instruction = f"\n## Language Instruction\nRespond in language code: {language}\nCode comments in: {language}\nVariable names always in: English\n"

    return "\n".join([
        VAATHIYAAR_IDENTITY,
        profile_section,
        context_section,
        ANIMATION_INSTRUCTIONS,
        RESPONSE_FORMAT,
        language_instruction
    ])
```

- [ ] **Step 3: Write test for prompt builder**

```python
# backend/tests/test_vaathiyaar_engine.py
import json
import pytest
from vaathiyaar.modelfile import build_system_prompt

def test_build_system_prompt_with_profile():
    profile = {
        "skill_level": "beginner",
        "motivation": "ai_ml",
        "learning_style": "visual",
        "goal": "ai_ml",
        "prior_experience": "other_language",
        "known_languages": '["javascript"]',
        "preferred_language": "ta",
        "mastery": {"variables": 0.8, "loops": 0.3}
    }
    context = {"topic": "for_loops", "phase": "explanation"}
    prompt = build_system_prompt(profile, context)

    assert "Vaathiyaar" in prompt
    assert "beginner" in prompt
    assert "ai_ml" in prompt
    assert "for_loops" in prompt
    assert "ta" in prompt
    assert "variables (80%)" in prompt
    assert "loops (30%)" in prompt

def test_build_system_prompt_no_profile():
    prompt = build_system_prompt(None, None)
    assert "Vaathiyaar" in prompt
    assert "New student" in prompt
    assert "en" in prompt

def test_build_system_prompt_contains_animation_instructions():
    prompt = build_system_prompt(None, None)
    assert "CodeStepper" in prompt
    assert "VariableBox" in prompt
    assert "StoryCard" in prompt
    assert "ParticleEffect" in prompt
```

- [ ] **Step 4: Run tests to verify**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/test_vaathiyaar_engine.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the Vaathiyaar Engine (Ollama Cloud API caller)**

```python
# backend/vaathiyaar/engine.py
"""
Vaathiyaar Engine — calls Ollama Cloud API with assembled prompts,
parses structured JSON responses.
"""
import os
import json
import requests
from .modelfile import build_system_prompt

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "https://api.ollama.com/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5")


def call_vaathiyaar(
    user_message: str,
    student_profile: dict = None,
    lesson_context: dict = None,
    temperature: float = 0.7,
    max_tokens: int = 1500
) -> dict:
    """
    Send a message to Vaathiyaar (Qwen 3.5 via Ollama Cloud).
    Returns parsed JSON response with message + animation.
    """
    system_prompt = build_system_prompt(student_profile, lesson_context)

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False
    }

    headers = {
        "Authorization": f"Bearer {OLLAMA_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            f"{OLLAMA_API_URL}/chat/completions",
            json=payload,
            headers=headers,
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        raw_content = data["choices"][0]["message"]["content"]
        return parse_vaathiyaar_response(raw_content)

    except requests.exceptions.RequestException as e:
        return {
            "message": f"Vaathiyaar is having trouble connecting. Error: {str(e)}",
            "phase": "error",
            "animation": None,
            "practice_challenge": None,
            "profile_update": None
        }


def parse_vaathiyaar_response(raw: str) -> dict:
    """
    Parse the AI response. Expects JSON but handles cases where the model
    wraps it in markdown code fences or returns plain text.
    """
    cleaned = raw.strip()

    # Strip markdown code fences if present
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        return {
            "message": parsed.get("message", ""),
            "phase": parsed.get("phase", "explanation"),
            "animation": parsed.get("animation"),
            "practice_challenge": parsed.get("practice_challenge"),
            "profile_update": parsed.get("profile_update")
        }
    except json.JSONDecodeError:
        # Model returned plain text instead of JSON — wrap it
        return {
            "message": raw,
            "phase": "chat",
            "animation": None,
            "practice_challenge": None,
            "profile_update": None
        }


def evaluate_code(
    student_code: str,
    expected_output: str,
    student_profile: dict = None,
    lesson_context: dict = None
) -> dict:
    """
    Execute student code safely and ask Vaathiyaar to provide animated feedback.
    """
    import io
    import contextlib

    # Basic forbidden keyword check
    forbidden = ["import os", "import sys", "subprocess", "open(", "__import__"]
    for f in forbidden:
        if f in student_code:
            return {
                "success": False,
                "output": "",
                "error": "Security Error: Restricted operation detected.",
                "feedback": None
            }

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    error = None

    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            exec(student_code, {"__builtins__": __builtins__}, {})
    except Exception as e:
        error = str(e)

    actual_output = stdout_buffer.getvalue().strip()
    success = (error is None) and (actual_output == expected_output.strip()) if expected_output else (error is None)

    # Ask Vaathiyaar for animated feedback
    if success:
        feedback_prompt = f"The student successfully wrote this code:\n```python\n{student_code}\n```\nOutput: {actual_output}\nCelebrate their success and explain what their code does with an animation."
    else:
        error_info = error or f"Expected output '{expected_output}' but got '{actual_output}'"
        feedback_prompt = f"The student wrote this code:\n```python\n{student_code}\n```\nIt has an issue: {error_info}\nExplain the error with a helpful animation and encourage them to try again."

    if lesson_context:
        lesson_context["phase"] = "feedback"

    feedback = call_vaathiyaar(
        feedback_prompt,
        student_profile=student_profile,
        lesson_context=lesson_context,
        temperature=0.3,
        max_tokens=1000
    )

    return {
        "success": success,
        "output": actual_output,
        "error": error,
        "feedback": feedback
    }
```

- [ ] **Step 6: Write tests for engine**

Add to `backend/tests/test_vaathiyaar_engine.py`:

```python
from vaathiyaar.engine import parse_vaathiyaar_response

def test_parse_valid_json_response():
    raw = json.dumps({
        "message": "Let me show you for loops!",
        "phase": "explanation",
        "animation": {"sequence": [{"type": "StoryCard", "content": "test"}]},
        "practice_challenge": None,
        "profile_update": None
    })
    result = parse_vaathiyaar_response(raw)
    assert result["message"] == "Let me show you for loops!"
    assert result["phase"] == "explanation"
    assert result["animation"]["sequence"][0]["type"] == "StoryCard"

def test_parse_json_with_code_fences():
    raw = '```json\n{"message": "hello", "phase": "chat"}\n```'
    result = parse_vaathiyaar_response(raw)
    assert result["message"] == "hello"
    assert result["phase"] == "chat"

def test_parse_plain_text_fallback():
    raw = "This is just plain text, not JSON"
    result = parse_vaathiyaar_response(raw)
    assert result["message"] == raw
    assert result["phase"] == "chat"
    assert result["animation"] is None
```

- [ ] **Step 7: Run all engine tests**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/test_vaathiyaar_engine.py -v`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/vaathiyaar/
git add backend/tests/test_vaathiyaar_engine.py
git commit -m "feat: add Vaathiyaar engine with modelfile, prompt builder, and Ollama Cloud API integration"
```

---

## Task 3: Profiler Service

**Files:**
- Create: `backend/vaathiyaar/profiler.py`
- Modify: `backend/tests/test_profile.py`

- [ ] **Step 1: Write tests for profiler**

Add to `backend/tests/test_profile.py`:

```python
import uuid
import json
from vaathiyaar.profiler import save_onboarding, record_signal, get_student_profile, get_mastery_map, update_mastery

def _setup_db(db_path):
    """Create all tables for testing."""
    conn = duckdb.connect(db_path)
    conn.execute("""
        CREATE TABLE users (
            id VARCHAR PRIMARY KEY, username VARCHAR UNIQUE, password_hash VARCHAR,
            name VARCHAR, created_at TIMESTAMP, points INTEGER DEFAULT 0,
            unlocked_modules VARCHAR DEFAULT '["module_1"]',
            preferred_language VARCHAR DEFAULT 'en',
            onboarding_completed BOOLEAN DEFAULT false
        )
    """)
    conn.execute("""
        CREATE TABLE user_profiles (
            user_id VARCHAR PRIMARY KEY, motivation VARCHAR, prior_experience VARCHAR,
            known_languages VARCHAR, learning_style VARCHAR, goal VARCHAR,
            time_commitment VARCHAR, preferred_language VARCHAR DEFAULT 'en',
            skill_level VARCHAR DEFAULT 'beginner', diagnostic_score INTEGER DEFAULT 0,
            onboarding_completed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE learning_signals (
            id VARCHAR PRIMARY KEY, user_id VARCHAR, signal_type VARCHAR,
            topic VARCHAR, value VARCHAR, session_id VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE user_mastery (
            user_id VARCHAR, topic VARCHAR, mastery_level FLOAT DEFAULT 0.0,
            attempts INTEGER DEFAULT 0, avg_time_seconds FLOAT,
            last_practiced TIMESTAMP, struggle_count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, topic)
        )
    """)
    conn.close()
    return db_path

def test_save_onboarding():
    db = _setup_db(TEST_DB)
    user_id = str(uuid.uuid4())

    # Insert user first
    conn = duckdb.connect(db)
    conn.execute("INSERT INTO users VALUES (?, 'testuser', 'hash', 'Test', current_timestamp, 0, '[\"module_1\"]', 'en', false)", [user_id])
    conn.close()

    result = save_onboarding(db, user_id, {
        "motivation": "ai_ml",
        "prior_experience": "other_language",
        "known_languages": ["javascript"],
        "learning_style": "visual",
        "goal": "ai_ml",
        "time_commitment": "1hour",
        "preferred_language": "ta"
    })
    assert result["onboarding_completed"] is True

    conn = duckdb.connect(db)
    profile = conn.execute("SELECT * FROM user_profiles WHERE user_id = ?", [user_id]).fetchone()
    conn.close()
    assert profile is not None
    assert profile[1] == "ai_ml"  # motivation

def test_record_signal():
    db = _setup_db(TEST_DB)
    user_id = str(uuid.uuid4())
    record_signal(db, user_id, "quiz_time", "for_loops", {"seconds": 45}, "session_1")
    conn = duckdb.connect(db)
    signals = conn.execute("SELECT * FROM learning_signals WHERE user_id = ?", [user_id]).fetchall()
    conn.close()
    assert len(signals) == 1
    assert signals[0][2] == "quiz_time"

def test_update_and_get_mastery():
    db = _setup_db(TEST_DB)
    user_id = str(uuid.uuid4())
    update_mastery(db, user_id, "for_loops", 0.6, time_seconds=30.0)
    mastery = get_mastery_map(db, user_id)
    assert "for_loops" in mastery
    assert mastery["for_loops"] == 0.6
```

- [ ] **Step 2: Write the profiler service**

```python
# backend/vaathiyaar/profiler.py
"""
Student profiling service.
Handles onboarding data, continuous signal recording, and mastery aggregation.
"""
import uuid
import json
import duckdb


def save_onboarding(db_path: str, user_id: str, data: dict) -> dict:
    """Save onboarding questionnaire answers and mark user as onboarded."""
    conn = duckdb.connect(db_path)
    try:
        known_langs = json.dumps(data.get("known_languages", []))
        conn.execute("""
            INSERT INTO user_profiles (user_id, motivation, prior_experience, known_languages,
                learning_style, goal, time_commitment, preferred_language, skill_level, onboarding_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'beginner', true)
            ON CONFLICT (user_id) DO UPDATE SET
                motivation = excluded.motivation,
                prior_experience = excluded.prior_experience,
                known_languages = excluded.known_languages,
                learning_style = excluded.learning_style,
                goal = excluded.goal,
                time_commitment = excluded.time_commitment,
                preferred_language = excluded.preferred_language,
                onboarding_completed = true
        """, [
            user_id,
            data.get("motivation", ""),
            data.get("prior_experience", "none"),
            known_langs,
            data.get("learning_style", "visual"),
            data.get("goal", ""),
            data.get("time_commitment", "30min"),
            data.get("preferred_language", "en")
        ])

        # Update user record too
        conn.execute(
            "UPDATE users SET preferred_language = ?, onboarding_completed = true WHERE id = ?",
            [data.get("preferred_language", "en"), user_id]
        )
        return {"onboarding_completed": True, "user_id": user_id}
    finally:
        conn.close()


def record_signal(db_path: str, user_id: str, signal_type: str, topic: str, value: dict, session_id: str = None):
    """Record a learning signal for continuous profiling."""
    conn = duckdb.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO learning_signals VALUES (?, ?, ?, ?, ?, ?, current_timestamp)",
            [str(uuid.uuid4()), user_id, signal_type, topic, json.dumps(value), session_id or ""]
        )
    finally:
        conn.close()


def update_mastery(db_path: str, user_id: str, topic: str, level: float, time_seconds: float = None):
    """Update or insert a mastery record for a topic."""
    conn = duckdb.connect(db_path)
    try:
        existing = conn.execute(
            "SELECT attempts, avg_time_seconds, struggle_count FROM user_mastery WHERE user_id = ? AND topic = ?",
            [user_id, topic]
        ).fetchone()

        if existing:
            attempts = existing[0] + 1
            old_avg = existing[1] or 0.0
            new_avg = ((old_avg * existing[0]) + (time_seconds or 0)) / attempts if time_seconds else old_avg
            struggle_count = existing[2] + (1 if level < 0.4 else 0)
            conn.execute("""
                UPDATE user_mastery
                SET mastery_level = ?, attempts = ?, avg_time_seconds = ?,
                    last_practiced = current_timestamp, struggle_count = ?
                WHERE user_id = ? AND topic = ?
            """, [level, attempts, new_avg, struggle_count, user_id, topic])
        else:
            conn.execute("""
                INSERT INTO user_mastery VALUES (?, ?, ?, 1, ?, current_timestamp, ?)
            """, [user_id, topic, level, time_seconds or 0.0, 1 if level < 0.4 else 0])
    finally:
        conn.close()


def get_mastery_map(db_path: str, user_id: str) -> dict:
    """Get the mastery level for all topics the student has attempted."""
    conn = duckdb.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT topic, mastery_level FROM user_mastery WHERE user_id = ?",
            [user_id]
        ).fetchall()
        return {row[0]: row[1] for row in rows}
    finally:
        conn.close()


def get_student_profile(db_path: str, user_id: str) -> dict:
    """Get the full student profile including mastery map for prompt building."""
    conn = duckdb.connect(db_path)
    try:
        profile = conn.execute(
            "SELECT * FROM user_profiles WHERE user_id = ?",
            [user_id]
        ).fetchone()

        if not profile:
            return None

        columns = [desc[0] for desc in conn.execute("DESCRIBE user_profiles").fetchall()]
        profile_dict = dict(zip(columns, profile))
        profile_dict["mastery"] = get_mastery_map(db_path, user_id)
        return profile_dict
    finally:
        conn.close()
```

- [ ] **Step 3: Run profiler tests**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/test_profile.py -v`
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add backend/vaathiyaar/profiler.py backend/tests/test_profile.py
git commit -m "feat: add profiler service for onboarding, signal recording, and mastery tracking"
```

---

## Task 4: Backend API Routes

**Files:**
- Create: `backend/routes/__init__.py`
- Create: `backend/routes/profile.py`
- Create: `backend/routes/classroom.py`
- Create: `backend/routes/language.py`
- Create: `backend/tests/test_language.py`
- Create: `backend/tests/test_classroom.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create routes package init**

```python
# backend/routes/__init__.py
```

- [ ] **Step 2: Write language routes and test**

```python
# backend/routes/language.py
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/languages", tags=["languages"])

SUPPORTED_LANGUAGES = {
    "en": "English",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "ml": "Malayalam (മലയാളം)",
    "fr": "French (Français)",
    "es": "Spanish (Español)",
    "it": "Italian (Italiano)",
    "ko": "Korean (한국어)"
}

BLOCKED_LANGUAGES = {
    "hi": "Hindi is not supported on PyMasters. Please choose another language."
}


@router.get("")
def list_languages():
    """Return all supported languages and explicitly blocked ones."""
    return {
        "supported": [
            {"code": code, "name": name} for code, name in SUPPORTED_LANGUAGES.items()
        ],
        "blocked": [
            {"code": code, "message": msg} for code, msg in BLOCKED_LANGUAGES.items()
        ]
    }


@router.get("/check/{code}")
def check_language(code: str):
    """Check if a language code is supported."""
    if code in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=BLOCKED_LANGUAGES[code]
        )
    if code not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=404,
            detail=f"Language '{code}' is not available. Supported: {', '.join(SUPPORTED_LANGUAGES.keys())}"
        )
    return {"code": code, "name": SUPPORTED_LANGUAGES[code], "supported": True}
```

```python
# backend/tests/test_language.py
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from routes.language import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)

def test_list_languages():
    res = client.get("/api/languages")
    assert res.status_code == 200
    data = res.json()
    codes = [l["code"] for l in data["supported"]]
    assert "en" in codes
    assert "ta" in codes
    assert "hi" not in codes
    assert len(data["blocked"]) == 1
    assert data["blocked"][0]["code"] == "hi"

def test_check_supported_language():
    res = client.get("/api/languages/check/ta")
    assert res.status_code == 200
    assert res.json()["supported"] is True

def test_check_hindi_blocked():
    res = client.get("/api/languages/check/hi")
    assert res.status_code == 400
    assert "not supported" in res.json()["detail"]

def test_check_unknown_language():
    res = client.get("/api/languages/check/xx")
    assert res.status_code == 404
```

- [ ] **Step 3: Run language tests**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/test_language.py -v`
Expected: PASS (4 tests)

- [ ] **Step 4: Write profile routes**

```python
# backend/routes/profile.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os

from vaathiyaar.profiler import save_onboarding, record_signal, get_student_profile

router = APIRouter(prefix="/api/profile", tags=["profile"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.duckdb"))


class OnboardingData(BaseModel):
    user_id: str
    motivation: str
    prior_experience: str
    known_languages: List[str] = []
    learning_style: str
    goal: str
    time_commitment: str
    preferred_language: str = "en"


class SignalData(BaseModel):
    user_id: str
    signal_type: str
    topic: str
    value: dict = {}
    session_id: Optional[str] = None


@router.post("/onboarding")
def onboarding(data: OnboardingData):
    """Save onboarding responses and mark student as profiled."""
    # Block Hindi
    if data.preferred_language == "hi":
        raise HTTPException(status_code=400, detail="Hindi is not supported on PyMasters. Please choose another language.")

    result = save_onboarding(DB_PATH, data.user_id, data.model_dump())
    return result


@router.get("/{user_id}")
def get_profile(user_id: str):
    """Get full student profile with mastery map."""
    profile = get_student_profile(DB_PATH, user_id)
    if not profile:
        return {"profile": None, "onboarding_completed": False}
    return {"profile": profile, "onboarding_completed": True}


@router.post("/signal")
def post_signal(data: SignalData):
    """Record a learning signal for continuous profiling."""
    record_signal(DB_PATH, data.user_id, data.signal_type, data.topic, data.value, data.session_id)
    return {"recorded": True}
```

- [ ] **Step 5: Write classroom routes**

```python
# backend/routes/classroom.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import json
import glob

from vaathiyaar.engine import call_vaathiyaar, evaluate_code
from vaathiyaar.profiler import get_student_profile, record_signal, update_mastery

router = APIRouter(prefix="/api/classroom", tags=["classroom"])

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.duckdb"))
LESSONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "lessons")

# Fallback if running from backend/ directly
if not os.path.isdir(LESSONS_DIR):
    LESSONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lessons")


def _load_lesson(lesson_id: str) -> dict:
    """Load a lesson JSON file by ID."""
    # Try both possible lesson directories
    for base in [LESSONS_DIR, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lessons")]:
        path = os.path.join(base, f"{lesson_id}.json")
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found")


class ChatRequest(BaseModel):
    user_id: str
    message: str
    lesson_context: Optional[str] = None
    phase: Optional[str] = None
    language: Optional[str] = "en"


class EvaluateRequest(BaseModel):
    user_id: str
    code: str
    expected_output: Optional[str] = ""
    lesson_id: Optional[str] = None
    topic: Optional[str] = None


class DiagnosticRequest(BaseModel):
    user_id: str
    code: str
    challenge_id: int = 0


@router.post("/chat")
def chat(req: ChatRequest):
    """Send a message to Vaathiyaar and get a response with animations."""
    profile = get_student_profile(DB_PATH, req.user_id)

    lesson_context = None
    if req.lesson_context:
        lesson_context = {
            "topic": req.lesson_context,
            "phase": req.phase or "chat"
        }

    result = call_vaathiyaar(
        req.message,
        student_profile=profile,
        lesson_context=lesson_context
    )

    # Auto-record profile update if present
    if result.get("profile_update"):
        pu = result["profile_update"]
        record_signal(DB_PATH, req.user_id, pu.get("signal", ""), pu.get("topic", ""), pu, None)

    return result


@router.get("/lesson/{lesson_id}")
def get_lesson(lesson_id: str, user_id: str = None):
    """Get a pre-built lesson with animations, adapted for the student."""
    lesson = _load_lesson(lesson_id)

    if user_id:
        profile = get_student_profile(DB_PATH, user_id)
        if profile:
            # Apply profile-based adaptations
            skill_level = profile.get("skill_level", "beginner")
            language = profile.get("preferred_language", "en")

            # Swap story variants to preferred language
            if "story_variants" in lesson and language in lesson["story_variants"]:
                lesson["active_story"] = lesson["story_variants"][language]
            elif "story_variants" in lesson and "en" in lesson["story_variants"]:
                lesson["active_story"] = lesson["story_variants"]["en"]

            # Swap title to preferred language
            if isinstance(lesson.get("title"), dict):
                lesson["active_title"] = lesson["title"].get(language, lesson["title"].get("en", ""))
            else:
                lesson["active_title"] = lesson.get("title", "")

            # Set speed multiplier based on skill level
            speed_map = {"beginner": 1.5, "intermediate": 1.0, "advanced": 0.7}
            lesson["speed_multiplier"] = speed_map.get(skill_level, 1.0)

            # Check adaptation points against mastery
            mastery = profile.get("mastery", {})
            adaptations = lesson.get("adaptation_points", [])
            lesson["active_adaptations"] = []
            for adapt in adaptations:
                if adapt.get("if_struggle") and adapt["if_struggle"] in mastery:
                    if mastery[adapt["if_struggle"]] < 0.4:
                        lesson["active_adaptations"].append(adapt)
                if adapt.get("if_advanced") and skill_level == "advanced":
                    lesson["active_adaptations"].append(adapt)

    return lesson


@router.get("/lessons")
def list_lessons():
    """List all available lessons (metadata only)."""
    lessons = []
    lessons_dir = LESSONS_DIR
    if not os.path.isdir(lessons_dir):
        lessons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lessons")

    if os.path.isdir(lessons_dir):
        for filepath in sorted(glob.glob(os.path.join(lessons_dir, "*.json"))):
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                title = data.get("title", {})
                if isinstance(title, dict):
                    title = title.get("en", "Untitled")
                lessons.append({
                    "id": data.get("id", os.path.basename(filepath).replace(".json", "")),
                    "title": title,
                    "description": data.get("description", {}).get("en", "") if isinstance(data.get("description"), dict) else data.get("description", ""),
                    "xp_reward": data.get("xp_reward", 50),
                    "topic": data.get("topic", "")
                })
    return lessons


@router.post("/evaluate")
def evaluate(req: EvaluateRequest):
    """Execute student code and get animated feedback from Vaathiyaar."""
    profile = get_student_profile(DB_PATH, req.user_id)
    lesson_context = {"topic": req.topic or "general", "phase": "practice"}

    result = evaluate_code(
        req.code,
        req.expected_output,
        student_profile=profile,
        lesson_context=lesson_context
    )

    # Record signal
    signal_value = {
        "success": result["success"],
        "error": result.get("error"),
        "code_length": len(req.code)
    }
    record_signal(DB_PATH, req.user_id, "code_attempt", req.topic or "general", signal_value)

    # Update mastery
    if req.topic:
        new_level = 0.7 if result["success"] else 0.2
        update_mastery(DB_PATH, req.user_id, req.topic, new_level)

    return result


@router.post("/diagnostic")
def diagnostic(req: DiagnosticRequest):
    """Run diagnostic code challenge to assess skill level."""
    DIAGNOSTIC_CHALLENGES = [
        {
            "id": 0,
            "instruction": "Print numbers 1 to 5, each on a new line",
            "expected_output": "1\n2\n3\n4\n5",
            "topic": "loops",
            "difficulty": "beginner"
        },
        {
            "id": 1,
            "instruction": "Create a list of squares from 1 to 5 using list comprehension and print it",
            "expected_output": "[1, 4, 9, 16, 25]",
            "topic": "list_comprehension",
            "difficulty": "intermediate"
        },
        {
            "id": 2,
            "instruction": "Write a function called 'factorial' that computes n! recursively, then print factorial(5)",
            "expected_output": "120",
            "topic": "recursion",
            "difficulty": "advanced"
        }
    ]

    if req.challenge_id >= len(DIAGNOSTIC_CHALLENGES):
        return {"complete": True, "message": "Diagnostic complete"}

    challenge = DIAGNOSTIC_CHALLENGES[req.challenge_id]
    result = evaluate_code(req.code, challenge["expected_output"])

    record_signal(DB_PATH, req.user_id, "diagnostic", challenge["topic"], {
        "difficulty": challenge["difficulty"],
        "success": result["success"],
        "challenge_id": req.challenge_id
    })

    return {
        "success": result["success"],
        "output": result["output"],
        "error": result.get("error"),
        "feedback": result.get("feedback"),
        "next_challenge_id": req.challenge_id + 1 if req.challenge_id + 1 < len(DIAGNOSTIC_CHALLENGES) else None,
        "challenge": challenge
    }
```

- [ ] **Step 6: Write classroom API tests**

```python
# backend/tests/test_classroom.py
from fastapi.testclient import TestClient
import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from routes.language import router as lang_router
from routes.classroom import router as class_router

app = FastAPI()
app.include_router(lang_router)
app.include_router(class_router)
client = TestClient(app)

def test_list_lessons_endpoint():
    """Test that /api/classroom/lessons returns a list."""
    res = client.get("/api/classroom/lessons")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
```

- [ ] **Step 7: Run all backend tests**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 8: Mount routers in main.py**

In `backend/main.py`, add these imports near the top (after existing imports):

```python
from routes.profile import router as profile_router
from routes.classroom import router as classroom_router
from routes.language import router as language_router
```

After the CORS middleware section, mount the routers:

```python
app.include_router(profile_router)
app.include_router(classroom_router)
app.include_router(language_router)
```

Remove the old `/api/ai/chat` endpoint (the `chat_ai` function and route).
Remove the old `/api/run` endpoint (the `execute_code` function and route).
Remove the `CONTENT_MAP` dictionary (lines 19-68) — lessons will come from JSON files.

Keep the existing `/api/auth/*` and `/api/content/*` routes for backward compatibility during transition.

- [ ] **Step 9: Create .env file with Ollama API key**

```bash
# backend/.env
OLLAMA_API_KEY=208d52f4a68a4c00aa4518fac8d995c6.oV--ePuqKn4DSs2T7tBW0KE7
OLLAMA_API_URL=https://api.ollama.com/v1
OLLAMA_MODEL=qwen3.5
DB_PATH=pymasters.duckdb
```

Add `.env` to `.gitignore` if not already there.

- [ ] **Step 10: Commit**

```bash
git add backend/routes/ backend/tests/test_language.py backend/tests/test_classroom.py backend/main.py
git commit -m "feat: add classroom, profile, and language API routes with Vaathiyaar integration"
```

---

## Task 5: Pre-built Lesson JSON Files

**Files:**
- Create: `backend/lessons/variables.json`
- Create: `backend/lessons/for_loops.json`
- Create: `backend/lessons/lists.json`
- Create: `backend/lessons/conditionals.json`

- [ ] **Step 1: Create lessons directory**

```bash
mkdir -p C:/Users/muthu/PycharmProjects/PyMasters/backend/lessons
```

- [ ] **Step 2: Create for_loops lesson with full animation sequence**

```json
{
  "id": "for_loops",
  "topic": "for_loops",
  "title": {
    "en": "For Loops: The Postman's Route",
    "ta": "ஃபார் லூப்கள்: தபால்காரரின் பாதை",
    "te": "ఫార్ లూప్స్: పోస్ట్‌మ్యాన్ మార్గం",
    "ml": "ഫോർ ലൂപ്പുകൾ: പോസ്റ്റ്മാന്റെ വഴി",
    "fr": "Boucles For : La Tournée du Facteur",
    "es": "Bucles For: La Ruta del Cartero",
    "it": "Cicli For: Il Percorso del Postino",
    "ko": "For 루프: 우체부의 경로"
  },
  "description": {
    "en": "Learn how Python repeats actions using for loops — through the story of a postman delivering letters.",
    "ta": "ஒரு தபால்காரர் கடிதங்களை வழங்கும் கதை மூலம் பைதான் ஃபார் லூப்களைக் கற்றுக்கொள்ளுங்கள்."
  },
  "xp_reward": 100,
  "next_unlock": "lists",
  "story_variants": {
    "en": "Imagine a postman walking down a street with 5 houses. He stops at each house, delivers a letter, and moves to the next one. He doesn't skip any house, and he doesn't go backwards. That's exactly what a for loop does — it visits each item in order, does something, and moves on.",
    "ta": "ஒரு தெருவில் 5 வீடுகள் இருக்கின்றன என்று கற்பனை செய்யுங்கள். தபால்காரர் ஒவ்வொரு வீட்டிலும் நிற்கிறார், கடிதத்தை வழங்குகிறார், அடுத்த வீட்டிற்கு செல்கிறார். எந்த வீட்டையும் தவிர்க்க மாட்டார், பின்னால் செல்ல மாட்டார். ஃபார் லூப் சரியாக இதையே செய்கிறது.",
    "te": "5 ఇళ్ళు ఉన్న ఒక వీధిలో పోస్ట్‌మ్యాన్ నడుస్తున్నాడని ఊహించుకోండి. అతను ప్రతి ఇంటి వద్ద ఆగుతాడు, ఉత్తరం అందజేస్తాడు, తర్వాత ఇంటికి వెళ్తాడు.",
    "fr": "Imaginez un facteur marchant dans une rue avec 5 maisons. Il s'arrête à chaque maison, livre une lettre, et passe à la suivante.",
    "es": "Imagina un cartero caminando por una calle con 5 casas. Se detiene en cada casa, entrega una carta y pasa a la siguiente.",
    "ko": "5채의 집이 있는 거리를 걸어가는 우체부를 상상해 보세요. 그는 각 집에 멈춰서 편지를 배달하고 다음 집으로 이동합니다."
  },
  "animation_sequence": [
    {
      "type": "StoryCard",
      "content": "story_variant",
      "illustration": "postman_street",
      "duration": 4000
    },
    {
      "type": "CodeStepper",
      "code": "for i in range(5):\n    print(f'Delivering to house {i}')",
      "highlight_sequence": [1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
      "speed": "profile_adaptive",
      "id": "main_stepper"
    },
    {
      "type": "VariableBox",
      "variable": "i",
      "values": [0, 1, 2, 3, 4],
      "sync_with": "main_stepper",
      "labels": {
        "en": "Current house number",
        "ta": "தற்போதைய வீட்டு எண்"
      }
    },
    {
      "type": "Terminal",
      "output": [
        "Delivering to house 0",
        "Delivering to house 1",
        "Delivering to house 2",
        "Delivering to house 3",
        "Delivering to house 4"
      ],
      "sync_with": "main_stepper"
    },
    {
      "type": "FlowArrow",
      "from": "line_2_end",
      "to": "line_1_start",
      "label": {
        "en": "Loop back",
        "ta": "திரும்பிச் செல்"
      },
      "style": "dashed"
    },
    {
      "type": "ParticleEffect",
      "effect": "success_confetti",
      "trigger": "sequence_complete"
    }
  ],
  "practice_challenges": [
    {
      "instruction": {
        "en": "Write a for loop that prints numbers 1 to 5, each on a new line.",
        "ta": "1 முதல் 5 வரை எண்களை அச்சிடும் ஒரு ஃபார் லூப் எழுதுங்கள்."
      },
      "starter_code": "# Write your for loop here\n",
      "expected_output": "1\n2\n3\n4\n5",
      "hints": {
        "en": [
          "Think about the postman — he needs to visit houses 1 through 5.",
          "range() usually starts at 0. How do you make it start at 1?",
          "Try: for i in range(1, ___): where the blank is one MORE than 5"
        ],
        "ta": [
          "தபால்காரரை நினைத்துப் பாருங்கள் — அவர் 1 முதல் 5 வரை வீடுகளுக்கு செல்ல வேண்டும்.",
          "range() வழக்கமாக 0-ல் தொடங்கும். 1-ல் தொடங்க எப்படி?",
          "முயற்சி: for i in range(1, ___): காலியானது 5-ஐ விட ஒன்று அதிகம்"
        ]
      }
    }
  ],
  "quiz": [
    {
      "q": {
        "en": "What does range(3) produce?",
        "ta": "range(3) என்ன உருவாக்குகிறது?"
      },
      "options": {
        "en": ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "1, 2"],
        "ta": ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "1, 2"]
      },
      "correct": 1
    },
    {
      "q": {
        "en": "How many times does 'for i in range(4)' loop?",
        "ta": "'for i in range(4)' எத்தனை முறை சுழல்கிறது?"
      },
      "options": {
        "en": ["3", "4", "5", "Depends on i"],
        "ta": ["3", "4", "5", "i-ஐ பொறுத்தது"]
      },
      "correct": 1
    }
  ],
  "adaptation_points": [
    {
      "at_step": 1,
      "if_struggle": "iteration",
      "inject": [
        {
          "type": "StoryCard",
          "content": {
            "en": "Let's slow down. Think of it like counting on your fingers — you start at 0 (thumb) and count up one at a time.",
            "ta": "மெதுவாகப் போவோம். உங்கள் விரல்களில் எண்ணுவது போல் நினைத்துப் பாருங்கள்."
          },
          "illustration": "counting_fingers",
          "duration": 3000
        }
      ]
    },
    {
      "at_step": 3,
      "if_advanced": true,
      "skip_to": 5
    }
  ]
}
```

- [ ] **Step 3: Create variables lesson**

```json
{
  "id": "variables",
  "topic": "variables",
  "title": {
    "en": "Variables: Naming Your Boxes",
    "ta": "மாறிகள்: உங்கள் பெட்டிகளுக்கு பெயரிடுங்கள்"
  },
  "description": {
    "en": "Learn how Python stores data in variables — like labeling boxes in a warehouse.",
    "ta": "பைதான் எவ்வாறு மாறிகளில் தரவை சேமிக்கிறது என்பதைக் கற்றுக்கொள்ளுங்கள்."
  },
  "xp_reward": 50,
  "next_unlock": "conditionals",
  "story_variants": {
    "en": "Imagine you run a warehouse. Every box needs a label so you can find it later. You write 'apples' on one box and put 10 apples inside. Later, you can say 'show me the apples box' and instantly know there are 10. Variables in Python work the same way — a name pointing to a value.",
    "ta": "நீங்கள் ஒரு கிடங்கை நடத்துவதாக கற்பனை செய்யுங்கள். ஒவ்வொரு பெட்டிக்கும் ஒரு லேபிள் தேவை. 'ஆப்பிள்கள்' என்று ஒரு பெட்டியில் எழுதி 10 ஆப்பிள்களை உள்ளே வைக்கிறீர்கள்."
  },
  "animation_sequence": [
    {
      "type": "StoryCard",
      "content": "story_variant",
      "illustration": "warehouse_boxes",
      "duration": 4000
    },
    {
      "type": "CodeStepper",
      "code": "name = 'PyMaster'\nage = 25\npi = 3.14\nprint(f'{name} is {age} years old')",
      "highlight_sequence": [1, 2, 3, 4],
      "speed": "profile_adaptive",
      "id": "var_stepper"
    },
    {
      "type": "VariableBox",
      "variable": "name",
      "values": ["'PyMaster'"],
      "sync_with": "var_stepper"
    },
    {
      "type": "VariableBox",
      "variable": "age",
      "values": [25],
      "sync_with": "var_stepper"
    },
    {
      "type": "VariableBox",
      "variable": "pi",
      "values": [3.14],
      "sync_with": "var_stepper"
    },
    {
      "type": "Terminal",
      "output": ["PyMaster is 25 years old"],
      "sync_with": "var_stepper"
    },
    {
      "type": "ParticleEffect",
      "effect": "success_confetti",
      "trigger": "sequence_complete"
    }
  ],
  "practice_challenges": [
    {
      "instruction": {
        "en": "Create three variables: your_name (string), your_age (integer), and your_hobby (string). Print them in a sentence using an f-string.",
        "ta": "மூன்று மாறிகளை உருவாக்குங்கள்: your_name, your_age, your_hobby. f-string பயன்படுத்தி அச்சிடுங்கள்."
      },
      "starter_code": "# Create your variables here\n\n# Print them in a sentence\n",
      "expected_output": "",
      "hints": {
        "en": [
          "A box needs a label. your_name = 'Alice' puts 'Alice' into the box labeled your_name.",
          "f-strings let you peek inside boxes: f'{your_name} is {your_age}'",
          "your_name = 'Alice'\nyour_age = 20\nyour_hobby = 'coding'\nprint(f'{your_name} is {your_age} and loves {your_hobby}')"
        ]
      }
    }
  ],
  "quiz": [
    {
      "q": {"en": "What is the type of x after: x = 3.14?", "ta": "x = 3.14 க்குப் பிறகு x-ன் வகை என்ன?"},
      "options": {"en": ["int", "str", "float", "double"], "ta": ["int", "str", "float", "double"]},
      "correct": 2
    },
    {
      "q": {"en": "Which is a valid variable name?", "ta": "சரியான மாறி பெயர் எது?"},
      "options": {"en": ["2name", "my-var", "my_var", "class"], "ta": ["2name", "my-var", "my_var", "class"]},
      "correct": 2
    }
  ],
  "adaptation_points": []
}
```

- [ ] **Step 4: Create conditionals lesson**

```json
{
  "id": "conditionals",
  "topic": "conditionals",
  "title": {
    "en": "Conditionals: The Traffic Signal",
    "ta": "நிபந்தனைகள்: போக்குவரத்து சிக்னல்"
  },
  "description": {
    "en": "Learn if/elif/else — like a traffic signal that decides which road to take.",
    "ta": "if/elif/else கற்றுக்கொள்ளுங்கள் — எந்த வழியில் செல்வது என்று முடிவு செய்யும் போக்குவரத்து சிக்னல் போல."
  },
  "xp_reward": 75,
  "next_unlock": "for_loops",
  "story_variants": {
    "en": "You're driving and you reach a traffic signal. If it's green, you go. If it's yellow, you slow down. If it's red, you stop. Python's if/elif/else works exactly like this — it checks conditions and takes different paths.",
    "ta": "நீங்கள் வாகனம் ஓட்டிக்கொண்டு போக்குவரத்து சிக்னலை அடைகிறீர்கள். பச்சை என்றால் செல்லுங்கள். மஞ்சள் என்றால் மெதுவாக. சிவப்பு என்றால் நிறுத்துங்கள்."
  },
  "animation_sequence": [
    {
      "type": "StoryCard",
      "content": "story_variant",
      "illustration": "traffic_signal",
      "duration": 3500
    },
    {
      "type": "CodeStepper",
      "code": "signal = 'green'\n\nif signal == 'green':\n    print('Go!')\nelif signal == 'yellow':\n    print('Slow down...')\nelse:\n    print('Stop!')",
      "highlight_sequence": [1, 3, 4],
      "speed": "profile_adaptive",
      "id": "cond_stepper"
    },
    {
      "type": "VariableBox",
      "variable": "signal",
      "values": ["'green'"],
      "sync_with": "cond_stepper"
    },
    {
      "type": "FlowArrow",
      "from": "line_3",
      "to": "line_4",
      "label": {"en": "True! Go here", "ta": "உண்மை! இங்கே செல்"},
      "style": "solid"
    },
    {
      "type": "Terminal",
      "output": ["Go!"],
      "sync_with": "cond_stepper"
    },
    {
      "type": "ParticleEffect",
      "effect": "success_confetti",
      "trigger": "sequence_complete"
    }
  ],
  "practice_challenges": [
    {
      "instruction": {
        "en": "Write a program that checks a variable 'score'. If score >= 90, print 'A'. If >= 80, print 'B'. If >= 70, print 'C'. Otherwise print 'F'. Set score to 85.",
        "ta": "'score' மாறியை சோதிக்கும் நிரலை எழுதுங்கள். score >= 90 என்றால் 'A'. >= 80 என்றால் 'B'. >= 70 என்றால் 'C'. இல்லையென்றால் 'F'. score-ஐ 85 ஆக வைக்கவும்."
      },
      "starter_code": "score = 85\n\n# Write your if/elif/else here\n",
      "expected_output": "B",
      "hints": {
        "en": [
          "Think traffic signal — check the highest condition first (green light = A).",
          "Start with: if score >= 90: then add elif for each grade.",
          "score = 85\nif score >= 90:\n    print('A')\nelif score >= 80:\n    print('B')\nelif score >= 70:\n    print('C')\nelse:\n    print('F')"
        ]
      }
    }
  ],
  "quiz": [
    {
      "q": {"en": "What prints if x = 5 and we write: if x > 10: print('big') else: print('small')?"},
      "options": {"en": ["big", "small", "Error", "Nothing"]},
      "correct": 1
    }
  ],
  "adaptation_points": []
}
```

- [ ] **Step 5: Create lists lesson**

```json
{
  "id": "lists",
  "topic": "lists",
  "title": {
    "en": "Lists: The Train with Compartments",
    "ta": "பட்டியல்கள்: பெட்டிகளுடன் கூடிய ரயில்"
  },
  "description": {
    "en": "Learn Python lists — ordered collections that grow, shrink, and rearrange like train compartments.",
    "ta": "பைதான் பட்டியல்களைக் கற்றுக்கொள்ளுங்கள் — ரயில் பெட்டிகள் போன்ற வரிசைப்படுத்தப்பட்ட தொகுப்புகள்."
  },
  "xp_reward": 100,
  "next_unlock": null,
  "story_variants": {
    "en": "Picture a train. Each compartment holds one thing — a passenger, a bag, a crate. You can add compartments to the end, remove one from the middle, or peek inside any compartment by its number. That's a Python list. Compartment 0 is the engine, compartment 1 is next, and so on.",
    "ta": "ஒரு ரயிலை கற்பனை செய்யுங்கள். ஒவ்வொரு பெட்டியிலும் ஒரு பொருள் உள்ளது. இறுதியில் பெட்டிகளை சேர்க்கலாம், நடுவில் இருந்து ஒன்றை அகற்றலாம், எந்த பெட்டியையும் அதன் எண் மூலம் பார்க்கலாம்."
  },
  "animation_sequence": [
    {
      "type": "StoryCard",
      "content": "story_variant",
      "illustration": "train_compartments",
      "duration": 4000
    },
    {
      "type": "CodeStepper",
      "code": "fruits = ['apple', 'banana', 'cherry']\nfruits.append('date')\nprint(fruits[0])\nprint(len(fruits))",
      "highlight_sequence": [1, 2, 3, 4],
      "speed": "profile_adaptive",
      "id": "list_stepper"
    },
    {
      "type": "DataStructure",
      "structure": "list",
      "data": ["apple", "banana", "cherry"],
      "operations": [
        {"action": "append", "value": "date"}
      ]
    },
    {
      "type": "VariableBox",
      "variable": "fruits[0]",
      "values": ["'apple'"],
      "sync_with": "list_stepper"
    },
    {
      "type": "Terminal",
      "output": ["apple", "4"],
      "sync_with": "list_stepper"
    },
    {
      "type": "ParticleEffect",
      "effect": "success_confetti",
      "trigger": "sequence_complete"
    }
  ],
  "practice_challenges": [
    {
      "instruction": {
        "en": "Create a list called 'colors' with 3 colors. Add a 4th color using .append(). Print the entire list.",
        "ta": "3 நிறங்களுடன் 'colors' என்ற பட்டியலை உருவாக்குங்கள். .append() பயன்படுத்தி 4வது நிறத்தைச் சேர்க்கவும். முழு பட்டியலையும் அச்சிடுங்கள்."
      },
      "starter_code": "# Create your colors list\n\n# Add a 4th color\n\n# Print the list\n",
      "expected_output": "",
      "hints": {
        "en": [
          "A train starts with compartments: colors = ['red', 'blue', 'green']",
          "Adding a compartment: colors.append('yellow')",
          "colors = ['red', 'blue', 'green']\ncolors.append('yellow')\nprint(colors)"
        ]
      }
    }
  ],
  "quiz": [
    {
      "q": {"en": "What is fruits[1] if fruits = ['a', 'b', 'c']?"},
      "options": {"en": ["'a'", "'b'", "'c'", "Error"]},
      "correct": 1
    },
    {
      "q": {"en": "What does .append() do?"},
      "options": {"en": ["Adds to beginning", "Adds to end", "Removes last", "Sorts the list"]},
      "correct": 1
    }
  ],
  "adaptation_points": []
}
```

- [ ] **Step 6: Verify lessons load**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -c "import json, glob; [print(json.load(open(f))['id']) for f in glob.glob('lessons/*.json')]"`
Expected: Prints `for_loops`, `variables`, `conditionals`, `lists`

- [ ] **Step 7: Commit**

```bash
git add backend/lessons/
git commit -m "feat: add pre-built lesson JSON files with multi-language animation sequences"
```

---

## Task 6: Install GSAP & Frontend Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install GSAP**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && npm install gsap`

- [ ] **Step 2: Verify installation**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && node -e "require('gsap'); console.log('GSAP OK')"`
Expected: "GSAP OK"

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add GSAP animation library"
```

---

## Task 7: Animation Primitives — Core Components

**Files:**
- Create: `frontend/src/components/animations/StoryCard.jsx`
- Create: `frontend/src/components/animations/CodeStepper.jsx`
- Create: `frontend/src/components/animations/VariableBox.jsx`
- Create: `frontend/src/components/animations/TerminalOutput.jsx`
- Create: `frontend/src/components/animations/ParticleEffect.jsx`
- Create: `frontend/src/components/animations/FlowArrow.jsx`
- Create: `frontend/src/components/animations/DataStructure.jsx`
- Create: `frontend/src/components/animations/MemoryStack.jsx`
- Create: `frontend/src/components/animations/ComparisonPanel.jsx`
- Create: `frontend/src/components/animations/ConceptMap.jsx`
- Create: `frontend/src/components/animations/AnimationRenderer.jsx`

This is the largest task. Each primitive is a self-contained React component that registers itself with a GSAP timeline.

- [ ] **Step 1: Create StoryCard primitive**

```jsx
// frontend/src/components/animations/StoryCard.jsx
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function StoryCard({ content, illustration, duration = 3000, onComplete }) {
    const cardRef = useRef(null);
    const textRef = useRef(null);

    useEffect(() => {
        const tl = gsap.timeline({
            onComplete: () => onComplete?.()
        });

        // Card springs in
        tl.fromTo(cardRef.current,
            { opacity: 0, y: 40, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }
        );

        // Text typewriter effect
        const textEl = textRef.current;
        if (textEl) {
            const fullText = content;
            textEl.textContent = '';
            const chars = fullText.split('');
            chars.forEach((char, i) => {
                tl.to(textEl, {
                    duration: 0.02,
                    onStart: () => { textEl.textContent += char; }
                }, `>-0.01`);
            });
        }

        // Hold for reading time
        tl.to({}, { duration: duration / 1000 });

        return () => tl.kill();
    }, [content, duration, onComplete]);

    const illustrations = {
        postman_street: '🏘️',
        warehouse_boxes: '📦',
        traffic_signal: '🚦',
        train_compartments: '🚂',
        counting_fingers: '🖐️'
    };

    return (
        <div ref={cardRef} className="opacity-0 mx-auto max-w-2xl">
            <div className="panel rounded-2xl p-8 border-l-4 border-l-purple-500/50">
                <div className="flex items-start gap-4">
                    <div className="text-4xl shrink-0 mt-1">
                        {illustrations[illustration] || '📖'}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-sm">🧑‍🏫</div>
                            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Vaathiyaar</span>
                        </div>
                        <p ref={textRef} className="text-slate-200 text-base leading-relaxed font-medium"></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Create CodeStepper primitive**

```jsx
// frontend/src/components/animations/CodeStepper.jsx
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function CodeStepper({ code, highlightSequence = [], speed = 'normal', onStep, onComplete }) {
    const containerRef = useRef(null);
    const [activeLineIndex, setActiveLineIndex] = useState(-1);
    const lines = code.split('\n');

    const speedMap = { slow: 1.5, normal: 1.0, fast: 0.6, profile_adaptive: 1.0 };
    const stepDuration = speedMap[speed] || 1.0;

    useEffect(() => {
        const tl = gsap.timeline({ onComplete: () => onComplete?.() });

        // Container springs in
        tl.fromTo(containerRef.current,
            { opacity: 0, x: -30 },
            { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }
        );

        // Step through highlight sequence
        highlightSequence.forEach((lineNum, stepIdx) => {
            tl.to({}, {
                duration: stepDuration,
                onStart: () => {
                    setActiveLineIndex(lineNum - 1);
                    onStep?.(stepIdx, lineNum);
                }
            });
        });

        return () => tl.kill();
    }, [code, highlightSequence, stepDuration, onStep, onComplete]);

    return (
        <div ref={containerRef} className="opacity-0 mx-auto max-w-2xl">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#020617]">
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/5">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600 ml-2">lesson.py</span>
                </div>
                <div className="p-4 font-mono text-sm">
                    {lines.map((line, idx) => (
                        <div
                            key={idx}
                            className={`flex items-center transition-all duration-300 rounded px-2 py-0.5 ${
                                idx === activeLineIndex
                                    ? 'bg-cyan-500/15 border-l-2 border-l-cyan-400'
                                    : 'border-l-2 border-l-transparent'
                            }`}
                        >
                            <span className={`w-8 text-right mr-4 text-xs select-none ${
                                idx === activeLineIndex ? 'text-cyan-400' : 'text-slate-700'
                            }`}>
                                {idx + 1}
                            </span>
                            <span className={idx === activeLineIndex ? 'text-cyan-100' : 'text-slate-500'}>
                                {line || '\u00A0'}
                            </span>
                            {idx === activeLineIndex && (
                                <span className="ml-1 w-2 h-4 bg-cyan-400 animate-pulse rounded-sm"></span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create VariableBox primitive**

```jsx
// frontend/src/components/animations/VariableBox.jsx
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function VariableBox({ variable, values = [], label, syncStep, onComplete }) {
    const boxRef = useRef(null);
    const valueRef = useRef(null);
    const [currentValue, setCurrentValue] = useState(null);
    const [valueIndex, setValueIndex] = useState(-1);

    // Update when syncStep changes
    useEffect(() => {
        if (syncStep !== undefined && syncStep < values.length) {
            setValueIndex(syncStep);
            setCurrentValue(values[syncStep]);

            if (valueRef.current) {
                gsap.fromTo(valueRef.current,
                    { scale: 1.3, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }
                );
            }
        }
    }, [syncStep, values]);

    useEffect(() => {
        if (boxRef.current) {
            gsap.fromTo(boxRef.current,
                { opacity: 0, scale: 0.8, y: 20 },
                { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' }
            );
        }
    }, []);

    return (
        <div ref={boxRef} className="inline-flex flex-col items-center opacity-0">
            <div className="panel rounded-xl p-4 min-w-[120px] text-center border-cyan-500/20 bg-cyan-500/5">
                <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mb-2">{variable}</div>
                <div ref={valueRef} className="text-2xl font-mono font-bold text-white">
                    {currentValue !== null ? String(currentValue) : '—'}
                </div>
                {label && <div className="text-[10px] text-slate-500 mt-2">{label}</div>}
            </div>
            {valueIndex >= 0 && (
                <div className="flex gap-1 mt-2">
                    {values.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            i <= valueIndex ? 'bg-cyan-400' : 'bg-slate-700'
                        }`}></div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Create TerminalOutput primitive**

```jsx
// frontend/src/components/animations/TerminalOutput.jsx
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function TerminalOutput({ output = [], syncStep, onComplete }) {
    const termRef = useRef(null);
    const [visibleLines, setVisibleLines] = useState([]);

    useEffect(() => {
        if (termRef.current) {
            gsap.fromTo(termRef.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
            );
        }
    }, []);

    useEffect(() => {
        if (syncStep !== undefined && syncStep < output.length) {
            setVisibleLines(prev => {
                if (prev.length <= syncStep) {
                    return [...prev, output[syncStep]];
                }
                return prev;
            });
        }
    }, [syncStep, output]);

    return (
        <div ref={termRef} className="mx-auto max-w-2xl opacity-0">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#020617]">
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Output</span>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                </div>
                <pre className="p-4 font-mono text-sm text-green-400 min-h-[60px]">
                    {visibleLines.map((line, i) => (
                        <div key={i} className="animate-fade-in">
                            <span className="text-slate-600 mr-2">&gt;</span>
                            {line}
                        </div>
                    ))}
                    {visibleLines.length === 0 && (
                        <span className="text-slate-700 italic">Waiting for execution...</span>
                    )}
                </pre>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Create ParticleEffect primitive**

```jsx
// frontend/src/components/animations/ParticleEffect.jsx
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ParticleEffect({ effect = 'success_confetti', trigger = 'on_start', active = false }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!active || !containerRef.current) return;

        const container = containerRef.current;
        const particles = [];

        if (effect === 'success_confetti') {
            const colors = ['#06b6d4', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'];
            for (let i = 0; i < 40; i++) {
                const particle = document.createElement('div');
                particle.style.cssText = `
                    position: absolute; width: ${4 + Math.random() * 6}px; height: ${4 + Math.random() * 6}px;
                    background: ${colors[Math.floor(Math.random() * colors.length)]};
                    border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                    left: 50%; top: 50%; pointer-events: none;
                `;
                container.appendChild(particle);
                particles.push(particle);

                gsap.to(particle, {
                    x: (Math.random() - 0.5) * 400,
                    y: (Math.random() - 0.5) * 300 - 100,
                    rotation: Math.random() * 720,
                    opacity: 0,
                    scale: 0,
                    duration: 1 + Math.random() * 1,
                    ease: 'power3.out',
                    delay: Math.random() * 0.3
                });
            }
        } else if (effect === 'error_sparks') {
            for (let i = 0; i < 15; i++) {
                const spark = document.createElement('div');
                spark.style.cssText = `
                    position: absolute; width: 3px; height: 3px;
                    background: #ef4444; border-radius: 50%;
                    left: 50%; top: 50%; pointer-events: none;
                    box-shadow: 0 0 6px #ef4444;
                `;
                container.appendChild(spark);
                particles.push(spark);

                gsap.to(spark, {
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200,
                    opacity: 0,
                    duration: 0.6 + Math.random() * 0.4,
                    ease: 'power2.out'
                });
            }
        }

        return () => {
            particles.forEach(p => p.remove());
        };
    }, [active, effect]);

    return (
        <div ref={containerRef} className="fixed inset-0 pointer-events-none z-50 overflow-hidden"></div>
    );
}
```

- [ ] **Step 6: Create FlowArrow primitive**

```jsx
// frontend/src/components/animations/FlowArrow.jsx
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function FlowArrow({ label, style = 'solid', direction = 'down', onComplete }) {
    const arrowRef = useRef(null);
    const labelText = typeof label === 'object' ? (label.en || '') : (label || '');

    useEffect(() => {
        if (!arrowRef.current) return;

        const tl = gsap.timeline({ onComplete: () => onComplete?.() });
        tl.fromTo(arrowRef.current,
            { opacity: 0, scaleY: 0 },
            { opacity: 1, scaleY: 1, duration: 0.6, ease: 'power3.out', transformOrigin: 'top center' }
        );

        return () => tl.kill();
    }, [onComplete]);

    return (
        <div ref={arrowRef} className="flex flex-col items-center gap-1 opacity-0 my-2">
            <svg width="24" height="48" viewBox="0 0 24 48" className="text-cyan-400">
                <line x1="12" y1="0" x2="12" y2="36"
                    stroke="currentColor" strokeWidth="2"
                    strokeDasharray={style === 'dashed' ? '4 4' : 'none'} />
                <polygon points="6,36 12,48 18,36" fill="currentColor" />
            </svg>
            {labelText && (
                <span className="text-[10px] text-cyan-400/70 font-mono">{labelText}</span>
            )}
        </div>
    );
}
```

- [ ] **Step 7: Create DataStructure primitive**

```jsx
// frontend/src/components/animations/DataStructure.jsx
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function DataStructure({ structure = 'list', data = [], operations = [], onComplete }) {
    const containerRef = useRef(null);
    const [items, setItems] = useState(data);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    useEffect(() => {
        if (!containerRef.current) return;

        const tl = gsap.timeline({ onComplete: () => onComplete?.() });

        // Container appears
        tl.fromTo(containerRef.current,
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' }
        );

        // Play operations
        operations.forEach((op, idx) => {
            tl.to({}, {
                duration: 0.8,
                onStart: () => {
                    if (op.action === 'append') {
                        setItems(prev => [...prev, op.value]);
                        setHighlightIndex(items.length + idx);
                    } else if (op.action === 'remove') {
                        setItems(prev => prev.filter((_, i) => i !== op.index));
                    }
                }
            });
        });

        return () => tl.kill();
    }, [data, operations, onComplete]);

    const structureLabels = { list: 'List []', dict: 'Dict {}', set: 'Set {}', tuple: 'Tuple ()' };

    return (
        <div ref={containerRef} className="mx-auto max-w-2xl opacity-0">
            <div className="panel rounded-xl p-6">
                <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider mb-3">
                    {structureLabels[structure] || 'Collection'}
                </div>
                <div className="flex gap-2 flex-wrap">
                    {items.map((item, idx) => (
                        <div
                            key={`${idx}-${item}`}
                            className={`px-4 py-3 rounded-lg font-mono text-sm font-bold transition-all duration-300 ${
                                idx === highlightIndex
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 scale-110'
                                    : 'bg-white/5 text-slate-300 border border-white/10'
                            }`}
                        >
                            <div className="text-[8px] text-slate-600 mb-1">[{idx}]</div>
                            {JSON.stringify(item)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 8: Create MemoryStack primitive**

```jsx
// frontend/src/components/animations/MemoryStack.jsx
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export default function MemoryStack({ frames = [], operations = [], onComplete }) {
    const stackRef = useRef(null);
    const [visibleFrames, setVisibleFrames] = useState([]);

    useEffect(() => {
        if (!stackRef.current) return;

        const tl = gsap.timeline({ onComplete: () => onComplete?.() });

        tl.fromTo(stackRef.current,
            { opacity: 0 },
            { opacity: 1, duration: 0.4 }
        );

        frames.forEach((frame, idx) => {
            const op = operations[idx] || 'push';
            tl.to({}, {
                duration: 0.6,
                onStart: () => {
                    if (op === 'push') {
                        setVisibleFrames(prev => [frame, ...prev]);
                    } else if (op === 'pop') {
                        setVisibleFrames(prev => prev.slice(1));
                    }
                }
            });
        });

        return () => tl.kill();
    }, [frames, operations, onComplete]);

    return (
        <div ref={stackRef} className="mx-auto max-w-md opacity-0">
            <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-2">Call Stack</div>
            <div className="space-y-1">
                {visibleFrames.map((frame, idx) => (
                    <div key={`${idx}-${frame.name}`}
                        className={`panel rounded-lg p-3 border-l-2 transition-all ${
                            idx === 0 ? 'border-l-orange-400 bg-orange-500/5' : 'border-l-slate-700'
                        }`}
                    >
                        <div className="text-xs font-bold text-orange-300 mb-1">{frame.name}()</div>
                        <div className="flex gap-2 flex-wrap">
                            {Object.entries(frame.variables || {}).map(([k, v]) => (
                                <span key={k} className="text-[10px] font-mono text-slate-400">
                                    {k}={JSON.stringify(v)}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
                {visibleFrames.length === 0 && (
                    <div className="text-slate-700 text-xs italic p-3">Stack empty</div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 9: Create ComparisonPanel primitive**

```jsx
// frontend/src/components/animations/ComparisonPanel.jsx
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ComparisonPanel({ before, after, onComplete }) {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!panelRef.current) return;
        const tl = gsap.timeline({ onComplete: () => onComplete?.() });

        const panels = panelRef.current.children;
        tl.fromTo(panels[0], { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' });
        tl.fromTo(panels[1], { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, '-=0.3');

        return () => tl.kill();
    }, [before, after, onComplete]);

    return (
        <div ref={panelRef} className="grid grid-cols-2 gap-4 mx-auto max-w-2xl">
            <div className="panel rounded-xl p-4 border-red-500/20">
                <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-2">{before?.label || 'Before'}</div>
                <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap">{before?.code || ''}</pre>
            </div>
            <div className="panel rounded-xl p-4 border-green-500/20">
                <div className="text-[10px] text-green-400 font-bold uppercase tracking-wider mb-2">{after?.label || 'After'}</div>
                <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap">{after?.code || ''}</pre>
            </div>
        </div>
    );
}
```

- [ ] **Step 10: Create ConceptMap primitive**

```jsx
// frontend/src/components/animations/ConceptMap.jsx
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function ConceptMap({ nodes = [], edges = [], onComplete }) {
    const mapRef = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;

        const tl = gsap.timeline({ onComplete: () => onComplete?.() });
        const nodeEls = mapRef.current.querySelectorAll('.concept-node');
        const edgeEls = mapRef.current.querySelectorAll('.concept-edge');

        tl.fromTo(nodeEls, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: 'back.out(2)' });
        tl.fromTo(edgeEls, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08 }, '-=0.2');

        return () => tl.kill();
    }, [nodes, edges, onComplete]);

    return (
        <div ref={mapRef} className="mx-auto max-w-lg">
            <div className="flex flex-wrap justify-center gap-4">
                {nodes.map((node) => (
                    <div key={node.id} className="concept-node panel rounded-xl px-4 py-2 text-sm font-bold text-cyan-300 border-cyan-500/20 opacity-0">
                        {node.label}
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
                {edges.map((edge, idx) => (
                    <div key={idx} className="concept-edge text-[10px] text-slate-500 opacity-0">
                        {edge.from} → {edge.label} → {edge.to}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 11: Create AnimationRenderer orchestrator**

```jsx
// frontend/src/components/animations/AnimationRenderer.jsx
import { useState, useCallback } from 'react';
import StoryCard from './StoryCard';
import CodeStepper from './CodeStepper';
import VariableBox from './VariableBox';
import TerminalOutput from './TerminalOutput';
import ParticleEffect from './ParticleEffect';
import FlowArrow from './FlowArrow';
import DataStructure from './DataStructure';
import MemoryStack from './MemoryStack';
import ComparisonPanel from './ComparisonPanel';
import ConceptMap from './ConceptMap';

const PRIMITIVE_MAP = {
    StoryCard,
    CodeStepper,
    VariableBox,
    Terminal: TerminalOutput,
    ParticleEffect,
    FlowArrow,
    DataStructure,
    MemoryStack,
    ComparisonPanel,
    ConceptMap
};

export default function AnimationRenderer({ sequence = [], storyContent = '', speedMultiplier = 1.0, language = 'en', onSequenceComplete }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [syncStep, setSyncStep] = useState(-1);
    const [particleActive, setParticleActive] = useState(false);

    const handleStepComplete = useCallback(() => {
        const nextStep = currentStep + 1;
        if (nextStep < sequence.length) {
            setCurrentStep(nextStep);
            // Check if next step is a particle effect triggered on sequence_complete
            const nextPrimitive = sequence[nextStep];
            if (nextPrimitive?.type === 'ParticleEffect' && nextPrimitive?.trigger === 'sequence_complete' && nextStep === sequence.length - 1) {
                setParticleActive(true);
                onSequenceComplete?.();
            }
        } else {
            onSequenceComplete?.();
        }
    }, [currentStep, sequence, onSequenceComplete]);

    const handleCodeStep = useCallback((stepIdx) => {
        setSyncStep(stepIdx);
    }, []);

    const resolveContent = (content) => {
        if (content === 'story_variant') return storyContent;
        if (typeof content === 'object') return content[language] || content.en || '';
        return content || '';
    };

    return (
        <div className="space-y-6 py-4">
            {sequence.slice(0, currentStep + 1).map((primitive, idx) => {
                const Component = PRIMITIVE_MAP[primitive.type];
                if (!Component) return null;

                const isActive = idx === currentStep;
                const props = { ...primitive };

                // Resolve localized content
                if (props.content) props.content = resolveContent(props.content);
                if (props.label) props.label = resolveContent(props.label);

                // Apply speed multiplier
                if (props.duration) props.duration = props.duration * speedMultiplier;

                // Wire sync for VariableBox and Terminal
                if (primitive.sync_with && (primitive.type === 'VariableBox' || primitive.type === 'Terminal')) {
                    props.syncStep = syncStep;
                }

                // Wire events
                if (isActive && primitive.type !== 'ParticleEffect') {
                    props.onComplete = handleStepComplete;
                }
                if (primitive.type === 'CodeStepper') {
                    props.onStep = handleCodeStep;
                }
                if (primitive.type === 'ParticleEffect') {
                    props.active = particleActive || primitive.trigger === 'on_start';
                }

                return <Component key={`${idx}-${primitive.type}`} {...props} />;
            })}
        </div>
    );
}
```

- [ ] **Step 12: Verify components render without errors**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 13: Commit**

```bash
git add frontend/src/components/animations/
git commit -m "feat: add cinema-quality animation primitive library with GSAP — 10 primitives + orchestrator"
```

---

## Task 8: Language Selector & i18n System

**Files:**
- Create: `frontend/src/i18n/index.js`
- Create: `frontend/src/i18n/en.json`
- Create: `frontend/src/i18n/ta.json`
- Create: `frontend/src/components/LanguageSelector.jsx`

- [ ] **Step 1: Create i18n loader**

```js
// frontend/src/i18n/index.js
import { useState, useCallback } from 'react';
import en from './en.json';
import ta from './ta.json';

const translations = { en, ta };

export function useTranslation(language = 'en') {
    const t = useCallback((key) => {
        const lang = translations[language] || translations.en;
        return lang[key] || translations.en[key] || key;
    }, [language]);

    return { t };
}

export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ta', name: 'தமிழ் (Tamil)', flag: '🇮🇳' },
    { code: 'te', name: 'తెలుగు (Telugu)', flag: '🇮🇳' },
    { code: 'ml', name: 'മലയാളം (Malayalam)', flag: '🇮🇳' },
    { code: 'fr', name: 'Français (French)', flag: '🇫🇷' },
    { code: 'es', name: 'Español (Spanish)', flag: '🇪🇸' },
    { code: 'it', name: 'Italiano (Italian)', flag: '🇮🇹' },
    { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' }
];

export const BLOCKED_LANGUAGES = [
    { code: 'hi', name: 'Hindi', message: 'Hindi is not supported on PyMasters. Please choose another language.' }
];
```

- [ ] **Step 2: Create translation files**

```json
// frontend/src/i18n/en.json
{
    "classroom": "Classroom",
    "overview": "Overview",
    "learning_path": "Learning Path",
    "ask_vaathiyaar": "Ask Vaathiyaar anything...",
    "run_code": "Run Code",
    "need_hint": "Need a hint?",
    "next_lesson": "Continue to next lesson",
    "try_again": "Try Again",
    "language_select": "Choose Language",
    "hindi_blocked": "Hindi is not supported on PyMasters. Please choose another language.",
    "onboarding_welcome": "Vanakkam! I'm Vaathiyaar, your Python guide.",
    "xp_earned": "XP Earned",
    "modules_completed": "Modules Completed"
}
```

```json
// frontend/src/i18n/ta.json
{
    "classroom": "வகுப்பறை",
    "overview": "மேலோட்டம்",
    "learning_path": "கற்றல் பாதை",
    "ask_vaathiyaar": "வாத்தியாரிடம் கேளுங்கள்...",
    "run_code": "இயக்கு",
    "need_hint": "குறிப்பு வேண்டுமா?",
    "next_lesson": "அடுத்த பாடத்திற்கு செல்லுங்கள்",
    "try_again": "மீண்டும் முயற்சிக்கவும்",
    "language_select": "மொழியைத் தேர்ந்தெடுக்கவும்",
    "hindi_blocked": "PyMasters-ல் ஹிந்தி ஆதரிக்கப்படவில்லை. மற்றொரு மொழியைத் தேர்ந்தெடுக்கவும்.",
    "onboarding_welcome": "வணக்கம்! நான் வாத்தியார், உங்கள் பைதான் வழிகாட்டி.",
    "xp_earned": "XP பெறப்பட்டது",
    "modules_completed": "நிறைவு செய்யப்பட்ட தொகுதிகள்"
}
```

- [ ] **Step 3: Create LanguageSelector component**

```jsx
// frontend/src/components/LanguageSelector.jsx
import { useState } from 'react';
import { SUPPORTED_LANGUAGES, BLOCKED_LANGUAGES } from '../i18n';
import { Globe, X } from 'lucide-react';

export default function LanguageSelector({ currentLanguage = 'en', onSelect }) {
    const [open, setOpen] = useState(false);
    const [blockMessage, setBlockMessage] = useState('');

    const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === currentLanguage) || SUPPORTED_LANGUAGES[0];

    const handleSelect = (code) => {
        const blocked = BLOCKED_LANGUAGES.find(l => l.code === code);
        if (blocked) {
            setBlockMessage(blocked.message);
            return;
        }
        onSelect?.(code);
        setOpen(false);
        setBlockMessage('');
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
            >
                <Globe size={14} className="text-cyan-400" />
                <span className="text-white">{currentLang.flag} {currentLang.name}</span>
            </button>

            {open && (
                <div className="absolute top-full mt-2 right-0 w-72 panel rounded-xl overflow-hidden z-50 border border-white/10">
                    <div className="p-3 border-b border-white/5">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Choose Language</span>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelect(lang.code)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                                    lang.code === currentLanguage
                                        ? 'bg-cyan-500/10 text-cyan-300'
                                        : 'text-slate-300 hover:bg-white/5'
                                }`}
                            >
                                <span className="text-lg">{lang.flag}</span>
                                <span>{lang.name}</span>
                                {lang.code === currentLanguage && (
                                    <span className="ml-auto text-cyan-400 text-xs font-bold">Active</span>
                                )}
                            </button>
                        ))}

                        {/* Hindi — explicitly blocked */}
                        {BLOCKED_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelect(lang.code)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-600 cursor-not-allowed opacity-50"
                            >
                                <span className="text-lg">🚫</span>
                                <span className="line-through">{lang.name}</span>
                                <span className="ml-auto text-[10px] text-red-400 font-bold uppercase">Not Supported</span>
                            </button>
                        ))}
                    </div>

                    {blockMessage && (
                        <div className="p-3 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
                            <X size={14} className="text-red-400 shrink-0" />
                            <span className="text-xs text-red-300">{blockMessage}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/ frontend/src/components/LanguageSelector.jsx
git commit -m "feat: add i18n system with language selector and explicit Hindi exclusion"
```

---

## Task 9: Profile Context & Onboarding Page

**Files:**
- Create: `frontend/src/context/ProfileContext.jsx`
- Create: `frontend/src/pages/Onboarding.jsx`
- Create: `frontend/src/components/ChatBar.jsx`

- [ ] **Step 1: Create ProfileContext**

```jsx
// frontend/src/context/ProfileContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setProfile(null);
            setLoading(false);
            return;
        }
        api.get(`/profile/${user.id}`)
            .then(res => {
                setProfile(res.data.profile);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [user]);

    const refreshProfile = async () => {
        if (!user) return;
        const res = await api.get(`/profile/${user.id}`);
        setProfile(res.data.profile);
    };

    return (
        <ProfileContext.Provider value={{ profile, loading, refreshProfile }}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile() {
    return useContext(ProfileContext);
}
```

- [ ] **Step 2: Create ChatBar component**

```jsx
// frontend/src/components/ChatBar.jsx
import { useState } from 'react';
import { Send } from 'lucide-react';

export default function ChatBar({ onSend, placeholder = "Ask Vaathiyaar anything...", loading = false }) {
    const [input, setInput] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;
        onSend(input.trim());
        setInput('');
    };

    return (
        <form onSubmit={handleSubmit} className="relative">
            <div className="panel rounded-xl overflow-hidden border border-white/10">
                <div className="flex items-center gap-2 px-4">
                    <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-[10px] shrink-0">🧑‍🏫</div>
                    <input
                        className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 py-3.5 focus:outline-none"
                        placeholder={placeholder}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="text-slate-500 hover:text-cyan-400 transition-colors disabled:opacity-30"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <Send size={16} />
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
}
```

- [ ] **Step 3: Create Onboarding page**

```jsx
// frontend/src/pages/Onboarding.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import LanguageSelector from '../components/LanguageSelector';

const QUESTIONS = [
    {
        key: 'preferred_language',
        vaathiyaar: "Vanakkam! I'm Vaathiyaar, your Python guide. Before we begin — which language would you like me to teach in?",
        type: 'language'
    },
    {
        key: 'motivation',
        vaathiyaar: "What brings you to Python?",
        type: 'choice',
        options: [
            { value: 'career_switch', label: '🚀 Career Switch', emoji: '🚀' },
            { value: 'student', label: '🎓 Student', emoji: '🎓' },
            { value: 'hobby', label: '🎨 Hobby', emoji: '🎨' },
            { value: 'ai_ml', label: '🤖 AI/ML Interest', emoji: '🤖' },
            { value: 'work', label: '💼 Work Requires It', emoji: '💼' },
            { value: 'data_science', label: '🧪 Data Science', emoji: '🧪' }
        ]
    },
    {
        key: 'prior_experience',
        vaathiyaar: "Have you written code before?",
        type: 'choice',
        options: [
            { value: 'none', label: "🌱 Never coded before" },
            { value: 'some', label: "📝 A little (HTML, Excel macros)" },
            { value: 'other_language', label: "💻 Yes, in another language" },
            { value: 'python', label: "🐍 Yes, in Python" }
        ]
    },
    {
        key: 'learning_style',
        vaathiyaar: "How do you learn best?",
        type: 'choice',
        options: [
            { value: 'visual', label: "👁️ Watching examples & animations" },
            { value: 'hands_on', label: "🛠️ Doing exercises & challenges" },
            { value: 'reading', label: "📖 Reading explanations" },
            { value: 'projects', label: "🏗️ Building real projects" }
        ]
    },
    {
        key: 'goal',
        vaathiyaar: "What do you want to build with Python?",
        type: 'choice',
        options: [
            { value: 'web', label: "🌐 Web Applications" },
            { value: 'data_science', label: "📊 Data Science" },
            { value: 'automation', label: "⚡ Automation & Scripts" },
            { value: 'ai_ml', label: "🧠 AI & Machine Learning" },
            { value: 'games', label: "🎮 Games" },
            { value: 'unknown', label: "🤷 I don't know yet" }
        ]
    },
    {
        key: 'time_commitment',
        vaathiyaar: "How much time can you give to learning?",
        type: 'choice',
        options: [
            { value: '15min', label: "⏱️ 15 minutes/day" },
            { value: '30min', label: "⏱️ 30 minutes/day" },
            { value: '1hour', label: "⏱️ 1 hour/day" },
            { value: 'weekends', label: "📅 Weekends only" }
        ]
    }
];

const REACTIONS = {
    career_switch: "Bold move! Python is the #1 language for career changers. Let's make it count. 💪",
    student: "Perfect timing to learn! Python will be your superpower in every course. 📚",
    hobby: "The best code comes from curiosity. Let's have fun! 🎨",
    ai_ml: "Ah, the world of intelligent machines! Python is the mother tongue of AI. 🤖",
    work: "Smart approach — Python skills pay dividends. Let's get you productive fast. 💼",
    data_science: "Data is the new oil, and Python is the refinery. Let's dig in! 🧪",
    none: "Welcome to your first adventure in code! I'll make sure every step is clear. 🌱",
    some: "Good — you already know the basics. We'll build on that foundation. 📝",
    other_language: "Excellent! You already think like a programmer. Python will feel natural. 💻",
    python: "Coming back to sharpen your skills? I love it. Let's go deeper. 🐍",
    visual: "A visual learner! You'll love the animations I've prepared. 👁️",
    hands_on: "Learning by doing — my favorite! Get ready for challenges. 🛠️",
    reading: "A reader! I'll make sure my explanations are rich and clear. 📖",
    projects: "A builder! We'll be creating real things very soon. 🏗️"
};

export default function Onboarding() {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({ preferred_language: 'en' });
    const [messages, setMessages] = useState([
        { role: 'vaathiyaar', content: QUESTIONS[0].vaathiyaar }
    ]);
    const [submitting, setSubmitting] = useState(false);

    const handleAnswer = async (key, value) => {
        const newAnswers = { ...answers, [key]: value };
        setAnswers(newAnswers);

        // Add user's answer to chat
        const option = QUESTIONS[step]?.options?.find(o => o.value === value);
        setMessages(prev => [...prev, { role: 'user', content: option?.label || value }]);

        // Add Vaathiyaar reaction
        if (REACTIONS[value]) {
            setMessages(prev => [...prev, { role: 'vaathiyaar', content: REACTIONS[value] }]);
        }

        const nextStep = step + 1;
        if (nextStep < QUESTIONS.length) {
            // Add next question after a brief pause
            setTimeout(() => {
                setMessages(prev => [...prev, { role: 'vaathiyaar', content: QUESTIONS[nextStep].vaathiyaar }]);
                setStep(nextStep);
            }, 800);
        } else {
            // Submit onboarding
            setSubmitting(true);
            try {
                await api.post('/profile/onboarding', {
                    user_id: user.id,
                    ...newAnswers,
                    known_languages: []
                });
                setMessages(prev => [...prev, {
                    role: 'vaathiyaar',
                    content: "Excellent! I know you now. Let's begin your Python journey! 🚀"
                }]);
                setTimeout(() => navigate('/dashboard/classroom'), 1500);
            } catch (err) {
                setMessages(prev => [...prev, {
                    role: 'vaathiyaar',
                    content: "Something went wrong saving your profile. Let's try again."
                }]);
                setSubmitting(false);
            }
        }
    };

    const currentQ = QUESTIONS[step];

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                {/* Chat messages */}
                <div className="space-y-4 mb-8 max-h-[60vh] overflow-y-auto px-2">
                    <AnimatePresence>
                        {messages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                            >
                                {msg.role === 'vaathiyaar' && (
                                    <div className="flex gap-3 max-w-[85%]">
                                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-sm shrink-0 mt-1">🧑‍🏫</div>
                                        <div className="panel rounded-2xl rounded-bl-sm p-4 border-purple-500/15 bg-purple-500/5">
                                            <div className="text-sm text-slate-200 leading-relaxed">{msg.content}</div>
                                        </div>
                                    </div>
                                )}
                                {msg.role === 'user' && (
                                    <div className="bg-cyan-500/15 border border-cyan-500/20 rounded-2xl rounded-br-sm px-4 py-3 max-w-[70%]">
                                        <div className="text-sm text-cyan-200">{msg.content}</div>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Answer options */}
                {!submitting && currentQ && (
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                    >
                        {currentQ.type === 'language' ? (
                            <div className="flex justify-center">
                                <LanguageSelector
                                    currentLanguage={answers.preferred_language}
                                    onSelect={(code) => handleAnswer('preferred_language', code)}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2 justify-center">
                                {currentQ.options.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => handleAnswer(currentQ.key, opt.value)}
                                        className="px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-sm hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Progress dots */}
                <div className="flex justify-center gap-2 mt-8">
                    {QUESTIONS.map((_, idx) => (
                        <div key={idx} className={`w-2 h-2 rounded-full transition-all ${
                            idx < step ? 'bg-purple-500' :
                            idx === step ? 'bg-cyan-400 scale-125' :
                            'bg-slate-700'
                        }`}></div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/ProfileContext.jsx frontend/src/pages/Onboarding.jsx frontend/src/components/ChatBar.jsx
git commit -m "feat: add profile context, conversational onboarding flow, and chat bar component"
```

---

## Task 10: Classroom Page — Guided Flow UI

**Files:**
- Create: `frontend/src/pages/Classroom.jsx`

- [ ] **Step 1: Create the Classroom page**

```jsx
// frontend/src/pages/Classroom.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { motion, AnimatePresence } from 'framer-motion';
import AnimationRenderer from '../components/animations/AnimationRenderer';
import ChatBar from '../components/ChatBar';
import api from '../api';
import { BookOpen, ChevronRight, Play, RotateCcw } from 'lucide-react';

export default function Classroom() {
    const { user } = useAuth();
    const { profile } = useProfile();
    const [lessons, setLessons] = useState([]);
    const [currentLesson, setCurrentLesson] = useState(null);
    const [phase, setPhase] = useState('select'); // select | intro | animation | practice | feedback
    const [chatMessages, setChatMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [code, setCode] = useState('');
    const [output, setOutput] = useState('');
    const [hintIndex, setHintIndex] = useState(-1);
    const [evalResult, setEvalResult] = useState(null);
    const scrollRef = useRef(null);

    const language = profile?.preferred_language || user?.preferred_language || 'en';

    useEffect(() => {
        api.get('/classroom/lessons').then(res => setLessons(res.data)).catch(console.error);
    }, []);

    const loadLesson = async (lessonId) => {
        try {
            const res = await api.get(`/classroom/lesson/${lessonId}?user_id=${user.id}`);
            setCurrentLesson(res.data);
            setPhase('intro');
            setCode('');
            setOutput('');
            setHintIndex(-1);
            setEvalResult(null);
            setChatMessages([]);
        } catch (err) {
            console.error(err);
        }
    };

    const handleChat = async (message) => {
        setChatMessages(prev => [...prev, { role: 'user', content: message }]);
        setChatLoading(true);
        try {
            const res = await api.post('/classroom/chat', {
                user_id: user.id,
                message,
                lesson_context: currentLesson?.topic || null,
                phase,
                language
            });
            setChatMessages(prev => [...prev, { role: 'vaathiyaar', content: res.data.message }]);
        } catch {
            setChatMessages(prev => [...prev, { role: 'vaathiyaar', content: 'Connection issue. Try again.' }]);
        }
        setChatLoading(false);
    };

    const handleRunCode = async () => {
        if (!currentLesson || !code.trim()) return;
        const challenge = currentLesson.practice_challenges?.[0];
        try {
            const res = await api.post('/classroom/evaluate', {
                user_id: user.id,
                code,
                expected_output: challenge?.expected_output || '',
                lesson_id: currentLesson.id,
                topic: currentLesson.topic
            });
            setOutput(res.data.output || res.data.error || '');
            setEvalResult(res.data);
            setPhase('feedback');
        } catch {
            setOutput('Execution error. Check your code.');
        }
    };

    const handleHint = () => {
        const challenge = currentLesson?.practice_challenges?.[0];
        const hints = challenge?.hints?.[language] || challenge?.hints?.en || [];
        if (hintIndex + 1 < hints.length) {
            setHintIndex(hintIndex + 1);
            setChatMessages(prev => [...prev, {
                role: 'vaathiyaar',
                content: `💡 Hint ${hintIndex + 2}: ${hints[hintIndex + 1]}`
            }]);
        }
    };

    const resolveText = (obj) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[language] || obj.en || '';
    };

    // --- PHASE RENDERS ---

    const renderLessonSelect = () => (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <header className="mb-8">
                <h2 className="text-3xl font-bold mb-2">Classroom</h2>
                <p className="text-slate-400">Choose a lesson. Vaathiyaar will guide you through it.</p>
            </header>
            <div className="space-y-3">
                {lessons.map((lesson) => (
                    <button
                        key={lesson.id}
                        onClick={() => loadLesson(lesson.id)}
                        className="w-full panel p-5 rounded-xl flex items-center justify-between hover:bg-white/[0.04] hover:border-cyan-500/30 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                                <BookOpen size={18} />
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-white group-hover:text-cyan-300 transition-colors">{lesson.title}</div>
                                <div className="text-sm text-slate-500">{lesson.description} • {lesson.xp_reward} XP</div>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                    </button>
                ))}
            </div>
        </div>
    );

    const renderIntro = () => (
        <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
            <AnimationRenderer
                sequence={currentLesson.animation_sequence || []}
                storyContent={currentLesson.active_story || resolveText(currentLesson.story_variants)}
                speedMultiplier={currentLesson.speed_multiplier || 1.0}
                language={language}
                onSequenceComplete={() => setPhase('practice')}
            />
        </div>
    );

    const renderPractice = () => {
        const challenge = currentLesson?.practice_challenges?.[0];
        return (
            <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
                {/* Vaathiyaar challenge instruction */}
                <div className="panel rounded-2xl p-6 border-l-4 border-l-purple-500/50">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-sm">🧑‍🏫</div>
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Vaathiyaar</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed">{resolveText(challenge?.instruction) || "Now you try!"}</p>
                </div>

                {/* Code editor */}
                <div className="rounded-xl overflow-hidden border border-white/10">
                    <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                        <span className="text-[10px] font-mono text-slate-500">practice.py</span>
                        <button
                            onClick={handleRunCode}
                            className="flex items-center gap-1.5 text-[10px] font-bold bg-green-500/10 text-green-400 px-3 py-1 rounded hover:bg-green-500/20 transition-colors uppercase tracking-wider"
                        >
                            <Play size={12} fill="currentColor" /> Run
                        </button>
                    </div>
                    <textarea
                        className="w-full bg-[#020617] text-slate-300 font-mono text-sm p-4 resize-none focus:outline-none leading-relaxed min-h-[150px]"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        placeholder={challenge?.starter_code || '# Write your code here\n'}
                        spellCheck="false"
                    />
                </div>

                {/* Output */}
                {output && (
                    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#020617]">
                        <div className="px-4 py-2 bg-white/5 border-b border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Output</div>
                        <pre className="p-4 font-mono text-sm text-green-400 whitespace-pre-wrap">{output}</pre>
                    </div>
                )}

                {/* Hint button */}
                <button onClick={handleHint} className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
                    💡 Need a hint?
                </button>
            </div>
        );
    };

    const renderFeedback = () => (
        <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
            {evalResult?.feedback?.animation && (
                <AnimationRenderer
                    sequence={evalResult.feedback.animation.sequence || []}
                    storyContent=""
                    language={language}
                />
            )}

            <div className={`panel rounded-2xl p-6 border-l-4 ${
                evalResult?.success ? 'border-l-green-500/50' : 'border-l-red-500/50'
            }`}>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-sm">🧑‍🏫</div>
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Vaathiyaar</span>
                </div>
                <p className="text-slate-200 leading-relaxed">
                    {evalResult?.feedback?.message || (evalResult?.success ? "Excellent work!" : "Not quite right. Let's try again.")}
                </p>
            </div>

            <div className="flex gap-3 justify-center">
                {evalResult?.success ? (
                    <button
                        onClick={() => { setCurrentLesson(null); setPhase('select'); }}
                        className="btn-neo btn-neo-primary"
                    >
                        Continue <ChevronRight size={16} className="ml-1" />
                    </button>
                ) : (
                    <button
                        onClick={() => { setPhase('practice'); setOutput(''); setEvalResult(null); }}
                        className="btn-neo btn-neo-ghost"
                    >
                        <RotateCcw size={14} className="mr-2" /> Try Again
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            {/* Main content area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto pb-32">
                {phase === 'select' && renderLessonSelect()}
                {phase === 'intro' && renderIntro()}
                {phase === 'practice' && renderPractice()}
                {phase === 'feedback' && renderFeedback()}

                {/* Chat messages (visible in all phases except select) */}
                {phase !== 'select' && chatMessages.length > 0 && (
                    <div className="max-w-2xl mx-auto mt-6 space-y-3">
                        {chatMessages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                            >
                                {msg.role === 'vaathiyaar' ? (
                                    <div className="flex gap-2 max-w-[85%]">
                                        <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-violet-600 rounded-full flex items-center justify-center text-[10px] shrink-0">🧑‍🏫</div>
                                        <div className="panel rounded-xl rounded-bl-sm p-3 text-sm text-slate-200 border-purple-500/10">
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl rounded-br-sm px-3 py-2 text-sm text-cyan-200 max-w-[70%]">
                                        {msg.content}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Persistent chat bar (visible in all phases except select) */}
            {phase !== 'select' && (
                <div className="sticky bottom-0 bg-gradient-to-t from-[#030712] via-[#030712] to-transparent pt-6 pb-2 px-4">
                    <div className="max-w-2xl mx-auto">
                        <ChatBar onSend={handleChat} loading={chatLoading} />
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Classroom.jsx
git commit -m "feat: add Classroom page with guided-flow phases — lesson select, animated intro, practice, and feedback"
```

---

## Task 11: Wire Everything Together — Routes, Layout, API

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/context/AuthContext.jsx`

- [ ] **Step 1: Update api.js with new endpoints**

```js
// frontend/src/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const api = axios.create({
  baseURL: API_URL,
});

// Auth
export const loginUser = (username, password) => api.post('/auth/login', { username, password });
export const registerUser = (username, password, name) => api.post('/auth/register', { username, password, name });

// Profile
export const getProfile = (userId) => api.get(`/profile/${userId}`);
export const saveOnboarding = (data) => api.post('/profile/onboarding', data);
export const recordSignal = (data) => api.post('/profile/signal', data);

// Classroom
export const classroomChat = (data) => api.post('/classroom/chat', data);
export const getLesson = (lessonId, userId) => api.get(`/classroom/lesson/${lessonId}?user_id=${userId}`);
export const listLessons = () => api.get('/classroom/lessons');
export const evaluateCode = (data) => api.post('/classroom/evaluate', data);
export const submitDiagnostic = (data) => api.post('/classroom/diagnostic', data);

// Language
export const getLanguages = () => api.get('/languages');
export const checkLanguage = (code) => api.get(`/languages/check/${code}`);

// Legacy (kept for backward compatibility during transition)
export const getModules = () => api.get('/content/modules');
export const getModule = (id) => api.get(`/content/module/${id}`);
export const completeModule = (userId, moduleId, score) => api.post('/content/complete', { user_id: userId, module_id: moduleId, score });

export default api;
```

- [ ] **Step 2: Update AuthContext to include onboarding state**

In `frontend/src/context/AuthContext.jsx`, replace the entire file:

```jsx
// frontend/src/context/AuthContext.jsx
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('pm_user'));
        } catch {
            return null;
        }
    });

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('pm_user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('pm_user');
    };

    const updateProgress = (points, unlocked) => {
        const updated = { ...user, points, unlocked };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    const updateUser = (data) => {
        const updated = { ...user, ...data };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, updateProgress, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
```

- [ ] **Step 3: Update Layout.jsx — rename Studio to Classroom**

In `frontend/src/components/Layout.jsx`, change the import and navItems:

Replace the icon import line:
```jsx
import {
    LayoutDashboard,
    BookOpen,
    GraduationCap,
    LogOut,
    Settings,
    ChevronRight,
    Terminal,
    Zap,
    Hexagon
} from 'lucide-react';
```

Replace the navItems array:
```jsx
    const navItems = [
        { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
        { icon: BookOpen, label: 'Learning Path', path: '/dashboard/learn' },
        { icon: GraduationCap, label: 'Classroom', path: '/dashboard/classroom' },
    ];
```

- [ ] **Step 4: Update App.jsx — add routes**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { Overview, LearningMap, ModuleViewer } from './pages/Dashboard';
import Classroom from './pages/Classroom';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />

            {/* Onboarding */}
            <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />

            {/* Dashboard */}
            <Route path="/dashboard" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Overview />} />
              <Route path="learn" element={<LearningMap />} />
              <Route path="learn/:id" element={<ModuleViewer />} />
              <Route path="classroom" element={<Classroom />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Remove StudioView export from Dashboard.jsx**

In `frontend/src/pages/Dashboard.jsx`, remove the entire `StudioView` function (lines 299-422) and remove `Code2`, `Cpu`, `Play`, `Send`, `Activity`, `Terminal as TerminalIcon` from the lucide imports if they are no longer used by other components. Keep imports used by Overview, LearningMap, and ModuleViewer.

- [ ] **Step 6: Verify full build**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Layout.jsx frontend/src/api.js frontend/src/context/AuthContext.jsx frontend/src/pages/Dashboard.jsx
git commit -m "feat: wire Classroom route, update navigation, remove Studio, add ProfileProvider"
```

---

## Task 12: Backend .env and Final Integration

**Files:**
- Create: `backend/.env`
- Modify: `backend/main.py` (load dotenv)
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Update requirements.txt**

```
fastapi
uvicorn
duckdb
pydantic
pydantic-settings
python-multipart
python-jose[cryptography]
passlib[bcrypt]
requests
python-dotenv
pytest
httpx
```

- [ ] **Step 2: Create .env file**

```bash
# backend/.env
OLLAMA_API_KEY=208d52f4a68a4c00aa4518fac8d995c6.oV--ePuqKn4DSs2T7tBW0KE7
OLLAMA_API_URL=https://api.ollama.com/v1
OLLAMA_MODEL=qwen3.5
DB_PATH=pymasters.duckdb
```

- [ ] **Step 3: Add dotenv loading to main.py**

At the top of `backend/main.py`, after the first imports, add:

```python
from dotenv import load_dotenv
load_dotenv()
```

- [ ] **Step 4: Ensure .env is in .gitignore**

Check root `.gitignore` — add `backend/.env` and `.env` if not present.

- [ ] **Step 5: Install new Python deps and run all tests**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && pip install python-dotenv pytest httpx && python -m pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 6: Start backend and verify new endpoints**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && python -c "from main import app; print('Routes:', [r.path for r in app.routes])"`
Expected: Shows `/api/classroom/chat`, `/api/classroom/lesson/{lesson_id}`, `/api/profile/onboarding`, `/api/languages`, etc.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/main.py .gitignore
git commit -m "feat: add dotenv loading, update deps, final backend integration"
```

---

## Task 13: End-to-End Smoke Test

- [ ] **Step 1: Start backend**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/backend && uvicorn main:app --reload --port 8001`

- [ ] **Step 2: Start frontend**

Run: `cd C:/Users/muthu/PycharmProjects/PyMasters/frontend && npm run dev`

- [ ] **Step 3: Verify these flows manually**

1. Open http://localhost:5173 → Login → Navigate to `/onboarding`
2. Complete onboarding conversation with Vaathiyaar
3. Navigate to Classroom → Select "For Loops" lesson
4. Watch the animation sequence play (StoryCard → CodeStepper → VariableBox → Terminal)
5. Write practice code in the editor → Run → See feedback
6. Open chat bar → Ask Vaathiyaar a question → Get response
7. Check language selector → Verify Hindi shows as blocked

- [ ] **Step 4: Fix any issues found during smoke test**

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Vaathiyaar + Classroom — complete integration"
```
