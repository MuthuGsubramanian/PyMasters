# PyMasters AI Learning Platform — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform PyMasters into a full AI-powered Python training portal with Claude API tutoring, interactive code execution, visual OOP/DSA explanations, gamification, and personalized learning paths.

**Architecture:** Dual-AI provider (Claude + HuggingFace) with smart model routing. Streamlit frontend with MongoDB backend. Cost-conscious: Haiku-first with Sonnet escalation. Server-side code sandbox for execution.

**Tech Stack:** Streamlit, MongoDB, Claude API (anthropic SDK), HuggingFace Hub, Plotly (charts), Streamlit-ace (code editor)

---

## Chunk 1: AI Engine Foundation

### Task 1: Add anthropic SDK and dependencies

**Files:**
- Modify: `requirements.txt`
- Modify: `config/settings.py`

- [ ] **Step 1: Update requirements.txt**

Add these lines to `requirements.txt`:

```
anthropic>=0.49.0
streamlit-ace>=0.1.1
```

- [ ] **Step 2: Add Claude settings to config/settings.py**

Add to the `Settings` class in `config/settings.py` after the `huggingfacehub_api_token` field:

```python
anthropic_api_key: Optional[str] = Field(
    default=None,
    env="ANTHROPIC_API_KEY",
    description="API key for Claude AI services.",
)
```

- [ ] **Step 3: Install new dependencies**

Run: `pip install anthropic streamlit-ace`

- [ ] **Step 4: Commit**

```bash
git add requirements.txt config/settings.py
git commit -m "feat: add anthropic SDK and streamlit-ace dependencies"
```

### Task 2: AI Cache Service

**Files:**
- Create: `pymasters_app/services/__init__.py`
- Create: `pymasters_app/services/cache_service.py`

- [ ] **Step 1: Create services __init__.py**

Create empty `pymasters_app/services/__init__.py`.

- [ ] **Step 2: Create cache_service.py**

Create `pymasters_app/services/cache_service.py`:

```python
"""AI response caching backed by MongoDB."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Optional


class CacheService:
    """Cache AI responses in MongoDB with TTL support."""

    def __init__(self, db: Any) -> None:
        self._col = db["ai_cache"]
        self._col.create_index("cache_key", unique=True)
        self._col.create_index("expires_at", expireAfterSeconds=0)

    def get(self, prompt: str, model: str) -> Optional[str]:
        key = self._make_key(prompt, model)
        doc = self._col.find_one({"cache_key": key, "expires_at": {"$gt": datetime.utcnow()}})
        return doc["response"] if doc else None

    def set(self, prompt: str, model: str, response: str, ttl_seconds: int = 86400) -> None:
        key = self._make_key(prompt, model)
        self._col.update_one(
            {"cache_key": key},
            {"$set": {
                "cache_key": key,
                "response": response,
                "model": model,
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds),
            }},
            upsert=True,
        )

    @staticmethod
    def _make_key(prompt: str, model: str) -> str:
        raw = json.dumps({"prompt": prompt.strip().lower(), "model": model}, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()
```

- [ ] **Step 3: Commit**

```bash
git add pymasters_app/services/
git commit -m "feat: add AI response cache service"
```

### Task 3: Claude Service

**Files:**
- Create: `pymasters_app/services/claude_service.py`

- [ ] **Step 1: Create claude_service.py**

Create `pymasters_app/services/claude_service.py`:

```python
"""Claude API wrapper for PyMasters."""
from __future__ import annotations

import os
from typing import Any, Optional

import anthropic
import streamlit as st


def _get_api_key() -> str:
    key = os.getenv("ANTHROPIC_API_KEY")
    if key:
        return key
    try:
        return st.secrets["ANTHROPIC_API_KEY"]
    except Exception:
        raise RuntimeError("ANTHROPIC_API_KEY not set in env or Streamlit secrets.")


class ClaudeService:
    """Thin wrapper around the Anthropic Messages API."""

    HAIKU = "claude-haiku-4-5-20251001"
    SONNET = "claude-sonnet-4-6"

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=_get_api_key())

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str = "",
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        model = model or self.HAIKU
        resp = self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=messages,
        )
        return resp.content[0].text

    def quick(self, prompt: str, *, model: str | None = None, max_tokens: int = 512) -> str:
        """Single-turn convenience method."""
        return self.chat(
            [{"role": "user", "content": prompt}],
            model=model or self.HAIKU,
            max_tokens=max_tokens,
        )
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/services/claude_service.py
git commit -m "feat: add Claude API service wrapper"
```

### Task 4: AI Router

**Files:**
- Create: `pymasters_app/services/ai_router.py`

- [ ] **Step 1: Create ai_router.py**

Create `pymasters_app/services/ai_router.py`:

```python
"""AI model routing — Haiku for simple, Sonnet for complex tasks."""
from __future__ import annotations

from typing import Any, Optional

from pymasters_app.services.claude_service import ClaudeService
from pymasters_app.services.cache_service import CacheService


# Keywords that signal complex tasks requiring Sonnet
_COMPLEX_SIGNALS = [
    "review my code", "debug", "refactor", "architecture", "design pattern",
    "explain this error", "project", "build", "create a", "step by step",
    "compare", "optimize", "performance", "security", "best practice",
    "class design", "inheritance", "polymorphism", "data structure",
]


class AIRouter:
    """Route AI requests to the appropriate Claude model with caching."""

    def __init__(self, db: Any) -> None:
        self._claude = ClaudeService()
        self._cache = CacheService(db)

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str = "",
        force_model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        use_cache: bool = False,
        cache_ttl: int = 86400,
    ) -> str:
        model = force_model or self._select_model(messages)

        if use_cache and len(messages) == 1:
            cached = self._cache.get(messages[0]["content"], model)
            if cached:
                return cached

        response = self._claude.chat(
            messages, system=system, model=model,
            max_tokens=max_tokens, temperature=temperature,
        )

        if use_cache and len(messages) == 1:
            self._cache.set(messages[0]["content"], model, response, cache_ttl)

        return response

    def quick(self, prompt: str, **kwargs) -> str:
        return self.chat([{"role": "user", "content": prompt}], **kwargs)

    def _select_model(self, messages: list[dict[str, str]]) -> str:
        last_msg = messages[-1]["content"].lower() if messages else ""
        if any(signal in last_msg for signal in _COMPLEX_SIGNALS):
            return ClaudeService.SONNET
        if len(last_msg) > 500:
            return ClaudeService.SONNET
        return ClaudeService.HAIKU
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/services/ai_router.py
git commit -m "feat: add AI router with Haiku/Sonnet model selection"
```

### Task 5: HuggingFace Service (refactored)

**Files:**
- Create: `pymasters_app/services/hf_service.py`

- [ ] **Step 1: Create hf_service.py**

Create `pymasters_app/services/hf_service.py` (refactored from legacy `services/huggingface_service.py`):

```python
"""HuggingFace Inference API wrapper for embeddings and recommendations."""
from __future__ import annotations

import os
from typing import Optional

import streamlit as st
from huggingface_hub import InferenceClient


def _get_hf_token() -> Optional[str]:
    token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if token:
        return token
    try:
        return st.secrets.get("HUGGINGFACEHUB_API_TOKEN")
    except Exception:
        return None


class HFService:
    """HuggingFace service for embeddings and feature extraction."""

    EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

    def __init__(self) -> None:
        token = _get_hf_token()
        self._client = InferenceClient(token=token) if token else None

    @property
    def available(self) -> bool:
        return self._client is not None

    def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not self._client:
            return []
        result = self._client.feature_extraction(texts, model=self.EMBED_MODEL)
        if hasattr(result, "tolist"):
            return result.tolist()
        return result

    def get_similarity(self, text_a: str, text_b: str) -> float:
        embeddings = self.get_embeddings([text_a, text_b])
        if len(embeddings) < 2:
            return 0.0
        import numpy as np
        a, b = np.array(embeddings[0]), np.array(embeddings[1])
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/services/hf_service.py
git commit -m "feat: add refactored HuggingFace service for embeddings"
```

### Task 6: XP and Gamification Service

**Files:**
- Create: `pymasters_app/services/xp_service.py`

- [ ] **Step 1: Create xp_service.py**

Create `pymasters_app/services/xp_service.py`:

