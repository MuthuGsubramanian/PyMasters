# PyMasters Enhancement Research & Roadmap — June 2026

> Evidence-based recommendations for improving PyMasters for **individual learners** and **enterprise/school/university** buyers. Findings come from a multi-source deep-research pass (29 sources, 25 claims adversarially verified — 18 confirmed, 7 refuted and excluded). Each recommendation is mapped to PyMasters' current state and rated by impact/effort.

> ⚠️ **Refuted — do NOT cite as fact:** Bloom's "2-sigma" tutoring magnitude and the ~1.0-SD mastery-learning effect (both failed verification), specific neural-HLR error numbers, and the 2.6%/3.7% EdTech freemium-conversion figures. We can invoke Bloom's *framing* (scalable instruction approaching 1:1 tutoring) to justify the AI tutor — just not the precise magnitudes.

---

## TL;DR — the five highest-leverage moves

1. **Add recall-driven spaced repetition** (review by estimated recall, not fixed streaks). Highest-confidence individual-retention lever; PyMasters already has the substrate (concept graph + user_mastery) to do it well. *High impact / Medium effort.*
2. **Ship AI career tooling + a portfolio** (job-readiness gap analysis vs a real job post, mock-interview practice, shareable project portfolio). Portfolios beat certificates for outcomes; reuses Vaathiyaar. *High impact / Medium effort — and a paid-conversion hook.*
3. **LTI 1.3 / LTI Advantage + SSO** — the **table-stakes** to sell to schools/universities. Without it, institutional deals stall. *High impact / High effort — strategic bet.*
4. **Extend the Org Console to enterprise baseline**: SSO, seat/license management, assignable paths to cohorts with per-cohort insights. *High impact / Medium effort.*
5. **Re-tune gamification toward mastery** and **harden academic integrity beyond code-similarity** (randomized variants + AI viva). *Medium impact / Low–Medium effort — quick wins.*

---

## Segment 1 — Individual self-directed learners

