# 03 — Benchmark: PyMasters vs best-in-class learning platforms — 2026-07-29

Grounded in the live codebase (frontend/src, backend/, design-system/MASTER.md) and cited external sources.

## 1. Lesson structure & pacing

- **Brilliant:** one concept per lesson, 2–4 sentence intro + illustration, then learner *immediately asked a question*; every screen demands interaction; wrong answers trigger scaffolded nudges; 5–15 min lessons. (screensdesign.com Brilliant breakdown; skillscouter Brilliant review)
- **DataCamp:** rigid chunk contract — lesson = one 3–4 min video (300–400 word script cap) + 2–4 exercises; chapter = 3–4 lessons; course = 44–60 exercises. (DataCamp instructor guidelines)
- **PyMasters:** lesson = narrative story + ~6 scroll-synced animation_sequence steps + 1 practice challenge + 3-question quiz. Chunking is genuinely good — one concept, small quiz.
- **Delta: PyMasters' scroll steps are passive — scrolling advances the visualizer with zero comprehension checks until the single end-of-lesson challenge; Brilliant gates every screen on an answer.** Adding a 1-tap prediction prompt ("what will this print?") to 2 of 6 steps closes most of the gap.

## 2. In-browser execution feedback loop

- **freeCodeCamp / Exercism:** exercises graded by *named unit tests*, each failing test a specific actionable message; projects build incrementally "passing one test after another"; Exercism layers automated analyzers + optional human mentoring. (fCC new curriculum; Exercism docs)
- **Codecademy:** per-step "Get a hint" reads the learner's *actual code* and generates a personalized hint; dedicated "explain this error". (Codecademy AI features)
- **PyMasters:** ~397 lessons grade by exact stdout string comparison (routes/classroom.py); only AI/ML set has a test_code assertion harness. Errors render as raw red tracebacks + "Ask Vaathiyaar". Hints are pre-authored and cycle (`hintIndex % hints.length`) — same hints regardless of learner code; weekly Challenges show only hints[0].
- **Delta: stdout-equality grading can't tell the learner *which* behavior is wrong; hints are static text untethered from the learner's code.** Migrating the grader to 3–5 named assertions per challenge (the test_code path already exists) is the single biggest feedback-loop upgrade.

## 3. Progress / mastery / retention mechanics

- **Duolingo:** streaks engineered not decorative — 7-day streakers 3.6x more likely to stay; Streak Freeze cut at-risk churn 21%, applied *silently* and bounded. (apptitude.io; deconstructoroffun)
- **Khan Academy:** mastery levels (Familiar→Proficient→Mastered) with *downward* movement on missed reviews; Mastery Challenges do personalized spaced review, rate-limited 12h. (Khan support docs)
- **Gimmick line:** Boot.dev's RPG dressing works only because it sits on top of real completion friction; mechanics read as gimmicks when they reward *showing up* rather than *remembering*.
- **PyMasters:** already has the useful half — routes/review.py implements a half-life forgetting-curve review queue (Duolingo-HLR modeled), surfaced via ReviewQueue on Dashboard. XP/streaks/leaderboards exist; **no streak freeze/repair** (backend/streaks.py); Knowledge Map mastery doesn't visibly decay.
- **Delta: PyMasters built Khan-grade spaced-review plumbing but buried it as one Dashboard widget while the gimmick layer (XP, leaderboard) gets top billing; streak has no forgiveness where Duolingo recovers 21% of at-risk churn.** Promote review queue to first-class; add one bounded silent streak freeze.

## 4. In-course navigation & information architecture

- **Stripe docs:** three-column — nav left, prose center, always-populated runnable code right; "the right column is never empty" removes scroll-to-find-code. (Moesif teardown; apidog)
- **Brilliant (ustwo):** single learning-path spine with a level gameboard + companion always pointing to the *next* lesson; one obvious continue action.
- **PyMasters:** learner sidebar has **12 top-level destinations** (Layout.jsx:120-143), four of which (Classroom, Knowledge Map, Evolution/Paths, Explains) all plausibly answer "where do I learn next?".
- **Delta: PyMasters distributes the learning journey across four sibling pages where Brilliant collapses it into one path with one "continue" affordance.** Merge Evolution + Knowledge Map + Classroom entry into a single path view with a persistent "Continue: <next lesson>" CTA; demote Trending/Explains/Reference to a "Library" group.

