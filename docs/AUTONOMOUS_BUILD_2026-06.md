# PyMasters — Autonomous Build Log (Jun 2026)

A week of autonomous product work on branch `feat/autonomous-week-2026-06`.
Every change was tested and live-verified; the platform was deployed to Cloud Run
(`pymasters`, us-central1) at each stable milestone with a recorded rollback target.

## What shipped

### Content — 7 new "not available elsewhere" tracks (52 lessons)
Each lesson teaches through a **deterministic, sandbox-verified hands-on Python
challenge** (graded on output equality, runs in the hardened code sandbox):

| Track (`track` id) | Lessons | Focus |
|---|---:|---|
| `vibe_coding` | 14 | dos & don'ts of AI-assisted development |
| `python_internals` | 10 | object model, refcounting/GC, GIL, descriptors, metaclasses |
| `transformers_scratch` | 8 | softmax / attention / layer-norm by hand in pure Python |
| `async_concurrency` | 5 | event loop, await/gather, structured concurrency |
| `performance_optimization` | 5 | profiling, killing O(n²), data-structure choice |
| `debugging_mastery` | 5 | tracebacks, bisection, defensive programming |
| `regex_mastery` | 5 | groups, lookarounds, when NOT to use regex |

Also: consolidated the auto-generated `ai_engineering` bloat **361 → 124**.
**Catalogue: 420 lessons, 0 broken.** New tracks are registered in
`backend/routes/classroom.py` (skill_visible + primary/secondary track lists).

### Security / production-readiness
- **Code sandbox** (`backend/vaathiyaar/execution.py`): closed a secret-exfiltration
  hole (child no longer inherits the parent env), AST-based safety gate (replaces a
  bypassable substring blocklist), isolated cwd, POSIX resource limits, timeouts.
- **Auth**: JWT fail-closed in production (`K_SERVICE` + weak secret → refuses to boot);
  `/api/playground/execute` + `/install-package` now require auth + are rate-limited.
- **Password recovery fixed end-to-end**: registration never collected/stored email
  (form → `registerUser` → `UserRegister` model → INSERT all dropped it). Now collected
  + persisted; reserved super-admin emails are rejected at registration (anti-impersonation).
- **Dashboard** loaded stale fallback trends (`/api/trends` → `/api/trending`, `summary`→`desc`).
- **Test suite** repaired: was 13 collection errors + 2 failures → **127 passed, 1 skipped**.

### AI tutor
- `parse_vaathiyaar_response` salvages the message from truncated JSON (no raw braces to students).
- **Struggle-aware feedback**: after 3 failed attempts the tutor escalates to concrete
  step-by-step help and returns a `struggling` flag; the Classroom shows a supportive panel.
- "Explain my error" in the Playground (`OutputPanel` → `handleAskAIForHelp`) verified working.

### UI/UX
- Finished the Home landing redesign; full SEO (meta/OG/Twitter/JSON-LD, robots.txt,
  sitemap.xml, generated og-image); refreshed the What's-New modal (v2.0.0) to feature
  the new tracks; reusable `StateViews` (Loading/Empty/Error+retry).
- Live section-by-section analysis via Playwright (student / org-admin / super-admin
  journeys) — production-quality, no console errors in normal flows.

## Deploy recipe (validated)
1. `gcloud builds submit --tag us-central1-docker.pkg.dev/pymasters-app/cloud-run-source-deploy/pymasters:autoweek-<shortsha> --region=us-central1 .`
2. Record rollback: `gcloud run services describe pymasters --region=us-central1 --format="value(status.latestReadyRevisionName)"`
3. `gcloud run deploy pymasters --image <tag> --region=us-central1 --platform=managed --quiet` — **image-only swap preserves env/secrets/scaling.**
4. Smoke-test `https://pymasters.net`. Rollback: `gcloud run services update-traffic pymasters --region=us-central1 --to-revisions <prev>=100`.

> ⚠️ The committed `cloudbuild.yaml` is stale/unsafe (hardcoded old key, `--set-env-vars`
> would wipe Secret Manager mappings, `min=0`). Do **not** trigger it — use the recipe above.

## Tooling
- Playwright/Chromium installed in `_claude_audit/pwtools/` (gitignored) for visual
  verification; screenshots under `_claude_audit/screenshots/`.

## Update — curated paths + a critical seeding fix
- Added **5 curated learning journeys** through the new tracks (AI-Assisted
  Developer, Python Internals Mastery, Robust Python Engineering, Build a
  Transformer, Practical Python Toolkit) — `backend/paths/definitions.py`. 20 paths total.
- **Fixed silent prod seeding failure**: `init_db` committed AFTER calling
  `seed_concepts`/`seed_paths`, so their separate connections hit "database is
  locked" under Litestream/WAL and seeding was skipped every startup. Now commits
  first (+ 30s busy_timeout). Prod went from a partial seed to the full
  **233 concepts / 295 edges / 20 paths** — so the knowledge graph (recommendations,
  concept maps) and any future path/concept additions now actually land in prod.

## Final tally
10 new unique tracks (66 lessons) + 5 curated paths · ai_engineering 361→124 ·
catalogue 434 lessons / 0 broken · 3 real prod bugs fixed (trends, password
recovery, seeding) · security hardened · struggle-aware tutoring · test suite
127 passed · Home redesign + SEO · ~17 production deploys.

