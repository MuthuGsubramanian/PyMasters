# PyMasters — Product Owner Feature Analysis & Build Report
**Date:** 26 June 2026 · **Context:** Production hardening toward the **Aug 9** launch

This document plays two roles: (1) a **product-owner** assessment of current vs. good-to-have
capabilities, and (2) a **senior-developer** record of what was implemented this cycle and how it
was verified. Everything below was built against the committed `main` (the PR #121 merge) and
**verified by live analysis** — a real server over HTTP and a real production frontend build, not
mocks.

---

## 1. Current state (before this cycle)

| Area | What existed | Gap |
|---|---|---|
| **Ranking** | `/challenges/leaderboard` (ranked challenge completions only) | No global XP ranking, no streak ranking, no "your rank" |
| **Org/School** | Org membership, roles, groups, invites, analytics, progress | No competitive challenges, no per-org or per-group leaderboard |
| **Social** | Vaathiyaar system messages only | No member directory, no follow/connect graph, no public cards |
| **Auth** | Username/password (bcrypt, SEC-1), reset flow | No social login (LinkedIn/Google), no token-only session hydration |
| **Discovery** | Static catalogue + module-generation pipeline | No topic search; generation not reachable from a "I can't find X" moment |

## 2. Good-to-have → shipped this cycle

### A. Individual ranking & community (flagship differentiator)
- **Global leaderboard** by **XP** and by **streak**, always returning the signed-in user's own
  rank even when off-page. `GET /api/leaderboard/global?scope=xp|streak`.
- **Member directory** with search + **Connect/Follow** graph. A learner can find peers and build
  a network. `GET /api/members`, `POST/DELETE /api/connections/{id}`, `GET /api/connections/{id}`.
- **Public profile cards** with tier (Novice→Master), XP, followers. `GET /api/members/{id}`.
- New **Community** page (Leaderboard + Members tabs) with one-tap connect.

### B. Org/School competitive challenges
- Managers compose a **competition** from the platform's vetted, sandbox-graded challenges and
  assign it to the **whole org or a specific group/cohort**, with progress tracking.
- **Per-competition leaderboard** (challenges solved → XP → earliest finish) and an **overall org
  leaderboard** (XP, with optional group filter) visible to every member so learners see where
  they stand. Reuses the existing grading engine — no re-implemented code execution.
- New **Compete** page (Competitions + Org Leaderboard), with a manager-only create flow.

### C. LinkedIn sign-in (OpenID Connect)
- Full **"Continue with LinkedIn"** flow: authorize → token exchange → userinfo → find-or-create
  user (links by provider id, then verified email) → issues the same JWT session as password login.
- **Config-gated**: dormant until `LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` are set, so CI and local
  dev are unaffected and **no secrets live in code**. The Login page only shows the button when the
  backend reports it enabled.

### D. Topic search → on-demand Vaathiyaar session
- A **search** across the catalogue + the learner's generated lessons. When nothing matches, the
  UI gathers **level + focus** and asks Vaathiyaar to **generate a tailored session** via the
  existing pipeline, with live progress. `GET /api/classroom/search`, `POST /api/classroom/generate`.

### E. Landing tweak
- "Talk to Sales" now routes to **muthu@pymasters.net**.

## 3. Verification (live analysis)
- **Backend:** a real uvicorn server on a fresh DB, exercised over HTTP — **27/27 checks pass**
  (registration, XP & streak leaderboards, directory search, follow/unfollow, `auth/me`, org
  competition create/permissions/leaderboards/group-scoping, topic search + generate, LinkedIn
  gating, and regression of existing password login + legacy leaderboard).
- **Frontend:** full `vite build` succeeds with Community, OrgCompete, and TopicSearch as code-split
  chunks.

## 4. Prioritized backlog (next good-to-have)
1. **Deep-link search results** to the exact lesson (currently opens the Classroom catalogue).
2. **Connection-aware leaderboard** ("friends" tab — rank among people you follow).
3. **Competition deadlines & badges** (the schema already carries `ends_at`).
4. **Google sign-in** (the OAuth scaffold generalises from the LinkedIn module).
5. **Notifications** on new followers / competition assignments (reuse the notifications table).
6. **LEGAL-1:** reconcile Terms "not directed at under-13" vs. org K-12 targeting before launch.