```python
"""XP, streaks, ranks, and achievement tracking."""
from __future__ import annotations

from datetime import datetime, date, timedelta
from typing import Any

RANKS = [
    (0, "Novice"),
    (100, "Apprentice"),
    (500, "Developer"),
    (1500, "Engineer"),
    (4000, "Master"),
    (10000, "Grandmaster"),
]

XP_REWARDS = {
    "lesson_complete": 15,
    "exercise_pass": 25,
    "exercise_first_try": 40,
    "project_milestone": 50,
    "daily_login": 5,
    "streak_bonus_7": 30,
    "streak_bonus_30": 100,
}

ACHIEVEMENTS = [
    {"key": "first_lesson", "title": "First Step", "description": "Complete your first lesson", "icon": "🎯", "category": "learning"},
    {"key": "streak_7", "title": "On Fire", "description": "7-day learning streak", "icon": "🔥", "category": "streak"},
    {"key": "streak_30", "title": "Unstoppable", "description": "30-day learning streak", "icon": "⚡", "category": "streak"},
    {"key": "first_project", "title": "Builder", "description": "Complete your first project", "icon": "🏗️", "category": "mastery"},
    {"key": "xp_100", "title": "Rising Star", "description": "Earn 100 XP", "icon": "⭐", "category": "learning"},
    {"key": "xp_1000", "title": "Powerhouse", "description": "Earn 1000 XP", "icon": "💪", "category": "learning"},
    {"key": "all_exercises", "title": "Completionist", "description": "Complete all exercises in a module", "icon": "🏆", "category": "mastery"},
    {"key": "code_reviewer", "title": "Code Reviewer", "description": "Get 10 AI code reviews", "icon": "🔍", "category": "learning"},
]


class XPService:
    """Manage XP, streaks, ranks, and achievements."""

    def __init__(self, db: Any) -> None:
        self._users = db["users"]
        self._achievements_col = db["achievements"]
        self._seed_achievements()

    def _seed_achievements(self) -> None:
        for ach in ACHIEVEMENTS:
            self._achievements_col.update_one(
                {"key": ach["key"]},
                {"$setOnInsert": ach},
                upsert=True,
            )

    def award_xp(self, user_id: str, action: str) -> dict[str, Any]:
        xp_amount = XP_REWARDS.get(action, 0)
        if xp_amount == 0:
            return {"xp_gained": 0}

        from bson import ObjectId
        user = self._users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return {"xp_gained": 0}

        current_xp = user.get("xp", 0)
        new_xp = current_xp + xp_amount
        old_rank = self.get_rank(current_xp)
        new_rank = self.get_rank(new_xp)

        self._users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"xp": new_xp, "rank": new_rank}},
        )

        result = {"xp_gained": xp_amount, "total_xp": new_xp, "rank": new_rank}
        if new_rank != old_rank:
            result["rank_up"] = True
        return result

    def update_streak(self, user_id: str) -> dict[str, Any]:
        from bson import ObjectId
        user = self._users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return {"streak": 0}

        today = date.today()
        last_active = user.get("last_active_date")
        streak = user.get("streak", 0)

        if last_active:
            if isinstance(last_active, datetime):
                last_active = last_active.date()
            if last_active == today:
                return {"streak": streak, "already_active": True}
            elif last_active == today - timedelta(days=1):
                streak += 1
            else:
                streak = 1
        else:
            streak = 1

        updates: dict[str, Any] = {
            "streak": streak,
            "last_active_date": datetime.combine(today, datetime.min.time()),
        }
        self._users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})

        result = {"streak": streak}
        # Check streak achievements
        new_achievements = []
        if streak >= 7:
            new_achievements.append("streak_7")
            self.award_xp(user_id, "streak_bonus_7")
        if streak >= 30:
            new_achievements.append("streak_30")
            self.award_xp(user_id, "streak_bonus_30")

        for ach_key in new_achievements:
            self.grant_achievement(user_id, ach_key)
        result["new_achievements"] = new_achievements
        return result

    def grant_achievement(self, user_id: str, achievement_key: str) -> bool:
        from bson import ObjectId
        result = self._users.update_one(
            {"_id": ObjectId(user_id), "achievements": {"$ne": achievement_key}},
            {"$addToSet": {"achievements": achievement_key}},
        )
        return result.modified_count > 0

    def get_user_stats(self, user_id: str) -> dict[str, Any]:
        from bson import ObjectId
        user = self._users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return {"xp": 0, "streak": 0, "rank": "Novice", "achievements": []}
        xp = user.get("xp", 0)
        return {
            "xp": xp,
            "streak": user.get("streak", 0),
            "rank": self.get_rank(xp),
            "achievements": user.get("achievements", []),
            "skill_levels": user.get("skill_levels", {}),
        }

    def get_all_achievements(self) -> list[dict[str, Any]]:
        return list(self._achievements_col.find({}, {"_id": 0}))

    @staticmethod
    def get_rank(xp: int) -> str:
        rank = "Novice"
        for threshold, name in RANKS:
            if xp >= threshold:
                rank = name
        return rank

    @staticmethod
    def xp_to_next_rank(xp: int) -> tuple[str, int]:
        for threshold, name in RANKS:
            if xp < threshold:
                return name, threshold - xp
        return "Grandmaster", 0
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/services/xp_service.py
git commit -m "feat: add XP, streaks, ranks, and achievements service"
```

### Task 7: Safe Code Executor

**Files:**
- Create: `pymasters_app/services/code_executor.py`

- [ ] **Step 1: Create code_executor.py**

Create `pymasters_app/services/code_executor.py`:

```python
"""Safe Python code execution in a restricted subprocess."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import os
from dataclasses import dataclass


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    success: bool
    timeout: bool = False


RESTRICTED_WRAPPER = '''
import sys
import io

# Block dangerous modules
_BLOCKED = {"os", "subprocess", "shutil", "socket", "http", "urllib",
            "ftplib", "smtplib", "ctypes", "importlib", "pathlib",
            "glob", "tempfile", "signal", "multiprocessing", "threading"}

_original_import = __builtins__.__import__ if hasattr(__builtins__, "__import__") else __import__

def _safe_import(name, *args, **kwargs):
    if name.split(".")[0] in _BLOCKED:
        raise ImportError(f"Module '{name}' is not allowed in the sandbox")
    return _original_import(name, *args, **kwargs)

import builtins
builtins.__import__ = _safe_import

# Capture output
_stdout = io.StringIO()
_stderr = io.StringIO()
sys.stdout = _stdout
sys.stderr = _stderr

try:
    exec(open("{code_file}", "r").read())
except Exception as e:
    print(f"{{type(e).__name__}}: {{e}}", file=_stderr)

sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
print("__STDOUT__")
print(_stdout.getvalue())
print("__STDERR__")
print(_stderr.getvalue())
'''


def execute_code(code: str, timeout: int = 10) -> ExecutionResult:
    """Execute Python code in a restricted subprocess with timeout."""
    if not code.strip():
        return ExecutionResult(stdout="", stderr="No code to execute.", success=False)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as code_f:
        code_f.write(code)
        code_path = code_f.name

    wrapper_code = RESTRICTED_WRAPPER.replace("{code_file}", code_path.replace("\\", "\\\\"))

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as wrap_f:
        wrap_f.write(wrapper_code)
        wrapper_path = wrap_f.name

    try:
        result = subprocess.run(
            [sys.executable, wrapper_path],
            capture_output=True, text=True, timeout=timeout,
        )
        output = result.stdout
        stdout = ""
        stderr = ""
        if "__STDOUT__" in output:
            parts = output.split("__STDOUT__\n", 1)
            if len(parts) > 1:
                rest = parts[1]
                if "__STDERR__" in rest:
                    stdout, stderr = rest.split("__STDERR__\n", 1)
                else:
                    stdout = rest
        else:
            stdout = output
            stderr = result.stderr

        return ExecutionResult(
            stdout=stdout.strip(),
            stderr=stderr.strip(),
            success=not stderr.strip(),
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            stdout="", stderr=f"Execution timed out after {timeout} seconds.",
            success=False, timeout=True,
        )
    finally:
        for f in (code_path, wrapper_path):
            try:
                os.unlink(f)
            except OSError:
                pass


def run_with_tests(code: str, test_cases: list[dict]) -> list[dict]:
    """Run code then evaluate test expressions against it."""
    results = []
    for test in test_cases:
        full_code = code + "\n" + test.get("test_code", "")
        result = execute_code(full_code)
        expected = test.get("expected_output", "").strip()
        actual = result.stdout.strip()
        passed = actual == expected and result.success
        results.append({
            "name": test.get("name", "Test"),
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "error": result.stderr if not result.success else "",
        })
    return results
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/services/code_executor.py
git commit -m "feat: add safe Python code executor with test runner"
```

---

## Chunk 2: Updated Navigation and Global CSS

### Task 8: Update main.py — navigation, CSS, and routing

**Files:**
- Modify: `pymasters_app/main.py`

- [ ] **Step 1: Update imports and page config in main.py**

Replace the imports section (lines 1-12) of `pymasters_app/main.py`:

