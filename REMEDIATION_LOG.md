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
