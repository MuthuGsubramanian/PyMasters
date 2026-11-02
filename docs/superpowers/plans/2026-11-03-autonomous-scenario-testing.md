# Autonomous Scenario Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every section and module of pymasters.net is exercised to completion on every deploy and nightly, failures block bad images or are fixed automatically, and results reach the 09:00 email.

**Architecture:** Playwright (Python, pytest) tests in `ops/e2e/scenarios/` drive the exact production Docker image started in CI with a fresh SQLite DB and a deterministic `stub` AI provider; a nightly workflow completes every lesson with verified reference solutions; a laptop timer runs a read-only production smoke and an 08:00 headless-Claude triage that fixes red items.

**Tech Stack:** Python 3.11, pytest, pytest-xdist, pytest-rerunfailures, Playwright (Chromium), Docker, GitHub Actions, systemd user timers, Claude Code CLI (headless).

**Spec:** `docs/superpowers/specs/2026-11-03-autonomous-scenario-testing-design.md`

## Global Constraints

- No test-only routes in production code; test state goes through `docker exec … python /app/ops_e2e/_dbtool.py` (tool copied into the container at test time, never baked into the image).
- `stub` AI provider must refuse to activate when `PYMASTERS_ENV=production` or `K_SERVICE` is set.
- Tier 1 wall time ≤ 15 min on a GitHub-hosted runner; Tier 2 ≤ 2 h.
- One automatic retry per failed test (`--reruns 1`); a pass-on-retry is reported as flaky.
- Tests never use fixed sleeps longer than 1 s; wait on elements/responses.
- Every test creates its own users/orgs with a unique suffix (`uuid4().hex[:8]`).
- No paid services; GitHub-hosted runners + existing laptop only.
- Triage guardrails: ≤ 3 fix attempts per defect; never delete/skip tests; never touch secrets, billing, DNS.

## Review Focus

- Org-type labels: a school org must say Students/Class/Teacher and an enterprise Employees/Team/Manager everywhere a learner or admin sees them — pin in Task 5 (`test_org_labels_follow_type`).
- Trial expiry mid-session: a learner whose trial expires while on a lesson gets the upgrade page, not a blank screen — pin in Task 7 (`test_expired_trial_redirects_to_upgrade`).
- Enterprise tracks must never appear to an individual (catalogue, search, direct URL) — pin in Task 6 (`test_enterprise_tracks_hidden_from_individual`).
- Mobile (400 px) layouts of lesson player and org console must not overflow — pin in Task 3 (page health covers both viewports for every route).
- Stub AI must never be reachable in production — pin in Task 1 (`test_stub_refused_in_production`).

---

### Task 1: Deterministic `stub` AI provider

**Files:**
- Modify: `backend/vaathiyaar/engine.py` (provider registries near `_PROVIDER_COMPLETE`)
- Test: `backend/tests/test_stub_provider.py`

**Interfaces:**
- Produces: `_stub_complete(messages: list, options: dict) -> str`, `_stub_stream(messages: list, options: dict) -> Iterator[str]`, registered as `"stub"`; active only via `VAATHIYAAR_PROVIDERS=stub`.

