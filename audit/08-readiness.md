# 08 — Production readiness (Phase 8) — 2026-07-29

Branch `feat/overnight-uplift-20260729` (13 commits from main@280eef1). Local dev verified: backend :8002, frontend :5173.

## Sweep results: before vs after

| | Before session | After session |
|---|---|---|
| Classroom (all users) | **CRASH** (ReferenceError, prod since 2026-07-28) | PASS — loads clean, 0 console errors |
| Anon acquisition CTAs | Land on sign-in "Welcome Back" | Land on signup chooser |
| Routes exercised | — | 38/39 in-browser, all 4 roles |
| Console errors across dashboard | Classroom + dependents threw | 0 across every route |
| Backend tests | 357 pass / 2 skip | 357 pass / 2 skip (no regression) |

## Build / lint / type / test

- **Frontend build**: ✅ `npm run build` green (12s), all my changes compile.
- **Lint**: pre-existing 102 errors (react-hooks/set-state-in-effect, exhaustive-deps, some no-unused-vars) — NOT touched this session; my 9 changed files added **0 new** lint errors. **CI GAP (see below).**
- **Type-check**: project is JS (no TS); N/A.
- **Backend tests**: ✅ 357 passed, 2 skipped, 242s. No regression vs baseline.

## Security pass

- **Role enforcement (API-level, verified with real tokens):**
  - `/api/admin/users`: anon → **401**, student → **403**, super-admin → **200**. ✅
  - `/api/admin/overview`: student → **403**. ✅
  - UI gate: student hitting `/dashboard/admin` → "Restricted" screen. ✅
- **Enterprise IDOR (regression of 2026-07-08 finding):** anon with forged `?user_id=` gets **346 non-enterprise lessons, 0 enterprise tracks leaked**. ✅ Still gated on JWT.
- **Anon direct-URL to gated routes:** `/dashboard/*` → redirect `/login`. ✅
- **Secrets:** no secrets in changed files; screenshots redacted; test passwords are local-only throwaways.
- **Dependency vuln scan:** NOT run this session — `npm audit` / `pip-audit` recommended before any prod deploy. UNVERIFIED.

## Accessibility summary

- Output-panel secondary text raised to AA contrast (slate-500 → slate-400, ~3.2:1 → ~5.9:1).
- Emoji-as-icon removed from classroom hints (now Lightbulb + aria-hidden).
- Legal-page + org-compete icons carry aria-hidden; org-compete empty state has heading hierarchy + CTAs.
- Viewport meta present (`width=device-width`, no zoom-disable). Mobile-first breakpoints used throughout (115 sm:, 102 lg:, 39 md:).
- **NOT verified this session:** full 375px visual pass (CDP screenshot captures a fixed desktop viewport — window resize did not change the rendered viewport; verified responsive *code* + viewport meta instead, but not the rendered small-screen layout). Keyboard-only traversal spot-checked (sign-out, form submit via Enter) but not exhaustively per-route.

## Performance

- Frontend bundle unchanged in shape (largest route chunk Classroom 164kB gz 44kB; xlsx 333kB is dynamic-imported). No asset regressions from this session's changes.
- Intermittent multi-second renderer freeze observed during onboarding (F-011, CDP screenshot timeouts) — not root-caused; may be dev-mode HMR artifact. Flagged, not fixed.

## Error handling / logging / monitoring

- Vaathiyaar LLM unavailability degrades gracefully (challenge fallback message; job marked failed) — confirmed live (local ollama at 429 weekly cap).
- Org-curriculum failure now surfaces the reason inline instead of a bare duplicate "failed".
- Monitoring/alerting off-laptop remains a known infra gap (prior sessions).

## Rollback path for this branch

Every commit is one concern and independently revertible. To roll back the whole session: `git checkout main` (branch is unmerged, main untouched). Individual reverts: `git revert <sha>`. No migrations, no data writes, no prod changes were made.

## CI gap that let the P0 reach prod (highest-priority follow-up)

The build (esbuild/vite) does NOT flag undefined JSX components, and the flat ESLint config's `no-undef` does **not** catch them either (verified empirically — `<UndefinedIcon/>` lints clean). That is exactly why `GraduationCap` shipped to prod. **Fix: add `eslint-plugin-react` and enable `react/jsx-no-undef` as an error, wired into the deploy gate.** It would have caught F-001. (Not done this session: needs a network `npm i` + the full lint suite is currently too noisy to gate on; recommend a focused `lint:jsx-undef` script running only that rule.)

## GO / NO-GO

**Verdict: conditional GO — but ONLY after cherry-picking the P0 fix (758879c) to main and deploying.**

- The single most important outcome of this session: **prod Classroom is currently broken for every user** (has been since the 2026-07-28 deploy) and this branch fixes it. That fix (`758879c`, one-line import) must reach production regardless of anything else here.
- Everything on this branch is low-risk, reversible, and verified; backend tests are green; no regressions introduced.
- **NO-GO blockers for a *full* branch merge as-is:** (1) dependency vuln scan not run; (2) 375px rendered layout not visually verified; (3) the CI jsx-undef gap remains open — merging without it risks the same class of outage recurring.

**Recommended action:** cherry-pick 758879c to main + deploy TONIGHT to restore prod; land the rest of the branch after a normal review + the dep scan + adding the jsx-undef lint gate.