## 5. AI assistance that teaches vs vends answers

- **Khanmigo:** Socratic by design; *guardrails are the product* — a moderation layer detects answer-extraction and redirects to questioning; reviewable transcripts. (NeuralClass; BuildMVPFast case study)
- **PyMasters:** Vaathiyaar's system prompt is genuinely well-designed — "never give the answer first," 3-level hint ladder ending in a Socratic question (vaathiyaar/modelfile.py).
- **Delta: PyMasters' answer-gating lives entirely in the prompt — one "ignore previous instructions" away from vending; Khanmigo enforces with a separate moderation layer.** Cheapest hardening: server-side check refusing responses containing the challenge's expected_output/complete solution, plus attempt-count-aware hint unlocking (Vaathiyaar already receives attempt_count).

## 6. Visual language

- **Brilliant (ustwo/Rive):** learning-purpose component library, "Game Feel" north star, *pedagogically-targeted* motion — celebration on correct answers, encouragement when struggling.
- **PyMasters:** on paper unusually strong — design-system/MASTER.md defines oklch semantic tokens with WCAG-AA-audited pairs, Outfit/Inter/JetBrains Mono, 4/8px density scale, 150–400ms motion budget. In practice components violate it: OutputPanel.jsx hardcodes `bg-[#161b22]`/`bg-[#0d1117]` + raw slate despite "semantic only" rule; Classroom.jsx ships emoji-in-button ("💡 Need a hint?") against "no emojis as UI icons".
- **Delta: PyMasters has Brilliant's token system but no *learning-moment* motion vocabulary — motion spend goes to panel fade-ins while correct-answer/struggle moments get nothing; token drift means the system isn't enforced.** Add a lint rule against raw hex/slate in src/components; spend motion budget on the evaluate-success moment.

## 7. AI-assisted authoring workflows

- **Coursera Course Builder:** author gives inputs → AI generates outline/descriptions/objectives + *editable* assessments, grounded by recommending vetted catalog modules to blend.
- **Khanmigo teacher tools:** lesson plans generated *aligned to named standards*, tied to existing content library.
- **PyMasters:** org/school admins generate from typed topics or uploaded syllabus (cap 10), review, publish to cohort — reusing run_pipeline. Review-before-publish already matches the pattern.
- **Delta: competitors ground generation in an existing vetted library; PyMasters generates every org lesson from scratch — no "436 existing lessons match this syllabus line, reuse instead of generate" step.** The semantic-search index (fastembed, 2026-07-12) is the ready-made retrieval layer for a "match existing first, generate only gaps" pass.

## Top 5 highest-leverage deltas (ranked by learner impact)

1. **Test-based grading with named assertions** — replace stdout-equality with 3–5 per-challenge tests + per-test failure messages; test_code path already exists.
2. **Interaction gates inside the scrollytelling** — 1–2 prediction prompts per lesson's 6 steps; turns the signature feature from demo into active recall.
3. **One learning spine with one "Continue" CTA** — collapse Classroom/Knowledge Map/Evolution; 12 sidebar destinations is the biggest IA gap vs every competitor.
4. **Server-enforced answer-gating for Vaathiyaar** — solution-leak filter + attempt-aware hint ladder; Socratic prompt is best-in-class, enforcement isn't.
5. **Promote review queue + streak forgiveness** — HLR review engine is built and buried; surfacing it + one silent bounded streak freeze is mostly UI work.

## Honest notes
PyMasters is *stronger* than expected in two areas: the design-token system and the spaced-repetition backend both already exist and are near best-in-class. The deltas there are enforcement/surfacing, not building. A generic "spacing is ad hoc" critique would be wrong — the real visual gap is learning-moment motion + token drift.