- [ ] **Step 1: Write failing tests**
```python
def test_stub_complete_returns_tutor_json(monkeypatch):
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "stub"); monkeypatch.delenv("PYMASTERS_ENV", raising=False)
    import importlib, vaathiyaar.engine as e; importlib.reload(e)
    out = e.complete([{"role": "user", "content": "hello"}], {})
    assert "message" in json.loads(out)          # same shape parse_vaathiyaar_response expects
def test_stub_stream_yields_multiple_chunks(monkeypatch): ...   # len(list(e.stream(...))) >= 3
def test_stub_refused_in_production(monkeypatch):
    monkeypatch.setenv("VAATHIYAAR_PROVIDERS", "stub"); monkeypatch.setenv("PYMASTERS_ENV", "production")
    ... ; with pytest.raises(e.VaathiyaarUnavailable): e.complete([...], {})
def test_stub_feedback_marks_correct_code_passed(...): ...      # evaluate_code path returns passed=True when stdout == expected
```
- [ ] **Step 2:** `cd backend && pytest tests/test_stub_provider.py -v` → FAIL (no stub provider).
- [ ] **Step 3:** Implement. Reply JSON `{"message": "Stub tutor reply.", "animation": null}` (match keys read by `parse_vaathiyaar_response`); stream splits the message into ≥3 chunks; both raise `RuntimeError("stub provider disabled in production")` when `_is_production()` (reuse `auth._is_production` logic: `K_SERVICE` or `PYMASTERS_ENV=production`), which `complete()` converts to `VaathiyaarUnavailable`.
- [ ] **Step 4:** tests PASS; full backend suite still passes.
- [ ] **Step 5:** Commit `feat(ai): deterministic stub provider for CI (refused in production)`.

### Task 2: Scenario framework and local runner

**Files:**
- Create: `ops/e2e/scenarios/conftest.py`, `ops/e2e/scenarios/_dbtool.py`, `ops/e2e/scenarios/requirements.txt`, `ops/e2e/run_scenarios.sh`, `ops/e2e/scenarios/test_framework_smoke.py`, `pytest.ini` section in `ops/e2e/scenarios/pytest.ini`

**Interfaces:**
- Produces (fixtures in conftest): `base_url: str` (env `PM_E2E_BASE`, default `http://127.0.0.1:8080`), `container: str` (env `PM_E2E_CONTAINER`, default `pm-e2e`), `api` (requests session factory), `new_user(kind="individual", **kw) -> dict{id, username, password, token, email}`, `new_org(org_type: str) -> dict{org_id, admin: user}`, `logged_in_page(user) -> playwright Page` (sets `pm_user` in localStorage like `module_sweep.py`), `ops_token() -> str` (service-login with env `PM_E2E_OPS_TOKEN`), `db(cmd: str, *args) -> str` (runs `_dbtool.py` in the container).
- `_dbtool.py` subcommands (stdout = value): `reset-token <email>`, `verify-token <user_id>`, `backdate-signup <user_id> <days>`, `set-plan <user_id> <plan> [days]`, `set-org-plan <org_id> <plan>`, `grandfather-org <org_id>`.
- `run_scenarios.sh [tier1|nightly] [pytest args]`: builds image if `PM_E2E_IMAGE` unset, `docker run -d --name pm-e2e -p 8080:8080` with env `DB_PATH=/tmp/e2e.db PYMASTERS_ENV=ci VAATHIYAAR_PROVIDERS=stub PYMASTERS_JOBS=0 JWT_SECRET=<random48> OPS_ADMIN_TOKEN=<random> RAZORPAY_KEY_ID=rzp_test_ci RAZORPAY_KEY_SECRET=<random> SEMANTIC_AUTOSTART=1`, copies `_dbtool.py` to `/app/ops_e2e/`, waits for `/health`, runs pytest with `-n auto --reruns 1 --junitxml=…`, always `docker logs` to an artifact file, removes container.

- [ ] **Step 1:** Write `test_framework_smoke.py`: health is 200 with `"db":"ok"`; `new_user()` returns a token accepted by `GET /api/auth/me`; `db("backdate-signup", uid, "10")` then `GET /api/profile/{uid}/access` reports `expired`; `ops_token()` passes `/api/admin/check`.
- [ ] **Step 2:** `ops/e2e/run_scenarios.sh tier1 -k framework_smoke` → FAIL (fixtures missing).
- [ ] **Step 3:** Implement conftest, `_dbtool.py` (sqlite3 on `$DB_PATH`), runner script.
- [ ] **Step 4:** Smoke passes locally (`podman`/`docker` both supported via `PM_E2E_DOCKER` env).
- [ ] **Step 5:** Commit `test(e2e): scenario framework, db tool and local runner`.