```python
"""PyMasters Streamlit application entrypoint (modern layout)."""
from __future__ import annotations

import streamlit as st

from pymasters_app.components.header import render_header
from pymasters_app.views import dashboard, login, profile, signup
from pymasters_app.views import tutor, code_arena, project_studio
from pymasters_app.views import learning_paths, progress_pulse
from pymasters_app.utils.auth import AuthManager
from pymasters_app.utils.db import get_database
from pymasters_app.utils.bootstrap import ensure_collections
from pymasters_app.services.xp_service import XPService
from utils.streamlit_helpers import rerun
```

- [ ] **Step 2: Update the global CSS**

Replace the `st.markdown` CSS block (lines 23-121) to add JetBrains Mono font and new component styles. Add after the existing `@import` line:

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
```

Add these new CSS rules after the existing `.pm-auth-card p` rule:

```css
/* Code blocks */
.pm-code-block {
    font-family: 'JetBrains Mono', monospace;
    background: rgba(2,6,23,0.9);
    border: 1px solid rgba(56,189,248,0.15);
    border-radius: 12px;
    padding: 1rem;
    overflow-x: auto;
}

/* XP bar */
.pm-xp-bar {
    height: 6px;
    background: rgba(148,163,184,0.15);
    border-radius: 999px;
    overflow: hidden;
}
.pm-xp-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #c084fc);
    border-radius: 999px;
    transition: width 0.5s ease;
}

/* Rank badge */
.pm-rank-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(56,189,248,0.15), rgba(192,132,252,0.15));
    border: 1px solid rgba(56,189,248,0.25);
    font-size: 0.8rem;
    font-weight: 600;
    color: #38bdf8;
    letter-spacing: 0.04em;
}

/* AI chat bubble */
.pm-ai-bubble {
    background: linear-gradient(135deg, rgba(124,58,237,0.12), rgba(192,132,252,0.06));
    border: 1px solid rgba(124,58,237,0.25);
    border-radius: 16px;
    padding: 1rem 1.2rem;
    margin: 0.5rem 0;
}
.pm-user-bubble {
    background: rgba(56,189,248,0.08);
    border: 1px solid rgba(56,189,248,0.2);
    border-radius: 16px;
    padding: 1rem 1.2rem;
    margin: 0.5rem 0;
}

/* Skill radar placeholder */
.pm-card-glass {
    background: linear-gradient(145deg, rgba(15,23,42,0.85), rgba(2,6,23,0.75));
    border-radius: 20px;
    border: 1px solid rgba(148,163,184,0.18);
    padding: 1.5rem;
    box-shadow: 0 18px 45px -20px rgba(59,130,246,0.35);
}

/* Achievement badge */
.pm-achievement {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.8rem;
    border-radius: 16px;
    background: rgba(15,23,42,0.6);
    border: 1px solid rgba(148,163,184,0.12);
    text-align: center;
    min-width: 80px;
}
.pm-achievement-locked {
    opacity: 0.35;
    filter: grayscale(1);
}

/* Streak indicator */
.pm-streak {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #f59e0b;
    font-weight: 600;
}

/* Visual explanation card */
.pm-visual-card {
    background: rgba(15,23,42,0.7);
    border-radius: 16px;
    border: 1px solid rgba(56,189,248,0.15);
    padding: 1.5rem;
    margin: 1rem 0;
}
.pm-visual-card pre {
    font-family: 'JetBrains Mono', monospace;
    color: #38bdf8;
    font-size: 0.85rem;
    line-height: 1.6;
    margin: 0;
}
```

- [ ] **Step 3: Update page routing**

Replace the page routing section (lines 167-220) with:

```python
public_pages = ("Login", "Sign Up")
private_pages = ("Dashboard", "AI Tutor", "Code Arena", "Projects", "Learning", "Analytics", "Profile", "Log out")

if not user and st.session_state.get("current_page") not in public_pages:
    st.session_state["current_page"] = "Login"

nav_pages = private_pages if user else public_pages
selected_page = render_header(
    user=user,
    on_logout=auth_manager.logout,
    pages=nav_pages,
    current_page=st.session_state["current_page"],
)
if selected_page and selected_page != st.session_state["current_page"]:
    st.session_state["current_page"] = selected_page

if st.session_state["current_page"] == "Log out":
    auth_manager.logout()
    st.session_state["current_page"] = "Login"
    rerun()

user = auth_manager.get_current_user()

# Update streak on page load for logged-in users
if user:
    xp_svc = XPService(db)
    xp_svc.update_streak(user["id"])

page = st.session_state["current_page"]

if page == "Login":
    login.render(auth_manager)
elif page == "Sign Up":
    signup.render(auth_manager)
elif page == "Profile":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        profile.render(auth_manager=auth_manager, user=user, db=db)
elif page == "AI Tutor":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        tutor.render(user=user, db=db)
elif page == "Code Arena":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        code_arena.render(user=user, db=db)
elif page == "Projects":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        project_studio.render(user=user, db=db)
elif page == "Learning":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        learning_paths.render(user=user, db=db)
elif page == "Analytics":
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        progress_pulse.render(user=user, db=db)
else:
    if not user:
        st.warning("Please sign in to continue.")
        login.render(auth_manager)
    else:
        dashboard.render(db=db, user=user)
```

- [ ] **Step 4: Commit**

```bash
git add pymasters_app/main.py
git commit -m "feat: update main.py with new pages, CSS, and XP tracking"
```

---

## Chunk 3: Core Views — Dashboard, AI Tutor, Code Arena

### Task 9: Dashboard (Mission Control)

**Files:**
- Modify: `pymasters_app/views/dashboard.py`

- [ ] **Step 1: Rewrite dashboard.py**

Replace the entire content of `pymasters_app/views/dashboard.py` with the new Mission Control dashboard. Key features:
- AI-generated daily tip (cached, Haiku)
- XP/streak/rank display with progress bar
- "Next Mission" recommendation card
- Module grid with progress indicators
- Quick-launch actions

```python
"""Dashboard — Mission Control view."""
from __future__ import annotations

from typing import Any
import streamlit as st

from pymasters_app.services.xp_service import XPService
from pymasters_app.services.ai_router import AIRouter


