# Autonomous scenario testing for pymasters.net — design

Date: 2026-11-03 · Owner: PyMasters ops (Claude, acting owner) · Status: approved in brainstorming, pending spec review

## 1. Intent

pymasters.net serves individual learners, school/college teachers and students, training centres and
enterprises. Every section and every module of the portal must be exercised end to end and completed —
not just loaded — and the whole thing must run, report and repair itself without the owner's involvement.
Success means: a broken page, module, journey, lesson or deploy is caught before or within a day of reaching
learners, and is fixed automatically or surfaced as a clear owner action.

Owner decisions (2026-11-03):
- Full journeys run against a disposable copy of the app in CI; production gets a daily read-only check.
- The AI tutor is a deterministic stub in CI; the daily production check makes one real AI call.
- Approach: Playwright browser tests against the exact production Docker image; deploy blocked on failure.
- Depth: every section and every module tested by completing its actions, every lesson completed nightly.
- Fully autonomous: scheduled runs, automatic triage and repair, report in the 09:00 status email.

Constraints: existing stack (FastAPI, React/Vite, SQLite, single e2-micro VM, Cloudflare); no paid services
(GitHub-hosted runners, existing laptop timers); no test-only backdoor routes in production code.

## 2. Components

- `ops/e2e/scenarios/` — Python + Playwright (matches the existing `ops/e2e` tooling), pytest-driven.
  - `conftest.py`: container URL, browser/context fixtures, unique-user factory, signup/login helpers,
    service-login helper, `db_exec()` helper (runs `ops/e2e/scenarios/_dbtool.py` inside the container via
    `docker exec`) for test state that the UI cannot create quickly (backdated trial, reset/verify tokens).
  - Journey files: `test_journey_individual.py`, `test_journey_school.py`, `test_journey_enterprise.py`,
    `test_journey_access_edges.py`.
  - Module files (one per area, each completes the module's main actions): classroom, playground, play
    (6 mini-games, one full round each), arcade (7 games, one full session each), challenges, paths,
    knowledge map, reference, explains, search, notifications/messages, community, live tutor, profile,
    org console (8 tabs × admin/manager/member), org compete, super admin (9 tabs), pricing/upgrade/payments,
    public pages (login, signup, forgot/reset, verify, join, legal pages, 404).
  - `test_page_health.py`: every route at desktop and 400 px — console errors, failed requests, overflow,
    empty renders (port of `module_sweep.py` checks).
  - `test_coverage_map.py`: parses `frontend/src/App.jsx` routes and backend routers; fails if a route or
    router has no test that references it (keeps coverage complete as the portal grows).
- `ops/e2e/nightly/` — Tier-2 suites: every lesson completed, every path walked, every track's boss
  battle, every org type's labels. `ops/e2e/solutions/<lesson_id>.json` stores verified reference solutions
  per practice challenge.
- `ops/e2e/prod_smoke.py` — read-only production check as the ops account.
- Backend: `stub` provider in `backend/vaathiyaar/engine.py` (complete + stream; deterministic, valid
  JSON/markdown shapes the callers expect). Refuses to activate when `PYMASTERS_ENV=production`.
- CI: `.github/workflows/deploy.yml` gains a scenario stage between build and push;
  new `.github/workflows/nightly-e2e.yml` (cron 20:30 UTC = 02:00 IST).
- Laptop: `ops/laptop/e2e_triage.sh` + `pymasters-e2e-triage.{service,timer}` (08:00 IST);
  `prod_smoke.py` added to the 07:30 IST run; `collect_status.sh` gains a "Test health" section.

## 3. Run flow

Tier 1 — every push to `main` (target ≤ 15 min):
1. Build the production image (unchanged) but do not push.
2. `docker run` it on the runner: temp `DB_PATH`, `VAATHIYAAR_PROVIDERS=stub`, `PYMASTERS_ENV=ci`, random
   `JWT_SECRET` and `OPS_ADMIN_TOKEN`, `PYMASTERS_JOBS=0`, Razorpay test key/secret, no SMTP.
3. Wait for `/health`; run all Tier-1 tests in parallel (pytest-xdist, one browser context per test, unique
   users/orgs per test).
4. On failure: do not push; upload Playwright traces, screenshots and container logs as artifacts; job red.
5. On success: push the image (existing step); VM rolls out within ~2 min.

Mechanics without backdoors: email tokens read from the test DB via `docker exec`; payments by creating a
real order through our API and signing the success callback with the CI test secret (exercises our HMAC
check and plan activation); trial expiry by backdating the user's signup in the test DB; admin actions via
the normal service login.

Tier 2 — nightly 02:00 IST against the image currently live, fresh DB (target ≤ 2 h):
- Every lesson (521 at time of writing): load in each offered language, render every animation step
  without console errors, submit the stored reference solution for each practice challenge through
  `/classroom/evaluate` and require a pass + XP award, answer its quiz items via warm-up/boss battle.
- Every learning path walked start to finish; every track's boss battle; every org type's labels.
- Reference solutions: generated once per challenge (Claude CLI on the ops laptop), verified in the
  sandbox against `expected_output`, committed; new lessons get solutions the night they appear.
  A stored solution that stops passing is reported as a content regression.
- Output: JSON report artifact + summary.

Production check — daily 07:30 IST (laptop): health/build, key public and dashboard pages, catalogue,
one lesson load, search, one real AI reply; read-only as the ops account.

## 4. Failures and flakiness

- Tier-1 failure blocks the deploy; production keeps the current version. Fixes land in a follow-up PR;
  tests are never deleted or skipped to get a deploy through (a wrong test is corrected with the reason in
  the commit message).
- Tests wait for concrete conditions (elements, responses), never fixed sleeps; fresh users per test;
  deterministic AI stub. One automatic retry per failed test; a pass-on-retry is reported as flaky and
  fixed within a day.
- Speed budget: Tier 1 ≤ 15 min; slowest module tests move to nightly if exceeded (never dropped).
- Tier-2 and production-check failures never block deploys; they become defects in the 09:00 email.

## 5. Autonomy and reporting

- 08:00 IST triage (laptop timer): reads nightly report, production check and any failed deploy. For each
  red item, a headless Claude Code session reproduces, fixes on a branch, runs all tiers, opens a PR and
  merges only if everything passes. Guardrails: ≤ 3 attempts per defect; never delete/skip tests; never
  touch secrets, billing or DNS; anything needing the owner goes to the email's "Your actions".
- 09:00 status email: new "Test health" row (Tier 1 / nightly / production pass rates, defects auto-fixed,
  defects open) and auto-fixes listed under "What changed since yesterday".
- Coverage stays complete: `test_coverage_map.py` fails CI when a route/router lacks a test.

## 6. Out of scope (this sub-project)

New product features, UI redesign (sub-project D), content rewriting (E), remaining security items (A).
Defects these tests find are fixed as normal work and feed D/E/A where they belong.

## 7. Success criteria

- Tier 1 runs on every deploy, covers every route and router (coverage check green), ≤ 15 min, blocks bad
  images.
- Nightly completes every lesson/path/boss battle and reports per-item results.
- Production check runs daily; one real AI reply verified.
- Triage runs daily; failures either auto-fixed (merged, tests green) or listed as owner actions.
- 09:00 email shows test health every day.
