# PyMasters — Corruption Recovery & Apply Guide

## What happened
During this session, a **filesystem-level corruption** was detected in the local repo at
`C:\Users\muthu\PycharmProjects\PyMasters`. Several files had been **truncated mid-content** and
parts of `.git` were **overwritten with NUL bytes**:

- Truncated source: `backend/main.py`, `backend/routes/classroom.py`, and (briefly) several
  frontend files (`api.js`, `App.jsx`, `Layout.jsx`, `Login.jsx`, `Classroom.jsx`, `OrgDashboard.jsx`,
  `ChatBar.jsx`, `VaathiyaarMessage.jsx`).
- Corrupted git metadata: `.git/config` (line 23+ nulled), `.git/index`, `.git/HEAD`,
  `.git/logs/HEAD`, and the local `track1-stability-precision` branch ref was lost.

This pattern (NUL-filled regions, truncated tails) typically comes from an **interrupted write,
crash, or a failing disk**. **Please run a disk health check** (Windows: `chkdsk`, or the drive
vendor's tool). Your committed work is **safe on GitHub** — `origin/main` already contains the
PR #121 merge.

## What I repaired in place
- Rebuilt `.git/config` from its valid prefix (backup at `.git/config.corrupt.bak`).
- Restored `backend/main.py` and `backend/routes/classroom.py` from the committed blobs, then
  re-applied this session's edits.
- Restored all truncated frontend files from the committed blobs + re-applied edits.
- Verified the whole app in a clean tree: **frontend `vite build` passes**, **backend live HTTP
  test 27/27 passes**.

`.git/index`, `.git/HEAD`, and `.git/index.lock` are **host-owned and could not be removed from my
sandbox** — you'll clear those in step 1.

## Recommended recovery (cleanest)
From a terminal in the repo root, on a machine you trust:

```powershell
# 1. Clear the stale lock + corrupt index/HEAD
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue
Remove-Item -Force .git\index       -ErrorAction SilentlyContinue

# 2. Point HEAD at main and rebuild index from the committed tree (working files untouched)
"ref: refs/heads/main" | Set-Content .git\HEAD -NoNewline
git fetch origin
git reset --mixed origin/main      # rebuilds index; keeps your working-tree changes

# 3. Sanity check
git status
git fsck
```

If `git fsck` still reports object damage, do a clean re-clone and re-apply this session's work
from the bundle (next section):

```powershell
cd ..
git clone https://github.com/MuthuGsubramanian/PyMasters.git PyMasters-clean
```

## Applying this session's new work
This session's changes are bundled in **`pymasters_session_bundle.tar.gz`** (20 files, paths
preserved). To apply over a clean checkout of `main`:

```bash
tar -xzf pymasters_session_bundle.tar.gz -C /path/to/PyMasters
cd /path/to/PyMasters/frontend && npm install && npm run build   # verify
cd ../backend && python -m pytest -q   # or run tests/live_smoke_community.py
git add -A && git commit -m "feat: community ranking, org competitions, LinkedIn login, topic search" && git push
```

### Files in the bundle
**New:** `backend/routes/social.py`, `org_challenges.py`, `oauth.py`, `discovery.py`;
`backend/tests/live_smoke_community.py`; `frontend/src/pages/Community.jsx`, `OrgCompete.jsx`,
`TopicSearch.jsx`; `scripts/deploy.sh`.
**Modified:** `backend/main.py`; `backend/routes/classroom.py`; `frontend/src/api.js`, `App.jsx`,
`components/Layout.jsx`, `pages/Login.jsx`, `pages/Home.jsx`, `pages/OrgDashboard.jsx`,
`components/ChatBar.jsx`, `components/VaathiyaarMessage.jsx`.

## Enabling LinkedIn sign-in (when ready)
Register a LinkedIn app (product: *Sign In with LinkedIn using OpenID Connect*), then set on the
Cloud Run service (via Secret Manager / env):
```
LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
LINKEDIN_REDIRECT_URI=https://pymasters.net/api/auth/linkedin/callback,
FRONTEND_URL=https://pymasters.net
```
The button stays hidden until these are set — no code change needed.

## Deploying
`scripts/deploy.sh` builds + deploys to Cloud Run and verifies the revision:
```bash
./scripts/deploy.sh            # build, deploy, health-check
./scripts/deploy.sh --no-traffic   # canary (promote with update-traffic --to-latest)
```
