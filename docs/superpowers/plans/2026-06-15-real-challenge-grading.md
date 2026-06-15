# Real Challenge Grading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/api/challenges/submit` stub (which marks any code "passed") with real sandbox-executed grading against each challenge's test cases, on an authenticated + rate-limited endpoint.

**Architecture:** Add a relaxed-but-bounded `check_challenge_safety` gate to the existing sandbox; build a per-submission harness that runs the user code then each test case (expression-compare *or* assertion-snippet) in `run_code_subprocess`, parses a sentinel-delimited JSON result, and awards XP only on a full pass. Normalize the 3 non-executable challenges' test cases. Surface per-test feedback in the UI.

**Tech Stack:** FastAPI + SQLite, the existing `vaathiyaar/execution.py` subprocess sandbox, `auth.get_current_user_id`, `ratelimit.SlidingWindowRateLimiter`, React (Challenges.jsx).

**Verification convention:** Per project preference, verify via **live flows** against the running stack (backend `:8001`, frontend `:5173`) using `curl` and the Playwright harness in `_claude_audit/pwtools/` — not pytest suites. After editing backend files, **restart the backend manually** (uvicorn StatReload is unreliable on Windows): find the `:8001` PID via `netstat -ano | grep :8001`, `taskkill //PID <pid> //T //F`, then relaunch `cd backend && ../.venv/Scripts/python.exe main.py`.

Spec: `docs/superpowers/specs/2026-06-15-real-challenge-grading-design.md`.

---

## File Structure

```
backend/
├── vaathiyaar/execution.py     — add check_challenge_safety() (relaxed AST gate)
├── routes/challenges.py        — auth + rate-limit on submit; grade_submission();
│                                  table migration; normalized test_cases for ch-04/06/12
frontend/
└── src/pages/Challenges.jsx    — per-test results panel + rejected/rate-limited states
```

---

## Task 1: Relaxed challenge safety gate

**Files:**
- Modify: `backend/vaathiyaar/execution.py` (add `check_challenge_safety` after `check_code_safety`)

- [ ] **Step 1: Add the gate**

After `check_code_safety` (ends ~line 90), add:

```python
# Modules that stay blocked for challenge grading: network, process spawning,
# native code, dynamic import, serialization-based escapes, persistence.
_CHALLENGE_BLOCKED_MODULES = {
    "subprocess", "socket", "ctypes", "multiprocessing", "importlib",
    "marshal", "pickle", "shutil", "urllib", "http", "requests", "ftplib",
    "smtplib", "webbrowser", "ssl", "select", "termios", "shelve", "dbm",
    "sqlite3", "mmap", "fcntl", "pty", "sys",
}
# os/tempfile/threading/asyncio/contextlib/time/etc. are intentionally allowed:
# challenges legitimately need them, and the subprocess is secret-free, cwd-
# isolated, resource-limited and time-limited.


def check_challenge_safety(code: str) -> str | None:
    """Relaxed variant of check_code_safety for graded challenge submissions.

    Blocks the genuinely dangerous surface (network, process, native, dynamic
    import, introspection escape) but allows computational stdlib. Returns a
    reason string if disallowed, else None.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None  # a real SyntaxError will surface when the harness runs

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _CHALLENGE_BLOCKED_MODULES:
                    return f"import of module '{root}' is not allowed in challenges"
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in _CHALLENGE_BLOCKED_MODULES:
                return f"import of module '{root}' is not allowed in challenges"
        elif isinstance(node, ast.Name):
            if node.id in {"eval", "exec", "compile", "__import__", "open", "input", "breakpoint"}:
                return f"use of '{node.id}' is not allowed in challenges"
        elif isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDERS:
                return f"access to '{node.attr}' is not allowed in challenges"
    return None
```

- [ ] **Step 2: Verify it imports and behaves**

Run:
```bash
cd backend && ../.venv/Scripts/python.exe -c "
from vaathiyaar.execution import check_challenge_safety as g
print('socket ->', g('import socket'))
print('os     ->', g('import os'))
print('tempfile ->', g('import tempfile'))
print('eval   ->', g('x = eval(\"1\")'))
print('escape ->', g('().__class__.__bases__'))
print('clean  ->', g('def f(): return 1'))
"
```
Expected: socket/eval/escape return a reason string; os/tempfile/clean return `None`.

