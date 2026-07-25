# Security & Production-Readiness Remediation Log

Worked phase-by-phase. Each entry records what changed, the test evidence (red → green),
and anything deliberately not done.

Baseline before any change: `python -m pytest -q` → **275 passed, 1 skipped**
(CI-parity command: from `backend/`, `JWT_SECRET=... .venv/Scripts/python -m pytest -q`).

---

## ⚠️ Environment finding (discovered during Phase 1) — auto-push paused

A Windows scheduled task **`PyMasters-ReleaseNow`** was running every **3 minutes**
(`push_fixes.ps1`), committing any `frontend/`+`backend/` working-tree change and pushing
to `origin/main`, which triggers the GitHub Actions deploy to **production Cloud Run**.

Two problems for this remediation:
1. **It defeats "commit per phase with the finding number."** My Phase 1 edits were
   auto-committed mid-work across four generic commits (`0238e96`, `c9c75f3`, `0c4dc8a`,
   `3ef7d3c`, 23:06–23:18) under identity `muthu.g.subramanian@gmail.com`.
2. **Its only gate is `npm run build` (frontend). It does NOT run backend pytest.** So
   each 3-minute snapshot of an in-progress multi-file backend edit was pushed and
   deployed even when the backend was in an inconsistent intermediate state. The *final*
   `main` HEAD is consistent (all 285 tests pass), but partial states did briefly deploy.
   For the phases ahead (Dockerfile, requirements pin, seed removal, IAM) this is a real
   production-breakage risk.

**Action:** `Disable-ScheduledTask PyMasters-ReleaseNow` (reversible). All remaining phases
are committed under my control on branch `security/remediation-phases`.
**MUST re-enable at the end:** `Enable-ScheduledTask -TaskName 'PyMasters-ReleaseNow'`
(and consider adding a backend-pytest gate to `push_fixes.ps1` before it runs again).

---

## Phase 0 — Do not lock the owner out

**Goal.** Confirm the production DB has `is_super_admin = 1` on the real owner accounts
(the addresses in `SUPER_ADMIN_EMAILS`) *before* Phase 1 removes the string-matching
fallback that currently grants admin.

**What I could verify.**
- The local dev DB (`backend/pymasters.db`, 52 test users — **not** production) has the
  `is_super_admin` column present. No row carries any of the owner emails
  (`muthu@pymasters.net`, `muthu.g.subramanian@gmail.com`, `claude-qa@pymasters.net`);
  the only super-admin row is a test account `su_3526` with an empty email.
- A `username='admin'` row exists locally (`is_super_admin=0`, created 2026-04-07),
  confirming the Phase 2 default-seed defect is real.

**What I could NOT verify (blocker).**
- **Production DB is unreachable from this session.** `gcloud` auth tokens are stale and
  cannot be refreshed non-interactively (`Reauthentication failed. cannot prompt during
  non-interactive execution`), and `litestream` is not installed locally, so I cannot
  restore the GCS replica (`gs://pymasters-app-db/pymasters.db`) to read the owner rows.
  The admin HTTP endpoints require a super-admin JWT I do not (and should not) hold.

**Mitigation that makes Phase 1 safe anyway.**
The Phase 1 fix includes an **idempotent startup resolver** in `init_db()` (runs on every
boot, in the daemon thread, before any admin request is served):
`UPDATE users SET is_super_admin=1 WHERE lower(email) IN (SUPER_ADMIN_EMAILS)`.
Because `init_db()` runs at container start on every production deploy, the owner accounts
get the column set from `SUPER_ADMIN_EMAILS` *before* the break-glass fallback removal can
take effect. The owner therefore cannot be locked out even without manual prod surgery.
This is verified by a regression test (see Phase 1: `test_startup_resolver_sets_owner_column`).

**Action needed from a human with live creds (belt-and-suspenders):** after `gcloud auth
login`, run the read-back in `Phase 0 verification` below against the restored replica to
confirm the owner rows carry `is_super_admin=1`. Left open intentionally.

---

## Phase 1 — [CRITICAL] Super-admin privilege escalation

**Defect.** `require_super_admin` granted admin whenever the caller's *user-controlled*
username OR email string matched `SUPER_ADMINS` (`is_break_glass`). Two exploits:
(1) register username `muthu@pymasters.net` → `/api/admin/users` = 200;
(2) register normally, then PUT `{"email":"muthu@pymasters.net"}` into your own profile
settings → 403 flips to 200 (email never verified, written straight through).

