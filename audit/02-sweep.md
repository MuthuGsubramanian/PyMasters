# 02 — End-to-end sweep (Phase 2) — 2026-07-29

Environment: local dev (backend :8002 = branch code w/ P0 fix, vite :5173), Chrome via CDP. Roles: ANON, STUDENT (qa_student_0729, created via UI). ORG-ADMIN + SUPER-ADMIN journeys below. Viewport 1280px primary; 375px responsive pass separate.

Verdicts: PASS = exercised in browser and seen working. Evidence = session screenshots (ss_ ids) + saved files in audit/evidence for defects.

| ID | Route/Feature | Role | Mode | Verdict | Notes |
|----|---------------|------|------|---------|-------|
| S01 | / (Home landing) | anon | User | PASS | Renders clean, 0 console errors. Critic: "Get Started" CTA lands on SIGN-IN ("Welcome Back") not signup → F-010 |
| S02 | /login (sign in) | anon | Tester | PASS | Clean render. OAuth buttons absent locally (env-gated) — UNVERIFIED locally, live in prod per 2026-07 memory |
| S03 | /login?mode=signup chooser | anon | User | PASS | Individual vs Org chooser clear |
| S04 | Signup (individual) | anon→student | User | PASS | Account created, password strength meter, redirects to onboarding |
| S05 | /onboarding 7-question flow | student | User | PASS | Personalized greeting (no {name} leak). Disabled-CTA helper "Answer N more to continue" good. Perf: intermittent multi-second renderer freezes → F-011 |
| S06 | Onboarding → personalized path | student | User | PASS | AI/ML answers → ML Engineer Path, Beginner, 25 lessons |
| S07 | /dashboard/classroom (list) | student | User | **FAIL→FIXED** | **P0 F-001: page crashed for ALL users — GraduationCap not imported (Classroom.jsx:307, module scope). In prod since 2026-07-28 deploy. Fixed 758879c, verified clean reload** |
| S08 | Lesson scrollytelling (variables_intro) | student | User | PASS | Visual debugger, step sync, Watch It Run |
| S09 | Start Practice → editor → Run Code | student | User | PASS | Sandbox exec ~2s, correct output |
| S10 | Challenge grading + XP | student | User | PASS | "Excellent work" +50 XP, 3 stars. Graceful LLM-down fallback: "couldn't reach the AI server... code ran correctly" |
| S11 | XP live-refresh in sidebar | student | Tester | PASS | 50→100 without reload — 2026-07-08 stale-XP issue no longer reproduces |
| S12 | Lesson list Done state | student | Tester | PASS | ✓ Done chip + next lesson unlocked |
| S13 | /dashboard (Overview) | student | User | PASS | Streak, stats, recommended lesson coherent |
| S14 | /dashboard/paths (Evolution) | student | User | PASS | Active path 1/25 4%. Critic: "Evolution" vs "Learning Paths" naming split → F-012 |
| S15 | /dashboard/knowledge | student | User | PASS | 277 concepts, progress reflected (1 in progress) |
| S16 | /dashboard/playground | student | Tester | PASS | Editor, credits 10000, Save/My-files UI present |
| S17 | /dashboard/trending | student | User | PASS | Topics, filters, daily picks |
| S18 | /dashboard/challenges | student | User | PASS | Weekly challenge, countdown, leaderboard |
| S19 | /dashboard/community | student | User | PASS | Leaderboard rank #1, members tab. Critic: rank name "Apprentice" vs sidebar badge "CADET" → F-013 |
| S20 | /dashboard/org-compete | student (no org) | Critic | PASS-with-issue | Bare text empty state, no CTA/explanation → F-014 |
| S21 | /dashboard/reference | student | User | PASS | Topic cards, search, filters |
| S22 | /dashboard/explains | student | User | PASS | 1 essay + honest "more on the way" card |
| S23 | /dashboard/live-tutor | student | User | PASS | Booking form, email prefilled, timezone detected |
| S24 | /dashboard/profile | student | User | PASS | XP bar, personal info, learning prefs |
| S25 | /dashboard/upgrade | student | User | PASS | 3 plans, trial banner consistent |
| S26 | /dashboard/admin as STUDENT | student | Tester | PASS | "Restricted — platform super admins only" + back CTA. UI gate correct |
| S27 | /dashboard/org as no-org user | student | Tester | PASS | Good empty state + Create Organization CTA |
| S28 | 404 in + out of dashboard | student | Tester | PASS | Branded 404 + Go Home |
| S29 | Sign out | student | Tester | PASS | Returns to login |
| S30 | Anon direct-URL to gated routes | anon | Tester | PASS | /dashboard/classroom → redirect /login |
| S31 | /pricing | anon | User | PASS-with-issue | Copy claims "24 tracks, 425+ lessons" — reconcile vs 31/436 → F-015 |
| S32 | /terms | anon | User | PASS | Different logo mark than app (blue terminal vs purple) → F-016 |
| S33 | /security | anon | User | PASS | Same logo issue F-016 |

(continued below as sweep proceeds)