## Update — full UI/UX audit + hardening (2026-06-13, weekend)
Live visual audit of **every module** in both light & dark mode (+ mobile),
driven via Playwright (`_claude_audit/pwtools/`). Zero JS/console errors on any
page. Found and fixed several real, user-facing issues — all committed on
`feat/autonomous-week-2026-06`, builds green, NOT yet deployed (gcloud token
expired; needs re-auth before the deploy recipe can run):

- **Brand logo invisible/muddy app-wide.** The detailed logo SVG (triangle +
  reactor + "Py"/"MASTERS" lockup) was illegible at small sizes and washed out
  by a `brightness(2)` hack inside the gradient brand boxes (sidebar, login,
  onboarding, landing nav, footer, chat-avatar mockups). Added a clean
  small-format white glyph (`pymasters-glyph.svg` — triangle + reactor
  aperture) that reads crisply from 14px up; kept the rich logo for the large
  hero/showcase. Commit `4e75086`.
- **Dark mode broken on Dashboard, Paths, Profile, and the legacy Learn map.**
  The theme overhaul deleted the global dark `!important` overrides but never
  migrated these pages, so their cards + form inputs rendered as washed-out
  white blocks in dark mode. Migrated to semantic tokens (3 files via parallel
  subagents). Commit `d1cc4f8`.
- **Challenges page stuck on "Loading challenge description…"** — the weekly API
  nests fields under `.challenge` and uses `week_number`/`xp_reward`, but the
  page read them flat (also a 00:00:00 countdown and a `user.user_id` submit bug
  that mis-attributed submissions). Flattened/field-mapped; computes next-Monday
  reset. Commit `01ecf16`.
- **OrgSetup dark-mode inputs** were hardcoded `bg-white/60` → invisible text in
  dark mode; migrated to `bg-bg-inset`. Commit `01ecf16`.
- Verified Admin Console (org invite-prompt + delete-org) and Super Admin render
  correctly in dark mode; no responsive/horizontal-overflow issues on mobile.

## Update — backlog pass (2026-06-15)
Continued the safe, high-value backlog (still on `feat/autonomous-week-2026-06`,
builds green, NOT yet deployed — gcloud re-auth still pending):
- **Reference cards** now show a real per-topic description (was every card
  repeating "Quick reference for this topic"); **Profile** shows "Member since
  <date>" (was N/A — `get_profile` now returns `created_at`); `StateViews`
  error box made dark-friendly. Commit `3603e8f`.
- **Challenges grader was a stub** (`passed = 1` for ANY code → `print(1)` and the
  unchanged starter earned XP and topped the leaderboard). Added a static,
  no-execution validation gate (valid Python, differs from starter, defines the
  required functions/classes, not left as bare `pass`). Commit `8418821`.
- Decided NOT to touch: `Trending.jsx` `dark:` usage is legitimate per-category
  accent pairs, not leaks (leave it); StateViews rollout is low marginal value
  (Paths/Challenges already have skeleton/error states).

### Update — real challenge grading SHIPPED (2026-06-15, branch only)
Implemented per `docs/superpowers/{specs,plans}/2026-06-15-real-challenge-grading*`:
- `check_challenge_safety` (relaxed-but-bounded sandbox gate — allows os/tempfile/
  asyncio/etc., blocks socket/subprocess/ctypes/introspection-escape).
- `grade_submission` runs the code + each test case in the sandbox (expression
  compare *or* assertion harness), tolerant comparison, per-test results.
- `/api/challenges/submit` now **authenticated** (`get_current_user_id`, ignores
  body user_id) + **rate-limited** (20/min); persists per-test counts; XP only on
  first pass.
- Normalised the un-gradable test cases (ch-03 matrix in-place, ch-04 LRU — incl.
  a latent wrong assertion, ch-06 decorators, ch-07 async, ch-12 context-mgrs);
  **verified all 12 challenges pass with a correct reference solution** and fail
  with no-ops (subagent-checked).
- Frontend: per-test results panel (pass/fail/blocked, N/total, +XP, expected-vs-got).
- Live-verified all 8 spec flows (401 unauth · correct→passed+XP · re-submit→
  already_completed · wrong→N/total · junk→0XP · `import socket`→rejected ·
  infinite-loop→timed out · >20/min→throttled) + UI panel in light/dark.
  Commits `ee35003`,`db3f418`,`d22001a`,`1ee2214`,`2a012a2`,`164b5c6`.
- Still open from the spec: the XP-cutover decision (don't claw back stub-era XP)
  — left for product; not auto-applied.

### Needs your decision / can't do autonomously
- **Dual content systems.** `/dashboard/learn` (legacy in-memory `CONTENT_MAP`,
  4 generic modules, not in nav) vs `/dashboard/classroom` (420-lesson
  catalogue). The Dashboard's "Start Learning" / module-progression CTAs (6
  call sites) point at the legacy pages. Consolidating changes the intended
  onboarding funnel — a product decision, not a clear bug. Recommendation:
  decide whether the dashboard on-ramp should be the curated 4-module path or
  the catalogue, then redirect/rebuild accordingly.
- **Deploy** the 2026-06-13 + 2026-06-15 fixes once gcloud is re-authed
  (`gcloud auth login`, then image-only swap per the recipe above).
- Finish i18n for the English-only tracks (needs local Ollama installed).
- Rotate the Ollama key historically committed in `cloudbuild.yaml` (needs the
  Ollama account).

### Backlog still open (safe, lower priority)
- Decompose the 1300-line `Classroom.jsx` / `OrgDashboard.jsx` / `Profile.jsx`.