### Task 3: Page health for every route + coverage map

**Files:**
- Create: `ops/e2e/scenarios/routes.py`, `ops/e2e/scenarios/test_page_health.py`, `ops/e2e/scenarios/test_coverage_map.py`

**Interfaces:**
- Produces: `ROUTES: list[tuple[name, path, role]]` (role ∈ public, learner, org_admin, super_admin) covering every `<Route path=…>` in `frontend/src/App.jsx` (parametrised paths filled with real ids created in fixtures).

- [ ] **Step 1:** `test_page_health[route-viewport]` parametrised over ROUTES × {desktop 1366×850 light, mobile 400×820 dark}: no `pageerror`, no console error, no `/api/` response ≥ 400 (except 401 on public pages), `scrollWidth <= clientWidth + 1`, `document.body.innerText.length > 40`.
- [ ] **Step 2:** `test_every_frontend_route_has_page_health`: regex-parse `App.jsx` `path="…"` values; every one (excluding redirects `Navigate`) appears in ROUTES. `test_every_backend_router_is_exercised`: every `APIRouter(prefix=…)` in `backend/routes/*.py` appears in at least one scenario file's text (string match on prefix).
- [ ] **Step 3:** Run → coverage tests fail until later tasks add module tests (expected; mark coverage tests `xfail(strict=False)` until Task 10, then remove the marker in Task 10 Step 4).
- [ ] **Step 4:** Page health passes or each failure is fixed in product code (fix commits separate).
- [ ] **Step 5:** Commit `test(e2e): page health for every route at desktop+mobile, coverage map`.

### Task 4: Journey — individual learner

**Files:** Create `ops/e2e/scenarios/test_journey_individual.py`

- [ ] **Step 1:** Test drives UI: `/login?mode=signup` → fills form → onboarding answers (college_student, beginner, ai_ml) → lands on recommended path → opens first lesson → waits for first animation element (`[data-anim-type]` or the CodeStepper heading) → sends a chat message, waits for stub reply text "Stub tutor reply." → practice: types the lesson's reference solution (from `ops/e2e/solutions/` if present else uses the lesson's `expected_output` echo program generated by the helper `solution_for(lesson_id, idx)` which falls back to `print(<expected_output>)`) → submits → sees success + XP toast → dashboard shows XP > 0 and streak ≥ 1 → warm-up shows ≥1 question and answering records progress → profile stats show 1 lesson completed.
- [ ] **Step 2–4:** run → fix product defects found → pass.
- [ ] **Step 5:** Commit `test(e2e): individual learner journey`.

### Task 5: Journey — school/college teacher and student

**Files:** Create `ops/e2e/scenarios/test_journey_school.py`

- [ ] **Step 1:** Parametrise org_type over `school`, `university`. Teacher signs up as organization (UI, step 0 org name/type, step 1 admin) → `db("grandfather-org", org_id)` (simulates approved plan) → invites a student (UI invites tab) → invite link read from the API response/UI → student opens `/join/:token`, registers, joins → student completes one lesson (API `POST /classroom/evaluate` with solution) → teacher's analytics/students tab lists the student with ≥1 completion. `test_org_labels_follow_type`: org console shows "Students"/"Class"/"Teacher" for school and "Students"/"Course"/"Faculty" for university.
- [ ] **Step 2–4:** run → fix → pass.
- [ ] **Step 5:** Commit `test(e2e): school and university teacher/student journey`.

### Task 6: Journey — training centre and enterprise

**Files:** Create `ops/e2e/scenarios/test_journey_enterprise.py`

