# Quiz Lock, Unified Execution & AI Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock completed quizzes from retake, unify code execution to subprocess for reliability, and enrich Vaathiyaar AI with full user journey context.

**Architecture:** Three features sharing the `lesson_completions` data layer. Phase 1 (Tasks 1-4) builds the completions endpoint and unified execution independently. Phase 2 (Tasks 5-7) enriches the AI with journey data and adds frontend signal recording. All backend changes are in existing files; no new files needed except one shared execution module.

**Tech Stack:** FastAPI/Python backend, React frontend, SQLite database, Ollama Cloud API (qwen3.5)

---

## File Map

| File | Responsibility | Tasks |
|------|---------------|-------|
| `backend/vaathiyaar/execution.py` | **CREATE** — Shared `run_code_subprocess()` + unified `BLOCKED_KEYWORDS` | 1 |
| `backend/vaathiyaar/engine.py` | **MODIFY** — Refactor `evaluate_code()` to use `run_code_subprocess()` | 2 |
| `backend/routes/playground.py` | **MODIFY** — Replace inline subprocess with `run_code_subprocess()` | 2 |
| `backend/main.py` | **MODIFY** — Add `GET /api/content/completions/{user_id}` endpoint | 3 |
| `frontend/src/api.js` | **MODIFY** — Add `getCompletions()` export | 3 |
| `frontend/src/pages/Dashboard.jsx` | **MODIFY** — Quiz lock UI, completion states, signal recording | 4, 6 |
| `frontend/src/pages/Classroom.jsx` | **MODIFY** — Completed lesson badges, chat history, signal recording | 4, 7 |
| `backend/vaathiyaar/profiler.py` | **MODIFY** — Enrich `get_student_profile()` with journey data | 5 |
| `backend/vaathiyaar/modelfile.py` | **MODIFY** — Add `LEARNER JOURNEY` system prompt section | 5 |
| `backend/routes/classroom.py` | **MODIFY** — Accept `history` in chat endpoints | 7 |
| `frontend/src/pages/Paths.jsx` | **MODIFY** — Record `path_started` signal | 6 |

---

### Task 1: Create Shared Code Execution Module

**Files:**
- Create: `backend/vaathiyaar/execution.py`

This task extracts subprocess execution into a shared module used by both Classroom and Playground.

- [ ] **Step 1: Create `execution.py` with `run_code_subprocess()` and `BLOCKED_KEYWORDS`**

```python
# backend/vaathiyaar/execution.py
"""
Shared Python code execution via subprocess.
Used by both Classroom evaluation and Playground terminal.
"""
import os
import sys
import tempfile
import subprocess


BLOCKED_KEYWORDS = [
    "subprocess.call", "subprocess.run", "subprocess.Popen",
    "os.system", "os.remove", "os.rmdir", "os.unlink",
    "shutil.rmtree", "shutil.move",
    "__import__('os').system",
    "eval(", "exec(",
    "open(",
    "pathlib",
]


def check_code_safety(code: str) -> str | None:
    """
    Check code against blocked keywords.
    Returns the matched keyword if unsafe, None if safe.
    """
    for kw in BLOCKED_KEYWORDS:
        if kw in code:
            return kw
    return None


def run_code_subprocess(code: str, timeout: int = 10) -> dict:
    """
    Execute Python code in an isolated subprocess.

    Returns: { "output": str, "error": str, "exit_code": int }
    """
    blocked = check_code_safety(code)
    if blocked:
        return {
            "output": "",
            "error": f"Security Error: forbidden operation '{blocked}' detected.",
            "exit_code": 1,
        }

    python_cmd = sys.executable or ("python3" if os.name != "nt" else "python")
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            temp_path = f.name

        result = subprocess.run(
            [python_cmd, temp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

        return {
            "output": result.stdout,
            "error": result.stderr,
            "exit_code": result.returncode,
        }

    except subprocess.TimeoutExpired:
        return {
            "output": "",
            "error": f"Execution timed out after {timeout} seconds.",
            "exit_code": 1,
        }
    except Exception as e:
        return {
            "output": "",
            "error": f"Execution failed: {str(e)}",
            "exit_code": 1,
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
```

- [ ] **Step 2: Verify the module imports correctly**

