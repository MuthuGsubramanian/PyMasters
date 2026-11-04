# Under the Hood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lesson (and the learner's own code) gets an "Under the hood" view showing names → objects, aliasing, mutation vs rebinding, call frames and returns, step by step, with an English/Tamil explanation per step.

**Architecture:** Extend the sandboxed tracer with a `heap` mode that records frames, a capped object graph with stable refs and diff events; expose it per lesson (cached) and for the learner's code; render it in a new `UnderTheHood` component reused by the lesson intro popup and the Time-travel visualizer.

**Tech Stack:** Python 3.11 + FastAPI backend (sandbox `run_code_subprocess`), React 18 + Vite + Tailwind frontend, vitest + jsdom, pytest, Playwright tier-1.

**Spec:** `docs/superpowers/specs/2026-11-04-under-the-hood-design.md`

## Global Constraints

- Backend tests: `cd backend && ~/pymasters-ops/e2e-venv/bin/python -m pytest -q <path>` (tests that import `vaathiyaar.engine` need `ollama` — avoid importing engine in new tests).
- Frontend tests: from the worktree root `~/pymasters-ops/heavy podman run --rm -v "$PWD":/app -v ~/Documents/Development/PyMasters/frontend/node_modules:/app/frontend/node_modules -w /app/frontend docker.io/library/node:20-alpine npx vitest run <path>` — ONE container at a time (laptop overheats).
- Tracer output must never contain memory addresses; refs are `o1`, `o2`, … in order of first sight.
- Caps: ≤ 30 objects per step, ≤ 20 items per container, existing `MAX_STEPS` (300) and `MAX_CODE_CHARS`.
- `mode="steps"` output must stay byte-for-byte compatible (TraceViewer and "Visualize my code" depend on it).
- UI: text ≥ 12 px, ≥ 4.5:1 contrast light and dark, 44 px targets, no page-level horizontal scroll at 390 px, reduced motion → no flashes/autoplay; reuse `VisualControls`/`useStepPlayback` and the `.dark`-scoped popup.
- Event kinds (exact): `new_object`, `bind`, `rebind`, `alias`, `mutate`, `call`, `return`, `unbind`, `exception`. Headline priority: exception > alias > mutate > rebind > new_object > call > return > bind > unbind.
- i18n keys `uth.<kind>` in `frontend/src/i18n/en.json` and `ta.json` (other locales fall back to English).

## Review Focus

1. A lesson whose example imports numpy/pandas → objects show type + short repr only; no crash, no huge payload. (Task 2 coverage test)
2. Recursive or deeply nested calls → frames list stays readable and capped; step cap reached → error banner, not a blank view. (Task 1)
3. A container holding itself (`a.append(a)`) or a cycle → no infinite expansion. (Task 1)
4. Learner code that never binds a name (only prints) → view shows "no names yet" and still steps. (Task 4)
5. Tamil learner → Tamil explanation sentences, with code identifiers left in English. (Task 3)

---

### Task 1: Tracer heap mode

**Files:** Modify `backend/vaathiyaar/tracer.py`; Test `backend/tests/test_tracer_heap.py`
**Produces:** `trace_code(code: str, timeout: int = 10, mode: str = "steps") -> dict`; in heap mode each step additionally has `frames: [{"func": str, "depth": int, "names": {name: ref}}]`, `objects: {ref: {"type": str, "repr": str, "mutable": bool, "items": [ref | repr] (containers only)}}`, `events: [{"kind": str, ...}]` with fields `name`, `ref`, `from`, `to`, `func` as relevant.

- [ ] Step 1: write tests — `b = a` on a list gives an `alias` event with both names → same ref; `a.append(4)` gives `mutate` on that ref; `x = 1; x = x + 1` gives `rebind` with different refs; a function call gives `call` then `return` and a frame appears/disappears; `1/0` gives `exception`; `a.append(a)` terminates with a capped object graph; > 30 objects capped; no `0x` address anywhere in the JSON; `mode="steps"` output for a sample program equals the current output (snapshot the current output first).
- [ ] Step 2: run — FAIL (no heap mode).
- [ ] Step 3: implement inside the generated tracer program (it runs in the sandbox subprocess): track `id(obj) → ref` map, per-step frames from user frames, objects reachable one level from names, diff with previous step for events.
- [ ] Step 4: run tests — PASS; run the existing tracer/playground tests — PASS.
- [ ] Step 5: commit `feat(tracer): heap mode — frames, object graph with stable refs, diff events`.

### Task 2: Lesson example code, API and coverage

