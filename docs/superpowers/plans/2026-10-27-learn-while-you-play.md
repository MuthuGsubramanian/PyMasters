# Learn While You Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Play mode with six concept-teaching games on one engine, scored server-side, feeding mastery, XP, streaks and the adaptive tutor.

**Architecture:** Backend `backend/games/` holds the game registry, verified content banks, the scoring engine and Python re-simulators; `backend/routes/play.py` exposes catalog/start/finish/stats and writes `game_rounds` + one `game_round` learning signal per round. Frontend `frontend/src/games/` holds a shared engine (seeded RNG, scoring, session hook, GameShell, Reveal, Results) and one folder per game; `pages/Play.jsx` is the catalog, `pages/PlayRound.jsx` hosts a round. Bank games never receive answer keys; simulation games report seed + moves and are re-simulated in Python before XP.

**Tech Stack:** FastAPI + sqlite3 (existing), pytest; React 18 + Vite + Tailwind v4 tokens, framer-motion (present), canvas 2D, vitest + jsdom. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-learn-while-you-play-design.md`

## Global Constraints

- No LLM call anywhere in the play loop (catalog, start, finish, stats).
- Answer keys for bank games stay server-side; the client gets `prompt`, `choices` (when any), never `answer`.
- One `learning_signals` row per round: `signal_type='game_round'`, `topic=game_id`.
- Mastery nudge: +0.03 per correct, −0.02 per wrong item, bounded to ±0.10 per topic per round; touches `mastery_level` and `last_practiced` only (never `attempts`/`struggle_count`).
- XP per round: `round(5 + 20 * score/max_score)` when accuracy ≥ 40 %, else 0; daily cap 150 across all games; simulation games earn 0 XP until their re-simulator golden test exists and passes (Gradient Golf's does in Task 9, so it earns XP from launch; Overfit Detective is score-only until Task 17).
- XP floor: a round whose median per-item time < 1500 ms scores but earns 0 XP.
- Six levels per game; start level from mastery of the game's topics: mean mastery < 0.3 → 1, < 0.6 → 2, else 3. Level up after ≥ 80 % accuracy, down after < 40 %.
- Daily mode: seed = `int(yyyymmdd) ^ crc32(game_id)`, one scored attempt per user per game per UTC day, no seen-item avoidance.
- Feature flag: env `PLAY_ENABLED` (default `"1"`); when `"0"` every `/api/play/*` route returns 503 `{"detail": "Play is paused"}`.
- Accessibility: every interaction keyboard-reachable; state never conveyed by colour alone; honour `isReducedMotion()`; touch targets ≥ 44 px; reveal text in an `aria-live="polite"` region.
- Frontend lint gate (`npm run lint:gate`) and `npm test` stay green; backend `pytest backend/tests` stays green.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A learner submits `finish` twice for the same `round_id` (double tap / retry after timeout): the second call must return the first result and award nothing again. Pinned in Task 5 (`test_finish_is_idempotent`).
2. A learner tampers with `responses` (unknown item ids, more responses than items, a sim with impossible moves): scoring must ignore unknown ids, cap at the round's items, and the re-simulator must decide the sim score. Pinned in Tasks 3 and 9.
3. The bank contains an item whose distractor equals the real output, or whose code no longer runs on the shipped Python: the bank test must fail CI. Pinned in Task 4 (`test_bank_items_reverify`).
4. A phone at 400 px in dark mode with reduced motion on: Output Oracle must remain playable with typing and keys 1–4; Gradient Golf must show stepped positions instead of animation. Pinned in Tasks 10 and 11 (vitest render smoke) and the live check in Task 13.
5. A learner with no mastery rows and no signals opens Play: catalog must return level 1 everywhere, an empty recommendations list, and no 500. Pinned in Task 5 (`test_catalog_for_new_user`).

---

### Task 1: XP awards with dedupe and daily total

**Files:**
- Create: `backend/progress.py`
- Modify: `backend/main.py:809` (call `progress.ensure_tables(DB_PATH)` next to the adaptive `ensure_tables`)
- Test: `backend/tests/test_progress.py`

**Interfaces:**
- Produces: `ensure_tables(db_path: str) -> None` creating `xp_awards(id INTEGER PRIMARY KEY, user_id TEXT, source TEXT, ref TEXT, amount INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, source, ref))`.
- Produces: `award_xp(conn, user_id: str, amount: int, source: str, ref: str) -> int` — inserts the award and adds to `users.points`; returns `amount`, or `0` when `(user_id, source, ref)` already exists or `amount <= 0`. Caller commits.
- Produces: `today_xp(conn, user_id: str, source: str | None = None) -> int` — sum of `amount` where `date(created_at) = date('now')`.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_progress.py` using a `tmp_path` sqlite db with a `users(id, points)` table: `test_award_once_adds_points` (award 20 → points 20, returns 20), `test_duplicate_ref_awards_zero` (second call same ref → 0, points stay 20), `test_today_xp_sums_by_source` (two awards sources `game`/`lesson` → `today_xp(source='game')` sums only game).
- [ ] **Step 2: Run** `pytest backend/tests/test_progress.py -v` → FAIL (module missing).
- [ ] **Step 3: Implement** `backend/progress.py` as specified; use `INSERT OR IGNORE` and `cursor.rowcount` to detect the dedupe.
- [ ] **Step 4: Wire** `ensure_tables` into `main.init_db` beside the adaptive call at line 809, same try/except style.
- [ ] **Step 5: Run** the test file and `pytest backend/tests/test_adaptive.py -q` → PASS.
- [ ] **Step 6: Commit** `feat(progress): deduplicated XP awards + daily total`.

### Task 2: Bounded mastery nudge

**Files:**
- Modify: `backend/vaathiyaar/profiler.py` (after `update_mastery`, line ~252)
- Test: `backend/tests/test_profiler_nudge.py`

**Interfaces:**
- Produces: `nudge_mastery(db_path: str, user_id: str, topic: str, delta: float) -> float` — read-modify-write `mastery_level` clamped to [0, 1], sets `last_practiced = CURRENT_TIMESTAMP`; inserts a row with `attempts = 0, struggle_count = 0` when none exists; returns the new level. Never changes `attempts`/`struggle_count`.

- [ ] **Step 1: Write failing tests**: `test_nudge_creates_row_with_zero_attempts` (new topic, +0.03 → level 0.03, attempts 0), `test_nudge_clamps_and_keeps_attempts` (existing level 0.99 attempts 4 → +0.03 gives 1.0, attempts still 4), `test_negative_nudge_floor_zero`.
- [ ] **Step 2: Run** → FAIL (`ImportError`).
- [ ] **Step 3: Implement** in `profiler.py`, reusing the module's `sqlite3.connect(db_path)` pattern; create `user_mastery` via `main.init_db` in the test fixture or a minimal CREATE in the test (mirror `test_profile.py::test_update_and_get_mastery`).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(profiler): nudge_mastery touches level only`.

### Task 3: Game registry and scoring engine

**Files:**
- Create: `backend/games/__init__.py`, `backend/games/catalog.py`, `backend/games/engine.py`
- Create: `backend/games/banks/_fixture_bank.json` (6 items, test only; same schema as real banks)
- Test: `backend/tests/test_games_engine.py`

**Interfaces:**
- `catalog.GAMES: dict[str, dict]` keyed by game id with fields `{id, title, blurb, kind: 'bank'|'sim', topics: list[str], levels: 6, bank: str|None, items_per_round: int}`. Ids: `output_oracle`, `bug_hunt`, `shape_sorter`, `big_o_sprint`, `gradient_golf`, `overfit_detective`. `items_per_round`: 6 for bank games, 3 (holes/datasets) for sims. Titles/blurbs as in the spec.
- Bank item schema (every bank file is a JSON list): `{id: str, level: 1-6, topic: str, kind: 'choice'|'text'|'line_then_choice'|'bin', prompt: {code?: str, text?: str, test?: str}, choices?: list[str], answer: str|int|list, misconception: str, why: str, lesson_id: str}`. `answer` for `choice` is the index; for `text` the exact stdout; for `line_then_choice` `[line_index, choice_index]`; for `bin` the bin label.
- `engine.load_bank(game_id: str) -> list[dict]` (cached per process; `_fixture_bank.json` loaded when `game_id == '_fixture'`).
- `engine.pick_items(game_id, level, seed: int, exclude_ids: set[str], n: int) -> list[dict]` — deterministic `random.Random(seed)` sample from items at `level`, falling back to `level±1` when fewer than `n`; excludes `exclude_ids` unless that leaves < n.
- `engine.public_item(item) -> dict` — strips `answer`, `why`, `misconception`, `lesson_id`.
- `engine.score_item(item, response) -> tuple[int, int]` — `(score, max)`: choice/text/bin 1 point exact match (text compared after `rstrip()` on each line); `line_then_choice` 1 point for line + 2 for fix, max 3. Unknown/None response → `(0, max)`.
- `engine.score_round(items, responses: dict[str, object]) -> dict` → `{score, max_score, correct: int, per_item: [{id, topic, correct: bool, misconception: str|None, score, max}]}`; responses keyed by item id, unknown ids ignored.
- `engine.xp_for(score, max_score, median_ms: float, today_xp: int, cap: int = 150) -> int` per Global Constraints.
- `engine.start_level(mastery_by_topic: dict[str, float], topics: list[str]) -> int` and `engine.next_level(level, accuracy) -> int` per Global Constraints.
- `engine.daily_seed(game_id: str, day: date) -> int`.

- [ ] **Step 1: Write failing tests**: `test_pick_items_deterministic_for_seed`, `test_pick_items_falls_back_to_neighbour_level`, `test_public_item_has_no_answer`, `test_score_text_ignores_trailing_whitespace`, `test_score_line_then_choice_partial` (right line wrong fix → (1,3)), `test_score_round_ignores_unknown_ids`, `test_xp_for_values` (full marks → 25; 50 % → 15; 30 % → 0; median 900 ms → 0; today 140 + 25 → 10), `test_start_and_next_level`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(games): registry + deterministic scoring engine`.

### Task 4: Output Oracle verified bank

**Files:**
- Create: `backend/games/templates/output_oracle.py` (template functions), `backend/games/build_banks.py` (CLI: `python backend/games/build_banks.py output_oracle`), `backend/games/banks/output_oracle.json`
- Test: `backend/tests/test_bank_output_oracle.py`

**Interfaces:**
- `templates/output_oracle.TEMPLATES: list[Callable[[random.Random], dict]]` — each returns a candidate item without `answer`; `build_banks.verify_output(code) -> str` runs `vaathiyaar.execution.run_code_subprocess(code, timeout=5)` and returns stdout, raising `ValueError` on non-zero exit.
- `build_banks.build(game_id: str, seed: int = 2026, per_level: int = 30) -> list[dict]`: instantiates templates until each level has `per_level` items, sets `answer` from the real run; for `choice` items generates 3 distractors by applying the item's `misconception` mutator (e.g. `/` vs `//` swapped) and running them too; rejects a distractor equal to the answer; writes the bank sorted by level then id.
- Topics and misconceptions (minimum coverage, levels in parentheses): `variables` str/int concat (1); `lists` slicing/negative index (1–2); `ds_dicts` ordering, `.get` default (2); `ds_tuples` single-element tuple (2); `conditionals` truthiness of `0`, `""`, `[]` (1–2); `for_loops` `range` bounds, `enumerate` start (1–3); `functions_scope` local shadowing, `global`, default evaluated once (3–4); `comprehensions` nested order (3); `adv_generators` laziness/exhaustion (5); `adv_decorators` wrap order (6); `errors_handling` `finally` ordering (4–5). Misconception tags are snake_case strings reused across games (`int_division`, `off_by_one`, `aliasing`, `scope_local_shadow`, `truthiness`, `mutable_default`, `generator_exhausted`, ...). `lesson_id` per topic: the lowest `order` lesson in `backend/lessons/python_fundamentals` with that `topic` (resolve once in `build()` by scanning the directory).

- [ ] **Step 1: Write failing tests**: `test_bank_exists_and_covers_levels` (≥ 25 items each level 1–6), `test_bank_items_reverify` (every item: run `prompt.code` through `run_code_subprocess`, stdout equals `answer` for text items / `choices[answer]` for choice items; distractors never equal the answer), `test_bank_items_have_lesson_and_why` (lesson file exists, `why` ≥ 20 chars).
- [ ] **Step 2: Run** → FAIL (no bank). **Step 3: Write templates and build script; run** `python backend/games/build_banks.py output_oracle` → writes bank, prints rejected count.
- [ ] **Step 4: Run tests** → PASS (budget: < 60 s; mark the reverify test `@pytest.mark.slow` only if it exceeds that on CI, keeping it in the default run).
- [ ] **Step 5: Commit** `feat(games): Output Oracle verified bank (180 items)`.

### Task 5: Play routes — start/finish/catalog/stats

**Files:**
- Create: `backend/routes/play.py`
- Modify: `backend/main.py` (import + `app.include_router(play_router)` after line 900; `play.ensure_tables(DB_PATH)` beside the others)
- Test: `backend/tests/test_play_routes.py` (full-app fixture as in `test_challenge_archive.py`)

**Interfaces:**
- Table `game_rounds(id TEXT PRIMARY KEY, user_id TEXT, game_id TEXT, mode TEXT, level INTEGER, seed INTEGER, item_ids TEXT, items INTEGER, correct INTEGER, score INTEGER, max_score INTEGER, xp INTEGER, duration_s REAL, concepts_json TEXT, result_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT)`; indexes `(user_id, game_id, created_at)`, `(user_id, created_at)`.
- `POST /api/play/round/start` body `{game_id: str, level?: int, mode?: 'practice'|'daily'}` → `{round_id, game_id, mode, level, seed, items: [public_item...]}`; 404 unknown game; 409 when a finished daily round exists today; level defaults to `start_level` from `get_mastery_map`; `exclude_ids` = item ids of the user's last 3 finished practice rounds of that game.
- `POST /api/play/round/finish` body `{round_id, responses: {item_id: response}, item_ms: {item_id: int}, sim?: {...}}` → `{score, max_score, correct, accuracy, xp, xp_capped: bool, next_level, reveal: [{id, answer, why, lesson_id, misconception, correct}], topics: {strengthened: [...], revisit: [...]}}`; 404 unknown round, 403 other user's round; **idempotent**: a finished round returns its stored `result_json` without side effects. Side effects on first finish, in one `sqlite3` connection: update the row; `record_signal(db, user, 'game_round', game_id, {level, mode, score, max_score, items: per_item})`; `nudge_mastery` per topic (sum of deltas clamped ±0.10); `award_xp(conn, user, xp, 'game', round_id)`; `touch_streak(conn, user)` when accuracy ≥ 40 %.
- `GET /api/play/catalog` → `{enabled: true, games: [{...GAMES fields, best_score, best_level, rounds, last_played, suggested_level, daily_done: bool}], recommendations: [{game_id, level, topic, reason}], today_xp, xp_cap: 150}`. Recommendations: up to 3, from (a) `user_mastery` rows with `mastery_level < 0.5 AND attempts >= 2` → first game whose `topics` contain the topic, reason `"You struggled with {topic} in Classroom"`; (b) topics from the same recall computation as `/api/review/due` (import `_estimated_recall`, `_days_since`, thresholds from `routes.review`) with reason `"Due for review"`; dedupe by game.
- `GET /api/play/stats` → `{rounds_30d, accuracy_by_topic: {topic: {correct, total}}, play_days_streak, best: {game_id: score}}` from `game_rounds.result_json`.
- All routes: `Depends(get_current_user_id)`, `assert_learning_access(db, user)`; a module-level `_enabled()` reads `PLAY_ENABLED` and raises 503 when `"0"`.

- [ ] **Step 1: Write failing tests** with the `_fixture` game registered only when `PYTEST_CURRENT_TEST` is set (add `catalog.GAMES['_fixture']` in the test via monkeypatch): `test_start_hides_answers`, `test_finish_scores_and_awards` (3/6 correct → xp 15, points +15, one `game_round` signal, mastery nudged), `test_finish_is_idempotent`, `test_finish_other_user_403`, `test_daily_second_attempt_409`, `test_catalog_for_new_user` (levels 1, recommendations `[]`, 200), `test_catalog_recommends_weak_topic` (mastery 0.3 attempts 2 on a fixture topic → recommendation), `test_disabled_flag_503`, `test_fast_round_earns_no_xp` (item_ms all 500).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `routes/play.py` and wiring. **Step 4: Run** the file + `pytest backend/tests -q` → all PASS.
- [ ] **Step 5: Commit** `feat(play): round start/finish, catalog, stats with server-side scoring`.

### Task 6: Adaptive tutor reads game evidence

**Files:**
- Modify: `backend/vaathiyaar/adaptive.py` (`_learner_material` ~L219, `scaffolding_for` ~L123)
- Test: `backend/tests/test_adaptive.py` (append)

**Interfaces:**
- `_game_summary(signals: list[dict]) -> list[str]` — folds `game_round` values into lines `"{misconception}: {count} misses in {game title} (last {date})"`, max 8 lines, sorted by count desc; the material dict gains `"games": [...]` and `game_round` rows are removed from `"signals"`.
- `scaffolding_for`: compute `game_acc` = correct/total over `game_round` signals in 14 days (≥ 6 items); when level would be `medium` and `game_acc < 0.5` → `high` with reason `"{n} of {m} game answers wrong this fortnight"`; when `medium` and `game_acc ≥ 0.85` → `low` with reason `"{n} of {m} game answers right this fortnight"`. A Classroom-derived `high` is never lowered.

- [ ] **Step 1: Write failing tests**: `test_material_summarises_game_rounds` (two rounds with `int_division` misses → one line with "2 misses"), `test_scaffolding_game_accuracy_breaks_tie_only` (medium + 2/8 → high; classroom high + 8/8 games → still high).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pytest backend/tests/test_adaptive.py -q` → PASS (20 tests).
- [ ] **Step 5: Commit** `feat(vaathiyaar): learner notes and scaffolding see game evidence`.

### Task 7: Frontend engine primitives (pure)

**Files:**
- Create: `frontend/src/games/engine/rng.js`, `frontend/src/games/engine/scoring.js`
- Test: `frontend/src/games/__tests__/rng.test.js`, `frontend/src/games/__tests__/scoring.test.js`

**Interfaces:**
- `rng.mulberry32(seed: number) -> () => number` in [0,1); `rng.shuffle(arr, rand)` Fisher–Yates returning a new array; `rng.seedFromString(s: string) -> number` (FNV-1a 32-bit).
- `scoring.accuracy(correct, total) -> number` (0 when total 0); `scoring.nextLevel(level, accuracy)` (same thresholds as backend); `scoring.medianMs(itemMs: Record<string, number>) -> number`.

- [ ] **Step 1: Write failing tests**: `mulberry32(42)` first three values equal fixed literals computed once and pasted; `shuffle` is a permutation and deterministic; `nextLevel(3, 0.8) === 4`, `nextLevel(3, 0.39) === 2`, `nextLevel(6, 1) === 6`, `nextLevel(1, 0) === 1`.
- [ ] **Step 2: Run** `npm test -- rng scoring` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(games): seeded rng + scoring primitives`.

### Task 8: Session hook, GameShell, Reveal, Results, API helpers, shared GlassCard

**Files:**
- Create: `frontend/src/components/ui/GlassCard.jsx` (export `GlassCard`, `SectionHeading`, moved verbatim from `pages/Profile.jsx:154-182`); add to `components/ui/index.js`
- Modify: `frontend/src/pages/Profile.jsx` (import from ui, delete local copies; `sectionVariant` moves with GlassCard)
- Modify: `frontend/src/api.js` (append `getPlayCatalog = () => api.get('/play/catalog')`, `startPlayRound = (gameId, level, mode) => api.post('/play/round/start', {game_id: gameId, ...(level ? {level} : {}), ...(mode ? {mode} : {})})`, `finishPlayRound = (roundId, responses, itemMs, sim) => api.post('/play/round/finish', {round_id: roundId, responses, item_ms: itemMs, ...(sim ? {sim} : {})})`, `getPlayStats = () => api.get('/play/stats')`)
- Create: `frontend/src/games/engine/useGameSession.js`, `GameShell.jsx`, `Reveal.jsx`, `Results.jsx`
- Test: `frontend/src/games/__tests__/useGameSession.test.js` (pure reducer), `frontend/src/__tests__/api.test.js` (append URL assertions for the four helpers)

**Interfaces:**
- `useGameSession({gameId, level, mode})` → `{state: 'idle'|'loading'|'playing'|'revealing'|'finishing'|'done'|'error', round, items, index, item, responses, answer(itemId, response), next(), finish(), result, error, retry()}`; internally `sessionReducer(state, action)` exported for tests; records `item_ms` from the time an item is shown to `answer()`; `finish()` calls `finishPlayRound` once and guards re-entry.
- `GameShell({title, level, index, total, score, onPause, children, footer})` — header with progress dots (`aria-label="item {i} of {n}"`), body, footer; pause overlay with Resume/Quit.
- `Reveal({item, revealItem, learnerResponse, onNext, lessonHref, onAsk})` — shows correct answer, `why`, chips "Open lesson" (`/dashboard/classroom/{lesson_id}`) and "Ask Vaathiyaar" which dispatches `pm:vaathiyaar-ask` with `detail.message` = `"In Play ({game title}) I answered {response} to this:\n\n{code}\n\nThe right answer was {answer}. Why?"`; `aria-live="polite"` wrapper; "Next" is a 44 px button also bound to Enter.
- `Results({result, onAgain, onBack, gameTitle})` — score, accuracy, XP (and "daily cap reached" when `xp_capped`), topics strengthened/revisit, buttons; dispatches `pm:xp-earned` with `{xp}` when `xp > 0`.
- Per-game interaction components receive `{item, onAnswer(response), disabled, reducedMotion}` and must not call the API.

- [ ] **Step 1: Write failing tests**: reducer transitions `idle→loading→playing` on `ROUND_LOADED`, `answer` stores response and ms, `FINISHED` sets `done` with result; api URL assertions.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the files; move GlassCard; `npm run lint:gate` clean.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run build` succeeds. **Step 5: Commit** `feat(games): session engine, shell, reveal, results; share GlassCard`.

### Task 9: Gradient Golf simulation (JS + Python, golden file)

**Files:**
- Create: `frontend/src/games/gradient-golf/levels.js`, `backend/games/sims/__init__.py`, `backend/games/sims/gradient_golf.py`, `backend/games/sims/golden/gradient_golf.json`
- Modify: `backend/games/engine.py` (`score_round` dispatches sims to `sims.<game>.score(payload)`)
- Test: `frontend/src/games/__tests__/gradientGolf.test.js`, `backend/tests/test_sim_gradient_golf.py`

**Interfaces:**
- Hole definition (shared constant table in both languages, by `id`): `{id, level, name, f: 'quad'|'quartic'|'double_well'|'plateau'|'saddle2d'|'noisy', params: {...}, start: number|[x,y], tol: 0.05, max_swings: 6, allow_momentum: bool, allow_decay: bool}`; nine holes: levels 1–2 `quad` (3 holes, different curvature `a`), level 3 `quartic` + `double_well`, level 4 `plateau`, level 5 `saddle2d` (2-D), level 6 `noisy` (gradient + seeded noise σ=0.3) and `double_well` with momentum.
- Gradient functions are polynomials (no `exp`/`sin`) so JS and Python agree to ~1e-12; noise uses `mulberry32` in JS and an identical implementation `mulberry32(seed)` in Python (uint32 arithmetic with masks).
- `simulate(hole, swing: {lr: number, steps: number, momentum?: number, decay?: number}, seed) -> {path: number[][], final: number[], converged: bool, diverged: bool}`; `diverged` when `|x| > 1e3`; `converged` when distance to the hole's known minimum (`params.min`) ≤ `tol`.
- Score: `swings_used` = number of swings until converged (unconverged round → `max_swings + 1`); hole score `max(0, max_swings + 1 - swings_used)`, max `max_swings`.
- Golden file: for each hole, three fixed swings with seed 7 → `final` and `converged`; generated by Python (`python -m backend.games.sims.gradient_golf --golden`) and asserted by both test suites with relative tolerance 1e-9 on positions, exact on booleans.
- Finish payload for sims: `sim: {holes: [{hole_id, swings: [{lr, steps, momentum, decay}], seed}]}`; `responses` unused for sims.
- `backend/games/sims/gradient_golf.score(payload, level) -> per_item list` in the same shape `score_round` returns (`topic` = `gradient_descent` for levels 1–4, `linear_regression_gd` level 5, `neural_networks_intro` level 6; `misconception` `lr_too_high` when any swing diverged, `lr_too_low` when all swings moved < 10 % of the start distance, else `None`).

- [ ] **Step 1: Write failing Python tests**: `test_quad_converges_with_good_lr` (hole quad a=1, start 3, lr 0.5 steps 10 → converged), `test_quad_diverges_lr_over_2` (lr 2.2 → diverged), `test_golden_matches` (regenerate in-memory, compare to file), `test_score_round_dispatches_sim`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** Python module + `--golden` writer; generate the golden file.
- [ ] **Step 4: Write failing JS tests** importing the golden JSON via `import golden from '../../../../backend/games/sims/golden/gradient_golf.json'` (vitest resolves JSON): same assertions. **Step 5: Implement** `levels.js`. **Step 6: Run** `npm test -- gradientGolf` and the pytest file → PASS.
- [ ] **Step 7: Commit** `feat(games): Gradient Golf simulation with cross-language golden file`.

### Task 10: Output Oracle interaction component

**Files:**
- Create: `frontend/src/games/output-oracle/Game.jsx`
- Test: `frontend/src/games/__tests__/outputOracle.test.jsx` (render with `react-dom/client` into jsdom; no testing-library)

**Interfaces:**
- `Game({item, onAnswer, disabled, reducedMotion})`: renders `item.prompt.code` in a `<pre>` with line numbers; `choice` kind: four buttons labelled 1–4, keys `1`–`4` answer; `text` kind: a `<textarea>` (monospace, 2–6 rows) and "Submit" (Ctrl/Cmd+Enter); a soft 45 s per-item countdown drawn as text `"0:45"` plus a shrinking bar with `role="timer"`; expiry calls `onAnswer(null)`.

- [ ] **Step 1: Write failing test**: renders four buttons for a choice item; pressing key `2` calls `onAnswer(1)`; text item submits trimmed value.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run lint:gate` → PASS. **Step 5: Commit** `feat(games): Output Oracle interaction`.

### Task 11: Gradient Golf interaction component (canvas)

**Files:**
- Create: `frontend/src/games/gradient-golf/Game.jsx`, `frontend/src/games/gradient-golf/draw.js`
- Test: `frontend/src/games/__tests__/gradientGolfGame.test.jsx` (mount smoke with `HTMLCanvasElement.prototype.getContext` stubbed)

**Interfaces:**
- `Game({item, onAnswer, disabled, reducedMotion})` where `item` is `{hole_id, level, seed}` from the server (sims' `public_item` returns these); maintains `swings: []`; controls: `<input type="range">` learning rate 0.01–3 (log scale label), steps 1–50, momentum/decay sliders only when the hole allows; "Swing" button animates the ball along `path` with `requestAnimationFrame` (or jumps through 5 stepped frames under reduced motion); when `converged` or swings reach `max_swings` calls `onAnswer({hole_id, swings, seed})`.
- `draw.drawHole(ctx, hole, path, {width, height, dark})` — 1-D: curve + ball + ghost trail; 2-D: contour rings + path polyline; colours from CSS variables read via `getComputedStyle(document.documentElement)` of the Tailwind tokens; the flag at the minimum uses a shape (triangle) not only colour.

- [ ] **Step 1: Write failing smoke test**: mounts, finds the Swing button, after a swing with lr 0.5 on hole `quad_a1` calls `onAnswer` with one swing recorded.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** tests + lint gate → PASS. **Step 5: Commit** `feat(games): Gradient Golf canvas game`.

### Task 12: Play page, round page, routing, nav, i18n, tutor label

**Files:**
- Create: `frontend/src/pages/Play.jsx`, `frontend/src/pages/PlayRound.jsx`, `frontend/src/games/index.js`
- Modify: `frontend/src/App.jsx` (lazy `Play`, `PlayRound`; routes `play` and `play/:gameId` inside the `/dashboard` Layout route), `frontend/src/components/Layout.jsx:128-151` (nav item `{icon: Gamepad2, label: t('nav.play', 'Play'), path: '/dashboard/play', desc: t('nav.play.desc', 'Learn while you play')}` after Playground), `frontend/src/components/VaathiyaarPanel.jsx:14` (`['/dashboard/play', 'Play — short concept games (predict output, gradient descent golf); the student may be asking about an item they just got wrong']` placed before the `/dashboard` catch-all), all eight `frontend/src/i18n/*.json` (`nav.play`, `nav.play.desc`, `play.*` strings; non-English files get English values as placeholders unless a translation is obvious)
- Test: `frontend/src/__tests__/i18n.test.js` (append: every locale has `nav.play`)

**Interfaces:**
- `games/index.js`: `GAME_COMPONENTS = { output_oracle: lazy(() => import('./output-oracle/Game')), gradient_golf: lazy(() => import('./gradient-golf/Game')) }` plus `GAME_ICONS` (lucide: `Terminal`, `Flag`, `Boxes`, `Timer`, `Mountain`, `ScatterChart`).
- `Play.jsx`: loads `getPlayCatalog()`; sections "Play to review" (recommendation cards → `/dashboard/play/{game_id}?level={level}`), game grid (GlassCard per game: title, blurb, best score, level, `daily_done` badge, "Play" and "Daily" buttons; games without a component show "Coming soon" disabled), stats row (today XP / cap). On 503 shows "Play is taking a short break".
- `PlayRound.jsx`: reads `:gameId`, `?level`, `?mode`; uses `useGameSession`; renders `GameShell` → game component → `Reveal` → `Results`; sets `setVaathiyaarHidden(false)`.

- [ ] **Step 1: Write failing test** (i18n key presence). **Step 2: Run** → FAIL. **Step 3: Implement** pages, routes, nav, labels, i18n. **Step 4: Run** `npm test`, `npm run lint:gate`, `npm run build` → PASS; the `play` chunks are each < 60 kB gzipped (read the build output).
- [ ] **Step 5: Commit** `feat(play): Play page, round route, nav and tutor context`.

### Task 13: Deploy wave 1 and live-verify

**Files:** none new (ops).

- [ ] **Step 1:** `git push origin main`; watch CI (`gh run watch`) and the VM rollout (`curl -s http://35.206.69.198/health` build sha).
- [ ] **Step 2:** In PyMastersBrowser, as the QA learner account: open `/dashboard/play`, play Output Oracle level 1 (desktop + 400 px, dark mode, keyboard only once), play Gradient Golf hole 1 with reduced motion toggled on; confirm Results shows XP and the XP chip updates.
- [ ] **Step 3:** Verify data: `python ops/pm_admin.py get /api/admin/vaathiyaar/adaptive` shows the learner; query via the admin user drawer that a `game_round` signal exists; `GET /api/play/stats` returns the round.
- [ ] **Step 4:** Run a dry-run learning cycle `POST /api/admin/vaathiyaar/learn?dry_run=1` and confirm the learner material includes a `games` line.
- [ ] **Step 5:** Record outcomes in `docs/superpowers/plans/2026-10-27-learn-while-you-play.md` (this file, "Wave 1 verification" note) and commit.

### Task 14: Bug Hunt bank + component

**Files:** `backend/games/templates/bug_hunt.py`, `backend/games/banks/bug_hunt.json`, `backend/tests/test_bank_bug_hunt.py`, `frontend/src/games/bug-hunt/Game.jsx`, test, `games/index.js` entry.

**Interfaces:**
- Item kind `line_then_choice`: `prompt.code` (buggy), `prompt.test` (the failing `test_code`), `choices` (3 full replacement lines), `answer: [line_index, choice_index]`. Build verification: buggy code must FAIL `test_code` under `run_code_subprocess` (append the test, expect non-zero exit) and the fixed code (line replaced by `choices[choice_index]`) must PASS; the other two choices must FAIL. 120 items, levels 1–6, topics `conditionals`, `for_loops`, `while_loops`, `functions_basics`, `functions_args`, `lists`, `errors_handling`, `fileio_reading`; misconceptions `off_by_one`, `mutable_default`, `missing_return`, `assign_vs_compare`, `shadowed_builtin`, `str_vs_int_input`, `mutate_while_iterating`, `is_none_check`, `swallowed_exception`, `unclosed_file`.
- Component: code with clickable line rows (`role="radio"` group, arrows + Enter), then the three fixes; `onAnswer([line, choice])`.

- [ ] Steps mirror Task 4 (bank tests → build → pass) then Task 10 (component test → implement → pass). Commit `feat(games): Bug Hunt`.

### Task 15: Shape Sorter bank + component

**Files:** `backend/games/banks/shape_sorter.json` (hand-authored, 90 cards, validated by `backend/tests/test_bank_shape_sorter.py`: every `answer` ∈ bins, unique ids, `why` present), `frontend/src/games/shape-sorter/Game.jsx`, test, index entry.

**Interfaces:**
- Item kind `bin`: `prompt.text` requirement card, `choices` = bins for the level (levels 1–2: `list|tuple|set|dict`; 3–4: + `frozenset|deque`; 5–6: methods/complexity: `list.append|list.insert(0)|set.add|dict.get|deque.appendleft|in-list|in-set`), `answer` the bin label; topics `lists`, `ds_tuples`, `ds_sets`, `ds_dicts`, `hash_tables`, `queues`, `stacks`.
- Component: dealt-hand layout (card centred, bins as 44 px buttons below; drag with framer-motion when not reduced motion, tap/keys always); `onAnswer(binLabel)`.

- [ ] Steps as Task 14. Commit `feat(games): Shape Sorter`.

### Task 16: Big-O Sprint bank + component

**Files:** `backend/games/templates/big_o_sprint.py`, `backend/games/banks/big_o_sprint.json` (100 items), test, `frontend/src/games/big-o-sprint/Game.jsx`, test, index entry.

**Interfaces:**
- Item kind `choice` with `choices = ['O(1)','O(log n)','O(n)','O(n log n)','O(n²)','O(2ⁿ)']` (always the same order) and extra field `counts: {10: int, 100: int, 1000: int}` measured at build time by instrumenting the snippet (a `__ops += 1` counter injected in the inner-most statement; run via `run_code_subprocess` with `n` bound); levels 5–6 ask `"which finishes in ~1 s at n = 10⁶?"` with `choices` being three snippets' labels. Topics `big_o_complexity`, `searching`, `sorting_basics`, `hash_tables`, `recursion_fundamentals`.
- Component: snippet + six buttons (keys 1–6); after answer a bar race of `counts` (bars labelled with numbers, not colour-only).

- [ ] Steps as Task 14. Commit `feat(games): Big-O Sprint`.

### Task 17: Overfit Detective simulation + component

**Files:** `frontend/src/games/overfit-detective/levels.js` (seeded dataset generator + polynomial least squares via normal equations with ridge λ; `fit(x, y, degree, lam)`, `mse`), `backend/games/sims/overfit_detective.py` (same maths in pure Python lists, no numpy), `backend/games/sims/golden/overfit_detective.json`, tests both sides, `frontend/src/games/overfit-detective/Game.jsx`, test, index entry; `engine.score_round` dispatch.

**Interfaces:**
- Dataset `{id, level, n_train: 20, n_test: 20, true_fn: 'poly3'|'sine_like_poly5'|'step_poly', noise: σ}`; points generated with `mulberry32(seed)`; sim payload `{datasets: [{dataset_id, seed, degree, lam?, split?: number}]}`; score per dataset = `max(0, 5 - rank_of_test_mse_among_degrees_1..12)` (5 when the chosen degree is the best, 4 within one, ...), max 5; `misconception` `overfit` when degree > best + 2, `underfit` when degree < best − 2; level 4 adds a leakage card: order `[split, scale, fit]` as `choice` item scored by the bank path (`answer` index).
- Topics `model_evaluation`, `train_test_split`, `linear_regression`, `logistic_regression`.
- Component: scatter canvas with the fitted curve updating live on the degree slider; "Commit" reveals test points and errors; reduced motion disables the curve morph.

- [ ] Steps as Task 9 then Task 11. Commit `feat(games): Overfit Detective`.

### Task 18: Wave-2 ship, verification, docs

- [ ] **Step 1:** Push; watch CI/VM; live-play all six games in PyMastersBrowser (desktop + 400 px, dark, reduced motion, keyboard) and confirm XP, signals, recommendations ("Play to review" appears for a learner with a weak topic), daily mode 409 on second attempt.
- [ ] **Step 2:** Add a "Play" row to `infra/gce/README.md` ops notes (flag `PLAY_ENABLED`, bank rebuild command) and a short section to `README.md`.
- [ ] **Step 3:** Update memory `project_learn_while_you_play_2026_10_27.md` with what shipped and the data to watch (rounds/day, accuracy by misconception).
- [ ] **Step 4:** Commit `docs(play): wave 2 shipped; ops notes`.

---

## Wave 3 roadmap — signature games that explain components (founder expectation)

The founder accepts the six launch games as a baseline and expects *professional, high-quality
games that explain the components* of Python and AI systems. This roadmap is planned now so the
engine built above accommodates it; each game below gets its own design spec and plan before code.

**Pattern every signature game follows: play → inspect → explain.** The player manipulates a
real system (not a metaphor); any component can be tapped to open an *inspector* showing the live
numbers behind it; an *explain* overlay links the mechanic to the exact maths or semantics, with
a "see this in the Classroom" deep link. Progression is a campaign (chapters with a narrative
goal, each chapter introducing one component), not isolated rounds.

| # | Game | System it explains, component by component | Core mechanic | Effort |
|---|------|--------------------------------------------|---------------|--------|
| 1 | **Neural Net Workshop** | neurons, weights, bias, activation, loss, gradient, backprop, learning rate, batch, epoch | Wire a network by hand to classify a 2-D dataset; watch activations flow as particles; drag a weight and see the decision boundary move; "autograd lens" shows per-weight gradients during a step | L |
| 2 | **Attention Arena** | tokens, embeddings, Q/K/V, dot-product scores, softmax, heads, positional encoding, causal mask | Route information between tokens by placing attention; the score matrix is a heat grid the player paints; levels add heads and masks; win by predicting the next token with the fewest connections | L |
| 3 | **Tokenizer Factory** | bytes, BPE merges, vocabulary size, special tokens, context window | Merge pairs on a conveyor to compress a corpus under a vocab budget; see how merges change how unseen words split | M |
| 4 | **Memory Lane** | names vs objects, references, mutability, aliasing, `id`, `is`, garbage collection, scope frames | A city where variables are street signs pointing at buildings; puzzles about which sign changes which building; frames as districts that vanish on return | M |
| 5 | **Async Airport** | event loop, coroutines, `await`, tasks, gather, blocking calls, timeouts, cancellation | Schedule flights (coroutines) on one runway (the loop); a blocking call freezes the whole airport; win by minimising total wait | M |
| 6 | **Pipeline Tycoon** | data splits, leakage, scaling, feature engineering, model selection, cross-validation, drift, latency/cost | Build an ML pipeline on a board; hidden test set and production traffic score it; trade accuracy against latency and cost | L |
| 7 | **Regex Ranger** | literals, classes, quantifiers, anchors, groups, greedy vs lazy, lookaround | Lasso targets in a text field with a regex; decoys punish over-matching; the engine's match path is animated | S |
| 8 | **Tensor Tetris** | shapes, broadcasting, matmul compatibility, reshape/transpose, batch dims | Falling tensors must be combined by valid ops before they land; invalid shapes shatter with the exact error message | M |

**Quality bar for wave 3** (beyond wave 1's): an art direction pass per game (palette, motion
language, sound ticks) using the design skills available; 60 fps on a mid-range Android; a
written "component map" per game listing every component and where the player meets it; a
five-learner playtest per game with think-aloud notes before release; a retention metric
(returning players after 7 days) reviewed two weeks after each launch; Tamil UI strings.

**Order and timing.** Start after wave 2 has two weeks of play data (what learners replay, where
accuracy stalls). Recommended order: Memory Lane (highest fundamentals impact, medium effort),
Neural Net Workshop (flagship, pairs with the Explains essays), Attention Arena, Async Airport,
Pipeline Tycoon, then the small ones. Each is a separate brainstorm → spec → plan cycle in this
same `docs/superpowers` structure.
