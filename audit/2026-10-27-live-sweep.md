# Live sweep log — started 2026-10-27 (standing directive: enterprise-grade, every module live-tested)

Method: real learner session in PyMastersBrowser (desktop, dark) + headless Playwright at 400 px
(`python ops/e2e/play_mobile.py`, dark + reduced motion). Findings are fixed with TDD and
deployed through CI → VM; each row says where it stands.

| # | Module | Finding | Severity | Status |
|---|--------|---------|----------|--------|
| 1 | Play / Gradient Golf | Reveal showed "You said [object Object]" for a simulation answer | P1 | fixed 515947a (wave 2, db38c92) |
| 2 | Play / Gradient Golf | Reveal rendered below the fold after the canvas; learner saw no verdict | P2 | fixed 515947a (scrollIntoView) |
| 3 | Vaathiyaar adaptive | Mastery rows created by game nudges (level 0.0–0.04, attempts 0) counted as "low mastery" → high scaffolding for a learner who merely played | P1 | fixed 1e38869 |
| 4 | Vaathiyaar adaptive | Unplayed Gradient Golf holes summarised as `lr_too_low` misconceptions | P2 | fixed 1e38869 (`not_attempted`, skipped in notes) |
| 5 | Layout (mobile) | Sidebar nav links are under 40 px tall at 400 px (touch target) | P3 | open |
| 6 | ReleaseNotes modal | "What's New" modal has no focus trap: keyboard shortcuts of the page behind it (e.g. Play keys 1–4) still fire; blocks first-visit E2E clicks | P2 | open |
| 7 | API latency | Play endpoints ≈0.85 s round trip from the laptop (TLS + 2× RTT to us-central1); page feels "Checking…" for ~1 s per item | P3 | monitor; consider keep-alive / edge later |

Next modules to sweep (as learner and as admin): Overview, Classroom (lesson + grade), Playground (execute + install), Paths, Knowledge Map, Challenges, Reference, Explains, Community, Live Tutor, Profile, Org console, Super Admin, Login/Signup/Forgot, Pricing/Upgrade.
