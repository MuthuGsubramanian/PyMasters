# Autonomous Session Report — 2026-07-25

## 1. Summary

GCP was audited end to end: a rogue Cloud Build trigger that built and deployed a duplicate service to Singapore on every git push was deleted along with the zero-traffic service and its 73 GB image registry, and a server-side cleanup policy now caps the main 92 GB registry at 10 images — cutting estimated spend from ~$82-92/mo (growing) to ~$61/mo (flat). The classroom lesson view was rebuilt on the Explains scrollytelling engine: every lesson's story now scrolls as sections on the left while the lesson's flow visual sits pinned on the right and advances in step with the section in view, verified live on desktop and mobile across three visual types; hardcoded light-only markdown colours were replaced with theme tokens. A full-site UAT/SIT sweep of 20+ pages found the platform production-healthy (zero console errors; auth/session, code execution, evaluation, XP/streak persistence, dark mode, deep links all pass). Local schedules were inventoried; one dead duplicate task was removed.

## 2. GCP

**Cost:** before ~$82-92/mo trending up → after ~$61/mo flat. Floor is the always-on 1 vCPU/2Gi Cloud Run instance required by the SQLite+Litestream design (documented as intentional in deploy.yml). Actual billed-spend-by-SKU was NOT retrievable: the billing console demands a passkey challenge only a human can pass, and no BigQuery billing export exists — figures are resource-derived estimates. Full inventory with per-resource classification: `_claude_audit/gcp_inventory_2026-07-25.md`.

**Removed (verified unused before each deletion; site re-verified after):**
| Resource | Why | Restore |
|---|---|---|
| Cloud Build trigger `rmgpgab-py-masters-asia-southeast1-…` | Auto-created 26 Jun; fired on EVERY push (345 builds); failing since ~17 Jul but still billing build-minutes | Reconnect repo in Cloud Build console (not recommended) |
| Cloud Run service `py-masters` (asia-southeast1) | Zero traffic ever; traffic pinned to rev 2 of 345; no domain mapping; no repo references | `gcloud run deploy py-masters --region asia-southeast1 --image <any us-central1 image>` |
| Artifact Registry repo asia-southeast1 (73 GB) | Fed only by the rogue trigger | Images rebuild from git; nothing referenced them |

**Kept:** Cloud Run `pymasters` (the product), us-central1 registry (now with keep-10/delete->30d cleanup policy — note the deploy.yml prune step has been silently failing for weeks due to missing SA delete permission; the server-side policy supersedes it), Litestream bucket (17 MB), tfstate, cloudbuild bucket (+30d lifecycle added), 17 secrets, 2 budget alerts (₹20k + ₹25k — satisfies the budget-alert requirement), uptime check, default log buckets. heyhomie-web project is fully dormant (₹0).

