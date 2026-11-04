# Visual clarity foundation — design

Date: 2026-11-04 · Status: approved by the owner ("approve the visual redesign … proceed without any interruption")
Part 1 of the visual-learning USP ("detail explanation of how each topic works is the USP"). Part 2 — under-the-hood
walkthroughs and "visualize my code" in every lesson — gets its own spec once this ships.

## Why

The owner: "the existing visual explanations in each components needs to be enhanced as they are not clear and ux of
the visuals needs enhancements." The 2026-11-04 audit (schema scan of all 527 lessons + live checks) found that the
lesson visuals often do not show what the author wrote:

| Defect | Lessons |
|---|---|
| `description` / `caption` / `title` on a primitive is discarded (ComparisonPanel even `delete`s it) | ~450 steps |
| FlowArrow `stages` / `steps` (the actual pipeline) ignored; only `from`→`to` drawn | ~150 |
| FlowDiagram nodes given as plain strings render as blank boxes | 12 |
| ComparisonPanel `{left:{result}, right:{result}}` renders as "Result: false / Result: true" with no meaning | ~40 |
| ComparisonPanel paints left red / right green even for neutral A-vs-B comparisons | all 325 |
| Code views drop indentation (lines rendered without `white-space: pre`) | every code view |
| LoopVisualizer `loopVariable`, `iterable`, `title` ignored | ~15 |
| DataStructure `structure_type`, `caption`, `highlight_cells` ignored | ~50 |
| VariableBox `data_type` deleted (the type is the lesson) | 148 |
| Explains/ScrollyBody on short screens: sticky visual covers 59 % of a 660 px window, active text sits under it | every essay + lesson intro |

There is no automated check that a visual shows its content, so each fix regressed silently before.

## Goal and success criteria

Every lesson visual shows everything its author wrote, legibly, on a phone and a laptop, in light and dark mode, and a
learner can step through it at their own pace.

1. **Nothing silently dropped.** For every primitive in every lesson JSON, every authored key is either consumed by
   the component (after normalisation) or on a short, named allowlist of non-content keys. A CI test enforces this.
2. **Every visual says what it shows.** A primitive's `title` / `description` / `caption` renders as a caption
   (title above, description below) via one shared component.
3. **Specific shapes render correctly:** FlowArrow stages as a labelled chain; FlowDiagram string nodes labelled;
   comparison results shown with their code/value, neutral colouring unless the author marks a right/wrong pair;
   indentation preserved; LoopVisualizer/DataStructure/VariableBox show the ignored fields above.
4. **Learner-paced playback.** Step-based visuals (ExecutionVisualizer, CodeStepper, LoopVisualizer, FlowDiagram,
   FlowArrow stages) get one shared control bar: play/pause, previous, next, restart, speed 0.5×/1×/2×, a step
   counter; keyboard ←/→/Space; `prefers-reduced-motion` starts paused and never autoplays.
5. **Legible everywhere.** Text in visuals ≥ 12 px and ≥ 4.5:1 contrast in light and dark mode; at 390 px wide no
   visual overflows the page (a visual may scroll inside its own box).
6. **No overlap on short screens.** Below the `lg` breakpoint ScrollyBody stacks each step as visual-then-text (the
   visual for step *i* rendered with `stepIndex = i`), so text is never under a sticky visual. Desktop keeps the
   sticky two-column layout.

## Design

### A. Data contract + normaliser (frontend/src/components/animations)

- Split `normalizeProps` out of `AnimationRenderer.jsx` into `normalize.js` (pure, no React), one function per
  primitive type, same exported name. Each returns the component's props **plus** `caption: {title, description}`.
- `CONTRACT` (in `normalize.js`): per type, the authored keys it consumes, and a shared `NON_CONTENT_KEYS` allowlist
  (`id`, `type`, `duration_ms`, `duration`, `speed`, `color`, `sync_with`, `animated`, `trigger`, `style`, `theme`).
  Any other key that a normaliser does not map is a contract failure.
