# Arcade — real games that unlock as you learn (Design)

Date: 2026-10-27 · Author: Claude (autonomous, per founder's standing authority) · Status: DRAFT awaiting founder approval
Supersedes `2026-10-27-memory-lane-design.md` as the wave-3 direction (that document stays as reference; its puzzle format is not what the founder wants).

## Intent

Founder, 2026-10-27 23:02–23:09 IST: *"this is not just a quiz or checksum games, i am talking about
the real life games like mario or speedkart … the animation of these games should be high quality …
real playable games and each game should unlock as each stage of learning is completed. a notification
should be sent that new game unlocked … the games should be directly linked to learning, like lists,
dict, functions, imports, packages, algorithms, concepts, DSA … one of a kind implementation like never
before. for example a snake and ladder game where each ladder will have a quick quiz and wrong answers
will be snakes … lets go with three sample games and based on how it looks we shall generate more."*

So: **classic game formats people already love, with the learning woven into the game's own rules**,
polished animation, and an unlock ladder driven by Classroom progress so that studying is how you earn
the next game. Three games first; more once the founder has seen them.

The six existing Play games stay as "Quick drills" under the same Play entry; the Arcade becomes the
headline.

## Goals

1. Three real games at launch, each a known genre with a Python/DSA twist that *is* the mechanic, not
   a quiz bolted on: a board game (Snakes & Ladders), an arcade action game (Snake), and a runner
   (gates). Each playable with one thumb on a 400 px phone and with a keyboard on desktop.
2. High-quality presentation: 60 fps canvas/SVG animation with squash-and-stretch, particles, screen
   shake, parallax, a consistent art direction per game, sound effects (mutable), reduced-motion path.
3. Unlock ladder: games and boards unlock on learning milestones (lesson completions). Unlocks create
   an in-app notification ("New game unlocked: Linked Snake") and a toast the moment they happen.
4. Learning is served by the real banks: every question comes from the interpreter-verified banks
   already in `backend/games/banks` (plus one new verified bank of expressions for the runner),
   graded server-side, each with a one-line why and a lesson link; results feed mastery, XP and the
   adaptive tutor exactly as Play does.
5. Cheap to run and extend: no LLM in the loop, no new services, two small tables; a shared arcade
   engine (loop, input, sprites, particles, HUD, question adapter) so game four is a new scene, not a
   new stack.

## Non-goals (this release)

- Multiplayer over the network (the board game's rival is a local AI; two-player on one device is
  a later option). Leaderboards beyond XP flowing into the existing global board.
- Licensed or downloaded art/sound packs: all art is drawn in code (SVG and canvas vector sprites),
  all sound is synthesised with WebAudio. (A CC0 asset pass can come later with the founder's go-ahead.)
- Music tracks. Short SFX only.
- Offline play, native app, guest play.

## Anti-goals

- **A quiz with a game skin.** The question must be a *move* inside the game (climb or slide, grow
  or shrink, pass the gate or crash) with real consequences for the game state, and the game must be
  fun to play even when you know every answer (dice luck, snake steering, runner timing).
- **Punishing beginners with content they have not learned.** A board or level only draws questions
  from topics whose lesson the learner has completed (or the current one), never from ahead.
- **Jank.** Any frame over 32 ms at 4× CPU slowdown in DevTools is a bug.
- **Cheating XP.** Game score never becomes XP directly; XP comes from server-graded answers under the
  Play caps (5–25 per session, 150/day shared with Play).

## The unlock ladder

Stages are counted in **completed lessons** (`lesson_completions`) across all tracks:

| Stage | Milestone | Unlocks | Notification |
|-------|-----------|---------|--------------|
| 1 | 1 lesson completed | **Snakes & Ladders: Python Quest** with the *Variables* board | "New game unlocked: Snakes & Ladders" |
| — | each topic lesson completed | a new themed **board** in Snakes & Ladders (Lists, Dicts, Loops, Conditionals, Functions, Scope, Errors, Comprehensions, Sets & Tuples, Big-O & Sorting) | "New board unlocked: Lists" |
| 2 | 3 lessons completed | **Linked Snake** | "New game unlocked: Linked Snake" |
| 3 | 6 lessons completed | **Loop Runner** | "New game unlocked: Loop Runner" |
| 4+ | reserved | future games (10, 15, 20 lessons…) | |

Unlocks are evaluated server-side (a) whenever a lesson completion is recorded and (b) on first load
of the arcade for learners who already have progress; each unlock is recorded once in a new
`arcade_unlocks` table and notified once via the existing `notifications` table
(`type = "game_unlocked"`, `link = "/dashboard/play#arcade"`). The Classroom completion response
gains `unlocked: [...]` so the frontend can show the toast immediately; the bell shows it anyway.
Locked cards show the milestone ("Complete 2 more lessons") and a preview still.

## The three games

### 1. Snakes & Ladders: Python Quest (board game, turn-based)

- **Board**: 10×10, squares 1–100 snaking up, drawn in SVG; each board has a theme illustration
  (Variables: a bazaar of labelled jars; Lists: a railway yard; Dicts: a post office…), 8 ladders and
  8 snakes placed per board (fixed per board so friends can compare). Light and dark art.
- **Players**: you (token = Python-blue) vs **Bugsy**, an AI rival (orange ladybird token). Bugsy
  rolls and moves on its own; at a ladder Bugsy "answers" with a probability that scales with the
  board's difficulty (60 % → 85 %), so a learner who knows the material beats it.
- **Turn**: tap the die (3-D tumble animation, 700 ms; reduced motion: instant). Token hops square by
  square with a bounce; landing on a **ladder foot** opens the question card. Correct → the token
  climbs rung by rung with sparkles. Wrong → the ladder *morphs into a snake* (path animation) and
  the token slides down to the snake's tail square, with the correct answer and the one-line why
  shown on the card. Landing on a **snake head** opens a rescue question: correct → the snake
  "backs off" (you stay); wrong → you slide. Rolling a six grants another roll (classic).
- **Questions**: 3–4 choice items from the banks filtered to the board's topic, chosen by the server
  at game start (12 per game, server-graded as answered). Output Oracle (choice kinds), Bug Hunt
  (line-then-choice rendered as "which line is the bug?" then "which fix?"), Shape Sorter (bin as a
  choice), Big-O Sprint. Question cards have a 20 s soft timer (expiry counts as wrong).
- **Win**: reach 100 first (exact landing not required). End screen: result, questions right/wrong
  with whys, XP earned, "Rematch" and "Next board". A game lasts 4–7 minutes.
- **Art direction**: warm paper board, hand-inked ladders, serpentine snakes with scale shading, tokens
  with a drop shadow that stretches on jumps; die is a CSS 3-D cube. Sounds: dice rattle, hop ticks,
  ladder chime, snake hiss.

### 2. Linked Snake (arcade action, real time)

- **Field**: 20×14 grid on canvas, neon-on-dark, soft glow. The snake is literally a **linked list**:
  each segment is a node card showing its value, linked by short connectors; the head carries the
  cursor. The HUD shows the live code for what you are doing: `snake.append(7)` when you grow,
  `snake.popleft()` when you shrink, `len(snake) == 9`.
- **Prompt**: a question sits in the HUD ("Which snippet prints `6`?", "Which is O(n log n)?",
  "Which container rejects duplicates?"). Three to four **food tiles** on the grid carry the
  candidate answers (short code chips). Steer (arrow keys / WASD / swipe) to eat the correct one:
  the snake grows by one node (+score, speed step up, burst particles). Eating a wrong one **pops
  the tail** (node flies off with the why text flashing on the HUD) and respawns the prompt. Walls
  and self-collision end the run. Hitting zero length ends the run. Levels every 8 correct answers:
  more obstacles (`None` blocks), faster tick.
- **Questions**: from the banks for topics the learner has completed, weighted to lists, DSA, Big-O
  and Shape Sorter (containers), with Output Oracle choice items; 30 per run requested in two
  batches so the HUD never waits.
- **Score**: nodes eaten × level multiplier; personal best stored; XP from correct answers.
- **Art direction**: CRT-dark field, node cards with monospace values, head with two eye dots that
  look toward the chosen food, trail glow; shrink animation is a tail node detaching and dissolving.
  Sounds: crunch (grow), fizz (shrink), low thud (crash).

### 3. Loop Runner (side-scrolling runner, real time)

- **World**: a courier robot runs through a parallax neon city (three background layers, lamp
  flicker, rain option). The runner auto-runs; the player **jumps** (tap / space / up) to take the
  upper gate or **slides** (swipe down / down arrow) for the lower gate. A **gate pair** arrives every
  2.4 s (speeding up), each gate labelled with a value; the HUD shows the current expression:
  `x = 7 → x % 3 == 1`, `"cat"[-1]`, `len([1, [2, 3]])`, `bool("")`, `3 * "ab"`, `[1,2,3][1:]`.
  Pass the gate whose label equals the expression's real value: correct → speed burst + coins; wrong →
  the gate flashes red, the robot stumbles, one life lost (of 3), the correct value and a one-line why
  show on the HUD strip for 1.5 s. Checkpoints every 10 gates (a *for loop* counter ticks up:
  `for gate in range(10)`), with a "chapter" change of scenery.
- **Questions**: a new **expressions bank** (`expressions.json`), generated from templates and
  verified by the interpreter in `build_banks.py` like Output Oracle: comparison operators, `%`,
  `//`, `in`, slicing, indexing, `len`, truthiness, string repetition, `and/or` short-circuit,
  comprehension length, `max/min/sum`. Difficulty tiers by the learner's completed lessons.
- **Score**: distance (gates passed) and coins; XP from correct gates.
- **Art direction**: cyan/magenta skyline, robot with wheel spin, squash on landing, dust puffs,
  speed lines, camera shake on a stumble. Sounds: jump whoosh, gate chime, stumble buzz.

## Shared arcade engine (`frontend/src/arcade/engine/`)

- `useGameLoop(update, draw)` fixed-timestep loop (60 Hz update, rAF draw, pauses when the tab is
  hidden or the shell is paused) ; `useInput()` keyboard + touch (tap, swipe 4-way, hold) with
  on-screen buttons ≥ 48 px on touch devices; `sprites.js` vector drawing helpers with
  squash/stretch and shadows; `particles.js` pooled bursts/trails; `sfx.js` WebAudio synth voices
  with a mute toggle (default on, remembered in `pm_arcade_sound`); `Hud.jsx`, `ArcadeShell.jsx`
  (title, pause, mute, quit, lives/score), `QuestionCard.jsx` (choice card with timer, used by the
  board game and reused for the drills later); `useArcadeSession()` (start → questions batch →
  answer → finish; mirrors `useGameSession`).
- Reduced motion: particles off, animations instant, screen shake off; the games remain playable.
- Accessibility: every choice is a real button in the DOM (the canvas is decorative plus a
  `role="img"` description); keyboard paths for all three games; question text in an aria-live
  region; colour never the only signal (shapes/labels on gates and tiles).

## Backend (`backend/routes/arcade.py`, `backend/arcade/`)

- Tables: `arcade_unlocks(user_id, key, unlocked_at)` (`key` = `game:snakes_ladders`,
  `board:lists`, `game:linked_snake`…) and `arcade_sessions(id, user_id, game_id, board, started_at,
  finished_at, score, questions_json, responses_json, correct, total, xp, result_json)`.
- `GET /api/arcade/catalog` → games with `unlocked`, `milestone` text, boards with unlock state,
  personal bests, `today_xp`, `xp_cap`; evaluates unlocks on the way (idempotent) and returns any
  newly unlocked keys.
- `POST /api/arcade/session/start {game_id, board?}` → session id + a batch of public question
  items (chosen from banks by the allowed topics; `n` by game); `POST /api/arcade/session/questions`
  for a further batch (Snake); `POST /api/arcade/session/answer {session_id, item_id, response}` →
  graded entry with answer/why/lesson (idempotent per item); `POST /api/arcade/session/finish
  {session_id, score}` → XP from correct answers (`engine.xp_for` on the answered set, shared
  150/day cap under source `"game"`), mastery nudges per topic, one `game_round`-style learning
  signal (`signal_type = "arcade_session"`), streak touch, result.
- `backend/arcade/unlocks.py`: `LADDER` (stage → key, lessons required), `BOARDS` (board → topic →
  lesson id), `evaluate(conn, user_id) -> list[newly_unlocked]`, creates notifications through
  `notifications.dispatcher.create_notification`. Called from the Classroom completion path and the
  catalog.
- `backend/games/templates/expressions.py` + `build_banks.py expressions`: ≥ 150 verified items,
  `kind: "choice"` with `prompt.expr` and `prompt.context` (variable bindings), four choices.
- Flag: `ARCADE_ENABLED` env (default on), same guard style as Play.

## Quality bar

- Backend pytest: unlock ladder (stage thresholds, board unlocks, idempotent notification), session
  flow (start/answer/finish, caps, allowed-topic filter never serves an unlearned topic), expressions
  bank verification. Frontend vitest: engine pure parts (loop stepping, input mapping, particles
  pool, board geometry, snake movement rules incl. tail pop and self-collision, runner gate
  resolution), question card, unlock toast; ESLint clean.
- Live (standing directive): each game played to completion in PyMastersBrowser desktop light and
  dark, keyboard only once; 400 px via headless Playwright with touch events; DevTools performance
  trace at 4× CPU slowdown with no frame > 32 ms; unlock flow verified by completing a lesson on a
  fresh test account and seeing the bell and toast.
- Chunk budget: arcade engine + one game < 120 kB gzipped per route chunk; lazy loaded per game.

## Rollout

1. Backend: unlock ladder + notifications + catalog + session routes + expressions bank. Play page
   gets the Arcade section with locked/unlocked cards (no game yet). Deploy, verify notifications.
2. Snakes & Ladders (Variables + Lists + Dicts + Functions boards first; other boards follow).
3. Linked Snake. 4. Loop Runner. Each live-verified before the next; founder review after all three.

## Calls made after the builder check (not founder decisions)

1. **Thin topics.** Boards ship only when their question pool holds at least 24 choice-style items.
   The bank builder gains a `choice_from_text` pass that turns free-text Output Oracle items into
   choice items with interpreter-verified distractors (mutated programs, same machinery as
   `_finish_choice`), which lifts Scope and Comprehensions above the bar; Errors stays hidden
   ("coming soon") until its templates are written. First boards: Variables, Lists, Dicts, Loops,
   Conditionals, Functions (`functions_basics` + `functions_args` + `functions_scope`), Containers
   (`ds_sets` + `ds_tuples` + `queues` + `hash_tables`), Big-O & Sorting. Boards never borrow
   from other topics.
2. **What counts as a stage.** Stage thresholds count only *drill-backed* lessons: lessons whose
   `topic` has at least one bank item (Python fundamentals, intermediate and DSA in practice).
   Cloud and AI lessons still earn XP but do not advance the arcade ladder, so the question pool is
   never empty when a game unlocks. The unlock hook is called from both completion writers
   (`routes/classroom.py` and `main.py`). Expressions items carry `topic` tags (`variables`,
   `conditionals`, `lists`, `ds_dicts`, `comprehensions`) and are filtered the same way.
3. **Notification channels and backfill.** Game and board unlocks are in-app only
   (`create_notification(..., channels=["in_app"])`; the dispatcher gains that parameter, default
   unchanged). Existing learners get **one** summary notification on their first arcade load
   ("Arcade unlocked: 2 games and 4 boards are waiting"); afterwards each new unlock notifies
   individually.
4. **Board unlock rule.** A board unlocks when **any one** of its lessons is completed. There is no
   special Variables board at stage 1: the first drill-backed lesson completed unlocks the game and
   the board of that lesson's topic.

## Open decisions for the founder (defaults in bold)

1. Sound **on by default** with a mute button, or off by default?
2. Stage thresholds **1 / 3 / 6 lessons** (so an engaged new learner unlocks all three within the
   first week), or stricter?
3. Bugsy the rival: **present by default** in Snakes & Ladders (race feel), or solo "reach 100 in
   the fewest turns" mode by default with the rival optional?

## Left to the builder

Exact board art per theme, ladder/snake coordinates per board, the snake's grid size on very
narrow screens, the runner's speed curve, the expressions template list, SFX voicing, and the
toast component's look (reuse the app's existing toast if one exists, else a small one in the
arcade engine).