def render(*, db: Any, user: dict[str, Any]) -> None:
    xp_svc = XPService(db)
    stats = xp_svc.get_user_stats(user["id"])
    xp = stats["xp"]
    streak = stats["streak"]
    rank = stats["rank"]
    next_rank, xp_needed = xp_svc.xp_to_next_rank(xp)

    # Hero greeting
    st.markdown(f"""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#38bdf8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">Mission Control</span>
    </div>
    <h1 style="font-size:2rem;margin-bottom:0.3rem;">Welcome back, {user['name'].split()[0]}</h1>
    """, unsafe_allow_html=True)

    # Stats row
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div style="color:#22c55e;font-size:1.8rem;font-weight:700;">{xp}</div>
            <div style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.15em;">XP</div>
        </div>""", unsafe_allow_html=True)
    with c2:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div class="pm-streak" style="font-size:1.8rem;justify-content:center;">🔥 {streak}</div>
            <div style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.15em;">Streak</div>
        </div>""", unsafe_allow_html=True)
    with c3:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div class="pm-rank-badge" style="font-size:1rem;margin:0.3rem auto;">{rank}</div>
            <div style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.15em;">Rank</div>
        </div>""", unsafe_allow_html=True)
    with c4:
        if xp_needed > 0:
            pct = min(100, int((xp / (xp + xp_needed)) * 100))
            st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
                <div style="color:#c084fc;font-size:0.9rem;font-weight:600;">{xp_needed} XP to {next_rank}</div>
                <div class="pm-xp-bar" style="margin-top:0.5rem;"><div class="pm-xp-bar-fill" style="width:{pct}%;"></div></div>
            </div>""", unsafe_allow_html=True)
        else:
            st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
                <div style="color:#c084fc;font-size:1rem;font-weight:600;">Max Rank!</div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # AI Daily Tip
    try:
        router = AIRouter(db)
        tip = router.quick(
            f"Give a short, practical Python tip for a {rank.lower()}-level learner. "
            "One paragraph, include a tiny code example if relevant. Be encouraging.",
            use_cache=True, cache_ttl=86400,
        )
        st.markdown(f"""<div class="pm-ai-bubble">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;">🧠</span>
                <span style="color:#c084fc;font-weight:600;font-size:0.85rem;">Daily AI Tip</span>
            </div>
            <div style="color:#e0d4f5;font-size:0.9rem;line-height:1.6;">{tip}</div>
        </div>""", unsafe_allow_html=True)
    except Exception:
        pass  # Skip tip if AI is unavailable

    st.markdown("<br>", unsafe_allow_html=True)

    # Learning modules
    st.markdown('<h2 style="font-size:1.3rem;">Your Learning Modules</h2>', unsafe_allow_html=True)
    modules = list(db["learning_modules"].find({}))
    if not modules:
        st.info("No learning modules available yet. Check back soon!")
        return

    for mod in modules:
        mod_id = str(mod.get("id", mod.get("_id", "")))
        progress = db["progress"].find_one({"user_id": user["id"], "module_id": mod_id})
        status = progress.get("status", "not_started") if progress else "not_started"
        status_color = {"not_started": "#94a3b8", "in_progress": "#f59e0b", "completed": "#22c55e"}.get(status, "#94a3b8")
        status_label = status.replace("_", " ").title()

        tags_html = "".join(
            f'<span style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);'
            f'border-radius:999px;padding:0.15rem 0.6rem;font-size:0.7rem;color:#38bdf8;">{t}</span>'
            for t in mod.get("tags", [])
        )

        st.markdown(f"""<div class="pm-card-glass" style="margin-bottom:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h3 style="font-size:1.1rem;margin-bottom:0.3rem;">{mod.get('title', 'Module')}</h3>
                    <p style="font-size:0.85rem;margin-bottom:0.5rem;">{mod.get('description', '')}</p>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">{tags_html}</div>
                </div>
                <div style="text-align:right;">
                    <span style="color:{status_color};font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">{status_label}</span>
                    <div style="color:#94a3b8;font-size:0.75rem;margin-top:0.3rem;">{mod.get('estimated_minutes', '?')} min • {mod.get('difficulty', 'Beginner')}</div>
                </div>
            </div>
        </div>""", unsafe_allow_html=True)

        col1, col2, col3 = st.columns([1, 1, 4])
        with col1:
            if status != "completed":
                label = "Continue" if status == "in_progress" else "Start"
                if st.button(label, key=f"start_{mod_id}"):
                    db["progress"].update_one(
                        {"user_id": user["id"], "module_id": mod_id},
                        {"$set": {"status": "in_progress", "updated_at": __import__("datetime").datetime.utcnow()}},
                        upsert=True,
                    )
                    st.rerun()
        with col2:
            if status == "in_progress":
                if st.button("Complete", key=f"done_{mod_id}"):
                    db["progress"].update_one(
                        {"user_id": user["id"], "module_id": mod_id},
                        {"$set": {"status": "completed", "updated_at": __import__("datetime").datetime.utcnow()}},
                        upsert=True,
                    )
                    xp_svc.award_xp(user["id"], "lesson_complete")
                    st.rerun()
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/dashboard.py
git commit -m "feat: rewrite dashboard as AI-powered mission control"
```

### Task 10: AI Tutor (Claude-Powered)

**Files:**
- Modify: `pymasters_app/views/tutor.py`

- [ ] **Step 1: Rewrite tutor.py**

Replace `pymasters_app/views/tutor.py` entirely:

```python
"""AI Tutor — Claude-powered Python mentor."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import streamlit as st
from pymasters_app.services.ai_router import AIRouter
from pymasters_app.services.claude_service import ClaudeService
from pymasters_app.services.xp_service import XPService

SYSTEM_PROMPT = """You are PyMaster, a world-class Python tutor inside the PyMasters learning platform.

Your personality:
- Friendly, encouraging, and patient
- You explain complex concepts with simple analogies and visual ASCII diagrams
- You always provide code examples
- When reviewing code, give specific, actionable feedback
- For OOP/DSA concepts, draw ASCII art diagrams showing relationships and data flows
- Adapt your explanations to the student's level

When explaining concepts visually, use ASCII art boxes, arrows, and diagrams like:
┌─────────┐    ┌─────────┐
│  Class A │───▶│  Class B │
└─────────┘    └─────────┘

For data structures, show step-by-step operations:
Stack: [1, 2, 3] → push(4) → [1, 2, 3, 4]