- Shape fixes (each with a unit test using a real lesson's shape):
  - FlowArrow: `stages`/`steps` (strings or `{label|name|title, description?}`) → `stages: [{label, detail}]`;
    the component renders a wrapped chain of stage pills with arrows (vertical on phones); `from`/`to`/`label` still
    supported as a two-stage chain; `branch` → arrow label.
  - FlowDiagram: string nodes → `{id: slug, label}`; edges referring to labels resolve to those ids.
  - ComparisonPanel: `left/right.result` → `code` (if present) + a result line `→ <result>`; a side with only a
    result shows the label and the value large; `tone: "neutral" | "before_after"` — `before_after` (red/green) only
    when the author wrote `before`/`after` or labels like Before/After/Wrong/Right/Bad/Good; otherwise neutral
    (both sides accent-coloured). `description` goes to the caption, not deleted.
  - LoopVisualizer: `loopVariable` → `variable`, `iterable` (string expression or list) → `collection`/code line,
    `expression`/`result` → shown under the loop as the accumulated result.
  - DataStructure: `structure_type` → `structure`, `caption` → caption, `highlight_cells`/`initial_state`/`labels`
    consumed.
  - VariableBox: `data_type` → a type badge (`int`, `str`, …); `color` stays non-content.
  - ConceptMap / TerminalOutput / StoryCard: `description`/`title` → caption.

### B. Shared UI pieces

- `VisualCaption` — title (semibold, text-primary) above, description (text-secondary, 14 px) below; renders nothing
  when both are empty. Used by AnimationRenderer, LessonFlowVisual and the Watch It Run popup.
- `VisualControls` — the control bar of goal 4. Controlled: `{step, total, playing, speed, onStep, onPlay,
  onSpeed}`; keyboard handled on the focused visual container (not window-global, so two visuals on a page do not
  fight). Uses existing tokens; 44 px targets; `aria-label`s; the step counter is `aria-live="polite"`.
- `useStepPlayback(total, {speed, reducedMotion})` — the timer behind play/pause; components that already accept
  `controlledStep` are driven by it (no new animation engine).
- Code lines in ExecutionVisualizer, CodeStepper, LoopVisualizer render inside `whitespace-pre`.

### C. Layout

- ScrollyBody (`components/ScrollyExplain.jsx`): `useMediaQuery('(min-width: 1024px)')`; below it, render
  `steps.map((s, i) => <Visual stepIndex={i}/> + text)` stacked, visual height `clamp(220px, 40vh, 320px)`; no
  IntersectionObserver on that path. Reduced-motion path unchanged.
- Watch It Run popup: each primitive wrapped as `VisualCaption` + component + `VisualControls` (when step-based).

### D. Tests (all TDD: each test seen failing on main first)

1. `normalize.contract.test.js` (vitest): loads every `backend/lessons/**/*.json`, normalises every primitive, and
   asserts no authored key outside the consumed set / allowlist is left unmapped. Fails today with the counts above.
2. Unit tests per shape fix (fixtures copied from real lessons, named in the test).
3. `visuals.render.test.jsx` (vitest + jsdom): for one representative primitive per (type, shape) found in the
   lessons, render the component and assert: no throw, non-empty text, no `[object Object]`, `undefined`, `NaN`,
   or bare `Result: true/false`; caption text present when authored.
4. Tier-1 scenario `test_ux_lesson_visuals.py` (Playwright, 390×844 and 1440×900, light and dark): open a lesson
   with each step-based type, Watch It Run → caption visible, controls work by keyboard, indentation preserved
   (leading spaces measured), no page-level horizontal overflow, caption/label contrast ≥ 4.5:1.
5. Tier-1 scenario for ScrollyBody at 390×660: in Explains (gradient-descent) and a lesson intro, every step's
   heading is the topmost element at its own position when scrolled into view.
6. After deploy: live sweep in the owner's Chrome — one lesson per primitive type, phone-width window where
   possible, results recorded in ops/laptop reports.

## Out of scope

New visual content per lesson, the under-the-hood walkthrough format, and running the learner's own code in lesson
visuals (part 2). Re-authoring lesson JSON is out of scope unless a shape cannot be normalised; such lessons are
listed by the contract test and fixed in the content round.

## Risks

- Normaliser changes touch every lesson: guarded by tests 1–3 over all 527 lessons before merge.
- Stacked mobile layout renders N visuals per page: visuals are SVG/DOM, N ≤ ~8; measured in test 5 (page must stay
  responsive), and only below `lg`.
