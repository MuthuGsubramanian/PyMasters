# S2-coverage — test manifest (per route × role)

Totals (from codebase + running app): **39 frontend routes, 4 roles (anon/student/instructor≈org-admin/super-admin) → the meaningful test surface is ~30 role-applicable page-units.** Backend: 192 endpoints across 32 route files. Lessons: 436 across 31 tracks.

Legend: PASS = exercised in a real browser this session and seen working. PASS(S1) = fully exercised in Session 1 (audit/02-sweep.md), not re-run this session. FIX = defect found+fixed this session.

## Re-verified THIS session (S2), in browser
| Unit | Role | Verdict | Evidence |
|---|---|---|---|
| Prod /dashboard/classroom | real user (owner acct) | FIX→PASS | was live crash "GraduationCap not defined"; after deploy loads full lesson list, 0 errors |
| /dashboard/classroom (list) | student | PASS + FIX | added per-track progress ("1 of 36 done" bar/badge) — verified |
| Lesson scrollytelling (variables_intro, for_loops) | student | PASS | intro renders, visual debugger steps |
| Practice → Run → success | student | PASS | code runs in sandbox, success screen |
| Lesson success → **Next lesson** CTA | student | FIX→PASS | new: "Up next" + Next lesson → loads for_loops at top, 0 errors |
| Hint button (Lightbulb icon) | student | PASS | shipped S1 fix confirmed live-local |
| /dashboard (Overview) | student | PASS | greeting + 4 stat cards + recommended + trending + quick actions (note: framer entrance anims freeze in the automated hidden tab — artifact, not a user bug; confirmed via computed opacity + interaction) |
| /dashboard/knowledge | student | PASS | 277 concepts, recommended-next, python-core grid |
| /dashboard/reference (+ detail) | student | PASS | topic grid + Python Basics detail with runnable cards |
| /dashboard/playground | student | PASS | editor + output + Save/My-files (S1) |
| /login (sign in + signup chooser) | anon | PASS | + shipped CTA fix (Get Started → signup) |

## Carried over from Session 1 (audit/02-sweep.md), not re-run in S2
All 4 roles walked end-to-end S1: signup→onboarding→path (student + org-admin 5Q), org console (Overview/Members/Students/Invites/Analytics/Requests/Curriculum), super-admin console (Overview/Users/Audit/Orgs/Support/Social/Settings), Community, Challenges, Trending, Explains, Live-Tutor, Profile, Upgrade, Pricing/Terms/Privacy/Security, 404, direct-URL gating, sign-out. Role enforcement verified at API level S1+S2 (anon 401 / student 403 / super-admin 200; enterprise IDOR closed).

## Untested / gaps (blunt)
- `/join/:token`, `/reset-password/:token` — need a real emailed token; not exercised (S1 tested via API/component).
- `/forgot-password` submit — not fired (avoids real email).
- **375px rendered layout** — UNVERIFIED both sessions: the CDP browser captures a fixed desktop viewport (window resize doesn't change the rendered viewport). Responsive *code* + viewport meta verified only.
- **All Vaathiyaar/LLM happy paths** — UNVERIFIED live: local ollama at weekly 429 cap. Graceful degradation confirmed; generation/chat success not seen.
- Instructor role = org-admin (no separate "instructor" role exists in the product).
