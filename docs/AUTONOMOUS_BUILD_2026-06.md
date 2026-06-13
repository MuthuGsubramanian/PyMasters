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

## Remaining opportunities (not blockers)
- **Deploy the 2026-06-13 UI fixes** once gcloud is re-authed (image-only swap
  per the recipe above). Branch is ready.
- Decompose the 1300-line `Classroom.jsx` / `OrgDashboard.jsx` / `Profile.jsx`.
- Roll `StateViews` out to more data pages (Trending, Paths, Challenges).
- Dual content systems: `/dashboard/learn` uses a legacy in-memory `CONTENT_MAP`
  while `/dashboard/classroom` serves the 420-lesson catalogue — consolidate
  (the legacy Learn map isn't in the nav and only shows 4 generic modules).
- `Trending.jsx` still uses old `dark:` variants (works) — migrate to tokens for
  consistency. Reference cards repeat generic "Quick reference for this topic"
  copy; Profile shows "Member since N/A".
- Finish i18n for the new English-only tracks via `backend/i18n/translate_lessons.py`.
- Rotate the Ollama key that was historically committed in `cloudbuild.yaml`.
