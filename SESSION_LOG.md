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

## Phase 4 — [F5] Silent translation fallback
**Backend (`routes/classroom.py`):** `get_lesson` now returns `requested_language`,
`story_language`, and `story_is_fallback` — True only when a non-English learner is served
English because their language variant is missing AND on-demand translation didn't produce
localized content. Additive; no existing field changed.
**Frontend (`pages/Classroom.jsx`):** an amber inline notice in the lesson intro —
"Not available in {Language} yet — showing English." with a "Change language" link to
profile — rendered when `currentLesson.story_is_fallback`. `LANG_LABELS` maps codes to names.
No translation is performed (out of scope).
**Report (`scripts/translation_coverage_report.py` → `TRANSLATION_COVERAGE_REPORT.md`):**
scans all lessons; emits per-locale coverage, the exact lessons missing each locale, and
every translated variant lacking `##`/`###` headings (regresses to single-card layout).
Current: 436 lessons, 7 locales (ta 35%, es/fr/ko/te ~10%, it/ml ~9%), 12 heading-gap variants.

**Also fixed [F3 deep-link render bug found during F5 QA]:** a cold-load deep-link to a lesson
URL left the page BLANK — the catalogue mounted first in phase 'select' and the immediate swap
to the lesson stalled `AnimatePresence mode="wait"` (currentLesson null while phase 'intro').
Fix: don't mount the catalogue during a deep-link; show a "Loading lesson…" placeholder until
the lesson resolves; open by id directly when the lesson isn't in the loaded catalogue. This
makes F3's fresh-tab / refresh cases actually render content (they previously showed only the
"Back to lessons" header over a blank body — I under-verified this in the F3 pass).

**F5 + F3-fix browser QA (local, qatester set to Tamil) — PASS:**
- Backend flag verified live: GET the en-only lesson as the Tamil user → `story_is_fallback:
  true, requested_language: ta, story_language: en`; a covered lesson → false (curl + in-page
  fetch).
- Uncovered lesson (`all_minilm_l6_v2_local_semantic_search`) deep-linked as Tamil user →
  amber "Not available in Tamil yet — showing English." + "Change language" link + full English
  lesson content renders. ✓ (screenshot)
- Covered lesson (`adv_generators`) as Tamil user → Tamil content, NO notice. ✓
- Backend: `tests/test_translation_fallback_flag.py` (3) RED→GREEN.

## Phase 6 — [U9] Reduced-motion support (F4)
**Hook (`hooks/useReducedMotion.js`):** single source of truth — user toggle (localStorage
`pm_reduce_motion`) overrides OS `prefers-reduced-motion` in both directions; reflects the
effective value onto `<html class="reduce-motion">`.
**Global (`index.css` + `index.html`):** `.reduce-motion` suppresses animation/transition
durations and `scroll-behavior`; a pre-React inline script sets the class pre-paint (no flash).
Class-driven (not raw `@media`) so the toggle can override the OS either way.
**Lesson flow (`components/ScrollyExplain.jsx`):** under reduced motion `ScrollyBody` swaps the
IntersectionObserver scroll-advancement for explicit Previous/Next controls (+ "Step X of N",
← / → keys) driving the SAME `stepIndex` into the SAME synced `Visual` — the teaching is intact,
only the motion is removed. `Classroom.jsx` subtitle switches to "use the step controls to
advance" in reduced mode.
**Settings toggle (`pages/Profile.jsx`):** a "Reduce motion" `ToggleSwitch` that calls
`setReduceMotionPref` — applies immediately, overrides the device setting.

**F4 browser QA (local, qatester) — PASS:**
- Reduced ON → open `variables_intro`: step controls render ("Previous" disabled | "Step 1 of
  4" | "Next"), one section shown, no scroll layout. ✓
- Click "Next" → "Step 2 of 4" AND the synced Visual Debugger advanced Step 1/6 → 3/6 (variables
  x=42, name="Ada", scores=[90,85]) — the lesson is fully completable via controls. ✓
- Reduced OFF (`pref='0'`, overriding any OS reduce) → no step controls, scroll hint + scroll-
  driven behaviour return, `.reduce-motion` class absent. ✓ (toggle overrides both directions)
- Backend untouched (frontend-only).

## Phase 5 — [U10] Dynamic results silent to screen readers
**Change (frontend-only):** polite live regions + `aria-busy` on the dynamic result surfaces:
- `components/OutputPanel.jsx` (playground execution): the output body is now
  `role="status" aria-live="polite" aria-busy={running}` with an `aria-label` — the result is
  announced once when it lands, and busy state is conveyed during the run.
- `pages/Classroom.jsx` FeedbackPhase: the grading-verdict panel (verdict + XP pill) is
  `role="status" aria-live="polite"`.
- `pages/Challenges.jsx`: the submission-result panel is `role="status" aria-live="polite"`.
- The streaming Vaathiyaar chat is deliberately NOT made assertive (would talk over the user).

**U10 browser QA (local, qatester) — PASS:**
- Playground output element carries `role=status, aria-live=polite, aria-busy` (false idle);
  after Run, `aria-busy` toggles and the output text ("F2 autosave marker 4242") appears inside
  the live region → announced once (non-streaming, so no per-partial spam). ✓ (verified via DOM;
  a hardware screen-reader read-aloud isn't drivable through the extension, so verification is at
  the ARIA-semantics + content-update level.)
- Backend untouched (frontend-only).

## Phase 7 — [F8] Review queue as default landing (medium item)
**Change (`pages/Dashboard.jsx`, frontend-only):** moved `<ReviewQueue>` from one panel in the
left column to the very top of the dashboard, full-width, above the welcome banner. It already
self-hides when nothing is due, so: returning learner with decayed recall → lands on their
reviews first (default landing state); new/caught-up learner → unchanged normal dashboard.
Review links use `?lesson=` which F3 now redirects to the lesson route (consistent).

**F8 browser QA (local, qatester with 2 seeded decayed-mastery rows) — PASS:**
- `/review/due` returns 2 due (variables_intro, for_loops, recall 0.0, ~41 days). ✓
- Dashboard renders "Due for Review (2)" at the top, full width, ABOVE the greeting, with both
  lessons + Review buttons. ✓
- No-due case self-hides → normal dashboard (by construction — same self-hiding component). ✓
