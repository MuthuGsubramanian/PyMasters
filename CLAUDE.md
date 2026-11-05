# PyMasters — notes for coding agents

pymasters.net: React 18 + Vite + Tailwind frontend (`frontend/`), FastAPI backend (`backend/`), lessons as JSON in
`backend/lessons/<track>/<id>.json`. Production is one e2-micro VM; `.github/workflows/deploy.yml` tests every PR
(backend, frontend, then a Tier-1 Playwright scenario gate) and deploys `main`.

## Always
- Open a pull request; never push to `main` directly. The deploy gate only protects what goes through a PR.
- Learner code runs in a sandbox on Python **3.11** (numpy, pandas, scikit-learn, matplotlib available; no network).
- Text ≥ 12 px, contrast ≥ 4.5:1 in light and dark, 44 px touch targets, no sideways page scroll at 390 px.
- Every new i18n key goes into all 8 files in `frontend/src/i18n/` (key-parity test).

## Adding or changing a lesson
A lesson is not done until all of these exist — `backend/tests/test_every_lesson_is_complete.py` fails otherwise:

1. **A verified reference solution for every practice challenge** in `ops/e2e/solutions/<lesson_id>.json`
   (`{"lesson_id", "challenges": [{"index", "code", "verified_output", "source"}]}`, 2-space indent). Check each with
   the production grader before committing:
   `cd backend && python -c "from vaathiyaar.grading import grade_submission; ..."` — the solution must pass, and an
   empty program, `print("hi")` and the unchanged starter code must all fail.
2. **A harness that checks the learner's own names.** `test_code` must fail when run on its own; a harness that
   redoes the exercise passes any program and the grader ignores it.
3. **An `expected_output` that the correct program really prints** (run it). Avoid outputs that depend on unseeded
   randomness or library versions; prefer a `test_code` harness for numeric work.
4. **A traceable example** for "Under the hood → Python's view": a self-contained `code` in an ExecutionVisualizer /
   CodeStepper, or a top-level `uth_example` (6-30 lines, stdlib or numpy, prints something). Never a challenge answer.
5. **An `under_the_hood` "How it works" explainer**: how the topic works inside, 4-7 steps with at least 2 visuals.
   Rules and allowed visual props: `backend/vaathiyaar/topic_uth.py` (`validate_under_the_hood`). Copy visual prop
   shapes from existing lessons that use the same visual type.
6. **Facts that are true.** Run every number, output and claim you state (heap layouts, softmax weights, model sizes,
   string comparisons have all been wrong before). Never quote prices, quotas or benchmark scores you cannot verify.

Lesson files are hand-formatted: change only the values you mean to (targeted edits), then check that `json.load`
of the new file equals the old one plus your change.
