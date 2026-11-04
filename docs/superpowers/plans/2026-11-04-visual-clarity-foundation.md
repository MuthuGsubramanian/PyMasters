# Visual Clarity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lesson visual shows everything its author wrote, legibly at 390 px and 1440 px in light and dark mode, with learner-paced step controls.

**Architecture:** Pull lesson-JSON normalisation out of `AnimationRenderer.jsx` into a pure `normalize.js` with a per-type data contract enforced by a test over all lesson files; add two shared UI pieces (`VisualCaption`, `VisualControls` + `useStepPlayback`) and wire them into the Watch It Run popup and the scroll-synced intro; make `ScrollyBody` stack visual-then-text below `lg`.

**Tech Stack:** React 18 + Vite, Tailwind tokens from `frontend/src/index.css`, framer-motion/anime already in the components, vitest + jsdom (`frontend/src/**/__tests__`), Playwright tier-1 scenarios (`ops/e2e/scenarios`).

**Spec:** `docs/superpowers/specs/2026-11-04-visual-clarity-foundation-design.md`

## Global Constraints

- Frontend test command (run from the worktree root; the worktree has no node_modules):
  `~/pymasters-ops/heavy podman run --rm -v "$PWD":/app -v ~/Documents/Development/PyMasters/frontend/node_modules:/app/frontend/node_modules -w /app/frontend docker.io/library/node:20-alpine npx vitest run <path>` — call this `VITEST <path>` below. One heavy job at a time (laptop overheats).
- Scenario tests run only in CI (tier-1 gate on the PR); never build the image locally.
- Text in visuals ≥ 12 px (`text-xs` minimum; no `text-[10px]`/`text-[11px]` for content) and ≥ 4.5:1 contrast in light and dark.
- At 390 px no visual may make the page scroll horizontally; a visual may scroll inside its own box (`overflow-x-auto`).
- `NON_CONTENT_KEYS` = `id, type, duration_ms, duration, speed, color, sync_with, animated, trigger, style, theme`.
- Locale maps (`{"en": …, "ta": …}`) resolve to the learner's language, falling back to `en`.
- `prefers-reduced-motion`: never autoplay; start paused.
- Keep existing exported names working: `normalizeProps` stays importable from `components/animations/AnimationRenderer` (re-export).
- Match surrounding code style (4-space indent in pages, 2-space in animations components as they are now).

## Review Focus

1. A `ta` learner on a lesson whose captions exist only in `en` → caption shows the English text, never `[object Object]` or blank. (Task 2 test)
2. Arrow keys typed inside the practice code editor or any input must not step a visual. (Task 7 test)
3. FlowArrow with a single stage or an empty `stages` list → renders the label/`from`→`to` fallback, never an empty box. (Task 3 test)
4. A 200-character code line at 390 px → the code box scrolls, the page does not. (Task 10 scenario)
5. Two step-based visuals on one page (stacked mobile Scrolly) → controls of one do not move the other. (Task 7 test)

---

### Task 1: Extract `normalize.js` and add the data-contract test

**Files:**
- Create: `frontend/src/components/animations/normalize.js`
- Modify: `frontend/src/components/animations/AnimationRenderer.jsx` (remove the `normalizeProps` body; `export { normalizeProps } from './normalize'`)
- Test: `frontend/src/__tests__/normalize.contract.test.js`

**Interfaces:**
- Produces: `normalizeProps(type: string, raw: object, language: string) => object` (same behaviour as today); `droppedKeys(type: string, raw: object) => string[]` — authored keys of `raw` that the normaliser for `type` neither maps to a component prop nor lists in `NON_CONTENT_KEYS`; `CONTRACT: Record<CanonicalType, {consumes: string[]}>`; `canonicalType(type) => string` (maps snake_case and `Terminal` aliases to the PascalCase names in `PRIMITIVE_MAP`); `NON_CONTENT_KEYS: Set<string>`.

- [ ] **Step 1: Write the contract test.** It globs `../../../backend/lessons/**/*.json` (use `import.meta.glob(..., {eager: true, import: 'default'})` or `fs` + `path` from the test file), collects every `animation_sequence` primitive (props from `.props` or the primitive minus `type`/`sync_with`), and for each canonical type asserts that the set of dropped keys across all lessons equals `KNOWN_GAPS[type]` exactly. Start `KNOWN_GAPS` as the measured current gaps (print them once, paste them in, sorted). Also assert `normalizeProps` is still importable from `AnimationRenderer`.
- [ ] **Step 2: Run** `VITEST src/__tests__/normalize.contract.test.js` — Expected: FAIL (`normalize.js` missing).
- [ ] **Step 3: Implement `normalize.js`** by moving the existing normalisation verbatim, splitting into one function per type, and adding `CONTRACT`/`droppedKeys`. No behaviour change.
- [ ] **Step 4: Run** the contract test and `VITEST src/__tests__/animationNormalize.test.js` — Expected: both PASS. Then the full `VITEST` — Expected: all pass.
- [ ] **Step 5: Commit** `refactor(visuals): normalize.js with a per-type data contract over every lesson`.

