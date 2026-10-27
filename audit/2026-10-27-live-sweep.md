# Live sweep log — started 2026-10-27 (standing directive: enterprise-grade, every module live-tested)

Method: real learner session in PyMastersBrowser (desktop, dark) + headless Playwright at 400 px
(`python ops/e2e/play_mobile.py`, dark + reduced motion). Findings are fixed with TDD and
deployed through CI → VM; each row says where it stands.

| # | Module | Finding | Severity | Status |
|---|--------|---------|----------|--------|
| 1 | Play / Gradient Golf | Reveal showed "You said [object Object]" for a simulation answer | P1 | fixed 515947a (wave 2, db38c92) |
| 2 | Play / Gradient Golf | Reveal rendered below the fold after the canvas; learner saw no verdict | P2 | fixed 515947a (scrollIntoView) |
| 3 | Vaathiyaar adaptive | Mastery rows created by game nudges (level 0.0–0.04, attempts 0) counted as "low mastery" → high scaffolding for a learner who merely played | P1 | fixed 1e38869 |
| 4 | Vaathiyaar adaptive | Unplayed Gradient Golf holes summarised as `lr_too_low` misconceptions | P2 | fixed 1e38869 (`not_attempted`, skipped in notes) |
| 5 | Layout (mobile) | Sidebar nav links are under 40 px tall at 400 px (touch target) | P3 | open |
| 6 | Play shortcuts / modals | Game keyboard shortcuts (1–6, arrows, Enter) fired behind the "What's New" dialog (the dialog itself traps focus correctly) | P2 | fixed: `games/engine/keys.js` guard, all games + Reveal |
| 8 | Play (mobile) | Floating Vaathiyaar launcher overlaps the round footer / sits on the Results card at 400 px (corner-collision rule) | P3 | fixed: bottom padding on GameShell/Results |
| 9 | Deploy | Container swap on the VM returns 502 for ~20 s on every rollout (update.sh restarts in place); seen by the headless sweep at 14:03 on Knowledge Map | P2 | mitigated: Caddy retries GET/HEAD during the swap (lb_retries), frontend retries one GET on 502/503/504; true blue/green blocked by Litestream living inside the app container + 1 GB RAM (needs a sidecar + swap) |
| 10 | Semantic search | First search after a restart takes ~6.5 s (embedder lazy-loads on the first query); warm queries 0.8 s | P3 | open — pre-warm the query embedder after the index build |
| 11 | Classroom grading | Vaathiyaar feedback rendered as raw text with literal backslash-n and markdown symbols (model double-escaped its JSON) — every graded challenge affected | P1 | fixed: parser unescapes double-escaped messages (`engine._unescape_message`) |
| 12 | Playground header | Prompt-credit meter shows a bare `11799/11800` beside the XP badge; reads like XP | P3 | fixed: label "prompts" |
| 13 | Console noise | `[PyMasters API] Module loaded` logged on every page load in user consoles | P3 | fixed: logs removed |
| 7 | API latency | Play endpoints ≈0.85 s round trip from the laptop (TLS + 2× RTT to us-central1); page feels "Checking…" for ~1 s per item | P3 | monitor; consider keep-alive / edge later |

Headless sweep 14:05 IST (`ops/e2e/module_sweep.py`, 25 routes × desktop-light + mobile-dark): 50/50 clean after the rollout window — no console/page errors, no horizontal overflow, no failed API calls, slowest page Overview 2.9 s.

Live API smoke 14:20 IST (`ops/e2e/api_smoke.py`, 16 calls incl. a real sandbox grade + playground execute): all 200, grade 4.9 s, everything else ≤1.6 s.

Wave-2 games live-verified 14:38 IST on build 1250dd8 (Bug Hunt keyboard flow + reveal, Shape Sorter arrows/Enter, Big-O with the measured count race, Overfit Detective fit/commit): all working, no console errors.