**Changes.**
- `routes/admin.py` — `require_super_admin` now authorizes on the `users.is_super_admin`
  column ONLY; the `is_break_glass` string comparison is deleted. Replaced it with
  `is_reserved_identifier(*idents)` used solely to *reject/protect* (never grant):
  admin `edit_user` refuses a reserved email; `delete_user` / `set_super_admin` still
  protect env-managed owner rows (now keyed on the reserved email set, not a live grant).
  `user_detail.break_glass` display flag now reflects the column.
- `main.py` — `register` constrains new usernames to `^[A-Za-z0-9._-]{1,64}$` (excludes
  `@`, enforced on create only), rejects reserved identifiers on BOTH username and email,
  and no longer grants super-admin from any string match (`onboarding_flag = 0`).
  `init_db()` gained the **startup resolver**: `UPDATE users SET is_super_admin=1 WHERE
  lower(email) IN (SUPER_ADMIN_EMAILS)` — email match only, runs every boot.
- `routes/profile.py` — settings update refuses to write a reserved email.

**Test evidence.** `backend/tests/test_super_admin_authz.py` (10 tests).
- RED: both exploit tests + resolver + owner-edit-reserved failed before the change
  (`6 failed, 2 passed`; the break-glass test only failed correctly once the fixture was
  fixed to reload `routes.admin`, which freezes `DB_PATH` at import).
- GREEN: `10 passed`. Full suite `285 passed, 1 skipped` (was 275 baseline).
- Acceptance met: exploit 1 → 422 (username charset) / exploit 2 → 400 (reserved email,
  not written, column stays 0); owner with `is_super_admin=1` → 200; a row carrying the
  owner email but `is_super_admin=0` → 403 (string match no longer grants).

**Not done / notes.** Could not read the *production* rows (Phase 0 blocker). The startup
resolver is the compensating control. The frontend still lets a user type an email as a
username; the server now returns a clean 422, but a nicer inline client-side message is a
Phase 8 candidate, not done here.

---

## Phase 2 — [CRITICAL] Default admin account

**Defect.** `init_db()` seeded username `admin` with hardcoded password `admin123` on
any empty users table. `start.sh` reaches an empty DB when there is no GCS replica and no
baked-in seed, so this well-known credential could exist in production; nothing
rate-limits login (Phase 5 addresses that).

**Production check (required by the plan).** Could NOT query production directly (same
stale-gcloud blocker as Phase 0). The **local dev DB** contains a matching row:
`username='admin'`, `is_super_admin=0`, `created_at=2026-04-07 15:23:52`, empty email.
This is a dev DB, not proof of the prod row — but it makes the risk concrete.

**Change (`main.py`).** Removed the hardcoded `admin123` seed. On an empty DB it now seeds
`admin` with `secrets.token_urlsafe(18)` (or `BOOTSTRAP_ADMIN_PASSWORD` if pinned by ops),
prints the password ONCE to stdout, and marks it `is_super_admin=1` — that is the only
bootstrap path to admin on a brand-new DB now that reserved-email registration is blocked
(Phase 1). I deliberately did NOT change or delete any existing `admin` row.

**Test evidence.** `backend/tests/test_admin_seed.py` (3 tests).
- RED: `3 failed` — `admin`/`admin123` logged in successfully before the change.
- GREEN: `3 passed`; full suite `288 passed, 1 skipped`.
- Proves: `admin123` login now 401; the printed random password logs in; env-pinned
  password works and `admin123` still fails.

**Not done / follow-up for a human with prod access.** If a real `admin` row exists in
production with password `admin123`, removing the seed does NOT fix that existing row.
Rotate its password (or delete it if unused) after confirming via the restored replica —
report `created_at`/`is_super_admin`/last-login first, per the plan. Left open.

## Phase 3 — [CRITICAL] Verify Litestream backups before any IAM change

**This is a gate, not a code change.** No file was modified. Findings from the terraform +
config (live GCP inspection blocked by the stale-gcloud/non-interactive auth from Phase 0):

**IAM discrepancy — confirmed in code.**
- `infra/terraform/iam.tf` grants the runtime SA **project-wide `roles/storage.objectViewer`**
  (read-only). Read-only cannot support Litestream replication (which must WRITE objects).
- `litestream.yml` asserts the runtime SA holds `roles/storage.objectAdmin` on
  `pymasters-app-db`.