### Task 2: Captions — `title`/`description`/`caption` are shown, never dropped

**Files:**
- Create: `frontend/src/components/animations/VisualCaption.jsx`
- Modify: `normalize.js` (every normaliser returns `caption: {title, description}` resolved to `language`; ComparisonPanel no longer deletes `description`), `AnimationRenderer.jsx` (wrap each primitive: `<VisualCaption {...caption}/>` above, component, description below via the same component), `pages/Classroom.jsx` `LessonFlowVisual` (render the caption of the chosen visual)
- Test: `frontend/src/__tests__/visualCaption.test.jsx`; update `KNOWN_GAPS` in the contract test

**Interfaces:**
- Consumes: Task 1 `normalizeProps`, `CONTRACT`.
- Produces: `VisualCaption({title?: string, description?: string, position?: 'above'|'below'})` → `null` when both empty; `normalizeProps(...).caption: {title: string, description: string}` (empty strings when absent; never passed to the component itself — AnimationRenderer strips it before spreading props).

- [ ] **Step 1: Write failing tests.** (a) Remove `title`, `description`, `caption` from every type in `KNOWN_GAPS`. (b) `visualCaption.test.jsx`: rendering `AnimationRenderer` with `[{type:'ComparisonPanel', left:{label:'A',code:'x'}, right:{label:'B',code:'y'}, description:{en:'Lists copy, tuples do not'}}]` shows the text `Lists copy, tuples do not`; with `language='ta'` and an `en`-only description it shows the English text (Review Focus 1); `VisualCaption` with both props empty renders nothing.
- [ ] **Step 2: Run** both tests — Expected: FAIL (dropped keys reported; caption text absent).
- [ ] **Step 3: Implement** caption extraction in `normalize.js` and `VisualCaption` (title: `text-sm font-semibold text-text-primary`; description: `text-sm text-text-secondary leading-relaxed`, max-w-prose).
- [ ] **Step 4: Run** both tests, then full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visuals): every lesson visual shows its title and description`.

### Task 3: FlowArrow stages and FlowDiagram string nodes

**Files:**
- Modify: `normalize.js`, `FlowArrow.jsx`, `FlowDiagram.jsx` (only if node shape handling needs it)
- Test: `frontend/src/__tests__/flowShapes.test.jsx`; `KNOWN_GAPS` update

**Interfaces:**
- Produces: `FlowArrow({stages?: {label: string, detail?: string}[], label?, direction?, duration?, onComplete, controlledStep?: number|null})`; normalised FlowArrow always has `stages` (from `stages`/`steps`/`nodes`/`flows`, or `[{label: from}, {label: to}]` from `from`/`to`); `branch` → arrow `label`. Normalised FlowDiagram nodes are always `{id, label}`; string nodes get `id = slug(label)` and edges whose `from`/`to` equal a label resolve to that id.

- [ ] **Step 1: Write failing tests:** a real lesson FlowArrow with `stages: ["Tokenize","Embed","Attend","Predict"]` renders those four texts in order; `steps: [{label:'Load', description:'read CSV'}]` renders `Load` and `read CSV`; `from:'A', to:'B'` renders `A` and `B`; `stages: []` with `label:'Next'` renders `Next` (Review Focus 3); FlowDiagram with `nodes: ['Start','Check','End']` renders all three labels; remove `stages`, `steps`, `nodes`, `flows`, `branch` from FlowArrow and string-node gaps from FlowDiagram in `KNOWN_GAPS`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** FlowArrow renders a wrapped chain of stage pills joined by arrows (`flex-wrap` row on `sm+`, vertical column below `sm`); each pill shows `label` and, if present, `detail` in `text-xs text-text-secondary`; accepts `controlledStep` to highlight stage *i* (used by Task 7).
- [ ] **Step 4: Run** tests + full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visuals): pipelines show every stage; flow diagram nodes are labelled`.

### Task 4: ComparisonPanel — real results and honest colouring

**Files:**
- Modify: `normalize.js`, `ComparisonPanel.jsx`
- Test: `frontend/src/__tests__/comparisonPanel.test.jsx`

