# Real Challenge Grading — Design Spec

**Status:** Proposed · **Date:** 2026-06-15 · **Branch target:** `feat/autonomous-week-2026-06` (or a fresh `feat/challenge-grading`)

## Problem

`POST /api/challenges/submit` does **not** grade submissions. The handler is a stub:

```python
# backend/routes/challenges.py — submit_solution()
# "For now, mark as passed ..."
passed = 1
xp = challenge["xp_reward"] if passed else 0
```

Consequences:
- **Any** code "passes" — `print(1)`, the unchanged starter, or an empty body all award XP and top the leaderboard. The feature is decorative, and the leaderboard is meaningless/gameable.
- The endpoint is **unauthenticated**: it trusts `user_id` from the request body (`SubmitSolutionRequest`), so XP can be written to any account by anyone.

An interim **static** gate now rejects obviously-junk submissions (valid Python, differs from starter, defines the required functions, not left as bare `pass`) — see commit `8418821`. That stops the worst abuse but is **not correctness grading**: a syntactically valid wrong answer still passes.

This spec defines **real grading** — running each submission against the challenge's test cases in the hardened sandbox — done safely.

## Goals

1. A submission passes **iff** it produces correct results for every test case of the challenge.
2. The submit endpoint is **authenticated** (user derived from JWT, not the body) and **rate-limited**.
3. Grading runs in the existing **hardened sandbox** with a challenge-appropriate safety policy — no secret/network/process-escape surface, but the stdlib challenges legitimately need (e.g. `os.path`, `tempfile`, `asyncio`, `contextlib`).
4. All 12 bundled challenges are gradable and **passable** by a correct solution.
5. The learner gets **useful per-test feedback** (which cases passed/failed, and for failures: input, expected, got) without locking the UX.

## Non-goals

- Arbitrary multi-file projects, stdin-driven programs, or non-Python languages.
- Plagiarism/AI-authorship detection.
- Performance/complexity scoring (a challenge may *describe* an O(n) requirement, but we grade correctness + a wall-clock timeout, not asymptotics).
- Partial XP. Pass is binary (all tests green). Attempt history may be stored, but XP is awarded once, on first full pass.

## Current state (verified 2026-06-15)

- **Endpoint:** `submit_solution(req: SubmitSolutionRequest)` in `backend/routes/challenges.py`. Body `{user_id, challenge_id, code}`. No auth dependency. Has an `already_completed` guard and a `challenge_submissions` table (`user_id, challenge_id, code, passed, xp_awarded, submitted_at`, `UNIQUE(user_id, challenge_id)`).
- **Sandbox** (`backend/vaathiyaar/execution.py`):
  - `run_code_subprocess(code: str, timeout: int = 10) -> {"output", "error", "exit_code"}` — runs in a subprocess with a secret-free minimal env, isolated cwd, POSIX resource limits (Linux/Cloud Run), timeout, and process-tree kill. **Does not** apply any static gate itself.
  - `check_code_safety(code) -> str | None` — AST gate. `_BLOCKED_MODULES` includes `os, sys, subprocess, shutil, socket, ctypes, importlib, multiprocessing, threading, asyncio, pathlib, pickle, marshal, builtins, gc, tempfile, io, urllib, http, requests, sqlite3, …`; `_BLOCKED_NAMES` = `eval, exec, compile, __import__, open, input, …`; plus escape dunders. This is the **classroom-strict** policy and is too restrictive for several challenges.
- **Auth + rate-limit reference** (`backend/routes/playground.py`): `user_id = Depends(get_current_user_id)` (from `auth`) and `SlidingWindowRateLimiter(max_calls=30, window_seconds=60)` from `ratelimit`, returning a friendly "try again in Ns" on `429`.
- **Challenge test-case gradability** (12 challenges, `CHALLENGES` list):

  | Bucket | Count | Challenges | Note |
  |---|---|---|---|
  | Executable (expr input + literal expected) | 9 | ch-01,02,03,05,07,08,09,10,11 | Work with the grader as-is |
  | Partial (multi-statement input) | 2 | ch-04 (LRU cache), ch-06 (decorator composition) | Inputs are statement sequences, not single expressions — need the richer schema below |
  | Prose (human descriptions) | 1 | ch-12 (context managers) | `input: "with Timer(): time.sleep(0.1)"`, `expected: "prints elapsed ~ 0.1s"` — must be rewritten as executable assertions |

## Design

### 1. Secure the endpoint

- Add `caller: str = Depends(get_current_user_id)` to `submit_solution`; **derive the acting user from the token**, ignore any body `user_id` (drop it from `SubmitSolutionRequest`, or keep but override). Forged/absent token → 401.
- Add a module-level `SlidingWindowRateLimiter(max_calls=20, window_seconds=60)` keyed by the authenticated user; on deny return `{status:"error", message:"Rate limit reached. Try again in Ns."}` (HTTP 200 with error status, matching the playground pattern, so the UI shows it gracefully).

