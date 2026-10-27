# SDD ledger — plan: docs/superpowers/plans/2026-10-27-learn-while-you-play.md
Worktree: C:/Users/muthu.MSG/PycharmProjects/PyMasters-play (branch feat/learn-while-you-play, base d9e5be1)
Pre-flight: Task1 award_xp/today_xp ↔ Task5 consumes same names/args — consistent. Task2 nudge_mastery(db_path,user,topic,delta) ↔ Task5 — consistent. Task3 engine.score_round(items, responses) ↔ Task5/9/17 (sims dispatch adds level + sim payload) — Ruling: score_round gains optional sim: dict|None and level: int kwargs; bank path ignores them — cost if wrong: one signature change. Task3 public_item ↔ Task8 client never receives answer — consistent. Task7 nextLevel thresholds ↔ Task3 next_level — same numbers (0.8 up, <0.4 down). Task9 hole table duplicated JS/Python — golden test guards drift. Task12 GAME_COMPONENTS ids ↔ Task3 GAMES ids — same six ids.
Task 13: merged feat/learn-while-you-play → main as 97e1ed3 (no-ff), pushed 13:03 IST; CI/VM rollout + live verification pending.
Task 13: complete (merge 97e1ed3 live on VM 13:15 IST; live-verified Output Oracle round, Gradient Golf round incl. divergence, Results/XP chip, stats, recommendations; learning cycle saw game material; FOUND+FIXED: sim answer '[object Object]' + reveal below fold (515947a), game-only mastery rows flagged weak + unplayed holes as lr_too_low (1e38869); mobile 400px check deferred to Playwright — Chrome min window width ~500)
Task 17: Ruling: score = ratio of test MSE to best achievable (bands 1.1/1.25/1.5/2/4 → 5..1) instead of exact rank — with noisy data neighbouring degrees differ by <1 % so rank punished correct choices; noisy datasets use 14–18 training points so degree 12 visibly overfits (with 20 it sometimes won) — cost if wrong: difficulty tuning. Leakage card (level 4) deferred to wave 3.
Task 18: complete (wave 2 merged db38c92 → live on VM 14:04 IST; headless 400px check (ops/e2e/play_mobile.py) clean; README + ops notes 8794cfe; memory updated)
Final review: fresh reviewer (fable) on d9e5be1..8794cfe — 0 critical, 5 important, 8 minor.
Final: fixed daily one-attempt bypass (answer-then-abandon) — test_daily_round_resumes_until_finished RED→GREEN; daily level pinned to 2 (ruling: "same items for everyone")
Final: fixed retry-after-failed-finish dealt a new round — REFINISH reducer test RED→GREEN
Final: fixed Play again double /round/start — PlayRound onAgain reloads once (no unit test: page-level; ruling)
Final: fixed sim payload id mismatch smuggling — test_answer_rejects_sim_payload_for_another_item RED→GREEN
Final: fixed Play UI strings not in i18n — i18n test (42 play.* keys × 8 dictionaries) RED→GREEN; Tamil translated, others English placeholders per plan
Final: fixed Output Oracle countdown restarting on parent re-render (re-graded Important: visible stall while typing) — keeps-counting test RED→GREEN
Final: suites frontend 62/62, backend play routes 15/15 (full backend suite ran green 490/490 before wave-2 merge; CI reruns on push)
Final: minor (deferred): concurrent double /finish can duplicate record_signal/nudge (UI guards; XP deduped)
Final: minor (deferred): sims monkeypatch engine.load_bank per request — refactor to engine.pick_from(bank, …)
Final: minor (deferred): non-numeric sim payload values raise 500 instead of scoring 0
Final: minor (deferred): abandoned rounds (finished_at NULL) never purged
Final: minor (deferred): play_stats streak mixes local date with UTC created_at
Final: minor (deferred): Big-O recount test depends on sys.settrace semantics across Python versions
Final: Ruling: reviewer's "declined" items (item_ms self-reported, exact-stdout strictness, bank counts below spec targets, legacy backend/Dockerfile py3.9) stand as designed — cost if wrong: none shipping; spec says exact stdout; floors enforced by tests
Final: fixed (post-merge) abandoned-round purge + UTC play streak — tests RED→GREEN (17/17 play routes)