**Interfaces:**
- Produces: `ComparisonPanel({before: {label, code?, result?}, after: {label, code?, result?}, tone: 'neutral'|'before_after'})`. `tone` is `before_after` only when the author used `before`/`after` keys or a side label matches `/^(before|after|wrong|right|bad|good|incorrect|correct)\b/i`; otherwise `neutral`.

- [ ] **Step 1: Write failing tests:** `{left:{label:'list', code:'a = [1]\nb = a\nb.append(2)', result:'[1, 2]'}, right:{label:'tuple', result:false}}` → renders the code with indentation intact, a line `→ [1, 2]`, the right side shows `tuple` and `False` large; the text `Result: false` never appears; neutral tone → neither side has a `red`/`green` class (assert via `data-tone="neutral"` on the root); `{before:…, after:…}` → `data-tone="before_after"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Booleans render as Python spellings `True`/`False`; neutral tone uses accent tokens for both headers; `before_after` keeps red/green.
- [ ] **Step 4: Run** tests + full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visuals): comparisons show their results and only colour real before/after pairs`.

### Task 5: LoopVisualizer, DataStructure and VariableBox show their ignored fields

**Files:**
- Modify: `normalize.js`, `LoopVisualizer.jsx`, `DataStructure.jsx`, `VariableBox.jsx`
- Test: `frontend/src/__tests__/structureShapes.test.jsx`; `KNOWN_GAPS` update

**Interfaces:**
- Produces: LoopVisualizer gains `result?: string` (shown under the loop as "Result: …"), receives `variable` from `loopVariable`, `collection` from list `iterable`, and `code` line `for <var> in <iterable>:` from string `iterable`/`expression`; DataStructure receives `structure` from `structure_type`, `highlight: number[] | [number, number][]` from `highlight_cells`, initial `data` from `initial_state` when `data` absent, `labels`; VariableBox gains `dataType?: string` rendered as a small badge next to the name.

- [ ] **Step 1: Write failing tests** using one real lesson shape per component (cite the lesson id in the test name), asserting the previously ignored value appears in the rendered text; remove those keys from `KNOWN_GAPS`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the mappings and minimal rendering.
- [ ] **Step 4: Run** tests + full `VITEST` — Expected: PASS; contract test shows the remaining `KNOWN_GAPS` only for keys this spec leaves alone (list them in a comment with the reason).
- [ ] **Step 5: Commit** `feat(visuals): loops, data structures and variables show what the author wrote`.

### Task 6: Code views keep indentation

**Files:**
- Modify: `ExecutionVisualizer.jsx`, `CodeStepper.jsx`, `LoopVisualizer.jsx` (code line spans)
- Test: `frontend/src/__tests__/codeIndent.test.jsx`

- [ ] **Step 1: Write failing test:** render each of the three with code `for i in range(3):\n    total += i`; assert the element holding line 2 has computed/class `whitespace-pre` and its text starts with four spaces.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `whitespace-pre` on the code-text span (container keeps `overflow-x-auto`).
- [ ] **Step 4: Run** test + full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(visuals): code in visuals keeps its indentation`.

### Task 7: Learner-paced controls

**Files:**
- Create: `frontend/src/components/animations/VisualControls.jsx`, `frontend/src/hooks/useStepPlayback.js`
- Modify: `AnimationRenderer.jsx` (for step-based types wrap the component: playback state → `controlledStep`, render `VisualControls` under it), `pages/Classroom.jsx` (Watch It Run popup uses the same wrapper)
- Test: `frontend/src/__tests__/visualControls.test.jsx`, `frontend/src/__tests__/useStepPlayback.test.js`

**Interfaces:**
- Produces: `useStepPlayback(total: number, {reducedMotion: boolean, intervalMs?: number = 1600}) => {step, playing, speed, play, pause, next, prev, restart, setSpeed}` (`step` clamped to `[0, total-1]`; playing stops at the last step; `speed ∈ {0.5,1,2}` divides the interval); `VisualControls({step, total, playing, speed, onPlay, onPause, onNext, onPrev, onRestart, onSpeed})`. Step-based types = `ExecutionVisualizer, CodeStepper, LoopVisualizer, FlowDiagram, FlowArrow` (FlowArrow only when it has ≥ 2 stages); `total` = executionSteps / highlightSequence / iterations / executionPath / stages length.

- [ ] **Step 1: Write failing tests** (fake timers): hook autoplays when `reducedMotion=false`, never when `true`; `next` at the end stays at `total-1`; speed 2 halves the interval. Controls: buttons have `aria-label`s `Previous step`, `Play`/`Pause`, `Next step`, `Restart`, and a speed toggle; the counter reads `Step 2 of 5` and is `aria-live="polite"`; ArrowRight on the focused visual container advances; ArrowRight dispatched from inside a `textarea`/`input`/`.cm-content` does not (Review Focus 2); with two wrapped visuals rendered, pressing Next on the first does not change the second's counter (Review Focus 5).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Keyboard listener on the wrapper (`tabIndex=0`, `onKeyDown`), ignoring events whose target is editable; 44 px targets; tokens from `index.css`.
- [ ] **Step 4: Run** tests + full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visuals): play, pause and step through every animated visual`.

