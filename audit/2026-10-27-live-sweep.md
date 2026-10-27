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
| 6 | Play shortcuts / modals | Game keyboard shortcuts (1–6, arrows, Enter) fired behind the "What's New" dialog (the dialog itself traps focus correctly) | P2 | fixed: `games/engine/keys.js` guard, all games + Reveal |
| 8 | Play (mobile) | Floating Vaathiyaar launcher overlaps the round footer / sits on the Results card at 400 px (corner-collision rule) | P3 | fixed: bottom padding on GameShell/Results |
| 9 | Deploy | Container swap on the VM returns 502 for ~20 s on every rollout (update.sh restarts in place); seen by the headless sweep at 14:03 on Knowledge Map | P2 | mitigated: Caddy retries GET/HEAD during the swap (lb_retries), frontend retries one GET on 502/503/504; true blue/green blocked by Litestream living inside the app container + 1 GB RAM (needs a sidecar + swap) |
| 10 | Semantic search | First search after a restart takes ~6.5 s (embedder lazy-loads on the first query); warm queries 0.8 s | P3 | open — pre-warm the query embedder after the index build |
| 7 | API latency | Play endpoints ≈0.85 s round trip from the laptop (TLS + 2× RTT to us-central1); page feels "Checking…" for ~1 s per item | P3 | monitor; consider keep-alive / edge later |

Headless sweep 14:05 IST (`ops/e2e/module_sweep.py`, 25 routes × desktop-light + mobile-dark): 50/50 clean after the rollout window — no console/page errors, no horizontal overflow, no failed API calls, slowest page Overview 2.9 s.

Live API smoke 14:20 IST (`ops/e2e/api_smoke.py`, 16 calls incl. a real sandbox grade + playground execute): all 200, grade 4.9 s, everything else ≤1.6 s.

Next modules to sweep (as learner and as admin): Overview, Classroom (lesson + grade), Playground (execute + install), Paths, Knowledge Map, Challenges, Reference, Explains, Community, Live Tutor, Profile, Org console, Super Admin, Login/Signup/Forgot, Pricing/Upgrade.