- [ ] **Step 1:** `test_enterprise_member_sees_enterprise_tracks`: org type `enterprise`, `db("set-org-plan", org_id, "enterprise")`, member joins → classroom catalogue includes `aws_enterprise` lessons. `test_enterprise_tracks_hidden_from_individual`: an individual sees none in catalogue, `/api/semantic/search?q=azure`, or `GET /api/classroom/lesson/<an aws_enterprise id>` (expect 403). `test_training_centre_curriculum_publish`: org type `training_center` admin creates a lesson set from 1 topic via curriculum tab (stub AI generates), publishes to a batch/group, the group member sees it; labels Trainees/Batch/Trainer. `test_org_requests_flow`: org admin files a plan request → ops approves via `/api/admin/org-requests` → org plan set.
- [ ] **Step 2–4:** run → fix → pass.
- [ ] **Step 5:** Commit `test(e2e): enterprise and training-centre journeys`.

### Task 7: Journey — access and billing edges

**Files:** Create `ops/e2e/scenarios/test_journey_access_edges.py`

- [ ] **Step 1:** `test_expired_trial_redirects_to_upgrade` (backdate 10 days → open a lesson → URL ends `/dashboard/upgrade`); `test_payment_activates_plan` (create-order via API → compute `hmac_sha256(order_id|payment_id, RAZORPAY_KEY_SECRET)` → `/payments/verify` → access `active`, plan `pro`); `test_student_access_request_approved` (support form with a small PNG → ops approves → user plan `student`); `test_blocked_user_refused` (ops blocks → next API call 403 and UI returns to login); `test_password_reset_flow` (forgot → `db("reset-token", email)` → `/reset-password/<t>` → login with new password works, old fails); `test_oauth_buttons_render` (GitHub/LinkedIn buttons visible when config endpoints report enabled, hidden when disabled).
- [ ] **Step 2–4:** run → fix → pass.
- [ ] **Step 5:** Commit `test(e2e): access, billing and account edge journeys`.

### Task 8: Module tests — learning surfaces

**Files:** Create `test_mod_classroom.py`, `test_mod_playground.py`, `test_mod_paths.py`, `test_mod_knowledge_reference_explains.py`, `test_mod_search_notifications.py` in `ops/e2e/scenarios/`

- [ ] **Step 1:** Classroom: Learn Anything request completes (stub) and appears in "my generated"; boss battle unlocks after 3 completions in a track and records an answer; podcast player loads manifest. Playground: run `print(2+3)` → output `5`; trace shows ≥1 step; create/rename/delete a file; chat stream returns stub text. Paths: start, progress endpoint reflects completion, switch path. Knowledge map renders concepts and a gap view; Reference opens 2 topics; Explains opens a static essay and generates one (stub). Search: query "list" returns results and opening one navigates to a lesson; notifications list, mark one read, mark all read; Vaathiyaar message dismiss.
- [ ] **Step 2–4:** run → fix → pass.
- [ ] **Step 5:** Commit `test(e2e): classroom, playground, paths, knowledge, reference, explains, search, notifications`.

### Task 9: Module tests — play, arcade, social, tutor, profile

**Files:** Create `test_mod_play.py`, `test_mod_arcade.py`, `test_mod_challenges_community.py`, `test_mod_live_tutor.py`, `test_mod_profile.py`

- [ ] **Step 1:** Play: for each game id in `GET /api/play/catalog`, the round page loads in the UI and a full round is completed through the round API (start → answer every question → finish) with `finish.status == 200` and stats incremented. Arcade: same for every id in `/api/arcade/catalog` (unlock prerequisites satisfied via completions first). Challenges: weekly loads, a correct submission scores, leaderboard lists the user. Community: follow/unfollow another fresh user. Live tutor: book → appears in "mine" → cancel. Profile: settings save persists after reload; change password; export returns JSON with the user's id; reset progress zeroes XP.
- [ ] **Step 2–4:** run → fix → pass.
- [ ] **Step 5:** Commit `test(e2e): play, arcade, challenges, community, live tutor, profile`.

### Task 10: Module tests — org, admin, payments pages, public pages

**Files:** Create `test_mod_org_console.py`, `test_mod_org_compete.py`, `test_mod_super_admin.py`, `test_mod_public_pages.py`; Modify `test_coverage_map.py` (remove xfail)