Run:
```bash
cd backend && python -c "from vaathiyaar.execution import run_code_subprocess, check_code_safety; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Test execution manually**

Run:
```bash
cd backend && python -c "
from vaathiyaar.execution import run_code_subprocess
r = run_code_subprocess('def greet(n): return f\"Hello {n}\"\nprint(greet(\"World\"))')
print('output:', repr(r['output']))
print('error:', repr(r['error']))
print('exit:', r['exit_code'])
"
```
Expected: `output: 'Hello World\n'`, `error: ''`, `exit: 0`

- [ ] **Step 4: Test blocked keyword detection**

Run:
```bash
cd backend && python -c "
from vaathiyaar.execution import run_code_subprocess
r = run_code_subprocess('import os; os.system(\"rm -rf /\")')
print('error:', r['error'])
"
```
Expected: `error: Security Error: forbidden operation 'os.system' detected.`

- [ ] **Step 5: Commit**

```bash
git add backend/vaathiyaar/execution.py
git commit -m "feat: add shared subprocess code execution module"
```

---

### Task 2: Unify Code Execution in Classroom and Playground

**Files:**
- Modify: `backend/vaathiyaar/engine.py` (lines 160-305 — `evaluate_code()`)
- Modify: `backend/routes/playground.py` (lines 352-434 — `/execute` endpoint)

- [ ] **Step 1: Refactor `evaluate_code()` in engine.py**

Replace the `exec()` execution block (lines 193-243) with subprocess. The function keeps its same signature and return format — only the execution mechanism changes.

Find this block in `engine.py` (the FORBIDDEN_KEYWORDS check and exec block, approximately lines 193-253):

```python
    FORBIDDEN_KEYWORDS = [
        "import os",
        "import sys",
        "subprocess",
        "open(",
        "exec(",
        "eval(",
        "__import__",
        "shutil",
        "pathlib",
    ]

    for kw in FORBIDDEN_KEYWORDS:
        if kw in student_code:
```

Replace the entire security check + execution block (from `FORBIDDEN_KEYWORDS` definition through the `actual_output = stdout_buf.getvalue()` and `stderr_output` lines) with:

```python
    from vaathiyaar.execution import run_code_subprocess, check_code_safety

    blocked = check_code_safety(student_code)
    if blocked:
        feedback_context = {
            "code_evaluation": {
                "success": False,
                "actual_output": "",
                "expected_output": expected_output,
                "error": f"Security Error: forbidden operation '{blocked}' detected.",
            }
        }
        if lesson_context:
            feedback_context.update(lesson_context)

        try:
            feedback = call_vaathiyaar(
                f"Student used forbidden keyword '{blocked}' in their code. "
                f"Explain why this is not allowed and guide them.",
                student_profile=student_profile,
                lesson_context=feedback_context,
            )
        except Exception:
            feedback = {
                "message": f"**Security Error:** `{blocked}` is not allowed in this environment. "
                           "Try solving the problem without system-level operations.",
                "phase": "feedback",
            }

        return {
            "success": False,
            "output": "",
            "error": f"Forbidden: '{blocked}'",
            "feedback": feedback.get("message", ""),
            "phase": feedback.get("phase", "feedback"),
            "animation": feedback.get("animation"),
        }

    # Execute code via subprocess
    result = run_code_subprocess(student_code)
    actual_output = result["output"]
    stderr_output = result["error"]
    exec_error = stderr_output if result["exit_code"] != 0 else ""
```

Keep everything after this (the output comparison logic, Vaathiyaar feedback call, and return statement) unchanged.

- [ ] **Step 2: Refactor Playground `/execute` endpoint in playground.py**

Find the execute endpoint (lines 352-434). Replace the inline subprocess logic with a call to the shared module.

Replace the body of the endpoint function (after parsing the request body) — specifically the `HARD_BLOCKED` check, temp file creation, and subprocess.run call — with:

```python
    from vaathiyaar.execution import run_code_subprocess

    code = request.get("code", "")
    if not code.strip():
        return {"output": "", "error": "No code provided.", "exit_code": 1}

    result = run_code_subprocess(code)

    output = result["output"]
    error = result["error"]

    # Combine output for terminal display
    combined = output
    if error:
        combined += ("\n" if combined else "") + error

    return {
        "output": combined.strip() if combined else "(No output)",
        "error": error,
        "exit_code": result["exit_code"],
    }
