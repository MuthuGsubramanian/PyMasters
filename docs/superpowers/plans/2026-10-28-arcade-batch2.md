# Arcade Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four more real games (Loop Runner, Bug Invaders, Dict Dash, Big-O Grand Prix) on the arcade engine, unlocked at 8 / 10 / 13 / 16 drill-backed lessons.

**Architecture:** Same as batch 1: pure rules/physics modules per game under `frontend/src/arcade/<game>/`, canvas renderers, `useArcadeSession` for server-graded questions, `useGameLoop` for time; backend changes limited to the ladder, per-game question kinds and topic bias in `GAME_META`.

**Tech Stack:** React 19, canvas 2D, WebAudio; FastAPI; vitest/pytest.

**Spec:** `docs/superpowers/specs/2026-10-28-arcade-batch2-design.md`

## Global Constraints

- Batch 1 constraints and review fixes hold (server grading, XP scaled by answered/n with a timing floor, pause really pauses, reduced motion = no particles/shake, accessible choice buttons, Tamil + English strings with fallbacks, chunk < 120 kB gzipped per game, 400 px playable).
- Unlock ladder: `loop_runner: 8`, `bug_invaders: 10`, `dict_dash: 13`, `big_o_grand_prix: 16`.
- Question kinds per game: Loop Runner `choice` (expressions first); Bug Invaders `line_then_choice` only; Dict Dash `choice` + `bin`; Grand Prix `choice` with topic bias `big_o_complexity, sorting_basics, searching, hash_tables, recursion_fundamentals`.
- No approval gates (founder 2026-10-28 02:38); one fresh whole-batch review at the end, then a fix pass.

## Review Focus

1. Loop Runner: the same expression returning with a different distractor pair must never show two identical labels (Task 2 `pairs never duplicate labels`).
2. Bug Invaders: a program with 3–8 lines must fit the formation at 400 px; a wave whose fix list has fewer than three fixes must still be playable (Task 3 `formation fits and tolerates short fix lists`).
3. Dict Dash: ghosts must never pass through walls or get stuck in a corner; the player's queued turn must apply at the next junction (Task 4 pathing tests).
4. Grand Prix: an AI kart must never take a lane that does not exist for a 3-choice question; lap counting must not double-count a checkpoint crossed backwards (Task 5 track tests).
5. All four: `session.exhausted` with the queue empty must end the run with `finish`, never hang (each game test `ends when the deck is empty`).

---

### Task 1: Ladder, question kinds and topic bias for the new games

**Files:** Modify `backend/arcade/unlocks.py` (GAMES, GAME_TITLES, LADDER), `backend/routes/arcade.py` (GAME_META with `kinds`, `topics_bias`, `n`; `_deal` applies the bias: prefer biased topics ∩ learned, fall back to learned), `backend/arcade/pools.py` (`pick(..., prefer_topics=None)` deals preferred-topic items first), `frontend/src/arcade/index.js` + `unlocks.js` titles, `frontend/src/arcade/__tests__/gallery.test.jsx` (7 cards).
**Tests:** `backend/tests/test_arcade_unlocks.py::test_batch2_ladder` (8/10/13/16), `backend/tests/test_arcade_routes.py::test_bug_invaders_deals_only_line_then_choice`, `::test_grand_prix_prefers_big_o_topics`, `::test_catalog_lists_seven_games`.
- [ ] Write the failing tests → run → FAIL → implement → run backend arcade tests + unlock tests → PASS → commit `feat(arcade): ladder and dealing rules for batch 2`.

### Task 2: Loop Runner
**Files:** Create `frontend/src/arcade/loop-runner/rules.js` (pure: `newRun()`, `spawnPair(item, rng, seen)` → `{upper, lower, truthIndex}` with distinct labels and distractor rotation, `step(state, dt, input)` with speed ramp 240→520 px/s over 60 gates, events `pass`, `stumble`, `checkpoint`, `game_over`; three lives), `render.js` (parallax, robot squash, gates, dust, speed lines), `Game.jsx` (jump/slide inputs, `Hud`, accessible buttons `data-gate="upper|lower"`, end screen, `finish`), tests `loopRunnerRules.test.js`, `loopRunnerGame.test.jsx`.
- [ ] RED → GREEN → lint → commit `feat(arcade): Loop Runner`.

### Task 3: Bug Invaders
**Files:** Create `frontend/src/arcade/bug-invaders/rules.js` (pure: `newWave(item)` → invaders one per program line in rows of ≤ 4, `step(state, dt)` formation sway + descent, `fire(state)` / `hitTest`, phases `line` → `fix`, events `innocent_hit`, `guilty_hit`, `fix_right`, `fix_wrong`, `boss`, `game_over`; three shields; answer shape `[line, fix]` sent once per wave), `render.js` (scanlines, pixel sprites, lasers, explosions), `Game.jsx` (← → / drag, Space / tap; accessible buttons `data-line` then `data-fix`), tests.
- [ ] RED → GREEN → lint → commit `feat(arcade): Bug Invaders`.

### Task 4: Dict Dash
**Files:** Create `frontend/src/arcade/engine/tilemap.js` (grid walls, BFS next-step, junction detection; tests), `frontend/src/arcade/dict-dash/maze.js` (19×13 layout + pellet/power-pellet positions), `rules.js` (pure: player movement with queued turn, pellets, ghosts with chase/scatter/frightened states and speed modifiers, power pellets labelled with choices, events `pellet`, `power_right`, `power_wrong`, `ghost_eaten`, `death`, `level_clear`, `game_over`), `render.js`, `Game.jsx` (swipe/arrows; accessible buttons `data-power`), tests.
- [ ] RED → GREEN → lint → commit `feat(arcade): Dict Dash`.

### Task 5: Big-O Grand Prix
**Files:** Create `frontend/src/arcade/engine/track.js` (Catmull-Rom spline track from control points, arc-length sampling, lane offsets, checkpoint gates, lap counter with direction check; tests), `frontend/src/arcade/grand-prix/rules.js` (pure: kart physics with accel/brake/steer/drift/draft, AI racing line + probabilistic lane choice, forks with lane labels, boost/oil events, items, three laps, finishing order), `render.js` (asphalt, kerbs, persistent tyre marks, karts, smoke, mini-map, confetti), `Game.jsx` (arrows + touch buttons; accessible lane buttons `data-lane`), tests.
- [ ] RED → GREEN → lint → commit `feat(arcade): Big-O Grand Prix`.

### Task 6: Merge, deploy, verify, review
- [ ] Full suites; merge to main; CI → VM; `ops/e2e/arcade_smoke.py` (extended to seven games) + `arcade_mobile.py` per game; PyMastersBrowser run of each; fresh whole-batch review; fix pass; audit + memory + founder report.