- [ ] **Step 1:** Org console: each of the 8 tabs renders for admin; manager sees progress tabs but not invites/curriculum/branding; member is refused admin tabs; branding save (portal name, colour) shows in the learner shell. Org compete: create a challenge set targeting a group, leaderboard renders. Super admin (ops session): all 9 tabs render; user search finds a fresh user; plan change applies; audit lists the action. Public: login, signup, forgot, reset (bad token message), verify (bad token message), join (bad token message), pricing shows ₹299/₹999, terms/privacy/security render, unknown path shows 404.
- [ ] **Step 2:** Remove xfail from coverage tests; run full Tier 1 → coverage green.
- [ ] **Step 3–4:** fix → pass.
- [ ] **Step 5:** Commit `test(e2e): org console, org compete, super admin, public pages; coverage map enforced`.

### Task 11: CI — scenario stage gates the image push

**Files:** Modify `.github/workflows/deploy.yml` (build job: between "Build Docker image" and "Push Docker image")

- [ ] **Step 1:** Add steps: set up Python 3.11; `pip install -r ops/e2e/scenarios/requirements.txt && playwright install --with-deps chromium`; `PM_E2E_IMAGE=<sha tag> ops/e2e/run_scenarios.sh tier1`; `actions/upload-artifact` (if: failure()) for `ops/e2e/out/**` (traces, screenshots, container log, junit). Push step unchanged and only runs if previous steps succeed.
- [ ] **Step 2:** Verify: push a branch commit that deliberately breaks a page (temporary), observe red stage and no push — then revert. (Use a throwaway branch with `workflow_dispatch`-equivalent: run the job via `act`-free approach — temporarily add `pull_request` trigger on a test branch; remove after verification.)
- [ ] **Step 3:** Merge; observe green deploy with stage time ≤ 15 min.
- [ ] **Step 4:** Commit `ci: block image push on Tier-1 scenario failures`.

### Task 12: Verified reference solutions for every practice challenge

**Files:** Create `ops/e2e/solutions/generate.py`, `ops/e2e/solutions/verify.py`, `ops/e2e/solutions/<lesson_id>.json` (one per lesson: `{"challenges": [{"index": i, "code": "...", "verified_output": "..."}]}`)

- [ ] **Step 1:** `verify.py` test: for a known lesson, the stored solution's stdout (run via `backend/vaathiyaar/execution.run_code_subprocess` locally) equals `expected_output` (normalised whitespace) and passes `test_code` when present.
- [ ] **Step 2:** `generate.py`: for each lesson/challenge without a stored solution, ask Claude CLI (headless, `--output-format json`, JSON schema `{"code": str}`) for a solution given instruction + expected output + test_code; run it; keep only if verify passes (≤ 3 attempts); report unsolved challenges as content defects (`ops/e2e/out/unsolved.json`).
- [ ] **Step 3:** Run for all lessons on the laptop; commit solutions; unsolved list feeds Task 16.
- [ ] **Step 4:** Commit `test(e2e): verified reference solutions for lesson practice challenges`.

### Task 13: Nightly Tier 2 suite and workflow

**Files:** Create `ops/e2e/scenarios/nightly/test_every_lesson.py`, `test_every_path.py`, `test_every_boss_battle.py`, `test_every_org_type.py`, `ops/e2e/scenarios/report.py`; Create `.github/workflows/nightly-e2e.yml`

