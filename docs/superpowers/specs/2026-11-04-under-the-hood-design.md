# Under the hood — design

Date: 2026-11-04 · Status: approved under the owner's standing approval ("consider that i approve all and proceed
without any interruption"). Part 2b of the visual-learning USP ("detail explanation of how each topic works is the
USP"; owner picks: under-the-hood walkthrough, visualize MY code, every lesson with consistent depth). Part 1 (visual
clarity, PR #255) and "Visualize my code" (PR #258) are live.

## Understanding

- **Outcome:** in every lesson, a learner can open **Under the hood** and watch what Python actually does when the
  lesson's example runs — names bound to objects, a new object vs the same object, in-place mutation vs rebinding,
  two names sharing one object, call frames pushed and popped, values returned — one step at a time, with a plain
  sentence explaining each step in English or Tamil.
- **Consistent depth:** the same view, structure and vocabulary in every lesson, generated from running the code —
  not hand-written per lesson.
- **Also for the learner's own code:** the same view as a tab in the Time-travel visualizer ("Visualize my code").
- **Success:** ≥ 95 % of lessons with example code produce a working Under-the-hood view (measured by a CI test over
  every lesson); every step has an explanation sentence; verified live in the owner's browser.
- Measured: 520 of 524 lessons carry example code in `animation_sequence` (286 have an ExecutionVisualizer).

## Approaches considered

1. **Tracer-driven object model + rule-based explanations (chosen).** Deterministic, consistent across all lessons,
   testable, no per-lesson authoring, works for the learner's own code.
2. LLM-written "how it works" essays per lesson rendered with existing visuals — rich but inconsistent quality, costly
   QA for 527 lessons, slow to land. Rejected for now.
3. Hybrid (1 + short per-topic "why it works this way" notes) — the notes are a later, separate content task.

## Design

### A. Tracer v2 — object model (backend/vaathiyaar/tracer.py, `mode="heap"`)
- Same sandbox, limits and endpoint family as today. `trace_code(code, mode="steps"|"heap")`; `"steps"` output is
  unchanged (TraceViewer keeps working).
- `"heap"` adds per step:
  - `frames`: `[{func, depth, names: {name: ref}}]` for user frames only, innermost last.
  - `objects`: `{ref: {type, repr, mutable: bool, items?: [ref|repr]}}` for objects reachable from those names
    (containers expanded one level; ≤ 30 objects per step; ≤ 20 items per container). `ref` is a stable short label
    (`o1`, `o2`, … in order of first sight) — never a memory address.
  - `events`: list of `{kind, name?, ref?, from?, to?, func?}` derived by diffing with the previous step, kinds:
    `new_object`, `bind` (name → new ref), `rebind` (name moved to another ref), `alias` (name bound to a ref another
    name already holds), `mutate` (same ref, changed content), `call` (frame pushed), `return` (frame popped, value
    ref), `unbind` (name gone), `exception`.
- Primitive immutables (int, float, str, bool, None, tuple of immutables) are objects too (so `x = x + 1` shows a new
  object), but small ints/interned strings are not specially explained beyond "a new value object".

### B. Explanations (frontend, i18n)
- `explainEvent(event, lang) -> string` with one template per event kind in `en` and `ta` (frontend/src/i18n keys
  `uth.<kind>`), e.g. alias: "`b = a` does not copy — `b` now points to the same list object as `a`."; mutate: "The
  list object itself changed (same object, new contents) — every name pointing to it sees the change.";
  rebind: "`x` now points to a different object; the old one is untouched."
- Step headline = the most important event (priority: exception > alias > mutate > rebind > new_object > call/return).

### C. Lesson source code + API
- `GET /api/classroom/lesson/{lesson_id}/under-the-hood` (auth + learning access as other lesson routes): picks the
  lesson's example code (first ExecutionVisualizer `code`, else first CodeStepper code / joined `steps` lines, else
  first code-bearing primitive), runs `trace_code(mode="heap")`, caches the result in memory keyed by
  `(lesson_id, sha256(code))`. 404 when the lesson has no example code.
- `POST /api/playground/trace` accepts `mode: "heap"` for the learner's own code (same rate limit as today).

### D. UI
- `UnderTheHood` component (frontend/src/components/animations/UnderTheHood.jsx): left = code with the current line
  highlighted (`whitespace-pre`); right = **Names** column (per frame, innermost on top) with arrows to **Objects**
  boxes (type badge, value / items, mutated objects flash once; alias = two arrows into one box); bottom = the step's
  explanation sentence(s) + `VisualControls` (reuse). Reduced motion: no flashes, no autoplay.
- Lesson intro: an "Under the hood" button next to "Watch It Run" opens it in the same dark popup. Hidden when the
  API returns 404.
- TraceViewer ("Visualize my code"): tabs "Steps" | "Under the hood"; the second tab fetches `mode: "heap"` lazily.
- Phones (< 640 px): names above objects; arrows replaced by matching ref chips (`o3`) so nothing overflows.
- Text ≥ 12 px, ≥ 4.5:1 in light and dark, 44 px targets.

### E. Tests
1. Backend unit tests (`backend/tests/test_tracer_heap.py`): alias (`b = a` on a list), mutate (`a.append`), rebind
   (`x = x + 1`), call/return with frames, exception, limits (≤ 30 objects, step cap), refs stable across steps, no
   addresses in output, `mode="steps"` output unchanged.
2. Backend coverage test: every lesson with example code returns a heap trace without tracer error (lessons whose
   example legitimately needs files/network are listed explicitly) — ≥ 95 % of lessons.
3. Frontend: `explainEvent` for every kind in en and ta; `UnderTheHood` render test from a recorded heap trace (names,
   objects, alias arrow/chip, explanation); headline priority.
4. Tier-1 scenario: lesson `lists` (or another list/alias lesson): open Under the hood, step to the alias/mutation step,
   see the explanation; 390 px no page overflow; contrast ≥ 4.5 light/dark.
5. Live check in the owner's browser after deploy.

## Out of scope
Per-topic "why Python works this way" essays; bytecode/disassembly views; memory-size accounting; C-level internals.

## Risks
- Tracing cost on the 1 GB VM: heap mode is heavier — cap objects/steps, cache per lesson, reuse the sandbox lock.
- Some lesson examples import heavy libs (numpy/pandas) — objects shown as type + short repr only; heavy-import timeout
  already exists (25 s).