- [ ] **Step 3: Commit**

```bash
git add backend/vaathiyaar/execution.py
git commit -m "feat(sandbox): relaxed check_challenge_safety gate for graded challenges"
```

---

## Task 2: Grader — `grade_submission()` (Form A + Form B)

**Files:**
- Modify: `backend/routes/challenges.py` (add `grade_submission` + helpers near top, after imports)

- [ ] **Step 1: Add `import json` and the grader**

Ensure `import json` is present at the top of `challenges.py` (add if missing). Then add, after the existing `_validate_submission` helper:

```python
_GRADE_SENTINEL = "__PMGRADE__"

# Harness comparison + driver, embedded into the sandboxed program. Compares an
# expression result to the expected literal (tolerant), or runs an assertion
# snippet (Form B). Prints one sentinel line of JSON: a list of per-test dicts.
_HARNESS_TMPL = '''
import json as __json, math as __math

def __cmp(got, raw, unordered=False):
    try:
        exp = eval(raw)
    except Exception:
        return (str(got) == str(raw)) or (repr(got) == raw)
    if unordered:
        try:
            return sorted(got) == sorted(exp)
        except Exception:
            try:
                return set(got) == set(exp)
            except Exception:
                pass
    if isinstance(got, float) or isinstance(exp, float):
        try:
            return __math.isclose(got, exp, rel_tol=1e-9, abs_tol=1e-12)
        except Exception:
            pass
    return (got == exp) or (str(got) == str(exp)) or (repr(got) == raw)

__tests = __json.loads(%(tests)s)
__results = []
for __t in __tests:
    __name = __t.get("name") or __t.get("input") or "test"
    try:
        if "harness" in __t and __t["harness"] is not None:
            exec(__t["harness"], globals())
            __results.append({"name": __name, "passed": True})
        else:
            __got = eval(__t["input"])
            __raw = __t.get("expected_output", __t.get("expected"))
            __ok = __cmp(__got, __raw, bool(__t.get("unordered")))
            __r = {"name": __name, "passed": bool(__ok)}
            if not __ok:
                __r["got"] = repr(__got)[:120]
                __r["expected"] = str(__raw)[:120]
            __results.append(__r)
    except Exception as __e:
        __results.append({"name": __name, "passed": False, "error": str(__e)[:160]})
print("%(sentinel)s" + __json.dumps(__results))
'''


def grade_submission(challenge: dict, code: str) -> dict:
    """Run the submission against the challenge's test cases in the sandbox.
    Returns {passed, passed_count, total, results, message}."""
    from vaathiyaar.execution import run_code_subprocess, check_challenge_safety

    reason = check_challenge_safety(code)
    if reason:
        return {"passed": False, "passed_count": 0, "total": 0, "results": [],
                "message": f"Code rejected: {reason}.", "rejected": True}

    tests = challenge.get("test_cases") or []
    if not tests:
        res = run_code_subprocess(code)
        ok = res.get("exit_code", 1) == 0 and not (res.get("error") or "").strip()
        return {"passed": ok, "passed_count": 1 if ok else 0, "total": 1, "results": [],
                "message": "Ran successfully." if ok else "Your code raised an error."}

    program = code + "\n" + (_HARNESS_TMPL % {
        "tests": repr(json.dumps(tests)),
        "sentinel": _GRADE_SENTINEL,
    })
    res = run_code_subprocess(program, timeout=10)
    out = res.get("output", "") or ""
    idx = out.rfind(_GRADE_SENTINEL)
    total = len(tests)
    if idx == -1:
        err = (res.get("error") or "").strip()
        tail = err.splitlines()[-1][:160] if err else ""
        msg = ("Your code timed out." if "timed out" in err.lower()
               else ("Your code errored before tests ran. " + tail) if err
               else "No output from your solution.")
        return {"passed": False, "passed_count": 0, "total": total, "results": [], "message": msg.strip()}
    try:
        results = json.loads(out[idx + len(_GRADE_SENTINEL):].splitlines()[0])
    except Exception:
        return {"passed": False, "passed_count": 0, "total": total, "results": [],
                "message": "Could not evaluate your solution."}
    passed_count = sum(1 for r in results if r.get("passed"))
    all_pass = passed_count == total and total > 0
    msg = f"All {total} tests passed!" if all_pass else f"{passed_count} of {total} tests passed."
    return {"passed": all_pass, "passed_count": passed_count, "total": total,
            "results": results, "message": msg}
```

