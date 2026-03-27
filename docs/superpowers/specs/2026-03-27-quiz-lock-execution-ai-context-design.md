# PyMasters: Quiz Lock, Unified Execution, and AI Context Integration

**Date:** 2026-03-27
**Status:** Approved for implementation

## Overview

Three interconnected improvements to PyMasters:

1. **Quiz Lock** — Disable completed quizzes so users cannot retake them
2. **Unified Code Execution** — Switch classroom evaluation from `exec()` to `subprocess.run()` so functions, classes, and imports work reliably
3. **AI Context Integration** — Give Vaathiyaar full knowledge of the user's journey (completions, quiz scores, path progress, browsing) so the AI experience feels coherent and personalized

## 1. Quiz Lock After Completion

### Problem

The backend already prevents duplicate XP via `lesson_completions` table and returns `already_completed: true` in the response. But the frontend ignores this — users can retake any quiz indefinitely, and there is no visual distinction between "unlocked" and "completed" modules.

### Design

#### 1.1 New Backend Endpoint

```
GET /api/content/completions/{user_id}
```

Returns all completed module/lesson IDs for a user in a single call:

```json
{
  "completions": [
    { "lesson_id": "module_1", "completed_at": "2026-03-26T10:00:00", "xp_awarded": 50 },
    { "lesson_id": "variables_and_types", "completed_at": "2026-03-26T11:30:00", "xp_awarded": 25 }
  ]
}
```

Query: `SELECT lesson_id, completed_at, xp_awarded FROM lesson_completions WHERE user_id = ?`

This endpoint lives in `main.py` alongside the existing `/api/content/complete`.

#### 1.2 Frontend: LearningMap Changes (Dashboard.jsx)

- Fetch completions on mount alongside modules
- Three visual states per module:
  - **Completed** (green checkmark + "Completed" badge) — in `lesson_completions` AND unlocked
  - **Unlocked** (cyan, clickable) — in `user.unlocked` but NOT completed
  - **Locked** (gray, not clickable) — not in `user.unlocked`
- Current code treats all unlocked modules identically with a checkmark — this is misleading

#### 1.3 Frontend: ModuleViewer Quiz Lock (Dashboard.jsx)

- On module load, check if `module.id` is in the completions set
- If completed:
  - Hide "Start Quiz" button
  - Show a completion summary card: "You completed this module on {date} and earned {xp} XP"
  - Still allow reading the content (for review)
  - Show a subtle "Completed" badge in the header
- If not completed:
  - Show quiz as normal (current behavior)

#### 1.4 Classroom Lesson Completion

- Classroom lessons already use `lesson_completions` for XP dedup
- Add a `completedLessons` set to Classroom state (fetched from the same endpoint)
- In lesson selection UI, show completed lessons with a checkmark and "Completed" label
- Practice challenges on completed lessons: show "Already completed — review only" with code editor still functional but no XP messaging

#### 1.5 API Addition in api.js

```javascript
export const getCompletions = (userId) => api.get(`/content/completions/${userId}`);
```

### Files Modified

| File | Change |
|------|--------|
| `backend/main.py` | Add `GET /api/content/completions/{user_id}` endpoint |
| `frontend/src/api.js` | Add `getCompletions()` export |
| `frontend/src/pages/Dashboard.jsx` | LearningMap: fetch completions, 3-state visuals. ModuleViewer: check completion, hide quiz if done |
| `frontend/src/pages/Classroom.jsx` | Fetch completions, mark completed lessons in selection UI |

---

## 2. Unified Subprocess Code Execution

### Problem

Two different execution environments exist:

| | Playground (`/execute`) | Classroom (`/evaluate`) |
|---|---|---|
| Method | `subprocess.run()` | `exec()` with empty locals |
| Functions work? | Yes | No (empty locals dict) |
| Imports work? | Most | Blocked by keyword check |
| State persistence | Per-file (natural) | None |

Students expect to define functions, use standard library imports, and write multi-line programs. The `exec()` approach in classroom breaks this expectation.

### Design

#### 2.1 Shared Execution Function

Create a new function `run_code_subprocess()` in `vaathiyaar/engine.py` (or a new `execution.py` module):

```python
def run_code_subprocess(code: str, timeout: int = 10) -> dict:
    """
    Execute Python code in a subprocess and return output.

    Returns: { "output": str, "error": str, "exit_code": int }
    """
```