- `infra/terraform/storage.tf` DOES grant `objectAdmin` — but on bucket
  **`pymasters-app-pymasters-data`**, a *different* bucket from the Litestream target
  **`pymasters-app-db`**. The backup bucket `pymasters-app-db` is **not defined in
  terraform at all** — its IAM was set out-of-band and is unverifiable from the repo.

**What this means.** Either (a) `objectAdmin` on `pymasters-app-db` was granted manually to
the runtime SA (so replication works and `litestream.yml` is right), or (b) only the
project-wide read-only binding applies and **Litestream replication has been failing —
i.e. there are no usable backups.** I cannot disambiguate without live access
(`gcloud storage ls gs://pymasters-app-db/`, `litestream generations`, newest snapshot vs
the 6h `snapshot-interval`).

**Terraform is not the full source of truth.** `cloud-run.tf` mounts only `ollama-api-key`;
the running service also reads `JWT_SECRET` and the GitHub/LinkedIn OAuth secrets, set
out-of-band via `deploy.yml`/gcloud. So the real secret set is larger than terraform shows.

**Decision (follows the plan's explicit rule).** **Do NOT narrow any IAM binding.** Both the
storage narrowing (could break unverified-but-possibly-working replication → data loss) and
the secret narrowing (would revoke the runtime SA's access to `JWT_SECRET`/OAuth secrets
terraform doesn't list → app crash) are unsafe blind. This BLOCKS the IAM sub-tasks of
Phase 4; the sandbox-egress sub-task proceeds independently.

**Required live verification (human with `gcloud auth login`), before any IAM narrowing:**
1. `gcloud storage ls gs://pymasters-app-db/` — does the bucket exist and hold generations?
2. Check newest snapshot timestamp vs `snapshot-interval: 6h` — is replication current?
3. `gcloud projects get-iam-policy pymasters-app` + bucket policy — what does the runtime SA
   actually hold on `pymasters-app-db`?
4. Enumerate every secret the running service mounts (deploy.yml + `gcloud run services
   describe pymasters`) before scoping `secretAccessor`.
If replication is broken, FIX it and confirm a fresh snapshot lands first.

## Phase 4 — [CRITICAL] Sandbox egress and IAM blast radius

**Defect.** `vaathiyaar/execution.py` deliberately did not block network access, and
`/api/playground/execute` allows arbitrary imports. Composed with the runtime SA's
project-wide `secretAccessor` + `objectViewer`, any authenticated user could hit the
metadata server, take the SA token, and read every secret + the user-DB bucket.

### Done — sandbox egress blocked (OS-level)
`execution.py` now runs the child through `_net_isolation_prefix()`: an unprivileged
network namespace (`unshare --net`) giving the child only a down loopback and no route
out, so it cannot reach `169.254.169.254` or any host. This is a namespace, not a Python
module blocklist (the plan's explicit "don't rely on module blocklisting"). Probed once
and cached; falls back to `()` (no isolation) where the platform forbids the namespace,
so execution never breaks.

**Test evidence.** `backend/tests/test_sandbox_egress.py` (4 tests).
- RED: `ImportError` (`_net_isolation_prefix`/`_build_child_command` missing).
- GREEN: `3 passed, 1 skipped`; full suite `291 passed, 2 skipped`.
- `test_isolation_prefix_is_wired_into_the_child_command` deterministically proves the
  interpreter runs THROUGH the prefix (red→green watchable on Windows).
- `test_metadata_endpoint_is_unreachable_from_sandbox` actually attempts a socket connect
  to the metadata server and asserts it fails — **runs on platforms where the namespace can
  be created** (Linux CI); skipped on Windows dev (no `unshare`). The `/install-package`
  flow does NOT use the sandbox's egress, so this block doesn't silently break it (Phase 6).

**Live verification still required (Cloud Run / gVisor).** Whether `unshare --net` is
permitted under Cloud Run's gVisor sandbox must be confirmed in the running container
(e.g. a playground exec doing `socket.connect(('169.254.169.254',80))` — expect failure).
If gVisor forbids the namespace, `_net_isolation_prefix()` returns `()` and egress is NOT
blocked in prod — then the least-privilege IAM below becomes the essential control.

### NOT done — IAM narrowing (BLOCKED by Phase 3)
Per the plan's ordering, no IAM binding is narrowed until Litestream backups are verified,
which I could not do (Phase 3). Recommended bindings to apply AFTER verification:
- `runtime_secret_accessor`: replace project-wide `roles/secretmanager.secretAccessor`
  with per-secret `google_secret_manager_secret_iam_member` on EACH secret the running
  service actually reads (ollama-api-key + JWT_SECRET + GitHub/LinkedIn OAuth secrets —
  enumerate from `deploy.yml` + `gcloud run services describe` first; terraform lists only
  ollama-api-key, so a blind scope would break the app).
- `runtime_storage_viewer`: drop the project-wide `roles/storage.objectViewer`; grant only
  the write level Litestream needs on the `pymasters-app-db` bucket (which is not yet in
  terraform — import it first). Do NOT touch until replication is confirmed healthy.
- `cloudbuild_run_admin`: replace project-wide `roles/run.admin` with `roles/run.developer`
  on the specific `pymasters` service + keep `iam.serviceAccountUser` on the runtime SA.
  Verify a full deploy still succeeds before removing the broad role.

## Phase 5 — [HIGH] Authentication hardening

**CORS.** Removed `"*"` from `main.py` origins. With `allow_credentials=True`, the wildcard
made Starlette echo any caller's Origin, defeating same-origin protection for credentialed
requests. `allow_methods/headers=["*"]` are kept (harmless without a wildcard origin).

**Rate limiting.** Added IP-keyed `SlidingWindowRateLimiter`s to the three unauthenticated
auth endpoints (previously unlimited): login (15/60s), register (8/300s), forgot-password
(5/900s), keyed on first-hop `X-Forwarded-For`/client IP. Added a per-username failed-login
lockout (5 failures/300s): once tripped, even the correct password is refused until the
window elapses. Added `SlidingWindowRateLimiter.reset()` so a successful login clears the
username's failure counter.

**Test evidence.** `backend/tests/test_auth_hardening.py` (6 tests).
- RED: `4 failed, 2 passed` (unlisted origin was echoed; endpoints unthrottled).
- GREEN: `6 passed`; full suite `297 passed, 2 skipped`.
- Proves: unlisted origin not echoed and not `*`; listed origin still echoed; login/register/
  forgot all return 429 past their limits; N failures lock the username (correct password →
  429); a success resets the counter.

**Caveat (per the plan).** This limiter is **IN-PROCESS**. It is only effective while the
service runs as a single instance (`min=max=1` in `cloud-run.tf`). The moment it scales
horizontally the counters fragment per-instance and it becomes trivially bypassable — move
to a shared store (Redis/Memorystore) before scaling out. Same caveat the limiter's own
docstring already carried; now it also guards the auth surface.

## Phase 6 — [HIGH] /install-package mutated the live interpreter

**Defect.** `routes/playground.py::install_package` ran `pip install <pkg>` into the serving
container: torch/tensorflow exceed the 1Gi memory + 60s timeout, a resolver-driven downgrade
of pydantic/fastapi could break the app on the next import, and installs vanished on revision
restart so behaviour varied by instance age. (It also would have silently broken once Phase 4
blocked sandbox egress — though install ran in the serving process, not the sandbox.)

**Decision — pre-baked allowlist + no-op reporter (not a per-execution venv).** A throwaway
per-execution venv was rejected: it needs network egress (which Phase 4 removes from the
sandbox), adds pip-download latency to every run, and still can't fit heavy wheels in the
limits. Baking the allowlist into the image keeps behaviour deterministic across instances
and needs no egress. The heavy wheels (torch/tensorflow) are intentionally NOT baked (they'd
blow image size); the endpoint reports them as "not bundled" rather than attempting a doomed
install.

**Change.** `install_package` no longer imports `subprocess` or shells out. It validates the
package against the allowlist, then uses `importlib.util.find_spec` (with a dist→import name
map, e.g. scikit-learn→sklearn) to report whether it's already importable. Available →
`{success, already_available}`; allowlisted-but-unbundled → `{success:false, installed:false}`
with a message that runtime install is disabled and it must be added to requirements.txt.

**Test evidence.** `backend/tests/test_install_package_noop.py` (4 tests) with an autouse
fixture that makes ANY `subprocess.run`/`Popen` call raise.
- RED: `2 failed` — the old code shelled out to pip (the guard caught the tensorflow call).
- GREEN: `4 passed`; full suite `301 passed, 2 skipped`.
- Proves: an available package is reported without pip; an unlisted one is rejected; an
  allowlisted-but-unbundled one does NOT install; empty name rejected.