Browser sweep 14:41 IST as the ops learner (desktop, dark): Overview, Classroom lesson (inline Run + graded challenge → +50 XP), Playground (run 346 ms), Profile, Challenges (week 44 + leaderboard), Community (rank #10), Live Tutor form, Knowledge Map (277 concepts), Super Admin overview — all render, no console errors. Not exercised on purpose (side effects on production): Live Tutor booking submit, Support form, org/admin mutations, signup/forgot-password (email is down anyway).

Final build 70851fd live 15:45 IST: headless sweep 50/50 clean, API smoke 17/17 green (semantic cold query now 1.3 s after the warm-up). CI caught a real finish race on Linux (two overlapping /finish calls both ran side effects) → atomic claim shipped.

Next modules to sweep (as learner and as admin): Overview, Classroom (lesson + grade), Playground (execute + install), Paths, Knowledge Map, Challenges, Reference, Explains, Community, Live Tutor, Profile, Org console, Super Admin, Login/Signup/Forgot, Pricing/Upgrade.

## Arcade (2026-10-28)

Founder redirected wave 3 from puzzle games to real arcade genres with the question as a move,
unlocked by Classroom progress. Seven games shipped across three deploys (49e037c, 6a233e3 fix pass,
1b439db Loop Runner, 7f63b5d Bug Invaders + Dict Dash + Grand Prix).

| # | Area | Finding | Fix |
|---|------|---------|-----|
| 14 | Snakes & Ladders | Game froze whenever Bugsy rolled a six (rival effect keyed on phase only) | effect keyed on the turn counter (6a233e3) |
| 15 | Code Slingshot | One wrong pig made the question unwinnable (stored server grade re-returned) | later hits graded locally against the stored answer, no extra XP |
| 16 | Linked Snake / Slingshot | Bug Hunt and Shape Sorter items dealt to canvas games were unanswerable | per-game `kinds` filter; catalog pool counts honest |
| 17 | All arcade | Shell pause did not stop loops or the question timer | controlled pause; pause-aware timer |
| 18 | Arcade XP | One answer earned full round XP; missing `ms` skipped the human floor | XP scaled by answered/n; missing timing = below floor; cap read + award in one transaction |
| 19 | Unlocks | Board announced as unlocked while the learner's own pool was too thin | board unlock needs ≥ 12 items from the learner's completed topics |
| 20 | Sessions | Concurrent answers overwrote each other; a failed finish left the session claimed forever | BEGIN IMMEDIATE on answer; claim released on error; score clamped |
| 21 | Loop Runner / Grand Prix | Two- and three-lane games need the truth among few labels without leaking it | server deals subset variants (`<id>~v<d…>`), graded by rebuilding the variant |

Live verification: `ops/e2e/arcade_smoke.py` 30/30 on 49e037c and 6a233e3; `ops/e2e/arcade_mobile.py`
400 px clean for the gallery, Snakes & Ladders and Slingshot (Linked Snake's canvas appeared late in
one run; re-check on 7f63b5d); PyMastersBrowser: Snakes & Ladders rival loop, Slingshot drag, Loop
Runner gates confirmed on the live build. QA account seeded with 20 drill-backed completions.

### Batch 2 (Loop Runner, Bug Invaders, Dict Dash, Big-O Grand Prix) — 2026-10-28 04:35 IST

Fresh whole-batch review found 4 critical + 9 important issues; all fixed in 653e4b9 (live as 77a900d):

| # | Area | Finding | Fix |
|---|------|---------|-----|
| 22 | Dict Dash | `bin` items graded wrong (integer vs label); items with > 4 choices could omit the truth | server deals 4-choice variants of choice items only |
| 23 | Dict Dash | No more questions after a level clear; player auto-ate a corner pellet on spawn | open question carries over; player stationary until the first steer |
| 24 | Linked Snake (live) | Snake ran into the wall before any input | stationary until the first steer |
| 25 | Grand Prix | AI karts got a free lap from the grid; laps counted by rocking over the start line | AI start at lap −1; laps need checkpoints in order |
| 26 | Subset variants | Repeat variants of a revealed question earned free XP/mastery; pool counted variants | base excluded once dealt; repeats score 0; pool counts distinct bases |
| 27 | Bug Invaders | Descent uncapped and continued during the fix phase; ships entered late and overlapped the top row | cap 28 px/s, frozen in fix phase, ships on screen, rows moved |
| 28 | All canvas games | Labels truncated into identical strings; answers unreadable at 400 px; keyboard could not activate answer buttons | `maxWidth` text, visible answer button rows, input hook ignores focused buttons |
| 29 | Dict Dash / Grand Prix | 43 % / 15 % of frames over 32 ms at 4× CPU (walls with shadows, road redrawn per frame) | offscreen maze and track layers; now 0 % |
| 30 | All canvas games | Canvas unsized after "Play again"; Retry after a failed finish left the loop stopped; vibrate logged before any gesture | resize keyed on restart; Retry restarts; haptics gated on a gesture |

Live on 77a900d: `arcade_smoke.py` 62/62; `arcade_mobile.py` game surface present for all seven at
400 px; `arcade_perf.py` at 4× CPU: six games 0 % over 32 ms, Linked Snake one 67 ms hitch (0.9 %);
PyMastersBrowser: Linked Snake and Dict Dash wait for input, Grand Prix forks and Bug Invaders waves
render. QA token version bumped afterwards (injected session invalidated).