Always format code in Python markdown blocks. Keep explanations concise but thorough."""

SUGGESTED_PROMPTS = [
    "Explain Python decorators with a visual example",
    "Review my code and suggest improvements",
    "Quiz me on list comprehensions",
    "What's the difference between a list and a tuple?",
    "Show me how a binary search tree works visually",
    "Explain OOP inheritance with a real-world example",
    "Help me understand recursion step by step",
]


def render(*, user: dict[str, Any], db: Any) -> None:
    router = AIRouter(db)
    xp_svc = XPService(db)

    st.markdown("""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#c084fc;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">AI Tutor</span>
    </div>
    <h1 style="font-size:1.8rem;margin-bottom:0.3rem;">🧠 PyMaster — Your AI Mentor</h1>
    <p style="font-size:0.9rem;color:#94a3b8;">Ask anything about Python. I'll explain with visuals, code, and examples.</p>
    """, unsafe_allow_html=True)

    # Initialize chat history
    if "tutor_messages" not in st.session_state:
        # Load from DB if exists
        session = db["tutor_sessions"].find_one(
            {"user_id": user["id"]},
            sort=[("created_at", -1)],
        )
        if session and session.get("messages"):
            st.session_state["tutor_messages"] = session["messages"]
        else:
            st.session_state["tutor_messages"] = []

    # Suggested prompts
    if not st.session_state["tutor_messages"]:
        st.markdown('<p style="color:#94a3b8;font-size:0.85rem;margin-top:1rem;">Try asking:</p>', unsafe_allow_html=True)
        cols = st.columns(3)
        for i, prompt in enumerate(SUGGESTED_PROMPTS[:6]):
            with cols[i % 3]:
                if st.button(f"💡 {prompt}", key=f"suggest_{i}", use_container_width=True):
                    st.session_state["tutor_messages"].append({"role": "user", "content": prompt})
                    st.rerun()

    # Display chat history
    for msg in st.session_state["tutor_messages"]:
        if msg["role"] == "user":
            st.markdown(f"""<div class="pm-user-bubble">
                <div style="color:#38bdf8;font-size:0.75rem;font-weight:600;margin-bottom:0.3rem;">You</div>
                <div style="color:#f8fafc;font-size:0.9rem;line-height:1.6;">{msg['content']}</div>
            </div>""", unsafe_allow_html=True)
        else:
            st.markdown(f"""<div class="pm-ai-bubble">
                <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;">
                    <span style="font-size:1rem;">🧠</span>
                    <span style="color:#c084fc;font-size:0.75rem;font-weight:600;">PyMaster</span>
                </div>
            </div>""", unsafe_allow_html=True)
            st.markdown(msg["content"])

    # Generate response if last message is from user
    if st.session_state["tutor_messages"] and st.session_state["tutor_messages"][-1]["role"] == "user":
        with st.spinner("PyMaster is thinking..."):
            try:
                stats = xp_svc.get_user_stats(user["id"])
                context = f"\nStudent level: {stats['rank']}. XP: {stats['xp']}."
                response = router.chat(
                    st.session_state["tutor_messages"],
                    system=SYSTEM_PROMPT + context,
                    max_tokens=2048,
                    temperature=0.7,
                )
                st.session_state["tutor_messages"].append({"role": "assistant", "content": response})

                # Save to DB
                db["tutor_sessions"].update_one(
                    {"user_id": user["id"]},
                    {"$set": {
                        "user_id": user["id"],
                        "messages": st.session_state["tutor_messages"],
                        "updated_at": datetime.utcnow(),
                    }, "$setOnInsert": {"created_at": datetime.utcnow()}},
                    upsert=True,
                )
                st.rerun()
            except Exception as e:
                st.error(f"AI service error: {e}")

    # Chat input
    user_input = st.chat_input("Ask PyMaster anything about Python...")
    if user_input:
        st.session_state["tutor_messages"].append({"role": "user", "content": user_input})
        st.rerun()

    # Clear chat
    if st.session_state["tutor_messages"]:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("🗑️ Clear conversation", key="clear_chat"):
            st.session_state["tutor_messages"] = []
            db["tutor_sessions"].delete_many({"user_id": user["id"]})
            st.rerun()
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/tutor.py
git commit -m "feat: rewrite AI tutor with Claude, visual explanations, suggested prompts"
```

### Task 11: Code Arena

**Files:**
- Create: `pymasters_app/views/code_arena.py`

- [ ] **Step 1: Create code_arena.py**

Create `pymasters_app/views/code_arena.py`:

```python
"""Code Arena — Interactive coding with AI feedback."""
from __future__ import annotations

from typing import Any
import streamlit as st
from streamlit_ace import st_ace

from pymasters_app.services.code_executor import execute_code
from pymasters_app.services.ai_router import AIRouter
from pymasters_app.services.xp_service import XPService

SAMPLE_EXERCISES = [
    {
        "title": "FizzBuzz",
        "type": "complete_function",
        "difficulty": "Beginner",
        "description": "Write a function that prints numbers 1-20. For multiples of 3 print 'Fizz', multiples of 5 print 'Buzz', both print 'FizzBuzz'.",
        "starter_code": "def fizzbuzz():\n    # Your code here\n    pass\n\nfizzbuzz()",
        "tags": ["loops", "conditionals"],
    },
    {
        "title": "Reverse a String",
        "type": "complete_function",
        "difficulty": "Beginner",
        "description": "Write a function that reverses a string without using slicing or built-in reverse methods.",
        "starter_code": "def reverse_string(s):\n    # Your code here\n    pass\n\nprint(reverse_string('hello'))\nprint(reverse_string('Python'))",
        "tags": ["strings", "loops"],
    },
    {
        "title": "Find Duplicates",
        "type": "complete_function",
        "difficulty": "Intermediate",
        "description": "Write a function that finds all duplicate elements in a list and returns them as a sorted list.",
        "starter_code": "def find_duplicates(lst):\n    # Your code here\n    pass\n\nprint(find_duplicates([1, 2, 3, 2, 4, 5, 3]))\nprint(find_duplicates([1, 1, 1, 2, 2, 3]))",
        "tags": ["lists", "sets", "data_structures"],
    },
    {
        "title": "Stack Implementation",
        "type": "complete_function",
        "difficulty": "Intermediate",
        "description": "Implement a Stack class with push, pop, peek, and is_empty methods.",
        "starter_code": "class Stack:\n    def __init__(self):\n        # Your code here\n        pass\n\n    def push(self, item):\n        pass\n\n    def pop(self):\n        pass\n\n    def peek(self):\n        pass\n\n    def is_empty(self):\n        pass\n\ns = Stack()\ns.push(1)\ns.push(2)\ns.push(3)\nprint(s.peek())  # 3\nprint(s.pop())   # 3\nprint(s.pop())   # 2\nprint(s.is_empty())  # False",
        "tags": ["oop", "data_structures"],
    },
]


def render(*, user: dict[str, Any], db: Any) -> None:
    router = AIRouter(db)
    xp_svc = XPService(db)

    st.markdown("""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#22c55e;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">Code Arena</span>
    </div>
    <h1 style="font-size:1.8rem;margin-bottom:0.3rem;">⚔️ Code Arena</h1>
    <p style="font-size:0.9rem;color:#94a3b8;">Write code, run it, get AI feedback. Level up your Python skills.</p>
    """, unsafe_allow_html=True)

    # Mode selection
    tab1, tab2 = st.tabs(["📝 Exercises", "🆓 Free Code"])

    with tab1:
        _render_exercises(db, user, router, xp_svc)

    with tab2:
        _render_free_code(router)


def _render_exercises(db: Any, user: dict, router: AIRouter, xp_svc: XPService) -> None:
    # Load exercises from DB or use samples
    exercises = list(db["exercises"].find({}))
    if not exercises:
        exercises = SAMPLE_EXERCISES
        for ex in exercises:
            db["exercises"].update_one(
                {"title": ex["title"]},
                {"$setOnInsert": ex},
                upsert=True,
            )

    # Exercise selector
    titles = [ex["title"] for ex in exercises]
    selected = st.selectbox("Choose an exercise", titles, key="exercise_select")
    exercise = next((ex for ex in exercises if ex["title"] == selected), exercises[0])

    st.markdown(f"""<div class="pm-card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="font-size:1.1rem;margin:0;">{exercise['title']}</h3>
            <span class="pm-rank-badge">{exercise.get('difficulty', 'Beginner')}</span>
        </div>
        <p style="font-size:0.9rem;margin-top:0.5rem;">{exercise['description']}</p>
    </div>""", unsafe_allow_html=True)

    # Code editor
    code = st_ace(
        value=exercise.get("starter_code", "# Write your code here\n"),
        language="python",
        theme="twilight",
        height=300,
        key=f"editor_{selected}",
        font_size=14,
    )

    col1, col2 = st.columns(2)
    with col1:
        run_clicked = st.button("▶️ Run Code", key="run_exercise", use_container_width=True)
    with col2:
        review_clicked = st.button("🧠 AI Review", key="review_exercise", use_container_width=True)

    if run_clicked and code:
        with st.spinner("Executing..."):
            result = execute_code(code)
        if result.stdout:
            st.markdown(f"""<div class="pm-code-block"><pre style="color:#22c55e;">{result.stdout}</pre></div>""", unsafe_allow_html=True)
        if result.stderr:
            st.markdown(f"""<div class="pm-code-block"><pre style="color:#ef4444;">{result.stderr}</pre></div>""", unsafe_allow_html=True)
        if result.success:
            st.success("Code executed successfully!")
            xp_svc.award_xp(user["id"], "exercise_pass")

    if review_clicked and code:
        with st.spinner("PyMaster is reviewing your code..."):
            try:
                feedback = router.chat(
                    [{"role": "user", "content": f"Review this Python code for the exercise '{exercise['title']}': {exercise['description']}\n\n```python\n{code}\n```\n\nGive specific feedback on correctness, style, and efficiency. Suggest improvements. Use visual diagrams if explaining data structures or algorithms."}],
                    system="You are PyMaster, a Python code reviewer. Be specific, encouraging, and educational. Use ASCII diagrams for visual explanations.",
                    force_model=ClaudeService.SONNET if len(code) > 200 else None,
                    max_tokens=1500,
                )
                st.markdown(f"""<div class="pm-ai-bubble">
                    <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem;">
                        <span>🧠</span><span style="color:#c084fc;font-weight:600;font-size:0.85rem;">Code Review</span>
                    </div>
                </div>""", unsafe_allow_html=True)
                st.markdown(feedback)
            except Exception as e:
                st.error(f"AI review failed: {e}")


def _render_free_code(router: AIRouter) -> None:
    st.markdown('<p style="font-size:0.9rem;color:#94a3b8;">Write and run any Python code. Ask the AI for help anytime.</p>', unsafe_allow_html=True)

    code = st_ace(
        value="# Free coding area\n# Write any Python code and run it\n\nprint('Hello, PyMasters!')\n",
        language="python",
        theme="twilight",
        height=350,
        key="free_editor",
        font_size=14,
    )

    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("▶️ Run", key="run_free", use_container_width=True) and code:
            result = execute_code(code)
            if result.stdout:
                st.markdown(f"""<div class="pm-code-block"><pre style="color:#22c55e;">{result.stdout}</pre></div>""", unsafe_allow_html=True)
            if result.stderr:
                st.markdown(f"""<div class="pm-code-block"><pre style="color:#ef4444;">{result.stderr}</pre></div>""", unsafe_allow_html=True)
    with col2:
        if st.button("🧠 Explain", key="explain_free", use_container_width=True) and code:
            with st.spinner("Explaining..."):
                try:
                    explanation = router.quick(
                        f"Explain what this Python code does step by step. Use visual diagrams if helpful:\n\n```python\n{code}\n```",
                        max_tokens=1000,
                    )
                    st.markdown(explanation)
                except Exception as e:
                    st.error(f"AI error: {e}")
    with col3:
        if st.button("🔧 Improve", key="improve_free", use_container_width=True) and code:
            with st.spinner("Analyzing..."):
                try:
                    improved = router.quick(
                        f"Improve this Python code. Show the improved version and explain what changed:\n\n```python\n{code}\n```",
                        max_tokens=1500,
                    )
                    st.markdown(improved)
                except Exception as e:
                    st.error(f"AI error: {e}")
```

- [ ] **Step 2: Add missing import in code_arena.py**

Add at the top of the imports in `code_arena.py`:

```python
from pymasters_app.services.claude_service import ClaudeService
```

- [ ] **Step 3: Commit**

```bash
git add pymasters_app/views/code_arena.py
git commit -m "feat: add Code Arena with interactive editor, execution, and AI review"
```

---

## Chunk 4: Project Studio, Learning Paths, Progress Pulse

### Task 12: Project Studio

**Files:**
- Create: `pymasters_app/views/project_studio.py`

- [ ] **Step 1: Create project_studio.py**

Create `pymasters_app/views/project_studio.py`:

```python
"""Project Studio — Claude-guided project building."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import streamlit as st
from streamlit_ace import st_ace

from pymasters_app.services.ai_router import AIRouter
from pymasters_app.services.claude_service import ClaudeService
from pymasters_app.services.code_executor import execute_code
from pymasters_app.services.xp_service import XPService