```

Remove the old `HARD_BLOCKED` list, temp file handling, and inline subprocess.run code since they're now in `execution.py`.

- [ ] **Step 3: Test classroom code execution with functions**

Run:
```bash
curl -s -X POST http://localhost:8001/api/classroom/evaluate \
  -H "Content-Type: application/json" \
  -d '{"code":"def add(a,b):\n    return a+b\nprint(add(2,3))","expected_output":"5","topic":"functions","user_id":"test"}' | python -m json.tool
```
Expected: `"success": true`, `"output"` contains `"5"`

- [ ] **Step 4: Test playground code execution with functions**

Run:
```bash
curl -s -X POST http://localhost:8001/api/playground/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"def greet(name):\n    return f\"Hello {name}\"\nprint(greet(\"World\"))","user_id":"test"}' | python -m json.tool
```
Expected: `"output"` contains `"Hello World"`

- [ ] **Step 5: Test blocked keyword still works**

Run:
```bash
curl -s -X POST http://localhost:8001/api/playground/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"import os; os.system(\"ls\")","user_id":"test"}' | python -m json.tool
```
Expected: `"error"` contains `"Security Error"`

- [ ] **Step 6: Commit**

```bash
git add backend/vaathiyaar/engine.py backend/routes/playground.py
git commit -m "feat: unify code execution to subprocess in classroom and playground"
```

---

### Task 3: Add Completions Endpoint + API Client

**Files:**
- Modify: `backend/main.py` (after line 648 — after `/api/content/complete` endpoint)
- Modify: `frontend/src/api.js` (add export)

- [ ] **Step 1: Add completions endpoint in main.py**

Add this endpoint after the existing `/api/content/complete` endpoint (after line 648):

```python
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
```

- [ ] **Step 2: Test the endpoint**

Run:
```bash
curl -s http://localhost:8001/api/content/completions/test-user-id | python -m json.tool
```
Expected: `{"completions": []}` (empty for new user)

- [ ] **Step 3: Add `getCompletions` to api.js**

In `frontend/src/api.js`, after the `completeModule` export (line 15), add:

```javascript
export const getCompletions = (userId) => api.get(`/content/completions/${userId}`);
```

- [ ] **Step 4: Verify frontend build**

Run:
```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add backend/main.py frontend/src/api.js
git commit -m "feat: add completions endpoint and API client"
```

---

### Task 4: Quiz Lock UI in Dashboard and Classroom

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx` (LearningMap + ModuleViewer)
- Modify: `frontend/src/pages/Classroom.jsx` (lesson selection)

- [ ] **Step 1: Add completion tracking to LearningMap (Dashboard.jsx)**

In the `LearningMap` component, add completions state and fetch. Find the existing state declarations (around line 272):

```javascript
const [modules, setModules] = useState([]);
const [loading, setLoading] = useState(true);
```

Change to:

```javascript
const [modules, setModules] = useState([]);
const [completions, setCompletions] = useState(new Set());
const [loading, setLoading] = useState(true);
```

Find the existing useEffect that fetches modules (around line 276):

```javascript
useEffect(() => {
    getModules()
        .then(res => setModules(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
}, []);
```

Replace with:

```javascript
useEffect(() => {
    Promise.all([
        getModules(),
        user?.id ? getCompletions(user.id) : Promise.resolve({ data: { completions: [] } }),
    ])
        .then(([modsRes, compRes]) => {
            setModules(modsRes.data);
            setCompletions(new Set((compRes.data.completions || []).map(c => c.lesson_id)));
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
}, [user?.id]);
```

Add `getCompletions` to the import from `'../api'` at line 22. Current import:

```javascript
import { getModules, getModule, completeModule } from '../api';
```

Change to:

```javascript
import { getModules, getModule, completeModule, getCompletions } from '../api';
```

- [ ] **Step 2: Update LearningMap module card to show 3 states**

Find the `isUnlocked` check (around line 283):

```javascript
const isUnlocked = (id) => (user.unlocked || []).includes(id) || id === "module_1";
```

Add a completion check after it:

```javascript
const isUnlocked = (id) => (user.unlocked || []).includes(id) || id === "module_1";
const isCompleted = (id) => completions.has(id);
```

Find the module card rendering inside the `.map()` (around lines 322-355). The current icon for unlocked modules shows `<CheckCircle2>` for all unlocked. Change the icon section:

Find:
```javascript
{unlocked ? <CheckCircle2 size={18} /> : idx + 1}
```