### 2. Challenge safety policy — `check_challenge_safety(code)`

**Decision (recommended):** a dedicated, *relaxed-but-bounded* gate rather than the classroom-strict `check_code_safety` (which breaks ch-07/ch-12) or no gate at all.

- **Block** (escape / network / process / persistence surface): `subprocess, socket, ctypes, multiprocessing, importlib, marshal, pickle, shutil, urllib, http, requests, ftplib, smtplib, ssl, webbrowser, sqlite3, mmap, fcntl, pty, signal`; builtins `eval, exec, compile, __import__, open(<non-temp path>), input, breakpoint`; and the escape dunders (`__class__/__bases__/__subclasses__/__globals__/...`) already in `_BLOCKED_DUNDERS`.
- **Allow** (computation the challenges need): `os` *(os.path only — see note)*, `tempfile, threading, asyncio, time, math, statistics, random, re, json, functools, itertools, collections, heapq, bisect, typing, dataclasses, contextlib, enum, string, datetime, decimal, fractions, copy, operator`.
- Note on `os`: ch-12 uses `os.path.isdir` and `tempfile`. Rather than allow all of `os`, allow `import os`/`os.path.*` and `tempfile.TemporaryDirectory` but the subprocess isolation (secret-free env, isolated cwd, rlimits, timeout) is the real boundary. Implementation: extend the AST gate with an `ALLOWED_FOR_CHALLENGES` set and only block the dangerous list above. **Defense in depth = gate + subprocess isolation + auth + rate-limit.**

> Alternative considered: no static gate, rely solely on subprocess isolation. Rejected — even authenticated, we shouldn't expose `socket`/`subprocess`/introspection-escape from a public endpoint. The relaxed gate keeps that closed while unblocking legitimate challenges.

### 3. Test-case schema (extended, backward compatible)

Support two forms per test case:

```jsonc
// Form A — expression (existing, 9 challenges): eval(input) compared to expected_output
{ "input": "fib(10)", "expected_output": "55" }

// Form B — assertion harness (new, for stateful/async/context-manager challenges):
// a Python snippet that runs after the user code and must complete without raising.
// Use assert for the check; an AssertionError (or any exception) = test failed.
{ "name": "suppress swallows ValueError",
  "harness": "with suppress(ValueError):\n    raise ValueError\n# reaching here = pass" }
```

- **Form A** comparison order: `result == eval(expected_output)` → else `str(result) == str(expected_output)` → else `repr(result) == expected_output`. Floats compared with `math.isclose`. If a challenge declares `"unordered": true`, compare as multisets/sets.
- **Form B** is for ch-04, ch-06, ch-12 (and future stateful challenges). The snippet runs in the same namespace as the user code; success = no exception.

**Normalization work (content):** rewrite ch-04, ch-06, ch-12 test_cases into Form A (where an expression suffices) or Form B (assertion harness). Keep the human-readable description in a separate `expected_output`/`hint` field for display; grading uses `harness`.

### 4. Grading harness & runner — `grade_submission(challenge, code) -> GradeResult`

1. `reason = check_challenge_safety(code)`; if set → fail fast (`status:"rejected"`, message = reason). No execution.
2. Build one harness program: the user `code`, then a loop over `test_cases` that, per case, runs Form A (`eval`) or Form B (`exec` the snippet) inside `try/except`, appends `{name, passed, got, error}`, and finally prints `__PMGRADE__` + `json.dumps(results)`.
3. `run_code_subprocess(harness, timeout=10)`. Parse the last `__PMGRADE__` line. If absent → the user code errored before tests (return the stderr tail as the message, `failed`).
4. `passed = all(r.passed) and len(results) == len(test_cases)`.

`GradeResult = {passed: bool, passed_count, total, results: [{name, passed, got?, error?}], message}`.

- Sandbox guarantees termination (timeout + tree-kill); an infinite loop in user code → timeout → `failed` with "took too long".
- The harness's own `eval`/`exec` are *our* code wrapping the (already safety-checked) user code; the gate applies to user code only.

### 5. Persistence & XP

- Keep the `already_completed` guard (no double XP).
- Award `challenge["xp_reward"]` only when `passed` is true and not previously passed.
- Store `passed`, `xp_awarded`, and add columns `passed_count INT`, `total_count INT` (best attempt) to `challenge_submissions` (additive migration in `_ensure_challenges_table`). Always record the latest `code` + `submitted_at`.

### 6. Response shape (consumed by the frontend)