PROJECT_TEMPLATES = [
    {
        "id": "web_scraper",
        "title": "Web Scraper",
        "description": "Build a Python web scraper that extracts data from websites",
        "icon": "🕷️",
        "difficulty": "Intermediate",
        "milestones": ["Setup & imports", "Fetch a page", "Parse HTML", "Extract data", "Save to CSV"],
    },
    {
        "id": "rest_api",
        "title": "REST API with FastAPI",
        "description": "Create a RESTful API with endpoints, validation, and error handling",
        "icon": "🚀",
        "difficulty": "Intermediate",
        "milestones": ["Project setup", "First endpoint", "Data models", "CRUD operations", "Error handling"],
    },
    {
        "id": "cli_tool",
        "title": "CLI Tool",
        "description": "Build a command-line tool with argument parsing and file operations",
        "icon": "⌨️",
        "difficulty": "Beginner",
        "milestones": ["Argument parser", "Core logic", "File I/O", "Error handling", "Polish & help text"],
    },
    {
        "id": "data_pipeline",
        "title": "Data Pipeline",
        "description": "Process and transform data using pandas and visualization",
        "icon": "📊",
        "difficulty": "Intermediate",
        "milestones": ["Load data", "Clean & transform", "Analysis", "Visualization", "Report generation"],
    },
]


def render(*, user: dict[str, Any], db: Any) -> None:
    router = AIRouter(db)
    xp_svc = XPService(db)
    projects_col = db["projects"]

    st.markdown("""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#f59e0b;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">Project Studio</span>
    </div>
    <h1 style="font-size:1.8rem;margin-bottom:0.3rem;">🏗️ Project Studio</h1>
    <p style="font-size:0.9rem;color:#94a3b8;">Build real Python projects with AI guidance, step by step.</p>
    """, unsafe_allow_html=True)

    # Check for active project
    active = projects_col.find_one({"user_id": user["id"], "status": "active"})

    if active:
        _render_active_project(active, db, user, router, xp_svc)
    else:
        _render_template_selection(db, user, router)