Replace with:
```javascript
{isCompleted(mod.id) ? <CheckCircle2 size={18} className="text-green-500" /> : unlocked ? <span className="text-sm">{idx + 1}</span> : idx + 1}
```

Find the XP badge area (around lines 357-366) and add a "Completed" badge after it for completed modules. After the closing `</span>` of the XP badge and before the `ChevronRight`/`Lock` icon section, add:

```javascript
{isCompleted(mod.id) && (
    <span className="text-[10px] font-bold rounded-full px-2.5 py-1 border text-green-600 bg-green-50 border-green-200">
        Completed
    </span>
)}
```

- [ ] **Step 3: Lock quiz in ModuleViewer for completed modules**

In the `ModuleViewer` component, add completions state. Find the state declarations (around line 405):

```javascript
const [module, setModule] = useState(null);
const [quizMode, setQuizMode] = useState(false);
```

Add after:

```javascript
const [module, setModule] = useState(null);
const [isModuleCompleted, setIsModuleCompleted] = useState(false);
const [completionInfo, setCompletionInfo] = useState(null);
const [quizMode, setQuizMode] = useState(false);
```

Find the module fetch useEffect (around line 410):

```javascript
useEffect(() => {
    getModule(id).then(res => setModule(res.data)).catch(() => navigate('/dashboard/learn'));
}, [id, navigate]);
```

Replace with:

```javascript
useEffect(() => {
    getModule(id).then(res => setModule(res.data)).catch(() => navigate('/dashboard/learn'));
    if (user?.id) {
        getCompletions(user.id).then(res => {
            const match = (res.data.completions || []).find(c => c.lesson_id === id);
            if (match) {
                setIsModuleCompleted(true);
                setCompletionInfo(match);
            }
        }).catch(() => {});
    }
}, [id, navigate, user?.id]);
```

Find the "Start Quiz" button (around line 522):

```javascript
<div className="mt-16 pt-8 border-t border-black/[0.04] flex justify-end">
    <button onClick={() => setQuizMode(true)} className="btn-neo btn-neo-primary gap-2">
        Start Quiz
        <ChevronRight size={18} />
    </button>
</div>
```

Replace with:

```javascript
<div className="mt-16 pt-8 border-t border-black/[0.04] flex justify-end">
    {isModuleCompleted ? (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-green-50 border border-green-200">
            <CheckCircle2 size={20} className="text-green-500" />
            <div>
                <p className="text-sm font-bold text-green-700">Module Completed</p>
                <p className="text-xs text-green-600">
                    Earned {completionInfo?.xp_awarded || 0} XP on {completionInfo?.completed_at ? new Date(completionInfo.completed_at).toLocaleDateString() : 'earlier'}
                </p>
            </div>
        </div>
    ) : (
        <button onClick={() => setQuizMode(true)} className="btn-neo btn-neo-primary gap-2">
            Start Quiz
            <ChevronRight size={18} />
        </button>
    )}
</div>
```

- [ ] **Step 4: Add completion badges to Classroom lesson selection**

In `Classroom.jsx`, add completions state. Find the component's state declarations near the top (around line 790-815). Add after the existing state:

```javascript
const [completedLessons, setCompletedLessons] = useState(new Set());
```

Find the lessons fetch useEffect (around line 845). After lessons are fetched, also fetch completions. Add inside the existing useEffect or add a new one after it:

```javascript
useEffect(() => {
    if (user?.id) {
        getCompletions(user.id)
            .then(res => setCompletedLessons(new Set((res.data.completions || []).map(c => c.lesson_id))))
            .catch(() => {});
    }
}, [user?.id]);
```

Add `getCompletions` to the import from `'../api'` at the top of the file. Find:

```javascript
import api, { getAuthHeaders, requestModule } from '../api';
```

Change to:

```javascript
import api, { getAuthHeaders, requestModule, getCompletions } from '../api';
```

Find the lesson card rendering in the `LessonSelect` component. Look for where each lesson item is rendered (around lines 280-350 in the LessonSelect subcomponent). Find the lesson title display and add a completion indicator after it:

After the lesson title `<span>` or `<div>`, add:

```javascript
{completedLessons.has(lesson.id) && (
    <span className="ml-2 text-[9px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Done
    </span>
)}
```

Pass `completedLessons` as a prop from the main Classroom component to the LessonSelect subcomponent.

- [ ] **Step 5: Verify frontend build**

Run:
```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Classroom.jsx
git commit -m "feat: lock completed quizzes and show completion badges"
```