### Task 8: ScrollyBody stacks below `lg`

**Files:**
- Create: `frontend/src/hooks/useMediaQuery.js`
- Modify: `frontend/src/components/ScrollyExplain.jsx` (`ScrollyBody`)
- Test: `frontend/src/__tests__/scrollyStacked.test.jsx`

**Interfaces:**
- Produces: `useMediaQuery(query: string) => boolean` (SSR-safe false; updates on change). `ScrollyBody({steps, Visual})` unchanged signature.

- [ ] **Step 1: Write failing test:** with `matchMedia('(min-width: 1024px)')` mocked false and 3 steps, `Visual` is rendered 3 times with `stepIndex` 0, 1, 2, each immediately followed by its step text; no element has class `sticky`; with it mocked true the existing sticky layout renders `Visual` once.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the stacked branch (visual box height `clamp(220px, 40vh, 320px)`, `panel rounded-2xl`), leaving the reduced-motion and desktop paths unchanged.
- [ ] **Step 4: Run** test + full `VITEST` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(explains): on phones each step shows its visual and text together, nothing covered`.

### Task 9: Render smoke test over every lesson

**Files:**
- Test: `frontend/src/__tests__/visuals.render.test.jsx`

- [ ] **Step 1: Write the test:** from all lesson JSON, pick one primitive per (canonical type, sorted key-set) pair; render it through `AnimationRenderer` (single-item sequence, language `en`, fake timers advanced 10 s); assert no throw, non-empty `textContent` (except ParticleEffect), and `textContent` matches none of `/\[object Object\]|\bundefined\b|\bNaN\b|Result: (true|false)\b/`.
- [ ] **Step 2: Run** — Expected: PASS if Tasks 2–6 are complete; if any case fails, fix the normaliser/component in the owning file (not the test) and note it in the ledger.
- [ ] **Step 3: Commit** `test(visuals): every lesson visual shape renders real content`.

### Task 10: Tier-1 scenarios

**Files:**
- Create: `ops/e2e/scenarios/test_ux_lesson_visuals.py`
- Modify: `ops/e2e/scenarios/test_ux_lesson_header.py` only if a selector it relies on changed

- [ ] **Step 1: Write the scenarios** (follow `test_ux_playground_layout.py` for login and contrast helpers): (a) parametrised 390×844 and 1440×900 × light/dark: open `/dashboard/classroom/variables_operators`, Watch It Run → caption or controls visible, `Next step` by keyboard changes the counter, `document.documentElement.scrollWidth <= innerWidth`, caption/label contrast ≥ 4.5, and no visible text node inside the visual has computed `font-size` < 12 px; (b) code indentation: a code line that starts with spaces in the lesson JSON has an on-screen `x` offset greater than line 1's; (c) 390×660: `/dashboard/explains/gradient-descent` — for each step heading scrolled into view, `elementFromPoint` at its centre is inside the heading; (d) 390×844: a 200-char code line inside a visual leaves `scrollWidth <= innerWidth` (Review Focus 4 — inject via a lesson whose code is long, or assert on the widest existing ExecutionVisualizer lesson).
- [ ] **Step 2: Push the branch as a draft PR** and read the tier-1 result: scenarios pass on this branch. To prove they bite, temporarily revert Task 8 locally in a scratch commit on a separate branch only if (c) cannot be shown failing otherwise — record which scenarios were seen failing on main in the PR body.
- [ ] **Step 3: Commit** `test(ux): lesson visuals readable, steppable and uncovered on phones and laptops`.

### Task 11: Ship and verify live

- [ ] **Step 1:** PR ready → CI green (backend, frontend, tier-1) → squash-merge → wait for the deploy run → `/health` build equals the merge commit.
- [ ] **Step 2:** Live sweep in the owner's Chrome (tab on pymasters.net): one lesson per step-based type and one ComparisonPanel/FlowArrow lesson; check caption, controls (keyboard), indentation; light and dark. Record pass/fail per lesson in `~/pymasters-ops/reports/live-audit-2026-11-04.md` under "Visual clarity (part 1) — live".