**UNKNOWN — your call:**
- `gs://pymasters-app-pymasters-data` — empty bucket, zero cost, probably terraform-created. Delete?
- `github-token` secret (0 enabled versions) and `pymasters-github-github-oauthtoken-f48707` (belongs to the deleted trigger's GitHub connection). Delete both?
- `compute` / `aiplatform` APIs enabled with zero resources — disable, or keep for terraform?
- HealthSentinel scheduled task (fleet, 15-min) currently failing AND overlaps UptimeWatchdog (5-min) — consolidate?

**Account consolidation (requested mid-session):** gmail account now has editor on pymasters-app + heyhomie-web (verified; heyhomie-web needed a project-level domain-policy override). Owner grants are pending email invitations in the gmail inbox. Billing-account IAM cannot be shared with gmail — the org domain policy applies at billing-account level and has no per-account override.

## 3. Classroom layout

**What changed:** Lesson intro now uses the exact Explains scrollytelling structure (`ScrollyBody`, extracted from `ScrollyExplain` and reused — Explains itself unchanged and regression-verified). Story markdown splits into scroll sections at `##`/`###` headings; the lesson's flow visual is pinned in the sticky right panel (top panel on mobile) and its execution step is driven by the section in view. Visual priority: ExecutionVisualizer > LoopVisualizer > FlowDiagram > CodeStepper > ConceptMap; the four step-driven visualizers gained an optional `controlledStep` prop (auto-play timeline untouched — the "Watch It Run" popup still works). Font-colour fix: lesson markdown's hardcoded light-only purples → theme tokens (verified in dark mode). Topic audit: TRACK_META ↔ 31 track dirs ↔ 436 lesson `track`/`id`/`topic` fields all consistent — no data fixes needed (previous sessions' fixes hold).

**Coverage: all 436 catalogue lessons.** Verified structurally, not lesson-by-lesson: every lesson passes through the same renderer; analysis of all 436 lesson JSONs confirms 436/436 split into ≥2 sections (h2-or-h3) and 436/436 have at least one supported visual. (First deploy used an h2-only split that covered only 146 — caught live in browser, fixed, redeployed.) Browser-verified live: `variables_intro` (ExecutionVisualizer, desktop dark + mobile — step 1/6 at section 1 → 6/6 with accumulated output at last section), `agentic_skill_internalization_rl` (CodeStepper), Explains gradient-descent (regression). Heading-less stories (e.g. some translations) fall back to the previous single-card layout by design.

**Screenshots:** baseline and after captured in-session (session transcript); before = single dark story card + popup launcher; after = two-column scrolly with synced visual.

## 4. QA results (UAT/SIT sweep)

Zero console errors on every page tested. All tests on live pymasters.net as super-admin muthu@pymasters.net (existing Chrome session).

| Page / module | Result | Notes |
|---|---|---|
| Home, Pricing, Terms, Privacy, Security | PASS | |
| Login | PASS | Username/password + GitHub + LinkedIn buttons render; auth submission not exercised (credential-entry restriction) |
| Signup / Forgot-password | PASS | Render + validation only; no accounts created |
| Dashboard Overview | PASS | Stats live-update (XP 95→145, streak 0→1, lessons 1→2 after practice run — persistence SIT pass); Continue-Learning deep-link works |
| Classroom catalogue | PASS | 24 tracks; completion badges persist |
| Lesson intro (new scrolly) | PASS | Desktop + mobile, 2 visual types, scroll-sync verified |
| Lesson practice → evaluate → feedback | PASS | Solved variables challenge live: run 335ms, "Excellent Work +50 XP", 3 stars, Vaathiyaar AI feedback streamed (qubrid/ollama chain live) |
| Playground | PASS | Code executed (`qa-check 42`, 335ms); pip panel renders |
| Explains (index + essay) | PASS | Scrolly regression after refactor, desktop + mobile |
| Knowledge Map | PASS | Concept click opens readiness panel |
| Trending | PASS | Category filter re-filters cards |
| Challenges | PASS | Weekly challenge, editor, leaderboard render (solution not submitted — would alter leaderboard) |
| Reference | PASS | Topic → card detail with runnable blocks |
| Community | PASS | Leaderboard + Members tabs, rank shown |
| Profile | PASS | Profile, XP progress, preferences, change-password form render |
| Upgrade | PASS | Plans render, access state correct |
| Super Admin | PASS | Overview stats, Users table (37 users) — read-only pass |
| Org | PASS (render) | "Create Organization" not clicked (side effect) |
| Dark mode | PASS | Whole dashboard + new lesson layout token-correct |
| Mobile (390px) | PASS | Home, dashboard, explains, lesson scrolly |

**Issues found & status:**
1. FIXED+RETESTED: h2-only section split left 290/436 lessons on fallback layout → split at h2-or-h3, redeployed, verified.
2. FIXED (same commit): hardcoded light-only markdown purples in lesson prose (dark-mode font-colour bug).
3. UNCONFIRMED (likely automation artifact): Ctrl+Enter run shortcut didn't fire via synthetic keys in Playground; handler exists and is correctly wired in code (CM6 `Mod-Enter` + textarea fallback) — recommend a 10-second manual keyboard check.
4. LOGGED (cosmetic): Vaathiyaar praise referenced `x = 30` when the variable was `age` (LLM feedback inaccuracy). 
5. LOGGED (cosmetic): forgot-password page is light-themed while login/signup are dark.
6. LOGGED (polish): controlled CodeStepper doesn't auto-scroll its code panel to the active line on long files; desktop mouse-wheel over the sticky visual scrolls the panel's inner content first.

## 5. Schedules

None in Cloud Scheduler; no Cloud Build triggers remain; GH Actions deploy.yml (on push) KEEP.
Local Task Scheduler: **removed** `\PyMasters\AutoPushFixes` (hourly duplicate of the 3-min ReleaseNow autopush, same script, dead since 30 Jun — disabled with XML backup at `_claude_audit/AutoPushFixes.task-backup.xml`; restore = `Enable-ScheduledTask`). **Kept:** ReleaseNow (3-min autopush), SocialWorker (5-min), UptimeWatchdog (5-min), Daily Pipeline (06:30 — but its last run returned error 0x800704E0, investigate), fleet agents ContentStudio/GrowthInsights/SiteSteward (active, healthy), Claude Code Startup. **UNKNOWN:** HealthSentinel (failing + overlaps watchdog).

## 6. Open items (deliberately not done)

- Auth form submissions, account creation, org creation, challenge submission: side-effectful or credential-gated — render-verified only.
- Learn-anything AI lesson generation, voice tutor, TTS audio, podcast player: not exercised (long-running AI generation / audio output can't be asserted via automation).
- Language-switch UI test (would mutate profile settings); translations of lesson stories rely on the same heading convention — heading-less ones get the fallback layout intentionally.
- Per-lesson browser walkthrough of all 436 lessons (structural verification + sampling instead — same code path).
- Cloud Run CUD (~17% off the $58 floor): worth taking once spend is stable; needs billing-account access (pymasters.net account only).
- Daily Pipeline non-zero exit and HealthSentinel failures: flagged, not fixed (outside session scope, both are content/ops loops not the site).

## 7. Risks

- **The 3-min autopush ships mid-edit working-tree states to production.** It committed my half-finished refactor as three partial commits before I could commit atomically; CI's concurrency-cancel means only the final state deployed, but a partial state that *passes tests* could ship. Consider gating the autopush on a marker file or a lint+build pre-push check.
- The AR cleanup policy prunes to 10 newest images within ~24h — rollbacks older than ~10 deploys will need an image rebuild from git.
- deploy.yml's own prune step still fails silently (SA lacks delete permission); harmless now the server-side policy exists, but the `continue-on-error` hides real permission drift.
- Browser extension dropped twice during the session (reconnected automatically) — noted per protocol.
- Litestream/SQLite remains the architectural cost floor and single-instance constraint (max-instances=1): fine at current scale, revisit before any traffic spike.