---

### Task 5: Enrich Vaathiyaar AI with User Journey Context

**Files:**
- Modify: `backend/vaathiyaar/profiler.py` (lines 190-248 — `get_student_profile()`)
- Modify: `backend/vaathiyaar/modelfile.py` (lines 424-462 — enhanced context blocks)

- [ ] **Step 1: Enrich `get_student_profile()` in profiler.py**

Find the end of `get_student_profile()` — after the recent_signals fetch (around line 245), before `return profile`. Add these additional queries:

```python
    # Add completed lessons
    conn = sqlite3.connect(db_path)
    try:
        comp_rows = conn.execute(
            "SELECT lesson_id, completed_at, xp_awarded FROM lesson_completions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20",
            [user_id],
        ).fetchall()
        profile["completed_lessons"] = [
            {"lesson_id": r[0], "completed_at": r[1], "xp": r[2]} for r in comp_rows
        ]
    finally:
        conn.close()

    # Add active learning path
    conn = sqlite3.connect(db_path)
    try:
        path_row = conn.execute(
            """SELECT lp.name, ulp.current_position, lp.lesson_sequence, ulp.status
               FROM user_learning_paths ulp
               JOIN learning_paths lp ON ulp.path_id = lp.id
               WHERE ulp.user_id = ? AND ulp.status = 'active'
               LIMIT 1""",
            [user_id],
        ).fetchone()
        if path_row:
            import json as _json
            seq = _json.loads(path_row[2]) if path_row[2] else []
            profile["active_path"] = {
                "name": path_row[0],
                "position": path_row[1] or 0,
                "total_lessons": len(seq),
                "status": path_row[3],
            }
        else:
            profile["active_path"] = None
    finally:
        conn.close()

    # Add recent playground conversation topics
    conn = sqlite3.connect(db_path)
    try:
        pg_rows = conn.execute(
            "SELECT title FROM playground_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5",
            [user_id],
        ).fetchall()
        profile["recent_playground_topics"] = [r[0] for r in pg_rows if r[0] and r[0] != "New conversation"]
    finally:
        conn.close()

    # Add XP and rank
    conn = sqlite3.connect(db_path)
    try:
        pts_row = conn.execute("SELECT points FROM users WHERE id = ?", [user_id]).fetchone()
        total_xp = pts_row[0] if pts_row else 0
        profile["total_xp"] = total_xp
        profile["rank"] = "ARCHITECT" if total_xp > 1000 else "ENGINEER" if total_xp > 500 else "CADET"
    finally:
        conn.close()

    return profile
```

- [ ] **Step 2: Add LEARNER JOURNEY section to `build_system_prompt()` in modelfile.py**

Find the enhanced context section (around lines 424-450). After the existing enhanced blocks (mastery map, recent signals, generated module info), add the journey block. Find the line where enhanced context blocks end and the final concatenation begins. Add before the final return/concatenation:

```python
    # ── Learner Journey Context ──────────────────────────────────────
    journey_block = ""
    if student_profile:
        journey_parts = []

        # Completed lessons
        completed = student_profile.get("completed_lessons", [])
        if completed:
            recent_names = ", ".join(
                f"{c['lesson_id']} ({c.get('completed_at', 'recently')[:10]})"
                for c in completed[:8]
            )
            journey_parts.append(f"Completed lessons (recent): {recent_names}")
            journey_parts.append(
                f"Total completed: {len(completed)} lessons | "
                f"{student_profile.get('total_xp', 0)} XP | "
                f"Rank: {student_profile.get('rank', 'CADET')}"
            )

        # Active path
        path = student_profile.get("active_path")
        if path:
            pct = round((path["position"] / max(path["total_lessons"], 1)) * 100)
            journey_parts.append(
                f'Active path: "{path["name"]}" — lesson {path["position"]} of {path["total_lessons"]} ({pct}% complete)'
            )

        # Playground topics
        pg_topics = student_profile.get("recent_playground_topics", [])
        if pg_topics:
            journey_parts.append(f"Recent playground topics: {', '.join(pg_topics[:5])}")

        if journey_parts:
            journey_block = (
                "\n\n=== LEARNER JOURNEY ===\n"
                + "\n".join(journey_parts)
                + "\n\nUse this context to:\n"
                "- Reference completed lessons when explaining related concepts\n"
                "- Acknowledge progress milestones naturally\n"
                "- Connect new topics to what the student already knows\n"
                "- Never re-explain concepts the student has demonstrated mastery in\n"
            )
```

