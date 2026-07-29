# 04 — Action plan (Phase 4) — 2026-07-29

Consolidated backlog from Phase 2 sweep + Phase 3 benchmark. Prioritised by charter tie-breakers: correctness > polish > features; blocks-core-journey > cosmetic; all-users > few; reversible > irreversible; cheap-certain > expensive-speculative; classroom/lesson > peripheral; on ties, smaller blast radius.

## P0 — blocks production

| ID | Evidence | Root cause | Fix | Effort | Blast | Tonight |
|----|----------|-----------|-----|--------|-------|---------|
| F-001 | S07, console ReferenceError Classroom.jsx:583 | `GraduationCap` used in module-scope object (a4059a0) but never imported → crashes classroom for ALL users; **live in prod since 2026-07-28** | Add import | XS | 1 line | ✅ DONE 758879c — **handoff: cherry-pick to main + deploy** |

## P1 — serious UX / correctness

| ID | Evidence | Root cause | Fix | Effort | Blast | Tonight |
|----|----------|-----------|-----|--------|-------|---------|
| F-010 | S01, Home.jsx:295 | All anon acquisition CTAs (Get Started/Start Free/hero/footer) → `/login` sign-in, not signup | ctaTarget → `/login?mode=signup` for anon | XS | 1 line | ✅ DONE 1ea9130 |
| F-003 | S38, backend log | Org-curriculum item shows raw "failed" with no reason/retry when generation errors (e.g. LLM 429) | Surface reason + retry affordance | S | org console | Candidate — verify rendering first |
| F-002 | S38, backend 429 | Vaathiyaar ollama weekly cap → all AI generation + chat down locally | Infra/quota, NOT a code bug. Chain is ollama+gemini(+qubrid); locally only ollama configured | — | — | PROPOSAL (infra) — graceful degradation already confirmed |

## P2 — uplift / consistency / polish (design-system drift + copy)

| ID | Evidence | Root cause | Fix | Effort | Tonight |
|----|----------|-----------|-----|--------|---------|
| F-020 | Classroom.jsx:1049,1111 | Emoji 💡 used as UI icon in hint message + hint button (violates no-emoji-icons) | Replace with Lightbulb icon | XS | ✅ DONE (this phase) |
| F-021 | OutputPanel.jsx:50,75 | Raw hex `bg-[#161b22]`/`bg-[#0d1117]` + raw slate despite semantic-token rule | Map to semantic tokens | S | Candidate |
| F-014 | S20 | Org-Compete empty state = bare sentence, no icon/CTA (empty-states rule) | Add icon + explanation + CTA | S | Candidate |
| F-015 | S31 vs inventory | Pricing/home copy "24 tracks, 425+ lessons" vs actual 31 tracks / 436 lessons | Reconcile copy to real numbers | XS | Candidate |
| F-016 | S32/S33 | /terms + /security use a different (blue terminal) logo mark than the app (purple glyph) | Unify logo asset | XS | Candidate |
| F-013 | S19 | Rank name mismatch: Community "Apprentice" vs sidebar badge "CADET" for same user | Align rank taxonomy | S | Candidate (needs source-of-truth check) |
| F-012 | S14 | Nav/route naming split: "Evolution" (sidebar) = `/dashboard/paths` = "Learning Paths" (title) | Pick one term | XS | Candidate |
| F-011 | S05 | Onboarding: intermittent multi-second renderer freeze (CDP screenshot timeouts) | Profile heavy re-render | M | Investigate |

## P3 — differentiators (from benchmark; effort × impact × risk)

| ID | Feature | Impact | Effort | Risk | Notes |
|----|---------|--------|--------|------|-------|
| D-1 | Test-based grading w/ named assertions (per-test failure msgs) | HIGH | M | M | test_code path exists; convert stdout-equality lessons |
| D-2 | Interaction gates in scrollytelling (prediction prompts) | HIGH | M | L | turns signature feature into active recall |
| D-3 | Server-enforced Vaathiyaar answer-gating (solution-leak filter + attempt-aware hints) | HIGH | S-M | L | prompt already Socratic; add enforcement |
| D-4 | Promote review queue + silent bounded streak freeze | MED-HIGH | S-M | L | HLR engine already built (routes/review.py); mostly UI |
| D-5 | One learning spine, one "Continue" CTA (IA consolidation) | HIGH | L | M | 12 sidebar items → biggest IA gap; larger blast radius |
| D-6 | Org-curriculum "reuse existing lesson before generating" via semantic index | MED | M | L | grounds generation, cuts cost/QA risk |

## Time allocation for remainder

1. **P1 F-003** (org-curriculum failure clarity) — verify rendering, fix if genuine. ~20 min.
2. **P2 quick-certain wins**: F-021 (OutputPanel tokens), F-015 (copy numbers), F-016 (logo), F-014 (empty state), F-020 done. ~45 min.
3. **UI/UX Phase 6**: review existing design-system/MASTER.md (already strong per benchmark); apply the drift fixes above rather than a rebuild — consistency via enforcement, not restyle. ~30 min.
4. **Differentiators Phase 7**: implement AT MOST TWO, feature-flagged default-OFF. Chosen by value÷risk: **D-3 (answer-gating)** and **D-4 (streak freeze / review surfacing)** — both low-risk, backend plumbing largely exists, independently revertible. D-1/D-2/D-5 stay as written proposals (higher blast radius / need content migration).
5. **Reserve final ~15%**: regression sweep, frontend build + backend tests, readiness doc, handoff summary, restore scheduled task.

Guardrail: do NOT start a third differentiator. Three excellent working things beat twelve half-finished.
