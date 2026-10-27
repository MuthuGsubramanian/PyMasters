# Learn While You Play — Design

Date: 2026-10-27 · Author: Claude (autonomous, per founder's standing authority) · Status: DRAFT awaiting founder approval

## Intent

Founder ask (2026-10-27): *"plan a feature called learn while you play, this feature should have
intuitive games that will help the user understand various concepts while they play these games.
want this to be an efficient and high quality implementation."*

PyMasters today teaches through lessons (story → animation → graded challenge) and the Vaathiyaar
tutor. Both are "sit down and study" modes. Play is a third mode: two to five minute rounds a
learner picks up on a phone between things, where the *game mechanic itself is the mental model*
of a Python or AI concept. You cannot score well without understanding the idea, and losing shows
you exactly which idea you are missing.

This is **not** a quiz with confetti. Every game is a direct manipulation of the thing being
learned (predict the output, aim the gradient step, pick the data structure by its properties).
Quizzes already exist on 310 lessons and stay where they are.

## Goals

1. Six games at launch covering the two most-used tracks: Python fundamentals/DSA and ML/DL
   concepts. Each round under five minutes, playable with one thumb on a 400 px screen.
2. Every round produces learning evidence: a `learning_signals` row per item with the concept
   (`topic`) and the specific misconception when wrong, plus a bounded mastery nudge. The
   adaptive tutor (nightly learner notes, scaffolding) sees game evidence with no further work.
3. Play is recommended, not just listed: the Play page opens with "Play to review" items drawn
   from weak mastery topics and spaced-repetition due topics.
4. Cheap to run: zero LLM calls inside the play loop; all level content is deterministic data
   banks verified by the real Python interpreter at authoring time, or client-side simulations.
   Fits the e2-micro VM (no new services, one small table).
5. Cheap to extend: one game engine (shell, session, scoring, results) and a declarative level
   format, so a seventh game is a data bank plus one interaction component.

## Non-goals (this release)

- Multiplayer, real-time duels, chat.
- LLM-generated levels or LLM judging during play (latency, cost, and the e2-micro budget).
- A public leaderboard beyond what already exists (`/api/leaderboard/global` on XP). Game XP
  flows into that existing board; no separate per-game ranking in v1 (see Open Decisions).
- Games for cloud/enterprise tracks (azure/aws/gcp): content is declarative, not mechanical.
- Guest (logged-out) play. Progress, mastery and XP are per user; v1 requires login.
- Native app, offline mode, sound design beyond a short optional success/fail tick.

## Anti-goals (would make this a failure even if it "works")

- A quiz skin: multiple-choice trivia with a timer. If a game can be answered by recognition
  alone, redesign it or cut it.
- Rewarding speed over understanding. Time is a tie-breaker inside a round, never the main score.
- Wrong answers that teach nothing. Every miss shows the correct answer *and* the one-line why,
  with a link to the lesson that teaches it and an "Ask Vaathiyaar" that opens the panel with the
  item pre-loaded.
- Cheating to the top of the XP board. Server recomputes scores for every checkable item and caps
  per-day game XP.
- Hurting the existing lint/test gates or the VM's memory headroom (518 MB available today).

## Players and moments

- **Beginner between lessons** (hobby / career profile): finished *variables*, bounces off
  *functions_scope*. Opens Play on the phone, gets "Play to review: Output Oracle — scope" at
  level 1, five snippets. Misses `global` vs local twice; end screen shows both, links the lesson.
- **Intermediate studying DSA**: plays Big-O Sprint daily; the seeded daily set is the same for
  everyone so friends compare scores in chat.
- **ML learner** on *gradient descent*: Gradient Golf makes the learning-rate trade-off physical
  within three holes, which the essay and lesson then make precise.

## The six launch games

Each game lists: mechanic → concept → `topic` keys it feeds (mastery/review keys are the lesson
`topic` values, e.g. `variables`, `functions_scope`, `big_o_complexity`).

### 1. Output Oracle — *predict the output*
- Mechanic: a 3–10 line snippet appears. Player types the exact stdout (or picks among 4 options
  at levels 1–2; typing from level 3). A reveal animates the actual run line by line (reusing
  `CodeStepper`/`TerminalOutput` with `controlledStep`).
- Concepts: integer vs true division, string slicing and negative indices, mutability/aliasing,
  truthiness, scope and `global`, f-string formatting, `range` bounds, dict ordering, `is` vs `==`,
  short-circuit evaluation, exceptions, comprehensions, generators/laziness, decorators (higher
  levels).
- Topics: `variables`, `lists`, `ds_dicts`, `ds_tuples`, `conditionals`, `for_loops`,
  `functions_scope`, `comprehensions`, `adv_generators`, `adv_decorators`, `errors_handling`.
- Content: a **verified snippet bank**. Author templates with parameter slots; a build script
  instantiates them, runs each through `run_code_subprocess`, stores `{code, stdout, topic,
  misconception_tags, distractors, why}`; items whose run fails or whose distractors collide with
  the real output are rejected. Bank ships as JSON in `backend/games/banks/output_oracle.json`
  (target 180 items, 6 levels × 30).

### 2. Bug Hunt — *find the line, pick the fix*
- Mechanic: code with exactly one bug and the failing test shown. Tap the guilty line (score 1),
  then choose the fix among three (score 2). Reveal runs the fixed code.
- Concepts: off-by-one, mutable default argument, missing `return`, `=` vs `==`, indentation /
  block scope, shadowing a builtin, string vs int from `input`, wrong `range` bound, modifying a
  list while iterating, `is None` checks, exception swallowed, unclosed file.
- Topics: `conditionals`, `for_loops`, `while_loops`, `functions_basics`, `functions_args`,
  `lists`, `errors_handling`, `fileio_reading`, `debugging` track foundations.
- Content: verified bank: the buggy version must fail `test_code` and the chosen fix must pass,
  both checked by the interpreter at build time (`backend/games/banks/bug_hunt.json`, target
  120 items).

### 3. Shape Sorter — *which container?*
- Mechanic: items fall slowly (or appear one by one with reduced motion); each is a requirement
  card ("ordered, allows duplicates, must change later", "unique, fast membership", "key → value,
  keys unhashable?" trap). Swipe/tap into list / tuple / set / dict / frozenset / deque bins.
  Later levels: pick the right method or complexity (`append` vs `insert(0)`, `in` on list vs set).
- Concepts: mutability, hashability, ordering, uniqueness, lookup cost, when to use which.
- Topics: `lists`, `ds_tuples`, `ds_sets`, `ds_dicts`, `hash_tables`, `queues`, `stacks`.
- Content: hand-authored declarative bank with `why` text; ~90 cards.

### 4. Big-O Sprint — *tag the complexity*
- Mechanic: snippet (loops, nested loops, recursion, sort calls, set lookups) → choose
  O(1)/O(log n)/O(n)/O(n log n)/O(n²)/O(2ⁿ). Level 3+: given n = 10⁶, "which finishes in a
  second?" and "halve the input, how much faster?". Visual: a bar race showing operation counts
  for n = 10, 100, 1000 after the answer.
- Topics: `big_o_complexity`, `searching`, `sorting_basics`, `hash_tables`, `recursion_fundamentals`.
- Content: declarative bank ~100 items; operation counts computed by instrumented runs at build
  time (counters inserted in the snippet) so the visual is factual.

### 5. Gradient Golf — *descend the loss*
- Mechanic: a loss curve (1-D at first, 2-D contour later) with a ball at a random start. Player
  sets learning rate (slider) and number of steps, hits "swing"; the ball follows exact gradient
  descent steps with the chosen rate. Fewer swings to settle within tolerance of the minimum wins.
  Too high a rate: visible overshoot/divergence; too low: runs out of steps. Holes introduce local
  minima, saddle, plateau, momentum (unlock), learning-rate decay (unlock), and a "noisy
  gradient" hole for SGD.
- Concepts: learning rate, convergence vs divergence, local minima, momentum, schedules, SGD noise.
- Topics: `gradient_descent` (deep_learning), `linear_regression_gd`, `linear_regression`,
  `neural_networks_intro` (machine_learning).
- Content: pure client simulation; hole definitions are functions + start points, seeded.
  Reuses the drawing approach of `components/explains/GradientDescentVisual.jsx`.

### 6. Overfit Detective — *fit, then face the test set*
- Mechanic: a scatter of points (seeded). Player drags a model-complexity slider (polynomial
  degree 1–12 or tree depth) watching the curve fit the *training* points; commits; the hidden
  test points appear and the test error is scored. Level 2: choose a train/validation split and
  use validation error to pick complexity; level 3: regularisation strength; level 4: spot data
  leakage in a pipeline card ordering (fit scaler before split = leak).
- Concepts: bias–variance, train/validation/test, generalisation, regularisation, leakage.
- Topics: `model_evaluation`, `train_test_split`, `linear_regression`, `logistic_regression`
  (machine_learning).
- Content: client simulation (least squares in a tiny linear algebra helper; seeded data).

Wave 2 candidates (not in scope, listed so the engine accommodates them): Regex Ranger (JS regex,
Python-compatible subset), Tensor Shapes (matmul/broadcast compatibility puzzle), Async Order
(predict print order of awaits), Pipeline Builder, Token Tetris (BPE merges).

## Experience

- **Play page** (`/dashboard/play`, sidebar "Play", icon `Gamepad2`):
  - Top: "Play to review" strip — up to three game+level cards chosen from (a) `user_mastery`
    topics with level < 0.5 and attempts ≥ 2, (b) `/api/review/due` topics, (c) the learner's
    current track; each card says *why* ("you missed scope twice in Classroom").
  - Grid of six game cards: name, one-line "you'll get better at…", best score, level reached,
    streak of days played. Daily challenge badge on the game of the day.
  - Personal stats row: rounds today, game XP today / daily cap, accuracy by concept (small bars).
- **Round screen** (`GameShell`): header with game name, level, progress dots, pause; body is the
  game's interaction component; footer shows score and a soft timer (never blocks input; expiry
  simply counts the item as a miss). Each item ends with a **reveal**: correct answer, actual run
  or simulation result, one-line *why*, chips "Open lesson" and "Ask Vaathiyaar". The reveal is
  skippable with a tap.
- **Results screen**: score, accuracy, concepts strengthened / to revisit (by topic), XP earned
  (and "daily cap reached" when applicable), "Play again (harder)", "Back". Dispatches
  `pm:xp-earned` so the Layout XP chip updates.
- **Difficulty**: six levels per game. Start level = f(mastery of the game's topics): new learners
  level 1, strong learners level 3. Level up after ≥ 80 % accuracy, down after < 40 %; the player
  may also pick a level manually.
- **Accessibility**: every interaction has a keyboard path (number keys for choices, arrows +
  enter for bins, slider is a native range); state is never conveyed by colour alone (shapes,
  labels, icons per the project rule); `useReducedMotion` swaps falling/physics for stepped
  reveals; touch targets ≥ 44 px; ARIA live region announces reveal text.
- **Languages**: UI strings through the existing i18n files (all eight languages get keys, with
  English fallback). Item `why` texts ship en + ta where the lesson has a Tamil story variant,
  else en; the reveal shows the UI language's text when present.
- **Theming**: Tailwind tokens already in `src/index.css`; both light and dark verified.

## Architecture

### Frontend (`frontend/src/games/`)
```
games/
  index.js              # registry: {id, title, blurb, icon, topics[], Component, bank: 'remote'|'local'}
  engine/
    GameShell.jsx       # header, progress, timer, pause, reveal overlay, results
    useGameSession.js   # start → answer(itemId, response, ms) → finish(); batches to the API
    scoring.js          # pure: item score, round score, level transitions
    rng.js              # seeded PRNG (mulberry32) — daily seed = yyyymmdd ^ gameId
    reveal/             # Reveal.jsx: why text + lesson link + Ask Vaathiyaar
  output-oracle/  bug-hunt/  shape-sorter/  big-o-sprint/  gradient-golf/  overfit-detective/
    Game.jsx            # interaction only; receives {item, onAnswer, reducedMotion}
    levels.js           # for simulation games: hole/dataset generators (pure, seeded, tested)
pages/Play.jsx           # catalog + recommendations + stats
pages/PlayRound.jsx      # route /dashboard/play/:gameId
```
- Banks for Output Oracle, Bug Hunt, Shape Sorter and Big-O Sprint are served by the API per
  round (`GET /api/play/round`) so the server knows the correct answers for scoring and never
  ships answers for *upcoming* items; the client receives items with distractors but not the key.
  Simulation games (Gradient Golf, Overfit Detective) are fully client-side; their outcomes are
  reported with the seed so the server can re-simulate in pure Python (same algorithm, same
  float64 maths) and verify the score before awarding XP.
- `GlassCard`/`SectionHeading` are extracted from `pages/Profile.jsx` to
  `components/ui/GlassCard.jsx` and reused (small refactor, no behaviour change).
- Chunking: games lazy-load per game via `lazyRetry`; gsap already present; no new runtime
  dependency. Canvas drawing for the two simulations is hand-written (no chart library).
- Vaathiyaar hook: dispatch `pm:vaathiyaar-ask` with a message that embeds the item (code + the
  learner's answer + the correct one) and a `page_context` of "Play: Output Oracle". No panel API
  change required; a structured `detail.context` can come later.

### Backend (`backend/games/` + `backend/routes/play.py`)
- Table `game_rounds(id, user_id, game_id, level, seed, items INTEGER, correct INTEGER,
  score INTEGER, max_score INTEGER, duration_s REAL, concepts_json TEXT, created_at)`, indexed on
  `(user_id, game_id, created_at)` and `(user_id, created_at)` for the daily cap.
- `backend/games/banks/*.json` loaded once at startup (a few hundred KB total). `backend/games/
  engine.py` : `pick_items(game_id, level, seed, user_id, n)` (seeded, avoids items seen in the
  last 3 rounds), `score_round(game_id, level, items, responses)` (recomputes against the bank
  or re-simulates), `xp_for(score, max_score, level, today_xp)` (5–25 per round, daily cap 150,
  shown transparently), `recommendations(user_id)`.
- Routes (all JWT, `assert_learning_access` like Playground):
  - `GET /api/play/catalog` → games, per-game best/level/last played, recommendations, today's XP.
  - `POST /api/play/round/start {game_id, level?}` → `{round_id, seed, level, items[]}` (items
    without answer keys); creates the row with `score NULL`.
  - `POST /api/play/round/finish {round_id, responses[]}` → scores server-side, writes the row,
    `record_signal('game_item', topic, {game_id, item_id, correct, misconception, ms})` per item
    and `record_signal('game_round', game_id, {...})`, nudges `update_mastery` (+0.03 per
    correct, −0.02 per wrong, per topic, bounded per round to ±0.1), adds XP to `users.points`,
    `touch_streak`, returns the reveal payload (correct answers + why) and totals.
  - `GET /api/play/stats` → accuracy by topic (30 d), rounds, streak of play days.
- Factor the existing inline XP/streak code in `classroom.py` only as far as the game needs:
  a small `backend/progress.py::award_xp(conn, user_id, amount, source, ref)` with a dedupe key
  (`(user_id, source, ref)` unique) used by the game; Classroom keeps its current path (migrating
  it is a separate cleanup).
- Adaptive tutor integration is automatic: `adaptive._learner_material` already reads all
  signal types for a learner; add `game_item` wrong answers' `misconception` field to the
  material formatter so notes can cite "confuses `//` with `/` (Output Oracle, 3 misses)".
- Bank build script `backend/games/build_banks.py` (dev-time, not shipped in the container's
  startup path): instantiates templates, runs code via `run_code_subprocess`, writes banks,
  fails loudly on any unverifiable item. A pytest asserts every shipped item re-verifies, so a
  stale bank cannot land.

### Anti-cheat and fairness
- Correct keys never leave the server for bank games; simulation games are re-simulated.
- Duration below a human floor (e.g. < 1.5 s per item median) scores but earns no XP.
- Daily XP cap; XP per round shown before and after. Rounds abandoned are recorded with
  `score NULL` and ignored by stats.

## Quality bar

- Backend: pytest for engine (seeded picking, scoring, xp cap, mastery bounds, re-simulation
  equality with the JS implementation on fixed seeds via a golden file), routes (full-app
  TestClient pattern), and bank verification. Target ≥ 25 tests.
- Frontend: vitest for `scoring.js`, `rng.js`, each simulation's `levels.js` (golden outputs shared
  with the Python side), and the item normaliser. ESLint gate stays green (react-hooks rules).
- Live verification (per the project's live-testing preference): play every game as a real
  learner account in PyMastersBrowser at 400 px and desktop, light and dark, keyboard only once;
  confirm signals land, mastery moves, XP chip updates, Profile learner-notes pick up a game
  misconception after a manual learning cycle.
- Performance: Play page interactive < 1 s on the VM path; game chunks < 60 kB gzipped each;
  simulations at 60 fps on a mid-range phone, degrade gracefully.
- Content review: founder reads the `why` texts of 20 random items per bank before launch.

## Rollout

1. Engine + Output Oracle + Gradient Golf end to end (one bank game, one simulation) behind a
   feature flag `PLAY_ENABLED` (default on in prod once verified) — proves both paths.
2. Bug Hunt, Shape Sorter, Big-O Sprint, Overfit Detective.
3. Recommendations strip, daily challenge seed, stats, adaptive material formatting, Profile
   "games" summary; LinkedIn/YouTube content about the games once the social pipeline is live.
Each step ships through the existing CI → VM timer path and is live-verified before the next.

## Open decisions for the founder

1. **Leaderboard**: keep v1 to XP flowing into the existing global board (my default), or add a
   per-game daily board (needs display-name consent, moderation, and more UI)?
2. **Plan gating**: games follow `assert_learning_access` like Playground (trial/paid/student),
   my default; or free for every logged-in account as a growth hook?
3. **XP economy**: 5–25 XP per round, 150/day cap, versus 50 for a lesson (my default). Change?
4. **Tamil `why` texts** in v1 (adds authoring time, roughly +30 %) or English-only first?

## Left to the builder

Exact visual treatment within the existing tokens; item wording; the level curves; whether
Shape Sorter uses falling cards or a dealt hand (both must satisfy reduced motion); file-level
splitting beyond the structure above.
