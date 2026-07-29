# DECISIONS.md — Overnight session 2026-07-29 (feat/overnight-uplift-20260729)

Append-only log of judgement calls made autonomously.

## D-001 — Session config resolved from repo + memory (2026-07-29 ~18:55 IST)
The launch config table was unfilled. Resolved as:
- **Repo**: `C:\Users\muthu.MSG\PycharmProjects\PyMasters`
- **Base branch**: `main` (clean at 280eef1)
- **Local dev**: backend `uvicorn main:app --port 8001` (DB_PATH=pymasters.db, JWT_SECRET=local-dev-secret-not-for-prod), frontend `npm run dev` → http://localhost:5173 (per start_dev.bat)
- **Staging**: none exists → all interactive verification on local dev; prod (https://pymasters.net) read-only reference only
- **Test accounts**: none with known passwords → create fresh local accounts via the app's own signup per role
- **Seed/reset**: local SQLite `backend/pymasters.db` created on first boot; lessons load from `backend/lessons/*.json`
- **Session length**: unspecified → work phases in order, continuous commits, final ~15% reserved for regression + reporting
Reversal: n/a (config only).

## D-002 — Disabled `\PyMasters-ReleaseNow` scheduled task for the session (2026-07-29 18:56 IST)
- **Why**: the task auto-commits and pushes ANY working-tree change under frontend/ or backend/ to **main** every ~3 min. That is incompatible with the hard stops "never push to main" and "work only on the session branch". Leaving it on would have shipped partial mid-edit states to production CI.
- **Options**: (a) leave on and only edit outside frontend/backend — impossible, the work is in those trees; (b) work in a separate worktree — script keys off the repo, risk unclear; (c) disable for the session — precedent from 2026-07-26 session, verified reversible.
- **Chose**: (c). `schtasks /change /tn "\PyMasters-ReleaseNow" /disable` — verified Status: Disabled. `\PyMasters\AutoPushFixes` was already Disabled.
- **Reversal**: at handoff, after checking out clean `main`: `schtasks /change /tn "\PyMasters-ReleaseNow" /enable`. NOTE FOR HANDOFF: re-enable only when the working tree is clean and on main, else the next tick ships whatever is lying around.