Then include `journey_block` in the final prompt concatenation. Find where `enhanced_context` is appended to the prompt string and add `journey_block` next to it.

- [ ] **Step 3: Test enriched profile**

Run:
```bash
cd backend && python -c "
from vaathiyaar.profiler import get_student_profile
import os
p = get_student_profile(os.environ.get('DB_PATH', 'pymasters.db'), 'test-user-id')
if p:
    print('completed_lessons:', p.get('completed_lessons'))
    print('active_path:', p.get('active_path'))
    print('playground_topics:', p.get('recent_playground_topics'))
    print('rank:', p.get('rank'))
else:
    print('No profile (expected for test user)')
"
```
Expected: Either profile data with new fields populated, or `No profile` for unknown user.

- [ ] **Step 4: Test system prompt includes journey**

Run:
```bash
cd backend && python -c "
from vaathiyaar.modelfile import build_system_prompt
prompt = build_system_prompt(
    student_profile={'completed_lessons': [{'lesson_id': 'loops', 'completed_at': '2026-03-26', 'xp': 25}], 'total_xp': 250, 'rank': 'CADET', 'active_path': {'name': 'Python Fundamentals', 'position': 3, 'total_lessons': 18, 'status': 'active'}, 'recent_playground_topics': ['recursion'], 'skill_level': 'beginner', 'preferred_language': 'en', 'name': 'Test'},
    lesson_context={'topic': 'functions'}
)
print('LEARNER JOURNEY' in prompt)
print('loops' in prompt)
print('Python Fundamentals' in prompt)
"
```
Expected: `True`, `True`, `True`

- [ ] **Step 5: Commit**

```bash
git add backend/vaathiyaar/profiler.py backend/vaathiyaar/modelfile.py
git commit -m "feat: enrich Vaathiyaar AI with user journey context"
```

---

### Task 6: Frontend Learning Signal Recording

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx` (quiz signals)
- Modify: `frontend/src/pages/Classroom.jsx` (lesson viewed signal)
- Modify: `frontend/src/pages/Paths.jsx` (path started signal)

- [ ] **Step 1: Add quiz signals in Dashboard.jsx**

Add `recordSignal` to the import from `'../api'`. Find the existing import (line 22):

```javascript
import { getModules, getModule, completeModule, getCompletions } from '../api';
```

Change to:

```javascript
import { getModules, getModule, completeModule, getCompletions, recordSignal } from '../api';
```

In the ModuleViewer component, find where `setQuizMode(true)` is called (around line 522). Add a signal before it:

```javascript
onClick={() => {
    recordSignal({ user_id: user.id, signal_type: 'quiz_started', topic: module.id, value: { module_id: module.id } }).catch(() => {});
    setQuizMode(true);
}}
```

In `handleQuizSubmit` (around line 424), add a signal after computing correctCount. After the `const passed = correctCount === module.quiz.length;` line, add:

```javascript
recordSignal({
    user_id: user.id,
    signal_type: 'quiz_attempt',
    topic: module.id,
    value: { module_id: module.id, score: correctCount, total: module.quiz.length, passed },
}).catch(() => {});
```

- [ ] **Step 2: Add lesson_viewed signal in Classroom.jsx**

Add `recordSignal` to the import from `'../api'`. Update the existing import to include it.

In `handleSelectLesson` (around line 859), add a signal at the start of the try block, after the lesson is loaded successfully. After `setCurrentLesson(data);`, add:

```javascript
recordSignal({
    user_id: user?.id,
    signal_type: 'lesson_viewed',
    topic: lesson.id,
    value: { lesson_id: lesson.id, track: lesson.track || '' },
}).catch(() => {});
```

- [ ] **Step 3: Add path_started signal in Paths.jsx**

Add `recordSignal` to the import from `'../api'`. Find the existing `api` import in Paths.jsx and add `recordSignal` to it.

Find the `handleStart` function (the function that calls `api.post(\`/paths/${pathId}/start\`)` or similar). After the successful API call, add:

```javascript
recordSignal({
    user_id: user?.id,
    signal_type: 'path_started',
    topic: pathId,
    value: { path_id: pathId },
}).catch(() => {});
```

- [ ] **Step 4: Verify frontend build**

