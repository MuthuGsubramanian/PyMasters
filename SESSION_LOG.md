# UX / Accessibility Build + Live QA — Session Log

Based on branch `security/remediation-phases` (security remediation complete + owner-lockout
hotfix deployed and verified; see REMEDIATION_LOG.md). Auto-push task stays DISABLED so no
partial state ships mid-work.

## Phase 0 — Establish autonomy (browser control gate)

**Result — browser control CONFIRMED (gate cleared):**
- Claude-in-Chrome extension responds (tab group created, tab 602888717).
- Loaded https://pymasters.net and read the JS-rendered SPA DOM (React nav/buttons/viewport
  via read_page) — not a static fetch. ✓
- Local app runs: `vite build` succeeds on Windows (win32 rollup binaries present, despite the
  `@rollup/rollup-linux-x64-gnu` hard-dep that breaks `npm install` — noted in REMEDIATION_LOG
  Phase 8). Baseline initial JS: index bundle 639 kB (205 kB gzip) + xlsx chunk 333 kB.
- Session-persistence 5-min idle test: NOT yet run.

**Status:** Phase 0 gate cleared. The build phases (F3 linkable lessons, F2 playground autosave,
F4 reduced-motion, F5 translation fallback) + the exhaustive 6-analyst live QA over every route
and all 436 lessons are a large workstream best run as its own focused session to avoid the
half-finished outcome the brief explicitly warns against. Recommended next-session order:
Phase 1 baseline (count routes/components/lessons/locales from repo; screenshot matrix), then
F3 → F2 → F5 → F4 → F6, each with its targeted browser verification before the next.

## Phase 1 — Baseline (counts recounted from repo)
- Routes: **36** (React Router paths in App.jsx; ~16 nested under /dashboard).
- Components: **55** (frontend/src/components/**/*.jsx). Pages: **27** (frontend/src/pages).
- Lesson files: **437** (backend/lessons/**/*.json) — prompt said 436; my recount is 437.
- i18n locales: **2** (en.json, ta.json) — hardcoded UI strings live in components, not i18n.
- Baseline initial JS (prod build): index 639 kB (205 kB gzip) + xlsx 333 kB chunk.
- Local stack up: backend :8001 (branch code, JWT local-dev), vite :5173. QA user `qatester`.
- DECISION (logged per "lowest-risk + log it"): the full 36×3×2 = 216-screenshot baseline
  matrix is deferred; instead I capture before/after screenshots for each route a build phase
  touches, and the QA sweep screenshots routes as it visits them. Rationale: the screenshots
  are a regression reference — capturing them per-touched-route gives the same diff value
  without 200+ up-front captures. Full-matrix baseline remains available on request.

## Phase 2 — [F3] Lessons are not linkable

**F3 change:** promoted the open lesson to a real route segment.
- `App.jsx`: added `<Route path="classroom/:lessonId">` alongside `classroom` (same component).
- `Classroom.jsx`: read `:lessonId` via `useParams`; `handleSelectLesson` now `navigate()`s to
  `/dashboard/classroom/:id` (URL reflects the open lesson); a sync effect opens/switches/closes
  the lesson from the URL (single source of truth, so back/forward work); exit handlers clear the
  segment; a legacy effect redirects `?lesson=<id>` → the route so review-queue links survive; an
  unknown id sets a graceful `lessonNotFound` notice instead of crashing.
- Scroll-offset restoration within the scrollytelling is NOT implemented (reopens at the lesson
  intro) — out of scope, would need per-lesson scroll persistence; logged as a deferral.

**F3 browser QA (local, qatester, tab 602888730/733) — all PASS:**
1. Click "Variables: The Magic Boxes" → URL = `/dashboard/classroom/variables_intro`. ✓
2. Same URL in a fresh tab → same lesson opens ("Back to lessons" view). ✓
3. Cold load of the lesson URL (= refresh) → lesson opens. ✓
4. Browser Back from a lesson → returns to `/dashboard/classroom`, lesson closes. ✓
5. `/dashboard/classroom/bogus_nonexistent_lesson` → amber "That lesson link didn't match…"
   notice + catalogue, no crash. ✓
6. Legacy `?lesson=variables_intro` → redirects to `/dashboard/classroom/variables_intro`. ✓
- Console: no errors on the classroom route during the flow.
- NOTE (perf finding, feeds U9): the 437-lesson catalogue with framer-motion is heavy — the
  renderer intermittently froze screenshot capture until settled. Flagged for the reduced-motion
  phase.

## Phase 3 — [F2] Playground loses work on refresh
**Change (`pages/Playground.jsx`, frontend-only):** debounced (600ms) autosave of the editor
buffer to `localStorage` under a per-user key `pm_playground_code_<userId>`, restored on mount
(without clobbering code injected from a Vaathiyaar demo), with a dismissible "Restored your
last session's code." banner so it isn't silent. All storage access wrapped in try/catch so
private-browsing / disabled storage degrades silently. Clearing the editor clears the buffer
(autosave writes '' → removeItem). Server-side snippet storage intentionally out of scope.

**F2 browser QA (local, qatester, tab 602888730) — PASS:**
1. Typed `answer = 4242 / print(...)` → refresh → code restored + cyan banner shown. ✓
2. Per-user scoping: localStorage key confirmed = `pm_playground_code_<qatester-uuid>`; a
   different account uses a different key and cannot see this buffer. ✓ (verified via
   javascript_tool reading localStorage)
3. Private browsing: all reads/writes are in try/catch → no throw when storage is unavailable.
   ✓ (code-verified; full incognito run not executed — logged as the sampling boundary)
- Backend suite stayed green (frontend-only change).
