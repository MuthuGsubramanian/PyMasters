# 01 — Inventory (Phase 1) — 2026-07-29

Derived from code (frontend/src/App.jsx router, backend/main.py + routes/*.py, backend/lessons/) and confirmed against the running local app (backend :8002, frontend :5175).

## 1. Frontend routes (39)

Guards: `PrivateRoute` = logged-in; `OnboardedRoute` = logged-in + onboarding complete (wraps ALL /dashboard/*). **No per-route role guard in the router** — org-admin / super-admin gating happens inside page components + backend.

Public (11): 1 `/` Home · 2 `/login` · 3 `/signup`→redirect · 4 `/register`→redirect · 5 `/join/:token` JoinOrg · 6 `/forgot-password` · 7 `/reset-password/:token` · 8 `/pricing` · 9 `/terms` · 10 `/privacy` · 11 `/security`

Auth-gated (2): 12 `/onboarding` (PrivateRoute) · 13 `/playground`→redirect

Dashboard shell (25, all OnboardedRoute+Layout): 14 `/dashboard` layout · 15 `/dashboard` index Overview · 16 `/dashboard/learn`→redir · 17 `/dashboard/learn/:id`→redir · 18 `/dashboard/paths` · 19 `/dashboard/paths/:pathId` · 20 `/dashboard/evolution`→redir · 21 `/dashboard/evolution/:pathId`→redir · 22 `/dashboard/knowledge` KnowledgeMap · 23 `/dashboard/upgrade` · 24 `/dashboard/classroom` · 25 `/dashboard/classroom/:lessonId` · 26 `/dashboard/playground` · 27 `/dashboard/trending` · 28 `/dashboard/challenges` · 29 `/dashboard/community` · 30 `/dashboard/org-compete` · 31 `/dashboard/reference` · 32 `/dashboard/explains` · 33 `/dashboard/explains/:slug` · 34 `/dashboard/live-tutor` · 35 `/dashboard/profile` · 36 `/dashboard/org/setup` · 37 `/dashboard/org` OrgDashboard · 38 `/dashboard/admin` SuperAdmin

Catch-all (1): 39 `*` NotFound (custom 404). Shared ErrorBoundary wraps pages; chunk-load failures retry via lazyRetry.

## 2. Backend endpoints (192 across main.py + 32 route files)

main.py 15 (health ×5, auth register/login/change/forgot/reset, legacy content ×4) · language 2 · profile 13 · classroom 9 · playground 7 · playground_files 5 · notifications 5 · modules 3 · graph 5 · messages 3 · paths 7 · trending 6 · organizations 18 · org_challenges 6 · org_curriculum 6 · org_requests 6 · challenges 4 · reference 2 · admin 26 · platform_settings 2 · social_studio 4 · podcasts 1 · review 1 · voice 1 · telemetry 2 · social 7 · semantic 3 · oauth(LinkedIn) 3 · github_oauth 3 · discovery 2 · payments 3 · support 7 · tutor_sessions 5.

Auth model: `get_current_user_id` (JWT) / `optional_user_id` / in-handler `require_super_admin` / in-body org-role checks. No WebSockets (SSE for chat streams).

Full endpoint-by-endpoint listing captured in session inventory (agent report); spot-verified against /docs on :8002.

## 3. Modules (23)

auth/accounts · classroom/lessons · vaathiyaar chat (panel/voice/proactive msgs) · playground+files · paths · knowledge graph · trending/discovery · challenges · community/social · org-compete · org admin (orgs/curriculum/requests) · super-admin console · support · live-tutor · profile/gamification · notifications · payments/upgrade (Razorpay) · reference · explains · podcasts · i18n/TTS · telemetry · module auto-generation.

## 4. Lessons

**436 lesson JSON files, 31 track directories** (schema.json excluded; azure foundry data file counted in its track). No central manifest — track = dir name, visibility via hardcoded primary/secondary track lists per skill level in routes/classroom.py; enterprise tracks gated by access.py::ENTERPRISE_TRACKS.
Per-track: ai_agents 6, ai_engineering 43, ai_fundamentals 20, ai_ml_foundations 18, async_concurrency 5, aws_enterprise 15, azure_ai_foundry 15, azure_enterprise 15, cross_cloud_architecture 15, debugging_mastery 5, deep_learning 21, deep_learning_complete 25, dsa 20, error_handling 4, frontier_ai_platforms 15, functional_python 5, fun_automation 6, gcp_vertex_ai 15, machine_learning 23, performance_optimization 5, python_fundamentals 36, python_intermediate 23, python_internals 10, python_modern 4, regex_mastery 5, testing_devops 12, transformers_scratch 8, trending_ai 3, vibe_coding 14, web_development 20, working_with_data 5.

## 5. Background work & integrations

In-process daemon threads only (no scheduler): boot egress self-test (Cloud Run only), semantic index build, module-generation jobs, fire-and-forget email. Lifecycle purge = on-demand admin endpoint hit by external automation. Social studio = external worker pull model.
Integrations: LLM chain ollama+gemini(+qubrid) · subprocess sandbox executor (import denylist) · SMTP (gmail + Brevo backup) · WhatsApp sender · faster-whisper STT · GitHub+LinkedIn OAuth · Razorpay · Litestream→GCS · semantic vector index.

## Hard totals

**39 routes, 23 modules, 436 lessons (31 tracks), 192 endpoints, 32 route files.**
All later phases reconcile against these numbers.