Run:
```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Classroom.jsx frontend/src/pages/Paths.jsx
git commit -m "feat: record learning signals for quiz, lesson view, and path start"
```

---

### Task 7: Classroom Chat Memory

**Files:**
- Modify: `backend/routes/classroom.py` (lines 240-311 — chat/stream endpoint)
- Modify: `frontend/src/pages/Classroom.jsx` (streaming fetch body)

- [ ] **Step 1: Accept `history` in classroom chat endpoints**

In `backend/routes/classroom.py`, find the `ChatRequest` model (around line 20-30). Add an optional `history` field:

```python
history: Optional[list] = None  # Last N chat messages for context
```

Find the chat/stream endpoint (around line 240). Where messages are assembled for the Ollama call (around line 262-266):

```python
messages=[
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": request.message},
],
```

Replace with:

```python
messages=[
    {"role": "system", "content": system_prompt},
    *([{"role": m.get("role", "user"), "content": m.get("content", "")} for m in (request.history or [])[-5:]]),
    {"role": "user", "content": request.message},
],
```

Do the same for the non-streaming `/chat` endpoint (around line 195-200) — find where `call_vaathiyaar()` is called and note that it takes `user_message` directly. The history can be prepended to the user message as context, or the `call_vaathiyaar` function signature can be extended. The simplest approach: prepend history to the message:

Find the call to `call_vaathiyaar(request.message, ...)` and change to:

```python
history_context = ""
if request.history:
    recent = request.history[-5:]
    history_context = "\n".join(
        f"{'Student' if m.get('role') == 'user' else 'Vaathiyaar'}: {m.get('content', '')}"
        for m in recent
    ) + "\n\n"

result = call_vaathiyaar(
    history_context + request.message,
    student_profile=profile,
    lesson_context=lesson_context,
)
```

- [ ] **Step 2: Send chat history from Classroom frontend**

In `Classroom.jsx`, find the streaming fetch body (around lines 929-936):

```javascript
body: JSON.stringify({
    user_id: user?.id,
    message,
    lesson_context: currentLesson ? { topic: currentLesson.topic || currentLesson.id, lesson_id: currentLesson.id } : null,
    phase,
    language,
    username: user?.name || user?.username,
}),
```

Add `history` to the body:

```javascript
body: JSON.stringify({
    user_id: user?.id,
    message,
    lesson_context: currentLesson ? { topic: currentLesson.topic || currentLesson.id, lesson_id: currentLesson.id } : null,
    phase,
    language,
    username: user?.name || user?.username,
    history: chatMessages.filter(m => !m._isStreaming).slice(-5).map(m => ({ role: m.role, content: m.content })),
}),
```

- [ ] **Step 3: Test classroom chat memory**

Start the backend, send two messages to the same lesson, and verify the second response acknowledges the first conversation turn.

Run:
```bash
# First message
curl -s -X POST http://localhost:8001/api/classroom/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","message":"What are variables?","language":"en"}' | python -c "import json,sys; print(json.load(sys.stdin).get('message','')[:100])"

# Second message with history
curl -s -X POST http://localhost:8001/api/classroom/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","message":"Can you give me an example?","language":"en","history":[{"role":"user","content":"What are variables?"},{"role":"assistant","content":"Variables store data values."}]}' | python -c "import json,sys; print(json.load(sys.stdin).get('message','')[:100])"
```
Expected: Second response should build on the context of "variables" rather than treating it as a standalone question.

- [ ] **Step 4: Verify frontend build**

Run:
```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 5: Commit**

```bash
git add backend/routes/classroom.py frontend/src/pages/Classroom.jsx
git commit -m "feat: add classroom chat memory with last 5 messages"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Full frontend build passes**: `cd frontend && npx vite build`
- [ ] **Backend imports clean**: `cd backend && python -c "from main import app; print('OK')"`
- [ ] **Function execution works in Classroom**: Test `def add(a,b): return a+b\nprint(add(2,3))` via `/classroom/evaluate`
- [ ] **Function execution works in Playground**: Same test via `/playground/execute`
- [ ] **Completed quiz is locked**: Complete module_1 quiz, navigate away and back — quiz section replaced with completion card
- [ ] **Vaathiyaar mentions completed lessons**: Open classroom chat after completing a lesson — AI references it
- [ ] **Signals recorded**: Check `learning_signals` table has `quiz_attempt`, `lesson_viewed`, `path_started` entries