Logic (adapted from Playground's current implementation):
1. Check code against unified `BLOCKED_KEYWORDS` list
2. Write code to temp `.py` file
3. Run via `subprocess.run([python_cmd, temp_path], capture_output=True, text=True, timeout=timeout)`
4. Capture stdout, stderr, exit_code
5. Clean up temp file
6. Return result dict

#### 2.2 Unified Blocked Keywords

Merge both lists into one authoritative list:

```python
BLOCKED_KEYWORDS = [
    "subprocess.call", "subprocess.run", "subprocess.Popen",
    "os.system", "os.remove", "os.rmdir", "os.unlink",
    "shutil.rmtree", "shutil.move",
    "__import__('os').system",
    "eval(", "exec(",
    "open(",             # File I/O blocked
    "pathlib",           # File access blocked
]
```

Note: `import os` is no longer blanket-blocked. Specific dangerous `os.*` operations are blocked instead. This allows `import math`, `import json`, `import random`, `import collections`, etc. to work naturally.

#### 2.3 Refactor evaluate_code()

Current `evaluate_code()` in `engine.py` does three things:
1. Security check (keyword filter)
2. Execute code
3. Compare output + get Vaathiyaar feedback

Refactored:
1. Security check using unified `BLOCKED_KEYWORDS`
2. Call `run_code_subprocess(code)` instead of `exec()`
3. Compare `result["output"].strip()` with `expected_output.strip()`
4. Call Vaathiyaar for feedback (unchanged)

#### 2.4 Refactor Playground /execute Endpoint

Replace inline subprocess logic in `routes/playground.py` with a call to the shared `run_code_subprocess()`. This eliminates code duplication.

#### 2.5 Import Allowlist (Safe Standard Library)

Since we're unblocking `import`, add a brief note in the execution: standard library imports work. Third-party packages (numpy, pandas, requests) depend on what's installed in the container. The Docker image can pre-install common ones.

### Files Modified

| File | Change |
|------|--------|
| `backend/vaathiyaar/engine.py` | Add `run_code_subprocess()`, refactor `evaluate_code()` to use it, unified `BLOCKED_KEYWORDS` |
| `backend/routes/playground.py` | Replace inline subprocess logic with `run_code_subprocess()` call |

---

## 3. AI Context Integration (Vaathiyaar Knows Everything)

### Problem

Vaathiyaar currently receives:
- Student profile (motivation, experience, language, learning style)
- Mastery map (topic → mastery_level)
- Last 10 learning signals (signal_type, topic, timestamp)
- Current lesson context (topic, phase, attempt count)

Missing context:
- Which lessons the user has completed (and when)
- Quiz scores and attempt history
- Current learning path progress (position, total, path name)
- What the user browsed but didn't finish
- Playground conversation topics
- Total XP and rank

Without this, Vaathiyaar can't say "Great job finishing loops yesterday!" or "You're halfway through the AI Fundamentals path."

### Design

#### 3.1 Enrich get_student_profile()

Extend `profiler.py:get_student_profile()` to include additional context from existing tables:

```python
profile = {
    # ... existing fields ...

    # NEW: Completion history
    "completed_lessons": [
        {"lesson_id": "module_1", "completed_at": "2026-03-26", "xp": 50},
        ...
    ],  # From lesson_completions table, last 20

    # NEW: Current learning path
    "active_path": {
        "name": "Python Fundamentals",
        "position": 5,
        "total_lessons": 18,
        "status": "active"
    },  # From user_learning_paths + learning_paths tables

    # NEW: Playground topics
    "recent_playground_topics": ["recursion help", "API design", ...],
    # From playground_conversations, last 5 titles

    # NEW: XP and rank
    "total_xp": 450,
    "rank": "ENGINEER",

    # existing: mastery, recent_signals
}
```

Queries needed (all simple SELECTs on existing tables):
- `SELECT lesson_id, completed_at, xp_awarded FROM lesson_completions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20`
- `SELECT lp.name, ulp.current_position, lp.lesson_sequence FROM user_learning_paths ulp JOIN learning_paths lp ON ulp.path_id = lp.id WHERE ulp.user_id = ? AND ulp.status = 'active' LIMIT 1`
- `SELECT title FROM playground_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5`
- `SELECT points FROM users WHERE id = ?` (already available)

#### 3.2 New System Prompt Section in modelfile.py

Add a `LEARNER JOURNEY` block to `build_system_prompt()`:

```
=== LEARNER JOURNEY ===
Completed lessons (recent): variables_and_types (Mar 25), control_flow (Mar 26), loops_basics (Mar 26)
Total completed: 8 lessons | 450 XP | Rank: ENGINEER
Active path: "Python Fundamentals" — lesson 5 of 18 (28% complete)
Recent playground topics: "recursion help", "API design patterns"
Strong topics (mastery >= 70%): variables (85%), loops (72%)
Weak topics (mastery < 40%): recursion (25%), OOP (30%)

Use this context to:
- Reference specific completed lessons when explaining related concepts
- Acknowledge progress milestones ("You've completed 8 lessons!")
- Connect new topics to what the student already knows
- Identify and address weak areas proactively
- Never re-explain concepts the student has demonstrated mastery in
```

This block is conditionally included only when data exists (skip if empty).

#### 3.3 Frontend Learning Signals

Add signal recording for key user actions that are currently untracked:

| Action | Signal Type | Where Sent | Data |
|--------|-------------|------------|------|
| User opens a lesson | `lesson_viewed` | Classroom.jsx `handleSelectLesson` | `{ lesson_id, track }` |
| User starts a quiz | `quiz_started` | Dashboard.jsx `setQuizMode(true)` | `{ module_id }` |
| User submits quiz | `quiz_attempt` | Dashboard.jsx `handleQuizSubmit` | `{ module_id, score, total, passed }` |
| User starts a path | `path_started` | Paths.jsx `handleStart` | `{ path_id, path_name }` |

Each is a simple POST to `/api/profile/signal` using the existing `recordSignal()` from `api.js`.

#### 3.4 Classroom Chat Memory

Currently classroom chat is single-turn (no history). Add lightweight session memory:

- Store last 5 messages of the current classroom session in component state (already done)
- Pass them to the streaming endpoint as `history` parameter
- Backend includes them in the Ollama messages array (like Playground already does)
- This gives Vaathiyaar conversational continuity within a lesson

Change in `routes/classroom.py` chat/stream endpoint:
- Accept optional `history` field in request
- Prepend history messages before the current user message in the Ollama call

Frontend change in `Classroom.jsx`:
- Include `chatMessages` (last 5) in the streaming fetch body as `history`

### Files Modified

| File | Change |
|------|--------|
| `backend/vaathiyaar/profiler.py` | Enrich `get_student_profile()` with completions, path, playground topics, XP/rank |
| `backend/vaathiyaar/modelfile.py` | Add `LEARNER JOURNEY` section to `build_system_prompt()` |
| `backend/routes/classroom.py` | Accept `history` in chat endpoints, pass to Ollama |
| `frontend/src/pages/Classroom.jsx` | Send `history` in chat requests, record `lesson_viewed` signal |
| `frontend/src/pages/Dashboard.jsx` | Record `quiz_started` and `quiz_attempt` signals |
| `frontend/src/pages/Paths.jsx` | Record `path_started` signal |

---

## Implementation Order

The three features share data dependencies:

```
Phase 1 (Independent):
  [A] Unified subprocess execution (engine.py, playground.py)
  [B] Completions endpoint + quiz lock UI (main.py, Dashboard.jsx, Classroom.jsx)

Phase 2 (Depends on Phase 1):
  [C] AI context enrichment (profiler.py, modelfile.py)
  [D] Frontend signal recording (Dashboard.jsx, Classroom.jsx, Paths.jsx)
  [E] Classroom chat memory (classroom.py, Classroom.jsx)
```

Phase 1A and 1B are independent and can be built in parallel.
Phase 2 depends on the completions data from 1B being in place.

## Testing Strategy

- **Quiz lock**: Register user, complete module_1 quiz, verify "Start Quiz" disappears, verify re-navigation still shows completion state
- **Code execution**: Run `def greet(name): return f"Hello {name}"\nprint(greet("World"))` in both Classroom and Playground — both should output "Hello World"
- **AI context**: Complete a few lessons, then open Classroom chat — Vaathiyaar should reference completed topics in its greeting
- **Signals**: Check `learning_signals` table after opening a lesson, starting a quiz, completing a path