```jsonc
{
  "status": "passed" | "failed" | "rejected" | "already_completed",
  "message": "All 5 tests passed! +10 XP." | "3 of 5 tests passed." | "<safety reason>",
  "xp_awarded": 10,
  "passed_tests": 5,
  "total_tests": 5,
  "results": [ { "name": "fib(10)", "passed": true },
               { "name": "fib(50)", "passed": false, "got": "12586269", "expected": "12586269025" } ]
}
```

For failed **visible** cases we surface `input/expected/got` — these are pedagogical, not secrets. (If hidden test cases are ever added, mark them `"hidden": true` and omit `got/expected`.)

## Frontend changes (`frontend/src/pages/Challenges.jsx`)

- The submit result already renders `result.message`/`result.status`. Add a **per-test results panel**: a checklist of `results[]` (green check / red x + name), and for failures an expandable "expected vs got". Use existing tokens (`bg-bg-elevated`, `text-text-*`, status colors). On `rejected`, show the safety message in a warning style.
- No change to the data-mapping fix already shipped (`01ecf16`).

## Files changed

### Backend
- `backend/vaathiyaar/execution.py` — add `check_challenge_safety(code)` (relaxed allowlist gate). Reuse the existing AST walk.
- `backend/routes/challenges.py` — auth dependency + rate limiter; replace the static `_validate_submission` call with `grade_submission`; extend `_ensure_challenges_table` (additive columns); richer response. Keep `_validate_submission` as a pre-filter (fast reject of unparseable/empty before spawning a subprocess).
- Challenge content in `CHALLENGES`: normalize test_cases for **ch-04, ch-06, ch-12** to Form A/B; spot-check the other 9 still pass.

### Frontend
- `frontend/src/pages/Challenges.jsx` — per-test results panel + rejected/warning state.

## Verification (live flows — per project convention, not unit tests)

Run against the local stack (backend `:8001`, frontend `:5173`), signed in as a normal learner, using the Playwright harness in `_claude_audit/pwtools/`:

1. **Auth:** submit with no/forged token → 401 (not silently accepted). Submit as a logged-in user → graded.
2. **Correctness, per challenge (all 12):** paste a known-correct solution → `passed`, XP awarded once; re-submit → `already_completed`, no extra XP.
3. **Wrong answers:** an off-by-one / wrong-output solution → `failed` with an accurate `passed_tests/total_tests` and a failing-case breakdown.
4. **Junk/abuse:** `print(1)`, empty, unchanged starter → `rejected`/`failed`, **0 XP** (regression guard for the original stub bug).
5. **Safety:** `import socket` / `subprocess` / `().__class__.__bases__…` → `rejected` with reason; `import os`/`tempfile`/`asyncio` in a legit ch-07/ch-12 solution → allowed and grades.
6. **Resource:** `while True: pass` → times out → `failed` "took too long", server healthy after.
7. **Rate limit:** >20 submits/min by one user → friendly rate-limit message, no 500s.
8. **Leaderboard integrity:** after the above, the leaderboard reflects only genuinely-passed challenges.

Add cases 4–6 to the weekly live E2E smoke routine as a regression guard.

## Rollout

1. Land behind the existing branch; verify all 8 flows locally in both light/dark.
2. Deploy via the image-only recipe (needs gcloud re-auth) with a recorded rollback revision.
3. Because grading is now real, **existing stub-era "passed" rows are not retroactively trustworthy** — optionally reset `challenge_submissions` (or flag pre-cutover rows) so the leaderboard starts clean. Recommended: a one-time `UPDATE challenge_submissions SET passed=0, xp_awarded=0 WHERE submitted_at < '<cutover>'` is **not** done automatically (would claw back user XP); instead leave history and note the cutover. Decide with product.

## Risks & mitigations

- **Sandbox escape / abuse** → auth + rate-limit + relaxed-but-bounded gate + subprocess isolation (secret-free env, isolated cwd, rlimits, timeout, tree-kill). Same engine already trusted for `/playground/execute`.
- **False negatives** (correct solution graded wrong due to ordering/float/format) → tolerant comparison (`math.isclose`, `unordered` flag, str/repr fallbacks); verify each of the 12 with a reference solution before shipping.
- **Breaking the live weekly challenge** (ch-12 is current) → ch-12 normalized to Form B assertions *before* deploy; flow #2 must pass for the active week.
- **Windows dev quirk:** POSIX rlimits don't apply locally and uvicorn StatReload is flaky — restart the backend manually after edits; real limits apply on Cloud Run (Linux).

## Out of scope / future
- Hidden test cases + anti-hardcoding (randomized inputs per submit).
- Author UI for adding challenges with validated test schemas.
- Streaming/iterative output challenges.
