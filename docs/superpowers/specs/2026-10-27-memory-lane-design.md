# Memory Lane — Design

Date: 2026-10-27 · Author: Claude (autonomous, per founder's standing authority) · Status: DRAFT awaiting founder approval
Parent: `2026-10-27-learn-while-you-play-design.md` (engine, XP, anti-cheat, adaptive integration all inherited) · Roadmap entry: plan §"Wave 3 roadmap", game #4

## Intent

The founder accepted the six launch games as a baseline and asked for *"professional high quality
games that will explain various components"*. Memory Lane is the first of those signature games.
It explains Python's memory model component by component: names, objects, references, mutability,
aliasing, copying, `is` vs `==`, `id()`, stack frames and scope, garbage collection.

Why this one first: these ideas sit under every bug a beginner hits in week two ("I changed `b`
and `a` changed too", "my function didn't change my list", "the default list remembers"). The
Classroom teaches them with metaphors in four separate lessons (Magic Boxes, Train Compartments,
Sealed Envelope, Nesting Dolls) but never lets the learner *watch* the machine. Memory Lane does.

**The game is a city.** Every object is a building. Every name is a street sign that points at a
building. A function call opens a new district; returning demolishes it. The player watches a real
Python program run one line at a time, and before each mystery line predicts what the city will
look like after it by moving signs, marking buildings and choosing contents. The city's truth is
not a model of Python: it is recorded from the real interpreter when the puzzle bank is built.

## Goals

1. **Play → inspect → explain**, the wave-3 pattern. *Play*: run real programs line by line and
   predict the memory state by manipulating the city directly. *Inspect*: tap any building or sign
   at any step to see the live facts behind it (type, label, `id`, how many signs point here, what
   it contains, which district it lives in). *Explain*: every reveal names the component just
   exercised, states the rule in two to four sentences, and deep-links to the Classroom lesson.
2. **Truth from the interpreter.** Every puzzle is a real Python program executed under a tracer
   at bank-build time; the per-line memory snapshots are stored and are the only source of both
   the animation and the grading. No hand-written model of Python semantics anywhere.
3. **A campaign, not trivia.** Six chapters, one component each, in a fixed order that builds the
   mental model. The Play card shows chapter progress. Each chapter is one engine level, so the
   existing round, scoring, XP, daily and adaptive machinery apply unchanged.
4. **Professional presentation.** A deliberate art direction (palette, building shapes per type,
   one motion language), 60 fps on a mid-range Android phone, one-thumb play at 400 px, keyboard
   path for every interaction, light and dark, Tamil UI strings.
5. **Reuse the engine.** Memory Lane is a `bank` game with four new item kinds. No new tables, no
   new routes, one new private item field. A later wave-3 game can reuse the inspector and explain
   overlay components.

## Non-goals (this release)

- Explaining CPython internals beyond what a learner can observe: no bytecode, no `__slots__`, no
  memory addresses as numbers (labels stand in for `id`; the real `id` is shown in the inspector
  as a curiosity only).
- String interning, integer object layout, `sys.getrefcount` numbers. Refcounts are shown as the
  count of references visible in the city (names + container slots), which is explainable.
- Free-form coding. The player never types Python; they predict and manipulate.
- Multiplayer, sound design beyond an optional tick, offline mode (parent spec non-goals hold).
- A general-purpose Python visualiser in the Classroom (possible later reuse, not scoped here).

## Anti-goals

- **Animations that lie.** If the city ever shows a state the interpreter did not produce, the
  game is worse than nothing. Hence goal 2: the bank build fails if any snapshot cannot be
  captured, and the frontend renders snapshots verbatim.
- **Metaphor leaking over the semantics.** The city is a *presentation*; every label in the
  inspector uses the real Python word next to the city word (building = object, sign = name,
  district = frame, locker = list slot, demolition = garbage collection).
- **Puzzles solvable by pattern-matching the question text.** Questions are about *this* program
  state; the same question type gets different right answers across items.
- **Punishing exploration.** Inspecting is free and unlimited, before and after answering. Time
  is recorded only as the anti-bot floor from the parent spec, never as score.

## Players and moments

- **Week-two beginner** who just hit the aliasing bug. Opens Memory Lane chapter 2 ("Lockers").
  Sees `a = [1, 2]` build a locker row and `b = a` hang a second sign on the *same* row. Mystery
  line `b.append(3)`: they predict only `b`'s building changes, drag nothing, tap `b`'s row. The
  reveal shows both signs on one row, states "Assignment never copies; `a` and `b` are two names
  for one list" and links Lists: The Train with Compartments.
- **Intermediate learner** confident about lists who still believes functions get copies. Chapter
  5 ("Districts") shows the call opening a district with parameter signs pointing at the *caller's*
  buildings; a rebind inside the district moves only the district's sign; a mutation changes the
  shared building. They finally see why `def f(x): x = x + [1]` does nothing for the caller.
- **Daily player** doing chapter 2's fixed daily set, comparing scores with a friend.

## The six chapters (component map)

Every chapter is one engine level. "Meets" lists where the player first encounters each component.
Lesson ids are the Classroom deep-links; topics feed mastery exactly as in the parent spec.

| Ch | Name | Components the player meets | Topic → lesson |
|----|------|-----------------------------|----------------|
| 1 | **Signs and Buildings** | name vs object; assignment points a sign; rebinding moves a sign and leaves the building; `a = b` hangs a second sign (alias) and copies nothing; ints and strings are sealed (immutable), so `x = x + 1` builds a new lamppost; a building with no signs is demolished | `variables` → `variables_intro` |
| 2 | **Lockers** | lists are open buildings (mutable); mutation through any alias changes the one building; `append`, `a[i] = v`, `+=` mutate in place; `a + b` and `a[:]`/`list(a)` build a new row (shallow copy); `is` vs `==` on two rows with equal contents | `lists` → `lists` |
| 3 | **Sealed Vaults** | tuples are sealed buildings whose slots still point at other buildings; `t[0].append(..)` works because the slot's target is open; `t[0] = ..` fails (TypeError shown as a locked door); tuple vs list of same contents under `==` and `is`; `None` is a single building the whole city shares | `ds_tuples` → `ds_tuples` |
| 4 | **Nested Streets** | a list of lists: outer slots point at inner rows; shallow copy duplicates the outer row only, so inner rows stay shared; `copy.deepcopy` rebuilds the whole street; dict values are slots too (`d["k"]` shares the same rules) | `ds_nested` → `ds_nested` |
| 5 | **Districts** | a call opens a district (frame); parameters are new signs pointing at the caller's buildings; rebinding a parameter moves a district sign only; mutating through it changes the shared building; `return` points a caller sign at a building and demolishes the district; `global` reaches the main district; a mutable default argument is one building owned by the function sign and shared across calls | `functions_scope` → `functions_scope`; default-argument items: `functions_args` → `functions_args` |
| 6 | **Demolition Crew** | `del x` removes a sign, not a building; a building is demolished the moment its last reference goes (reference counting); references from container slots count; two rows pointing at each other with no signs form a cycle that reference counting cannot free, demolished only by the crew's sweep (`gc.collect`) | `functions_scope` → `closures_scope` (python_intermediate) for frames; `lists` for the cycle items |

Chapter 6's "sweep" item is the one place the city shows something the player cannot deduce from
the picture alone; the explain text says so and names `gc`.

## Experience

### Entering

The Play card for Memory Lane shows the chapter strip (six small tiles, filled as the learner
reaches ≥ 80 % in that chapter at least once) instead of the bare level number; "Play" opens the
next unfilled chapter (falls back to the engine's suggested level). The learner may tap any tile:
chapters are *not* locked (founder decision 1 below, defaulted to open). Daily challenge uses
chapter 2 (engine `DAILY_LEVEL = 2`), unchanged.

### One item (one mystery line)

An item is a short program (4–9 lines) plus the index of one mystery line. Layout, phone first,
stacked: **program panel** on top (monospace, lines numbered, executed lines dimmed, the mystery
line highlighted with a "?" gutter mark), **city** below, **question bar** fixed at the bottom
of the game area with the submit button. Desktop puts program left, city right.

1. **Run-up.** The city animates lines 1..k one by one (about 450 ms each, a progress scrubber
   under the program lets the player drag back and forth over the executed lines; dragging is
   the inspect-the-past affordance). Reduced motion: the city appears in the state after line k
   and the scrubber still works, without transitions.
2. **Predict.** The question bar states the task for the mystery line. Five question kinds:
   - **Point the sign** — "After this line, where does `b` point?" The player taps a building,
     or the dashed *New building* lot. Answer: a building label or `new`.
   - **Who changes?** — "Tap every building whose contents change." Multi-select buildings;
     none is a valid answer ("Nothing changes" button). Answer: a set of labels.
   - **Same building?** — "Is `a is b` True? Is `a == b` True?" Two toggles. Answer: `[is, eq]`.
   - **Who gets demolished?** — multi-select buildings (or none). Answer: a set of labels.
   - **What's inside?** — "What does building B contain after this line?" Three or four rendered
     mini-buildings to choose from. Answer: an index.
   Submit is disabled until the task is answerable; Enter submits.
3. **Reveal.** The server grades and returns the true post-state. The city animates to it (signs
   slide along the street, locker doors flip to new values, a sealed door shakes on a TypeError,
   demolished buildings crumble to a dashed outline then vanish). Right/wrong banner, then the
   **Explain** card: component name (e.g. "Aliasing"), the two-to-four sentence rule written for
   this exact state (mentions the names in the program), and the standard chips "Open lesson",
   "Ask Vaathiyaar". The player can keep inspecting; Next advances.

### Inspector (inspect)

Tap or focus-and-Enter on any building or sign opens a bottom sheet (desktop: side card):

- Building: label (`B`), Python type, city word ("open locker row" / "sealed vault" /
  "lamppost" / "billboard" / "pigeon-hole wall" / "empty lot" for `None` / "depot" for a function
  object), contents as Python repr with slot targets shown as labels, **references: n** ("2 signs,
  1 slot"), district(s) of the signs, and `id()` as recorded by the interpreter with the note
  "numbers differ between runs; the label is what matters".
- Sign: name, district, points at label, and every other sign on the same building ("`a` and `b`
  are the same building").
- The sheet is non-modal and never blocks the question bar; shortcuts from the parent engine are
  suppressed while it is open (uses the existing `shortcutsBlocked` rule).

### Results

Standard engine results screen, plus one line "Chapter N: 5 of 6 — chapter complete" when
accuracy ≥ 80 %. "Play again (harder)" moves to the next chapter as the engine already does.

### Accessibility and motion

- Every building and sign is a focusable button with a full-sentence `aria-label` ("list B,
  2 references, contains 1, 2, 3"). Multi-select is `aria-pressed`. The city has a visually hidden
  text rendering of the state for screen readers, updated per step.
- State is never conveyed by colour alone: sealed buildings have a padlock glyph and a solid
  frame; open buildings have visible slot cells; demolished buildings are dashed and struck.
- Reduced motion (project `useReducedMotion`) replaces slides and crumbles with instant swaps and
  keeps the scrubber.
- Touch targets ≥ 44 px; the question bar never covers a building (the city scrolls above it).

### Art direction (the one bold element)

Spend the boldness on the **city itself**; keep chrome quiet (the engine's shell and cards).

- **Building vocabulary**, one silhouette per type, drawn as inline SVG components: int/float =
  lamppost with the value on its lamp; str = billboard with the text; list = horizontal row of
  lockers, one cell per element, open fronts; tuple = the same row inside a solid vault frame with
  a padlock; dict = pigeon-hole wall with key tags; set = a fenced yard of loose crates; `None` =
  an empty lot with a sign "None"; function = depot with the function name on the door; class
  instance = house with the class name. Slot targets are drawn as short arrows to other buildings
  when both are visible, else as the target's label inside the slot.
- **Signs** are brass plaques on a post, clustered at the building's door; the sign post is
  coloured by district (main = the app accent; each call district gets a distinct hue from a
  three-colour cycle with a district stripe behind its buildings).
- **Palette**: the app's tokens for surfaces and text; game-specific tokens for asphalt
  (street lines), brass (signs), sealed (vault frame) and demolition (dashed warning). Both themes
  defined; verified light and dark.
- **Motion language**: one easing for every movement (the app's existing curve), sign moves
  slide along the street; mutations flip the cell; demolition crumbles; nothing animates on page
  load except the run-up. Optional tick sounds (success/fail via a two-oscillator WebAudio blip),
  **off by default**, toggle in the shell footer, remembered per device.
- Typography: the program panel and all values in the app mono; building labels in the display
  face.

## Content

### Bank

`backend/games/banks/memory_lane.json`, built by `python games/build_banks.py memory_lane` from
`backend/games/templates/memory_lane.py`, which holds the authored puzzles: for each puzzle its
Python source, the chapter, the mystery lines (1–3 per program) each with question kind, prompt
text, `why` (one line, reveal banner), `explain` (2–4 sentences), misconception tag, lesson id,
and topic. Because an item's public `before` snapshots reveal the outcome of every earlier line of the same
program, **a round deals at most one item per program**: items carry a `group` (the program id)
and `engine.pick_items` skips an item whose group is already in the round (my call after the
builder check; the alternative of revealing items one at a time would change the round model).
So each chapter needs more programs than items per round. Target **≥ 9 programs per chapter,
≥ 54 programs, ≥ 80 items** (chapters 2 and 5 are the richest, ≥ 16 items each). Every program
runs in under 10 ms and uses only `copy`, `gc`, built-ins.

### Snapshot capture (the truth source)

`backend/games/memory_trace.py` runs a program source under `sys.settrace` and records, **after
each top-level or function-body line**, a snapshot:

```
{
  "line": 3,                          # 1-based line just executed
  "event": "line" | "call" | "return" | "exception",
  "frames": [ {"name": "main"|"f", "names": {"a": "A", "b": "A"}} ],   # bottom to top
  "objects": {
    "A": {"type": "list", "mutable": true, "repr": "[1, 2]", "slots": ["lit:1", "lit:2"], "id": 1403...},
    ...
  },
  "demolished": ["C"],                # labels freed by this line under CPython's rule (see below)
  "cyclic": ["D", "E"],               # unreachable but kept alive by a cycle until gc.collect()
  "error": null | {"type": "TypeError", "message": "..."}
}
```

Rules: labels are assigned in order of first appearance (A, B, C…), stable across the program;
an immutable value (int, float, str, bool, `None`) becomes a building only when a *name* points
at it directly or the template marks it `expand: true`; inside container slots it is drawn inline
as `lit:` so a list `[1, 2]` is two cells with values, not two lampposts. Labels follow object
identity, which means the interpreter's own sharing of small ints and interned strings would
surface wherever a program triggers it. **My call after the builder check:** the build *fails* on
any unplanned sharing of an immutable building (two names on one lamppost or billboard) unless
the template declares `shared_ok: true` for that puzzle; authors avoid it by choosing values
outside the small-int cache (for example 300, 1000) and strings with spaces. Only the explicit
small-int item (founder decision 3) opts in. `None` is always shared and always declared. Reachability is computed by walking frames' locals and
globals via `gc.get_referents`, restricted to objects created by the program (module-level
imports and builtins excluded).

**Demolition rule (my call after the builder check).** The tracer must hold references to label
objects, so it cannot observe real freeing, and real `id` reuse is not reproducible run to run.
Instead, demolition is *derived* from the recorded reference graph by CPython's documented rule:
after each line, take the objects unreachable from any frame; repeatedly remove those with no
remaining references from still-alive objects (reference count reaches zero, freed immediately);
whatever survives that fixpoint is kept alive by a cycle and is listed as `cyclic` until a
`gc.collect()` line, which demolishes everything cyclic. This is deterministic and matches what
the interpreter does; the tracer tests cross-check it with weak references on objects that
support them (class instances), asserting they die exactly when the rule says. The "`id` reuse"
idea is dropped. Cycle items record `gc.collect()` as an explicit program line so the sweep is a
visible step, and on the `del` line before it the right answer to "Who gets demolished?" is
"Nothing" (misconception `cycle_needs_sweep`). The inspector shows cyclic buildings with a
"waiting for the sweep" badge.

The build fails loudly if: a program raises anywhere except a line explicitly marked
`expect_error`; a mystery line's answer cannot be derived from the snapshots; two items in a
chapter are byte-identical; or any `explain` text is under 120 characters.

### Item shape

Public (sent to the client): `id`, `level`, `topic`, `kind` ∈ {`point`, `changed`, `identity`,
`demolished`, `contents`}, `prompt` {`code`, `mystery_line`, `question`, `subject` (name or
label the question is about), `choices` (for `contents`: rendered snapshot fragments)}, and
`before`: the list of snapshots for lines 1..k. Private (`PRIVATE_FIELDS`): `answer`, `why`,
`explain`, `misconception`, `lesson_id`, `after` (snapshots for the mystery line and, on a
`return`, the frame pop). The reveal returns `after`, `explain` and `component` alongside the
existing `answer` and `why`.

### Scoring

`engine.score_item` gains the four new kinds (`contents` reuses `choice`): `point` exact match of
label or `new` (1 point); `changed` and `demolished` exact set equality (1 point; the empty set
is a legitimate answer); `identity` 2 points, one per toggle, so `is`/`==` confusion is visible
in the per-item breakdown. Misconception tags (closed list, read by the adaptive summariser):
`assignment_copies`, `alias_mutation_missed`, `rebind_vs_mutate`, `shallow_copy_shares_inner`,
`tuple_slots_frozen`, `is_vs_eq`, `param_rebind_reaches_caller`, `del_destroys_object`,
`default_arg_fresh_each_call`, `cycle_needs_sweep`.

## Architecture

### Backend

- `backend/games/memory_trace.py` — `trace_program(source: str) -> list[Snapshot]`; pure, no I/O;
  unit-tested against hand-checked programs (aliasing, rebinding, call/return, default arg, cycle).
- `backend/games/templates/memory_lane.py` — authored puzzles; `build_items() -> list[dict]`
  calls the tracer and derives each answer from the snapshots (never hand-typed), e.g. `point` =
  `after.frames[-1].names[subject]`, `changed` = labels whose `repr` differs, `demolished` =
  `after.demolished`, `identity` = `[names[a] == names[b], eval-free equality from reprs]`
  (equality is derived by executing `a == b` inside the traced program as a marked helper line, so
  no repr comparison is trusted).
- `backend/games/build_banks.py` — add `memory_lane`.
- `backend/games/catalog.py` — `memory_lane` entry: `kind: "bank"`, `levels: 6`,
  `items_per_round: 6`, topics `["variables", "lists", "ds_tuples", "ds_nested",
  "functions_scope", "functions_args"]`, `chapters: [names…]` (new optional key, surfaced by
  `/api/play/catalog`).
- `backend/games/engine.py` — new kinds in `score_item`; `PRIVATE_FIELDS` + `"after"`, `"explain"`;
  `pick_items` honours an optional item `group` (at most one item per group per round; existing
  banks have no groups and are unaffected).
- `backend/routes/play.py` — reveal includes `after`, `explain`, `component`; `/stats` adds
  `chapters_done: [bool×6]` per game from `game_rounds` (max accuracy per level ≥ 0.8).
- Tests: `tests/test_memory_trace.py` (≥ 10 cases incl. cycle and default argument),
  `tests/test_bank_memory_lane.py` (every item's answer re-derived from a fresh trace equals the
  stored one; counts per chapter; explain length; no duplicate programs), engine kind tests,
  route reveal test.

### Frontend (`frontend/src/games/memory-lane/`)

- `city/` — `Building.jsx` (per-type SVG silhouettes), `Sign.jsx`, `District.jsx`, `City.jsx`
  (lays out districts top-to-bottom, buildings in a wrap grid, draws slot arrows in an SVG
  overlay when both ends are on screen), `Inspector.jsx` (bottom sheet), `layout.js` (pure:
  snapshot → positioned nodes; unit-tested), `diff.js` (pure: two snapshots → moved signs,
  changed cells, demolished labels; unit-tested and the thing the animation is driven by).
- `Game.jsx` — program panel + scrubber + City + question bar; builds the response for the five
  kinds; receives `reveal` and animates `before[k] → after` via `diff.js`.
- `Explain.jsx` — the explain card rendered inside the engine `Reveal` when `revealItem.explain`
  exists (engine change: `Reveal` renders an optional `extra` slot; other games unaffected).
- `sound.js` — optional ticks; `useSoundPref` with localStorage key `pm_play_sound`.
- Play card: `Play.jsx` renders the chapter strip when the catalog entry has `chapters` and the
  stats carry `chapters_done`.
- Tests: `layout.test.js`, `diff.test.js`, `memoryLaneGame.test.jsx` (each question kind submits
  the right response shape; reveal animates to the after state; inspector opens via keyboard;
  reduced motion path), `explain.test.jsx`.
- Performance budget: game chunk < 70 kB gzipped; a city of ≤ 12 buildings and ≤ 12 signs; all
  motion via transforms/opacity (framer-motion `layoutId` for signs).

### i18n

All UI strings through `play.*`/`lane.*` keys in the eight files; English and Tamil written,
others fall back. Puzzle `prompt.question`, `why`, `explain` are English in this release
(parent decision 4 held); Tamil content is a follow-up once the texts are stable.

## Quality bar (wave 3)

- Component map above is the checklist: every listed component appears in at least one item,
  verified by a bank test that asserts the set of `component` values per chapter.
- Live verification per the standing directive: every chapter played in PyMastersBrowser desktop
  and at 400 px headless, light and dark, keyboard-only once; inspector on every building type;
  reveal animation checked against the program by hand for ten random items.
- Performance: Chrome DevTools performance trace on the run-up and a reveal at 4× CPU slowdown
  shows no frame > 32 ms (approximates a mid-range Android).
- Playtest: the roadmap asks for five learners with think-aloud notes before release. That needs
  people; **founder-side item**. Until then, release behind the existing `PLAY_ENABLED` flag path
  (on), and log a note in the ledger that the playtest is outstanding.
- Retention: `/api/admin/vaathiyaar/adaptive` already exposes game evidence; add a one-line
  admin stat "players who returned within 7 days" per game to `/api/play/stats?admin=1` for the
  two-week review.

## Rollout

1. Tracer + bank + engine kinds + reveal fields (backend only), tests, deploy (no UI change yet).
2. City renderer + Game + Inspector + Explain, chapters 1–3 content live.
3. Chapters 4–6, Play card chapter strip, admin retention stat, Tamil UI strings.
Each step through CI → VM timer, live-verified before the next (standing directive).

## Calls made after the builder check (not founder decisions)

- Demolition is derived from the recorded graph by the reference-counting rule plus an explicit
  cycle set; the `id`-reuse item is dropped (not reproducible).
- Immutables are buildings only when named directly; unplanned sharing of immutables fails the
  build unless the puzzle opts in.
- One item per program per round, enforced in the engine's sampler; authoring target raised to
  ≥ 9 programs per chapter.

## Open decisions for the founder

1. **Chapter locking**: open (my default: any chapter playable, progress strip shows completion)
   or strict campaign (chapter N+1 unlocks at ≥ 80 % in N)?
2. **Sound ticks**: ship the optional off-by-default ticks (my default) or leave sound out entirely?
3. **Small-int caching**: include one chapter-1 item showing `a = 5; b = 5; a is b` is True
   with an explain that names it a CPython detail (my default: include, it is the question every
   learner eventually asks), or keep `is` puzzles to lists and `None` only?

## Left to the builder

Exact SVG shapes and sizes; the layout algorithm's grid breakpoints; the scrubber's control
(native range input preferred); whether `diff.js` emits an ordered animation script or the
components derive their own transitions; mono/display font sizes; the precise copy of
`aria-label`s; the set of 36+ programs (the component map and misconception list are the
constraints; the builder authors programs that produce each listed state, and the tracer proves
them).