def _render_template_selection(db: Any, user: dict, router: AIRouter) -> None:
    st.markdown('<h2 style="font-size:1.2rem;">Choose a Project</h2>', unsafe_allow_html=True)

    cols = st.columns(2)
    for i, tmpl in enumerate(PROJECT_TEMPLATES):
        with cols[i % 2]:
            st.markdown(f"""<div class="pm-card-glass" style="margin-bottom:1rem;">
                <div style="font-size:1.5rem;margin-bottom:0.5rem;">{tmpl['icon']}</div>
                <h3 style="font-size:1rem;margin-bottom:0.3rem;">{tmpl['title']}</h3>
                <p style="font-size:0.85rem;margin-bottom:0.5rem;">{tmpl['description']}</p>
                <span class="pm-rank-badge">{tmpl['difficulty']}</span>
            </div>""", unsafe_allow_html=True)
            if st.button(f"Start {tmpl['title']}", key=f"start_proj_{tmpl['id']}", use_container_width=True):
                # Generate first milestone instructions with Claude
                with st.spinner("AI is preparing your project..."):
                    try:
                        instructions = router.chat(
                            [{"role": "user", "content": f"I'm starting a Python project: {tmpl['title']} — {tmpl['description']}. The first milestone is: {tmpl['milestones'][0]}. Give me clear step-by-step instructions and starter code for this milestone. Keep it practical and beginner-friendly."}],
                            system="You are PyMaster, guiding a student through building a Python project. Give clear instructions with code examples.",
                            force_model=ClaudeService.SONNET,
                            max_tokens=1500,
                        )
                    except Exception:
                        instructions = f"Let's start with: {tmpl['milestones'][0]}"

                project_doc = {
                    "user_id": user["id"],
                    "template_id": tmpl["id"],
                    "title": tmpl["title"],
                    "description": tmpl["description"],
                    "milestones": [
                        {"title": m, "instructions": instructions if j == 0 else "", "user_code": "", "ai_review": "", "completed": False}
                        for j, m in enumerate(tmpl["milestones"])
                    ],
                    "current_milestone": 0,
                    "status": "active",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                db["projects"].insert_one(project_doc)
                st.rerun()


def _render_active_project(project: dict, db: Any, user: dict, router: AIRouter, xp_svc: XPService) -> None:
    current = project.get("current_milestone", 0)
    milestones = project.get("milestones", [])
    milestone = milestones[current] if current < len(milestones) else None

    st.markdown(f"""<div class="pm-card-glass">
        <h2 style="font-size:1.2rem;margin-bottom:0.3rem;">{project['title']}</h2>
        <p style="font-size:0.85rem;">Milestone {current + 1} of {len(milestones)}: <span style="color:#38bdf8;font-weight:600;">{milestone['title'] if milestone else 'Complete!'}</span></p>
        <div class="pm-xp-bar" style="margin-top:0.5rem;"><div class="pm-xp-bar-fill" style="width:{int((current / len(milestones)) * 100)}%;"></div></div>
    </div>""", unsafe_allow_html=True)

    if not milestone:
        st.success("Project complete! Great work!")
        if st.button("Start a new project"):
            db["projects"].update_one({"_id": project["_id"]}, {"$set": {"status": "completed"}})
            st.rerun()
        return

    # Show instructions
    if milestone.get("instructions"):
        st.markdown(f"""<div class="pm-ai-bubble">
            <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem;">
                <span>🧠</span><span style="color:#c084fc;font-weight:600;font-size:0.85rem;">Instructions</span>
            </div>
        </div>""", unsafe_allow_html=True)
        st.markdown(milestone["instructions"])

    # Code editor
    code = st_ace(
        value=milestone.get("user_code", "") or "# Write your code for this milestone\n",
        language="python",
        theme="twilight",
        height=300,
        key=f"proj_editor_{current}",
        font_size=14,
    )

    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("▶️ Run", key="run_proj", use_container_width=True) and code:
            result = execute_code(code)
            if result.stdout:
                st.markdown(f"""<div class="pm-code-block"><pre style="color:#22c55e;">{result.stdout}</pre></div>""", unsafe_allow_html=True)
            if result.stderr:
                st.markdown(f"""<div class="pm-code-block"><pre style="color:#ef4444;">{result.stderr}</pre></div>""", unsafe_allow_html=True)
    with col2:
        if st.button("🧠 Review & Advance", key="review_proj", use_container_width=True) and code:
            with st.spinner("PyMaster is reviewing..."):
                try:
                    review = router.chat(
                        [{"role": "user", "content": f"Review my code for milestone '{milestone['title']}' of the project '{project['title']}':\n\n```python\n{code}\n```\n\nIs it ready to move to the next milestone? Give feedback."}],
                        system="You are PyMaster reviewing a student's project milestone. Be encouraging but thorough.",
                        force_model=ClaudeService.SONNET,
                        max_tokens=1000,
                    )
                    st.markdown(review)

                    # Save code and advance
                    milestones[current]["user_code"] = code
                    milestones[current]["ai_review"] = review
                    milestones[current]["completed"] = True
                    next_idx = current + 1

                    updates = {"milestones": milestones, "current_milestone": next_idx, "updated_at": datetime.utcnow()}

                    # Generate next milestone instructions
                    if next_idx < len(milestones):
                        next_instructions = router.chat(
                            [{"role": "user", "content": f"The student completed milestone '{milestone['title']}' for project '{project['title']}'. Next milestone: '{milestones[next_idx]['title']}'. Give instructions and starter code."}],
                            system="You are PyMaster. Give clear project instructions.",
                            force_model=ClaudeService.SONNET,
                            max_tokens=1500,
                        )
                        milestones[next_idx]["instructions"] = next_instructions

                    db["projects"].update_one({"_id": project["_id"]}, {"$set": updates})
                    xp_svc.award_xp(user["id"], "project_milestone")
                    st.rerun()
                except Exception as e:
                    st.error(f"AI review failed: {e}")
    with col3:
        if st.button("🚪 Abandon Project", key="abandon_proj", use_container_width=True):
            db["projects"].update_one({"_id": project["_id"]}, {"$set": {"status": "abandoned"}})
            st.rerun()
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/project_studio.py
git commit -m "feat: add Project Studio with AI-guided milestone-based projects"
```

### Task 13: Learning Paths with Visual OOP/DSA Explanations

**Files:**
- Create: `pymasters_app/views/learning_paths.py`

- [ ] **Step 1: Create learning_paths.py**

Create `pymasters_app/views/learning_paths.py`:

```python
"""Learning Paths — Visual concept explanations with AI."""
from __future__ import annotations

from typing import Any
import streamlit as st

from pymasters_app.services.ai_router import AIRouter
from pymasters_app.services.claude_service import ClaudeService

CONCEPT_CATEGORIES = {
    "OOP Concepts": [
        {"name": "Classes & Objects", "icon": "📦", "prompt": "Explain Python classes and objects visually. Use an ASCII diagram showing a class as a blueprint and objects as instances. Use a real-world analogy like a Car blueprint creating car1, car2. Show __init__, attributes, and methods with a clear visual layout."},
        {"name": "Inheritance", "icon": "🧬", "prompt": "Explain Python inheritance visually. Draw an ASCII class hierarchy tree showing Animal → Dog, Cat. Show method resolution order (MRO) with arrows. Include code showing super() and method overriding."},
        {"name": "Polymorphism", "icon": "🎭", "prompt": "Explain Python polymorphism visually. Show a diagram of different classes (Circle, Rectangle, Triangle) all responding to the same area() method differently. Use ASCII art to show the concept of 'same interface, different behavior'."},
        {"name": "Encapsulation", "icon": "🔒", "prompt": "Explain Python encapsulation visually. Draw an ASCII diagram showing a class as a box with public interface on the outside and private data inside. Show _private, __name_mangled, and @property with a safe/vault analogy."},
        {"name": "Abstraction", "icon": "🎨", "prompt": "Explain Python abstraction using ABC. Draw a visual showing abstract base class as a contract/template, with concrete classes filling in the details. Use ASCII art showing the pattern."},
        {"name": "Composition vs Inheritance", "icon": "🧩", "prompt": "Explain composition vs inheritance in Python visually. Draw two ASCII diagrams side by side: one showing IS-A (inheritance) and HAS-A (composition). Use Car example: Car IS-A Vehicle vs Car HAS-A Engine."},
    ],
    "Data Structures": [
        {"name": "Lists & Arrays", "icon": "📋", "prompt": "Explain Python lists visually. Draw ASCII art showing a list as indexed boxes [0][1][2][3]. Show append, insert, pop operations step by step with before/after diagrams. Include time complexity."},
        {"name": "Stacks & Queues", "icon": "📚", "prompt": "Explain stacks and queues visually. Draw ASCII art showing a stack as a vertical pile (LIFO) and a queue as a horizontal line (FIFO). Show push/pop and enqueue/dequeue operations step by step."},
        {"name": "Linked Lists", "icon": "🔗", "prompt": "Explain linked lists visually. Draw ASCII art showing nodes connected by arrows: [data|next]→[data|next]→[data|None]. Show insertion and deletion operations step by step."},
        {"name": "Trees & BST", "icon": "🌳", "prompt": "Explain binary search trees visually. Draw an ASCII tree with nodes and branches. Show insertion of values step by step, and demonstrate in-order traversal with arrows showing the path."},
        {"name": "Hash Maps / Dicts", "icon": "🗺️", "prompt": "Explain Python dictionaries (hash maps) visually. Draw ASCII art showing hash function mapping keys to bucket indices. Show collision handling. Explain O(1) lookup with the diagram."},
        {"name": "Graphs", "icon": "🕸️", "prompt": "Explain graphs visually. Draw ASCII art showing nodes and edges for both directed and undirected graphs. Show adjacency list and adjacency matrix representations. Include BFS/DFS traversal order."},
    ],
    "Algorithms": [
        {"name": "Sorting Algorithms", "icon": "🔄", "prompt": "Explain bubble sort and merge sort visually. Show step-by-step ASCII diagrams of each pass through the array. Use color-coded (text markers) to show which elements are being compared and swapped."},
        {"name": "Binary Search", "icon": "🔍", "prompt": "Explain binary search visually. Draw ASCII art showing an array and how the search space is halved each step. Show low, mid, high pointers moving. Include the O(log n) explanation visually."},
        {"name": "Recursion", "icon": "🪞", "prompt": "Explain recursion visually. Draw an ASCII call stack diagram for factorial(4). Show each frame being pushed and popped. Visualize the tree structure of fibonacci recursion showing overlapping subproblems."},
        {"name": "Dynamic Programming", "icon": "📐", "prompt": "Explain dynamic programming visually. Use the fibonacci example. Draw the recursive tree showing repeated work, then show the memoization table being filled. Before/after comparison of approaches."},
    ],
}


def render(*, user: dict[str, Any], db: Any) -> None:
    router = AIRouter(db)

    st.markdown("""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#38bdf8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">Learning Paths</span>
    </div>
    <h1 style="font-size:1.8rem;margin-bottom:0.3rem;">📚 Visual Learning</h1>
    <p style="font-size:0.9rem;color:#94a3b8;">Master Python concepts with visual explanations, diagrams, and interactive examples.</p>
    """, unsafe_allow_html=True)

    # Category tabs
    categories = list(CONCEPT_CATEGORIES.keys())
    tabs = st.tabs(categories)

    for tab, category in zip(tabs, categories):
        with tab:
            concepts = CONCEPT_CATEGORIES[category]
            cols = st.columns(3)
            for i, concept in enumerate(concepts):
                with cols[i % 3]:
                    st.markdown(f"""<div class="pm-card-glass" style="text-align:center;margin-bottom:1rem;min-height:120px;">
                        <div style="font-size:2rem;margin-bottom:0.4rem;">{concept['icon']}</div>
                        <h3 style="font-size:0.95rem;">{concept['name']}</h3>
                    </div>""", unsafe_allow_html=True)
                    if st.button(f"Learn {concept['name']}", key=f"learn_{category}_{concept['name']}", use_container_width=True):
                        st.session_state["learning_topic"] = concept

    # Show selected topic
    if "learning_topic" in st.session_state:
        topic = st.session_state["learning_topic"]
        st.markdown(f"""<hr style="border-color:rgba(148,163,184,0.15);margin:1.5rem 0;">""", unsafe_allow_html=True)
        st.markdown(f"""<h2 style="font-size:1.4rem;">{topic['icon']} {topic['name']}</h2>""", unsafe_allow_html=True)

        cache_key = f"explanation_{topic['name']}"
        if cache_key not in st.session_state:
            with st.spinner(f"Generating visual explanation for {topic['name']}..."):
                try:
                    explanation = router.chat(
                        [{"role": "user", "content": topic["prompt"]}],
                        system="You are PyMaster, an expert Python educator. Create visually rich explanations using ASCII art diagrams, flowcharts, and step-by-step visualizations. Use monospace formatting for all diagrams. Make complex concepts simple through creative visual metaphors. Always include a working code example at the end.",
                        force_model=ClaudeService.SONNET,
                        max_tokens=3000,
                        temperature=0.5,
                        use_cache=True,
                        cache_ttl=604800,  # 7 days
                    )
                    st.session_state[cache_key] = explanation
                except Exception as e:
                    st.error(f"Failed to generate explanation: {e}")
                    return

        st.markdown(st.session_state[cache_key])

        # Quick quiz
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button(f"🧠 Quiz me on {topic['name']}", key=f"quiz_{topic['name']}"):
            with st.spinner("Generating quiz..."):
                try:
                    quiz = router.quick(
                        f"Generate a quick 3-question multiple choice quiz about {topic['name']} in Python. "
                        "Format each question clearly with A, B, C, D options. Put the correct answer at the end.",
                        max_tokens=800,
                        use_cache=True,
                        cache_ttl=86400,
                    )
                    st.markdown(quiz)
                except Exception as e:
                    st.error(f"Quiz generation failed: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/learning_paths.py
git commit -m "feat: add Learning Paths with visual OOP/DSA explanations"
```

### Task 14: Progress Pulse (Analytics)

**Files:**
- Create: `pymasters_app/views/progress_pulse.py`

- [ ] **Step 1: Create progress_pulse.py**

Create `pymasters_app/views/progress_pulse.py`:

```python
"""Progress Pulse — AI-powered analytics dashboard."""
from __future__ import annotations

from typing import Any

import plotly.graph_objects as go
import streamlit as st

from pymasters_app.services.ai_router import AIRouter
from pymasters_app.services.xp_service import XPService, RANKS


def render(*, user: dict[str, Any], db: Any) -> None:
    xp_svc = XPService(db)
    stats = xp_svc.get_user_stats(user["id"])
    all_achievements = xp_svc.get_all_achievements()
    user_achievements = set(stats.get("achievements", []))

    st.markdown("""
    <div style="margin-bottom:0.5rem;">
        <span style="color:#c084fc;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.25em;font-weight:600;">Progress Pulse</span>
    </div>
    <h1 style="font-size:1.8rem;margin-bottom:0.3rem;">📈 Your Progress</h1>
    <p style="font-size:0.9rem;color:#94a3b8;">Track your journey, see your strengths, and discover what to improve.</p>
    """, unsafe_allow_html=True)

    # Stats overview
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div style="color:#22c55e;font-size:2.2rem;font-weight:700;">{stats['xp']}</div>
            <div style="color:#94a3b8;font-size:0.8rem;">Total XP</div>
        </div>""", unsafe_allow_html=True)
    with c2:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div style="color:#f59e0b;font-size:2.2rem;font-weight:700;">🔥 {stats['streak']}</div>
            <div style="color:#94a3b8;font-size:0.8rem;">Day Streak</div>
        </div>""", unsafe_allow_html=True)
    with c3:
        st.markdown(f"""<div class="pm-card-glass" style="text-align:center;">
            <div class="pm-rank-badge" style="font-size:1.2rem;margin:0.3rem auto;">{stats['rank']}</div>
            <div style="color:#94a3b8;font-size:0.8rem;margin-top:0.3rem;">Current Rank</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Skill Radar Chart
    col_radar, col_info = st.columns([2, 1])
    with col_radar:
        st.markdown('<h2 style="font-size:1.2rem;">Skill Radar</h2>', unsafe_allow_html=True)
        skill_levels = stats.get("skill_levels", {})
        categories = ["Syntax", "Data Structures", "OOP", "Functions", "Libraries", "Problem Solving"]
        values = [skill_levels.get(c.lower().replace(" ", "_"), 0.3) for c in categories]
        values.append(values[0])  # Close the radar
        categories.append(categories[0])

        fig = go.Figure(data=go.Scatterpolar(
            r=values,
            theta=categories,
            fill="toself",
            fillcolor="rgba(56,189,248,0.15)",
            line=dict(color="#38bdf8", width=2),
            marker=dict(color="#c084fc", size=6),
        ))
        fig.update_layout(
            polar=dict(
                bgcolor="rgba(15,23,42,0.5)",
                radialaxis=dict(visible=True, range=[0, 1], showticklabels=False, gridcolor="rgba(148,163,184,0.1)"),
                angularaxis=dict(gridcolor="rgba(148,163,184,0.1)", linecolor="rgba(148,163,184,0.1)"),
            ),
            showlegend=False,
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#94a3b8", family="Inter"),
            margin=dict(l=60, r=60, t=30, b=30),
            height=350,
        )
        st.plotly_chart(fig, use_container_width=True)

    with col_info:
        st.markdown('<h2 style="font-size:1.2rem;">Rank Progress</h2>', unsafe_allow_html=True)
        for threshold, name in RANKS:
            is_current = name == stats["rank"]
            achieved = stats["xp"] >= threshold
            color = "#38bdf8" if is_current else ("#22c55e" if achieved else "#94a3b8")
            icon = "◆" if is_current else ("✓" if achieved else "○")
            st.markdown(f"""<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
                <span style="color:{color};font-size:0.9rem;">{icon}</span>
                <span style="color:{color};font-weight:{'700' if is_current else '400'};font-size:0.9rem;">{name}</span>
                <span style="color:#64748b;font-size:0.75rem;margin-left:auto;">{threshold} XP</span>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Achievements
    st.markdown('<h2 style="font-size:1.2rem;">Achievements</h2>', unsafe_allow_html=True)
    cols = st.columns(4)
    for i, ach in enumerate(all_achievements):
        unlocked = ach["key"] in user_achievements
        locked_class = "" if unlocked else "pm-achievement-locked"
        with cols[i % 4]:
            st.markdown(f"""<div class="pm-achievement {locked_class}">
                <div style="font-size:1.8rem;">{ach.get('icon', '🏆')}</div>
                <div style="color:#f8fafc;font-size:0.8rem;font-weight:600;">{ach['title']}</div>
                <div style="color:#94a3b8;font-size:0.7rem;">{ach['description']}</div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # AI Learning Summary
    st.markdown('<h2 style="font-size:1.2rem;">AI Learning Summary</h2>', unsafe_allow_html=True)
    if st.button("🧠 Generate personalized insights", key="ai_summary"):
        with st.spinner("Analyzing your progress..."):
            try:
                router = AIRouter(db)
                progress_list = list(db["progress"].find({"user_id": user["id"]}))
                modules = list(db["learning_modules"].find({}))
                module_map = {str(m.get("id", m.get("_id"))): m.get("title", "Unknown") for m in modules}
                progress_summary = ", ".join(
                    f"{module_map.get(p['module_id'], 'Unknown')}: {p['status']}"
                    for p in progress_list
                ) or "No progress yet"

                summary = router.quick(
                    f"Student stats: XP={stats['xp']}, Streak={stats['streak']}, Rank={stats['rank']}. "
                    f"Module progress: {progress_summary}. "
                    f"Give a brief, encouraging weekly summary (3-4 sentences). "
                    f"Highlight strengths and suggest one specific area to focus on next.",
                    max_tokens=300,
                )
                st.markdown(f"""<div class="pm-ai-bubble">
                    <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem;">
                        <span>🧠</span><span style="color:#c084fc;font-weight:600;font-size:0.85rem;">Weekly Insights</span>
                    </div>
                    <div style="color:#e0d4f5;font-size:0.9rem;line-height:1.6;">{summary}</div>
                </div>""", unsafe_allow_html=True)
            except Exception as e:
                st.error(f"AI analysis failed: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/progress_pulse.py
git commit -m "feat: add Progress Pulse analytics with skill radar and AI insights"
```

---

## Chunk 5: Profile Enhancement and Views Init

### Task 15: Enhanced Profile

**Files:**
- Modify: `pymasters_app/views/profile.py`

- [ ] **Step 1: Update profile.py signature**

Update the `render` function signature in `pymasters_app/views/profile.py` to accept `db`:

Change `def render(*, auth_manager: AuthManager, user: dict[str, Any]) -> None:` to:

```python
def render(*, auth_manager: AuthManager, user: dict[str, Any], db: Any = None) -> None:
```

Add at the start of the `render` function body (after the function signature):

```python
    # Show gamification stats if db available
    if db:
        from pymasters_app.services.xp_service import XPService
        xp_svc = XPService(db)
        stats = xp_svc.get_user_stats(user["id"])
        st.markdown(f"""<div class="pm-card-glass" style="margin-bottom:1.5rem;">
            <h3 style="font-size:1rem;margin-bottom:0.5rem;">Your Stats</h3>
            <div style="display:flex;gap:1.5rem;">
                <div><span style="color:#22c55e;font-weight:700;font-size:1.2rem;">{stats['xp']}</span> <span style="color:#94a3b8;font-size:0.8rem;">XP</span></div>
                <div><span style="color:#f59e0b;font-weight:700;font-size:1.2rem;">🔥 {stats['streak']}</span> <span style="color:#94a3b8;font-size:0.8rem;">Streak</span></div>
                <div><span class="pm-rank-badge">{stats['rank']}</span></div>
                <div><span style="color:#c084fc;font-weight:700;font-size:1.2rem;">{len(stats.get('achievements', []))}</span> <span style="color:#94a3b8;font-size:0.8rem;">Badges</span></div>
            </div>
        </div>""", unsafe_allow_html=True)
```

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/profile.py
git commit -m "feat: enhance profile with gamification stats"
```

### Task 16: Update views __init__.py

**Files:**
- Modify: `pymasters_app/views/__init__.py`

- [ ] **Step 1: Update views init**

Ensure `pymasters_app/views/__init__.py` exists and is empty (or has appropriate imports). The new modules `code_arena`, `project_studio`, `learning_paths`, and `progress_pulse` are imported directly in `main.py`.

- [ ] **Step 2: Commit**

```bash
git add pymasters_app/views/__init__.py
git commit -m "chore: update views init"
```

---

## Chunk 6: Deployment and Environment

### Task 17: Update Dockerfile and environment

**Files:**
- Modify: `Dockerfile`
- Modify: `.dockerignore`

- [ ] **Step 1: Update Dockerfile**

Replace `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD streamlit run app.py --server.port=8080 --server.address=0.0.0.0 --server.headless=true --browser.gatherUsageStats=false
```

- [ ] **Step 2: Update .dockerignore**

Ensure `.dockerignore` has:

```
.venv/
.git/
.idea/
__pycache__/
*.pyc
.env
tests/
docs/
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "chore: update Dockerfile and dockerignore"
```

### Task 18: Build and deploy to Cloud Run

- [ ] **Step 1: Build with Cloud Build**

```bash
gcloud builds submit --config=cloudbuild.yaml --region=us-central1 .
```

- [ ] **Step 2: Deploy to Cloud Run**

```bash
gcloud run deploy pymasters \
  --image us-central1-docker.pkg.dev/festive-bazaar-424313-i5/cloud-run-source-deploy/pymasters:v2 \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars="environment=production,ANTHROPIC_API_KEY=<key>,HUGGINGFACEHUB_API_TOKEN=<key>" \
  --timeout=300
```

Note: Set actual API keys via GCP Secret Manager or env vars.

- [ ] **Step 3: Verify deployment**

Visit `https://pymasters-33424838467.us-central1.run.app` and verify all pages work.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: deployment fixes"
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | Tasks 1-7 | AI Engine: Claude service, AI router, cache, HF service, XP system, code executor |
| 2 | Task 8 | Navigation, CSS, and page routing updates |
| 3 | Tasks 9-11 | Dashboard, AI Tutor, Code Arena |
| 4 | Tasks 12-14 | Project Studio, Learning Paths (visual OOP/DSA), Progress Pulse |
| 5 | Tasks 15-16 | Profile enhancement, views init |
| 6 | Tasks 17-18 | Deployment |