- [ ] **Step 2: Smoke-test the grader directly (before wiring the endpoint)**

Run:
```bash
cd backend && ../.venv/Scripts/python.exe -c "
from routes.challenges import grade_submission, CHALLENGES
fib = next(c for c in CHALLENGES if c['id']=='ch-01-fibonacci')
good = 'def fib(n):\n a,b=0,1\n for _ in range(n): a,b=b,a+b\n return a'
bad  = 'def fib(n): return 0'
print('good:', grade_submission(fib, good)['message'])
print('bad :', grade_submission(fib, bad)['message'])
print('junk:', grade_submission(fib, 'print(1)')['message'])
"
```
Expected: good → "All 5 tests passed!"; bad → "1 of 5 tests passed." (fib(0)==0); junk → a NameError-driven "0 of 5".

- [ ] **Step 3: Commit**

```bash
git add backend/routes/challenges.py
git commit -m "feat(challenges): grade_submission — sandboxed test-case grading (expr + assertion forms)"
```

---

## Task 3: Wire grading into the endpoint — auth, rate-limit, table columns, response

**Files:**
- Modify: `backend/routes/challenges.py` (imports, `_ensure_challenges_table`, `submit_solution`)

- [ ] **Step 1: Add imports + a rate limiter**

Near the top imports add:
```python
from fastapi import Depends
from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter

_submit_limiter = SlidingWindowRateLimiter(max_calls=20, window_seconds=60)
```
(If `from fastapi import APIRouter, HTTPException` already exists, extend it with `Depends` instead of a second import.)

- [ ] **Step 2: Add the table migration**

In `_ensure_challenges_table`, after the `CREATE TABLE` statement, add additive columns (idempotent):
```python
        cols = {r[1] for r in conn.execute("PRAGMA table_info(challenge_submissions)").fetchall()}
        if "passed_count" not in cols:
            conn.execute("ALTER TABLE challenge_submissions ADD COLUMN passed_count INTEGER DEFAULT 0")
        if "total_count" not in cols:
            conn.execute("ALTER TABLE challenge_submissions ADD COLUMN total_count INTEGER DEFAULT 0")
        conn.commit()
```

- [ ] **Step 3: Authenticate the endpoint + grade**

Change the signature and body of `submit_solution`:
```python
@router.post("/submit")
def submit_solution(req: SubmitSolutionRequest, caller: str = Depends(get_current_user_id)):
    """Submit a solution. Authenticated (user derived from JWT) + rate-limited.
    Graded against the challenge's test cases in the sandbox."""
    if not _submit_limiter.allow(caller):
        wait = _submit_limiter.retry_after(caller)
        return {"status": "error", "message": f"Rate limit reached. Try again in {wait}s.",
                "xp_awarded": 0, "challenge_id": req.challenge_id}

    user_id = caller  # ignore any body user_id — trust the token only

    challenge = next((c for c in CHALLENGES if c["id"] == req.challenge_id), None)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    db_path = _get_db_path()
    _ensure_challenges_table(db_path)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, passed FROM challenge_submissions WHERE user_id = ? AND challenge_id = ?",
            [user_id, req.challenge_id],
        )
        existing = cursor.fetchone()
        already_passed = bool(existing and existing[1] == 1)

        grade = grade_submission(challenge, req.code)
        passed = 1 if grade["passed"] else 0
        # Award XP only on the first successful pass.
        xp = challenge["xp_reward"] if (passed and not already_passed) else 0

        if existing:
            cursor.execute(
                "UPDATE challenge_submissions SET code=?, passed=?, xp_awarded=COALESCE(xp_awarded,0)+?, "
                "passed_count=?, total_count=?, submitted_at=datetime('now') WHERE user_id=? AND challenge_id=?",
                [req.code, max(passed, existing[1] or 0), xp, grade["passed_count"], grade["total"], user_id, req.challenge_id],
            )
        else:
            cursor.execute(
                "INSERT INTO challenge_submissions (user_id, challenge_id, code, passed, xp_awarded, passed_count, total_count) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [user_id, req.challenge_id, req.code, passed, xp, grade["passed_count"], grade["total"]],
            )
        if xp > 0:
            cursor.execute("UPDATE users SET points = COALESCE(points,0) + ? WHERE id = ?", [xp, user_id])
        conn.commit()

        status = ("already_completed" if (already_passed and passed)
                  else "rejected" if grade.get("rejected")
                  else "passed" if passed else "failed")
        message = ("You already completed this challenge." if status == "already_completed"
                   else (f"{grade['message']} +{xp} XP." if (passed and xp) else grade["message"]))
        return {
            "status": status,
            "message": message,
            "xp_awarded": xp,
            "passed_tests": grade["passed_count"],
            "total_tests": grade["total"],
            "results": grade["results"],
            "challenge_id": req.challenge_id,
        }
    finally:
        conn.close()
```
Keep `SubmitSolutionRequest.user_id` (still accepted for backward compatibility, but ignored).