### 1.1 Recall-driven spaced repetition — *High impact / Medium effort* ⭐ top pick
- **Evidence (high confidence):** Duolingo's trainable Half-Life Regression cut recall-prediction error 45%+ on ~13M traces and lifted daily engagement **12%** in a controlled 3.3M-student study; PNAS (Tabibian 2019) proves the *optimal* review time tracks current estimated recall and gives **MEMORIZE**, a simple scalable online algorithm. (Sources: research.duolingo.com/papers/settles.acl16.pdf; pnas.org/doi/10.1073/pnas.1815156116)
- **PyMasters today:** streaks + XP exist, but review is not recall-scheduled. We *already* seed a knowledge graph (233 concepts / 295 edges) and track `user_mastery` + `learning_signals` — ideal substrate.
- **Recommendation:** track per-concept estimated recall; when recall decays, surface a short "review" challenge (reuse existing sandbox-graded items) instead of a generic streak nudge. Start simple (recall = f(time-since-last-correct, #correct)); MEMORIZE/HLR is the upgrade path.

### 1.2 AI career tooling + portfolio — *High impact / Medium effort* ⭐
- **Evidence (high confidence):** Codecademy ships an AI **Job-Readiness Checker** (compares a job posting vs the learner's progress → compatibility % + skill gaps) and an **Interview Simulator** (role-specific Q&A with feedback). Hiring data shows **portfolios/GitHub beat certificates** for landing jobs (certs mostly pass HR filters). (Sources: codecademy.com/career-center; dice.com career-advice)
- **PyMasters today:** strong AI tutor (Vaathiyaar) but no career layer, no portfolio, no projects-as-artifacts.
- **Recommendation:** (a) **Portfolio** — auto-collect a learner's passed challenges/generated lessons into a shareable public profile + "export to GitHub" of their solutions. (b) **Job-readiness** — paste a job description → Vaathiyaar maps it to completed/missing tracks with a readiness % and a study plan. (c) **Mock interview** — Vaathiyaar runs role-specific Python/AI interview questions with feedback. All reuse existing AI infra; strong **Pro-tier conversion hook**.

### 1.3 Gamification re-tuned toward mastery — *Medium impact / Low effort* (quick win)
- **Evidence (high confidence):** Meta-analyses (Deci/Koestner/Ryan, 128 experiments) show tangible/performance-contingent rewards can **undermine** intrinsic motivation (overjustification), while *positive feedback* enhances it; mechanics never fix weak content. (Sources: selfdeterminationtheory.org; learningguild.com)
- **PyMasters today:** XP, ranks (Cadet/Engineer/Architect), weekly leaderboard, streaks.
- **Recommendation:** keep them, but (a) frame progress as **mastery/competence** ("concepts mastered", recall strength) not just XP; (b) make streaks *forgiving* (streak-freeze, weekly goals) to avoid punishing lapses; (c) emphasize personal-best and mastery feedback over competitive leaderboards as the default. Low effort, protects long-term motivation.

### 1.4 Pricing / conversion — *unresolved, needs data*
- The specific EdTech freemium-conversion benchmarks were **refuted** in verification, so no reliable figure to anchor on. **Recommendation:** instrument our own funnel (visitor → free account → activated → paid) and A/B the career/portfolio features as the paid hook before assuming external rates. (See Open Questions.)

---

## Segment 2 — Enterprise / School / University

### 2.1 LTI 1.3 / LTI Advantage — *High impact / High effort* ⭐ TABLE-STAKES
- **Evidence (high confidence):** 1EdTech defines **LTI Advantage** = LTI 1.3 core + three services: **NRPS** (Names & Role Provisioning = course rostering), **Deep Linking** (instructor adds our content into the LMS), **AGS** (Assignment & Grade Services = push scores into the LMS gradebook). Confirmed by Canvas & D2L docs. (Sources: imsglobal.org lti-advantage-overview, lti-nrps v2p0, lti-ags v2p0)
- **PyMasters today:** none — no LMS integration. This is the single biggest **blocker** to institutional sales for any school/university on Canvas/Moodle/Brightspace.
- **Recommendation:** implement LTI 1.3 launch (OIDC + JWKS) + the three Advantage services. Gradebook passback (AGS) of our sandbox-graded challenge scores is a natural fit and a strong differentiator. Treat as the flagship institutional strategic bet.

### 2.2 SSO + enterprise admin baseline — *High impact / Medium effort* (table-stakes)
- **Evidence (high confidence):** DataCamp for Business ships **SSO (SAML 2.0, Google, JIT)** + **seat-based license management**; Udemy Business gates **tiered analytics** and supports **assigning learning paths** to users/groups with **per-path insights**. (Sources: datacamp.com/business/admin-tools-user-management; udemy business cohort docs)
- **PyMasters today:** Org Console has groups/classes, per-student progress drill-down, bulk invites, roles, audit log — good foundation, but **no SSO, no seat/license management, no assign-path-to-cohort, no per-cohort/per-path analytics rollups.**
- **Recommendation:** add (a) **SSO** (SAML 2.0 / OIDC + Google Workspace — schools live on Google); (b) **seat/license management** (assign/reassign, utilization); (c) **assign a path/track to a group** with completion dashboards (the "teacher workflow" already on our roadmap); (d) tiered admin analytics (cohort funnels, at-risk flags we partly have).

### 2.3 Academic integrity beyond code-similarity — *Medium impact / Medium effort*
- **Evidence (high confidence):** automated similarity checkers (MOSS, JPlag) are **defeated by simple transforms and AI-generated code** — ChatGPT solutions show *lower* MOSS similarity than honest work. Similarity scores cannot be the sole integrity mechanism. (Sources: arxiv 2505.08244; OOPSLA 2020 "Mossad" 2010.01700)
- **PyMasters today:** deterministic sandbox grading (great for correctness, not authorship).
- **Recommendation:** layer **randomized challenge variants** (parameterized inputs per student), an optional **AI viva** (Vaathiyaar asks the learner to explain their own submission), and lightweight process/keystroke telemetry for proctored institutional assignments — rather than similarity detection.

### 2.4 Compliance & accessibility — *table-stakes gates (sequence TBD)*
- Procurement for EDU/enterprise typically gates on **FERPA/COPPA** (US K-12/higher-ed), **GDPR** (EU), **SOC 2** (enterprise security), and **WCAG 2.1/2.2 AA** accessibility. Our research could not verify the *exact ordering* of hard gates per buyer type (see Open Questions), but these are well-established procurement requirements.
- **PyMasters today:** known a11y gaps (focus rings, semantic HTML, contrast — partially improved); no formal compliance posture.
- **Recommendation:** prioritize **WCAG AA** remediation (also helps everyone) + a public privacy/security page and data-handling controls now; pursue **SOC 2** and FERPA/GDPR alignment when an institutional pipeline justifies the cost.

---

## Prioritized roadmap

| # | Initiative | Segment | Impact | Effort | Type |
|---|-----------|---------|--------|--------|------|
| 1 | Re-tune gamification toward mastery (forgiving streaks, mastery framing) | Individual | Med | **Low** | Quick win |
| 2 | Recall-driven spaced-repetition review (uses concept graph) | Individual | **High** | Med | Quick win→bet |
| 3 | Portfolio + "export solutions to GitHub" | Individual | **High** | Med | Quick win |
| 4 | AI career tooling: job-readiness gap analysis + mock interview | Individual | **High** | Med | Strategic + conversion |
| 5 | Org Console: assign path-to-cohort + per-cohort analytics | Institutional | **High** | Med | Strategic |
| 6 | SSO (SAML/OIDC + Google Workspace) + seat/license mgmt | Institutional | **High** | Med–High | Table-stakes |
| 7 | Academic integrity: randomized variants + AI viva | Institutional | Med | Med | Differentiator |
| 8 | WCAG 2.1 AA accessibility remediation | Both | Med | Med | Table-stakes gate |
| 9 | LTI 1.3 + LTI Advantage (NRPS/Deep Linking/AGS) | Institutional | **High** | **High** | Flagship bet |
| 10 | SOC 2 / FERPA / GDPR posture | Institutional | High (gate) | High | Pursue with pipeline |

**Suggested sequence:** quick wins (1, 3) → individual flagships (2, 4) → institutional baseline (5, 6, 8) → strategic gates (9, 10, 7) as institutional demand materializes.

---

## Open questions (research could not resolve — decide before committing)
1. **Conversion benchmarks** for EdTech/coding freemium were refuted; instrument our own funnel rather than rely on external figures.
2. **Compliance ordering** — which of FERPA / COPPA / GDPR / SOC 2 / WCAG are *hard* gates for K-12 vs higher-ed vs enterprise, and in what order to pursue?
3. **Provisioning depth** — beyond course-scoped NRPS, do target institutions need **OneRoster/SCIM** and **Google Classroom** integration? Which LMS (Canvas vs Moodle vs Google Classroom) dominates our target buyers?
4. **Integrity workflow** — most cost-effective human-in-the-loop method (AI viva vs randomized variants vs telemetry) that scales.

## Source quality note
Spaced-repetition (Duolingo HLR, PNAS/MEMORIZE), LTI standards, and plagiarism-detection findings rest on **primary peer-reviewed papers / standards-body docs** (highest confidence). Competitor feature claims (Codecademy, DataCamp, Udemy Business) come from **vendor docs** — reliable for "feature exists," not comparative efficacy, and may change over time. Full source list and verification votes in the research transcript (`tasks/w1dzs5dlq.output`).