- [ ] **Step 1:** `test_every_lesson[lesson_id]` (parametrised from the container's `/api/classroom/lessons` as an enterprise-entitled user): loads in each language in `title` keys; every animation step renders with no console error (click "next" through the sequence); each challenge's stored solution passes `/classroom/evaluate` and XP increases; quiz items answered via `/review/warmup/answer`. Paths/boss battles/org types analogous.
- [ ] **Step 2:** `report.py` turns junit XML into `nightly-report.json` `{date, image, totals:{passed,failed,flaky}, failures:[{test, message}]}`.
- [ ] **Step 3:** Workflow: cron `30 20 * * *`, pulls `:latest` image (WIF auth as deploy job; condition already requires main — use `workflow` run on default branch), runs `run_scenarios.sh nightly`, uploads report artifact.
- [ ] **Step 4:** Trigger once via `workflow_dispatch`; report produced.
- [ ] **Step 5:** Commit `test(e2e): nightly every-lesson/path/boss/org-type suite`.

### Task 14: Production smoke and test health in the daily email

**Files:** Create `ops/e2e/prod_smoke.py`; Modify `ops/laptop/collect_status.sh`, `ops/laptop/daily_report.sh` (prompt adds a "Test health" row), Create `ops/laptop/pymasters-prod-smoke.{service,timer}` (07:30 IST)

- [ ] **Step 1:** `prod_smoke.py --json`: read-only as ops account against `https://pymasters.net`: health/build == origin/main, 8 key pages render (Playwright, no console errors), catalogue ≥ 400 lessons, one lesson loads, search returns results, one real AI reply via `/api/playground/chat/stream` (non-empty text in ≤ 60 s). Writes `~/pymasters-ops/reports/prod-smoke-<date>.json`.
- [ ] **Step 2:** `collect_status.sh` "Test health" section: latest deploy run conclusion (`gh run list -w deploy.yml -L 1`), latest nightly report (`gh run download` artifact), today's prod-smoke JSON; daily_report prompt renders it (🟢/🟡/🔴 rules: red if Tier 1 failing on main or prod smoke failed; yellow if nightly failures or flaky > 0).
- [ ] **Step 3:** Install timer locally; run once; email section appears in a dry run (`collect_status.sh` output contains "## Test health").
- [ ] **Step 4:** Commit `ops: daily production smoke and test health in the status email`.

### Task 15: Autonomous triage

**Files:** Create `ops/laptop/e2e_triage.sh`, `ops/laptop/pymasters-e2e-triage.{service,timer}` (08:00 IST)

- [ ] **Step 1:** Script collects red items (failed deploy run on main, nightly failures, prod smoke failures) into `~/pymasters-ops/reports/triage-<date>.md`; if none, exits. Otherwise runs `claude -p "<triage prompt + report>" --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Write"` in the repo with the guardrails from Global Constraints spelled out in the prompt (branch per defect, run `run_scenarios.sh tier1` + backend/frontend suites, open PR, merge only when all green, ≤3 attempts, write unresolved items to `~/pymasters-ops/reminders.txt` as owner actions). Log to `triage-<date>.log`; email's "What changed" lists merged triage PRs (collect_status already lists last-24h commits).
- [ ] **Step 2:** Dry run with a synthetic red item (`--dry-run` flag prints the prompt and exits) → prompt contains report and guardrails.
- [ ] **Step 3:** Install timer.
- [ ] **Step 4:** Commit `ops: 08:00 autonomous e2e triage with guardrails`.

### Task 16: Run the overhaul and fix findings

**Files:** whatever the findings require (product code, content JSON, tests corrected with reasons).

- [ ] **Step 1:** Run Tier 1 and the nightly suite locally and in CI; collect every failure plus Task 12's unsolved list and the blueprint's known inconsistencies (dead `runCode`/`chatAI` helpers, unrouted `TopicSearch`/`LearningMap`/`ModuleViewer`, `Trending.jsx` hardcoded fetch, `/dashboard/evolution/:pathId` dropping the id, stray `frontend/_scan*.mjs`).
- [ ] **Step 2:** For each defect: failing test exists (or add one) → fix → test green → commit per defect (`fix(<area>): …`).
- [ ] **Step 3:** All tiers green on main; nightly report zero failures (or remaining content defects listed for sub-project E with lesson ids).
- [ ] **Step 4:** Update `portal-blueprint` memory with resolved inconsistencies; commit.