- [ ] **Step 4: Restart backend, live-verify auth + grading + rate-limit**

Restart backend (per the convention note). Then:
```bash
# 401 without a token
curl -s -o /dev/null -w "no-token -> %{http_code}\n" -X POST http://localhost:8001/api/challenges/submit \
  -H "Content-Type: application/json" -d '{"challenge_id":"ch-01-fibonacci","code":"x=1"}'
# register -> token; correct fib -> passed +10; junk -> failed 0
U=grader_$(date +%s|tail -c5)
RESP=$(curl -s -X POST http://localhost:8001/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"$U\",\"password\":\"Test1234!\"}")
TOK=$(echo "$RESP"|python -c "import sys,json;print(json.load(sys.stdin)['token'])")
ID=$(echo "$RESP"|python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST http://localhost:8001/api/challenges/submit -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d "{\"challenge_id\":\"ch-01-fibonacci\",\"user_id\":\"$ID\",\"code\":\"def fib(n):\\n a,b=0,1\\n for _ in range(n): a,b=b,a+b\\n return a\"}"
```
Expected: `no-token -> 401`; correct → `{"status":"passed","xp_awarded":10,"passed_tests":5,...}`; a junk submit → `{"status":"failed","xp_awarded":0,...}`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/challenges.py
git commit -m "feat(challenges): auth + rate-limit submit, persist per-test counts, real grade response"
```

---

## Task 4: Normalize test cases for ch-04, ch-06, ch-12

**Files:**
- Modify: `backend/routes/challenges.py` (the `test_cases` of these three entries in `CHALLENGES`)

- [ ] **Step 1: Replace ch-04 (LRU cache) test_cases** with assertion harnesses:

```python
        "test_cases": [
            {"name": "get returns stored value", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nassert c.get(1)==1"},
            {"name": "evicts least-recently-used", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nc.put(3,3)\nassert c.get(2)==-1"},
            {"name": "capacity 1 evicts previous", "harness": "c=LRUCache(1)\nc.put(1,1)\nc.put(2,2)\nassert c.get(1)==-1"},
            {"name": "get refreshes recency", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nc.get(1)\nc.put(3,3)\nassert c.get(2)==-1 and c.get(1)==1"},
            {"name": "missing key returns -1", "harness": "c=LRUCache(2)\nassert c.get(99)==-1"},
        ],
```

- [ ] **Step 2: Replace ch-06 (decorator composition) test_cases**:

```python
        "test_cases": [
            {"name": "timer preserves return value", "harness": "@timer\ndef slow():\n    return 42\nassert slow()==42"},
            {"name": "retry re-raises after max attempts", "harness": "n={'c':0}\n@retry(max_attempts=3)\ndef flaky():\n    n['c']+=1\n    raise ValueError('x')\ntry:\n    flaky()\n    assert False, 'should have raised'\nexcept ValueError:\n    assert n['c']==3"},
            {"name": "retry succeeds before max", "harness": "n={'c':0}\n@retry(max_attempts=3)\ndef eventually():\n    n['c']+=1\n    if n['c']<2:\n        raise ValueError\n    return 'ok'\nassert eventually()=='ok'"},
            {"name": "validate_types accepts valid args", "harness": "@validate_types\ndef add(a: int, b: int) -> int:\n    return a+b\nassert add(1,2)==3"},
            {"name": "validate_types rejects wrong types", "harness": "@validate_types\ndef add(a: int, b: int) -> int:\n    return a+b\nraised=False\ntry:\n    add('x',2)\nexcept TypeError:\n    raised=True\nassert raised"},
        ],
```

- [ ] **Step 3: Replace ch-12 (context managers) test_cases**:

```python
        "test_cases": [
            {"name": "Timer runs a block without error", "harness": "import time\nwith Timer():\n    time.sleep(0.01)"},
            {"name": "temp_directory yields an existing dir", "harness": "import os\nwith temp_directory() as d:\n    assert os.path.isdir(d)"},
            {"name": "temp_directory cleans up after", "harness": "import os\nwith temp_directory() as d:\n    saved=d\nassert not os.path.isdir(saved)"},
            {"name": "suppress swallows listed exception", "harness": "with suppress(ValueError):\n    raise ValueError('x')"},
            {"name": "suppress lets other exceptions through", "harness": "raised=False\ntry:\n    with suppress(ValueError):\n        raise KeyError('k')\nexcept KeyError:\n    raised=True\nassert raised"},
        ],
```

- [ ] **Step 4: Verify all 12 challenges are passable with a reference solution**

Create a throwaway script `backend/_refcheck.py` with reference solutions for the 3 normalized challenges and confirm they pass; spot-check the 9 executable ones still parse. Run:
```bash
cd backend && ../.venv/Scripts/python.exe -c "
from routes.challenges import grade_submission, CHALLENGES
refs = {
 'ch-04-lru-cache': '''from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity):
        self.cap=capacity; self.d=OrderedDict()
    def get(self,key):
        if key not in self.d: return -1
        self.d.move_to_end(key); return self.d[key]
    def put(self,key,value):
        if key in self.d: self.d.move_to_end(key)
        self.d[key]=value
        if len(self.d)>self.cap: self.d.popitem(last=False)''',
 'ch-06-decorator-composition': '''import functools
def timer(func):
    @functools.wraps(func)
    def w(*a,**k):
        return func(*a,**k)
    return w
def retry(max_attempts=3):
    def deco(func):
        @functools.wraps(func)
        def w(*a,**k):
            last=None
            for _ in range(max_attempts):
                try: return func(*a,**k)
                except Exception as e: last=e
            raise last
        return w
    return deco
def validate_types(func):
    import inspect
    @functools.wraps(func)
    def w(*a,**k):
        hints=getattr(func,'__annotations__',{})
        names=list(inspect.signature(func).parameters)
        for n,val in zip(names,a):
            if n in hints and isinstance(hints[n],type) and not isinstance(val,hints[n]):
                raise TypeError(n)
        return func(*a,**k)
    return w''',
 'ch-12-context-manager': '''import time, os, tempfile, shutil
from contextlib import contextmanager
class Timer:
    def __enter__(self):
        self.t=time.perf_counter(); return self
    def __exit__(self,*a):
        print(f'elapsed {time.perf_counter()-self.t:.3f}s')
@contextmanager
def temp_directory():
    d=tempfile.mkdtemp()
    try: yield d
    finally: shutil.rmtree(d, ignore_errors=True)
class DatabaseTransaction:
    def __init__(self,conn): self.conn=conn
    def __enter__(self): return self.conn
    def __exit__(self,et,ev,tb): pass
@contextmanager
def suppress(*exc):
    try: yield
    except exc: pass''',
}
for cid,code in refs.items():
    c=next(x for x in CHALLENGES if x['id']==cid)
    r=grade_submission(c,code)
    print(cid, '->', r['message'], '(passed)' if r['passed'] else '*** FAIL ***')
"
```
Expected: all three print "All N tests passed! (passed)". If any fails, fix the test_case or harness until a correct reference solution passes (never weaken to where junk passes).

Note: `shutil` is needed by the ch-12 reference but is in `_CHALLENGE_BLOCKED_MODULES`. **Resolution:** in Task 1, move `shutil` OUT of `_CHALLENGE_BLOCKED_MODULES` (it only does file ops within the isolated cwd/temp dir; the dangerous parts are network/process, not shutil). Update the gate and re-run this check.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/challenges.py backend/vaathiyaar/execution.py
git commit -m "content(challenges): executable test cases for LRU/decorator/context-manager + allow shutil"
```

---

## Task 5: Frontend — per-test results panel

**Files:**
- Modify: `frontend/src/pages/Challenges.jsx`

- [ ] **Step 1: Render the results + states**

After the existing submit-result rendering (the block that shows `result.message` / `result.status`), add a results panel. Locate where `result` is shown and extend it:

```jsx
{result && (
  <div className={`mt-3 rounded-xl p-3 border text-sm ${
      result.status === 'passed' ? 'bg-green-500/10 border-green-500/20 text-green-600'
    : result.status === 'already_completed' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600'
    : result.status === 'rejected' || result.status === 'error' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
    : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
    <div className="font-semibold">{result.message}</div>
    {Array.isArray(result.results) && result.results.length > 0 && (
      <ul className="mt-2 space-y-1">
        {result.results.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-text-secondary">
            <span className={r.passed ? 'text-green-500' : 'text-red-500'}>{r.passed ? '✓' : '✗'}</span>
            <span className="flex-1">
              <span className="font-mono text-xs">{r.name}</span>
              {!r.passed && r.expected !== undefined && (
                <span className="block text-xs text-text-muted">expected <code>{r.expected}</code>, got <code>{r.got}</code></span>
              )}
              {!r.passed && r.error && (
                <span className="block text-xs text-text-muted">error: {r.error}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
)}
```
If a simpler `result` display already exists, replace it with the above (keep one source of truth). Ensure `typeof result.message === 'string'`.

- [ ] **Step 2: Build + restart frontend if needed; verify it compiles**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Challenges.jsx
git commit -m "feat(challenges): per-test results panel + rejected/rate-limited states"
```

---

## Task 6: End-to-end live verification

**Files:** Create (throwaway): `_claude_audit/pwtools/verify_grading.mjs`

- [ ] **Step 1: Drive the full flow via Playwright + API**

Write `_claude_audit/pwtools/verify_grading.mjs` that, against the running stack: registers a learner, opens `/dashboard/challenges`, and submits (via the page or `p.request`) a correct solution (passed + XP, then already_completed), a wrong solution (failed with a breakdown), junk (`print(1)` → failed, 0 XP), and an unsafe submission (`import socket` → rejected). Capture a screenshot of the results panel (both a pass and a fail) to `_claude_audit/screenshots/`.

- [ ] **Step 2: Run it and confirm the 8 spec flows**

Run: `cd _claude_audit/pwtools && node verify_grading.mjs`
Confirm: 401 unauthenticated; correct → passed +XP once; re-submit → already_completed; wrong → failed N/total; junk → 0 XP; `import socket` → rejected; `while True: pass` → times out → failed; >20/min → rate-limited. Visually check the results-panel screenshots in both light and dark.

- [ ] **Step 3: Commit any fixes, then update the build log**

```bash
git add -A
git commit -m "test(challenges): live grading verification (8 flows) + build-log note"
```

---

## Self-review notes

- **Spec coverage:** Task 1 (safety policy), Task 2 (grading harness, comparison, Form A/B), Task 3 (auth, rate-limit, persistence, response shape), Task 4 (test-case normalization for the 2 partial + 1 prose challenges), Task 5 (frontend feedback), Task 6 (live verification of all 8 spec flows). XP-cutover is a flagged product decision (spec §Rollout) — not auto-applied here.
- **shutil:** the ch-12 reference needs `shutil.rmtree`; Task 4 Step 4 moves `shutil` out of the challenge blocklist (file ops are confined to the isolated cwd/temp dir; the dangerous surface is network/process/native, which stays blocked).
- **No deploy:** all changes land on the branch; deploy is gated on `gcloud auth login` (separate, user-run).