**Files:** Create `backend/vaathiyaar/lesson_code.py`; Modify `backend/routes/classroom.py`, `backend/routes/playground.py`; Test `backend/tests/test_under_the_hood_api.py`, `backend/tests/test_under_the_hood_coverage.py`
**Consumes:** Task 1 `trace_code(..., mode="heap")`. **Produces:** `example_code(lesson: dict) -> str | None`; `GET /api/classroom/lesson/{lesson_id}/under-the-hood` → heap trace JSON + `{"code": str}` (404 when no example code); `POST /api/playground/trace` accepts `mode` (`"steps"` default, `"heap"`).

- [ ] Step 1: tests — `example_code` picks ExecutionVisualizer code first, else CodeStepper `code` or joined `steps` lines, else None; the route requires auth and learning access like `/lesson/{id}`, returns `code` + steps with `frames`/`objects`/`events`, caches per `(lesson_id, sha256(code))` (second call does not re-run the tracer — patch it), 404 without code; playground `mode="heap"` passes through, default unchanged. Coverage test: run `trace_code(example_code(l), mode="heap")` for every lesson with example code (serial, plain subprocess is acceptable if the sandbox is unavailable in the test env) and assert ≥ 95 % have no tracer error; list failures in the assertion message; allow-list lessons that need files/network with a reason.
- [ ] Step 2: run — FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: run — PASS.
- [ ] Step 5: commit `feat(api): under-the-hood trace per lesson (cached) and for the learner's code`.

### Task 3: Explanations (en/ta)

**Files:** Create `frontend/src/components/animations/underTheHoodText.js`; Modify `frontend/src/i18n/en.json`, `ta.json`; Test `frontend/src/__tests__/underTheHoodText.test.js`
**Produces:** `explainEvent(event, t) -> string`, `headline(events) -> event | null` (priority from Global Constraints), `explainStep(step, t) -> {headline: string, details: string[]}`.

- [ ] Step 1: tests — one sentence per kind in en (identifiers in backticks preserved), ta returns Tamil for every kind with identifiers unchanged; priority order; empty events → a neutral "Python runs line N" sentence.
- [ ] Step 2: FAIL. Step 3: implement (templates with `{name}`, `{other}`, `{type}`, `{func}`). Step 4: PASS (+ i18n key-parity test stays green). Step 5: commit `feat(visuals): plain-language explanations for under-the-hood events (en, ta)`.

### Task 4: UnderTheHood component

**Files:** Create `frontend/src/components/animations/UnderTheHood.jsx`; Test `frontend/src/__tests__/underTheHood.test.jsx`
**Consumes:** Task 3. **Produces:** `UnderTheHood({code, trace, language})` — code panel (`whitespace-pre`, current line highlighted), Names (per frame) → Objects (type badge, value/items; alias = two names to one box; phones: ref chips), explanation headline + details, `PlayableVisual`/`VisualControls` for stepping; error banner when `trace.error`.

- [ ] Step 1: tests from a recorded heap trace fixture (alias + mutate program): at the alias step both names show the same ref and the headline is the alias sentence; at the mutate step the object shows the new items; no-names program shows "No names yet"; error trace shows the banner; reduced motion → no autoplay; markup has no `text-[9px|10px|11px]`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + full suite once. Step 5: commit `feat(visuals): Under the hood view — names, objects, frames, step explanations`.

### Task 5: Wire into the lesson intro and Visualize my code

**Files:** Modify `frontend/src/pages/Classroom.jsx`, `frontend/src/components/TraceViewer.jsx`, `frontend/src/hooks/useCodeTrace.js` (mode); Test `frontend/src/__tests__/underTheHoodWiring.test.jsx`
**Consumes:** Tasks 2–4.

- [ ] Step 1: tests — lesson intro shows an "Under the hood" button next to "Watch It Run" when the API returns a trace, hidden on 404; clicking opens the dark popup with `UnderTheHood`; TraceViewer has tabs "Steps" | "Under the hood" and the second fetches `mode: "heap"` once (lazy).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + full suite once. Step 5: commit `feat(lessons): Under the hood in every lesson and for your own code`.

### Task 6: Tier-1 scenario, ship, live

**Files:** Create `ops/e2e/scenarios/test_ux_under_the_hood.py`.
- [ ] Step 1: scenario — lesson with a list alias example (pick from lessons by grepping for `b = a`/`append`; else `lists`): open Under the hood, step until the alias or mutate headline appears, assert the sentence; 390 px no page overflow; explanation contrast ≥ 4.5 in light and dark. py_compile locally.
- [ ] Step 2: push, PR, CI green, merge, deploy, live check in the owner's Chrome (tab in foreground), record in `~/pymasters-ops/reports/live-audit-2026-11-04.md`.
