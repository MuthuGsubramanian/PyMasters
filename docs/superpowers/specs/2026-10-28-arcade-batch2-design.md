# Arcade batch 2 — four more real games (Design)

Date: 2026-10-28 · Author: Claude (autonomous; founder 02:38 IST: *"Do not wait for my approval, will review after all is done."*) · Status: building
Parent: `2026-10-27-arcade-design.md` (engine, sessions, unlock ladder, notifications, quality bar all inherited).

## Intent

Founder, 2026-10-28 02:37 IST, after playing the first three: *"This is good, create more such games and
keep it high quality and interactive."* Batch 2 adds four games in genres learners already know, each
with the question woven into the game's own rules, each unlocked by further Classroom progress. Two of
them lean on banks the first batch could not use well (Bug Hunt's line-then-fix items, Big-O Sprint).

## The four games

### 4. Loop Runner (side-scrolling runner; "Mario" feel) — unlocks at 8 lessons
A courier robot auto-runs through a parallax neon city. Gate pairs arrive every 2.4 s (faster over
time): an upper gate and a lower gate, each labelled with a value; the HUD shows the expression
(`x = 7 → x % 3`, `"cat"[-1]`, `len([1, [2, 3]])`). **Jump** (tap / Space / ↑) takes the upper gate,
**slide** (swipe down / ↓) the lower one. Right gate → speed burst, coins, combo; wrong gate → the
robot stumbles, one of three lives, the correct value flashes on the HUD strip with the why.
Checkpoints every ten gates change the scenery and show the loop counter (`for gate in range(10)`).
Questions: the expressions bank, then choice items at higher levels; two labels per pair are the
true value and one distractor (the other distractors rotate in later pairs of the same question so a
coin-flip is not enough over a run: the same expression returns up to twice with different pairs).
Score: gates passed × combo + coins. Art: three-layer parallax skyline, wheel spin, squash on landing,
dust puffs, speed lines, camera shake on a stumble. Sounds: jump whoosh, gate chime, stumble buzz.

### 5. Bug Invaders (Space Invaders) — unlocks at 10 lessons
The program's lines descend as a formation of invaders, one invader per line, each carrying its line
of code. The HUD shows the failing test (`assert total == 15`). **Phase 1:** shoot the guilty line.
Hitting an innocent line costs a shield (three shields), the invader flashes "passes", and the
formation drops a row. **Phase 2:** three "fix ships" fly across the top carrying candidate fixes;
shoot the fix that makes the test pass. The right fix clears the wave with a burst; a wrong fix drops
a bomb (shield). Waves speed up; every third wave a boss ("Off-by-one") needs two hits (line, then
fix) within one descent. The cannon moves with ← → / drag, fires with Space / tap.
Questions: Bug Hunt items (`line_then_choice`), graded as `[line, fix]`; the server scores 1 + 2 as
today, the game treats < 3 as a miss for the wave but still shows which part was right. Score: waves
× remaining shields. Art: CRT scanlines, chunky pixel-style sprites drawn in code, invader wiggle
animation, laser glow, explosion particles. Sounds: pew, invader step, boom, shield crack.

### 6. Dict Dash (Pac-Man maze) — unlocks at 13 lessons
A 19×13 maze of pellets. The HUD shows a prompt; the four **power pellets** in the corners carry the
candidate answers (labels drawn on the pellet). Eat the right power pellet: the ghosts turn blue and
edible for six seconds (eat them for bonus), and the next prompt loads. Eat a wrong one: the ghosts
speed up for six seconds and the why text flashes. Ghosts are named after errors (`KeyError`,
`None`, `IndexError`, `TypeError`) with simple chase/scatter AI; touching a ghost costs a life (three).
Clearing all pellets advances a level (new maze colour, faster ghosts). Swipe or arrows steer; the
dash queues the next turn like the original.
Questions: choice items from dicts, sets/containers, lists (Shape Sorter bins rendered as pellets
work naturally: "which container fits?"). Score: pellets 10, ghosts 200 × chain, right pellet 100.
Art: neon maze with glowing walls, pellet shimmer, ghost eyes that track the player, death spiral.
Sounds: waka tick, power-up whoop, ghost-eaten chime, death glissando.

### 7. Big-O Grand Prix (top-down kart race; "speedkart" feel) — unlocks at 16 lessons
A top-down oval-and-curves track, your kart vs three AI karts, three laps. At each of the four
**fork checkpoints** per lap the track splits into three lanes signposted with answers; the HUD shows
the question (`Which runs in O(n log n)?`, a snippet to tag, "fastest lookup?"). Taking the right lane
gives a boost pad; a wrong lane has an oil slick (spin, lose ~1.5 s) and shows the why. Between forks
it is real driving: accelerate / brake / steer with arrows or tilt-free touch buttons, drift on
curves, draft behind karts, pick up two item boxes per lap (speed burst, shield). AI karts answer by
probability like Bugsy (65 % → 90 %) and drive clean racing lines.
Questions: Big-O Sprint items (90) plus choice items on sorting/searching/data structures. Score:
finishing position × 500 + correct forks × 100 + best lap bonus. Art: painted asphalt with tyre
marks that persist, kerbs, grandstands, mini-map, skid smoke, boost flames, confetti at the finish.
Sounds: engine pitch by speed, drift squeal, boost whoosh, checkpoint chime.

## Shared changes

- Unlock ladder: `loop_runner: 8`, `bug_invaders: 10`, `dict_dash: 13`, `big_o_grand_prix: 16`;
  notifications and gallery cards as today; the stage line names the next game.
- Question dealing: `GAME_META` gains per-game `kinds` and `topics_bias`; Bug Invaders deals only
  `line_then_choice`; Loop Runner deals expressions first and choice items with ≤ 4 short choices;
  Dict Dash deals `choice` + `bin`; Grand Prix deals Big-O/sorting/searching topics first and falls
  back to the learner's pool. Sessions need ≥ 12 items as today.
- Engine additions: `useGameLoop` unchanged; `Hud` gains an optional `lives` row; a tiny `tilemap.js`
  (grid walls, pathfinding for ghosts) and `track.js` (spline track, lane geometry, lap/checkpoint
  logic) are pure modules with tests; `sfx.js` gains `engine` (continuous oscillator with pitch), `waka`,
  `pew`, `boom`, `squeal`, `boost`, `whoop`.
- Haptics: `navigator.vibrate(20)` on hits where supported (ignored elsewhere).
- Everything else (server grading, XP rule, caps, pause, reduced motion, accessible choice buttons,
  Tamil UI strings, 400 px layout, chunk budget) as in batch 1 and its review fixes.

## Quality bar

Same as batch 1 plus: each game has pure rules/physics modules with unit tests (gate resolution,
invader formation + hit detection, maze pathing + ghost states, track lap/checkpoint + lane choice),
a game-component test that drives one full question cycle through the accessible buttons, a live
run of each game on the VM in PyMastersBrowser and at 400 px headless, and a DevTools performance
check at 4× CPU with no frame over 32 ms.

## Rollout

Ship in order 4 → 5 → 6 → 7, each merged and live-verified before the next, with the fresh
whole-batch review at the end and a fix pass before the founder's review.
