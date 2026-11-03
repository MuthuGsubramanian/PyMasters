"""Every route in frontend/src/App.jsx, with who must be signed in and a concrete URL for parametrised paths.

`pattern` is the exact `path=` string from App.jsx (nested dashboard routes are relative there); the coverage
map test (test_coverage_map.py) fails if App.jsx gains a route that is missing here.
Roles: public · fresh (signed in, not onboarded) · learner · org_admin · super_admin.
"""
from collections import namedtuple

Route = namedtuple("Route", "name pattern url role allow_status")
# allow_status: API statuses that are the expected outcome on that page (e.g. a bogus token page gets 400/404).

ROUTES = [
    Route("home", "/", "/", "public", ()),
    Route("login", "/login", "/login", "public", (401,)),
    Route("join_bad_token", "/join/:token", "/join/not-a-real-token", "public", (400, 404, 410)),
    Route("forgot_password", "/forgot-password", "/forgot-password", "public", ()),
    Route("reset_password_bad_token", "/reset-password/:token", "/reset-password/not-a-real-token", "public", (400, 404)),
    Route("verify_email_bad_token", "/verify-email/:token", "/verify-email/not-a-real-token", "public", (400, 404)),
    Route("pricing", "/pricing", "/pricing", "public", ()),
    Route("terms", "/terms", "/terms", "public", ()),
    Route("privacy", "/privacy", "/privacy", "public", ()),
    Route("security", "/security", "/security", "public", ()),
    Route("not_found", "*", "/this-page-does-not-exist", "public", ()),
    Route("onboarding", "/onboarding", "/onboarding", "fresh", ()),
    Route("overview", "index", "/dashboard", "learner", ()),
    Route("paths", "paths", "/dashboard/paths", "learner", ()),
    Route("path_detail", "paths/:pathId", "/dashboard/paths/python_zero_to_hero", "learner", ()),
    Route("knowledge", "knowledge", "/dashboard/knowledge", "learner", ()),
    Route("upgrade", "upgrade", "/dashboard/upgrade", "learner", ()),
    Route("classroom", "classroom", "/dashboard/classroom", "learner", ()),
    Route("lesson", "classroom/:lessonId", "/dashboard/classroom/variables_intro", "learner", ()),
    Route("playground", "playground", "/dashboard/playground", "learner", ()),
    Route("play", "play", "/dashboard/play", "learner", ()),
    Route("arcade_game", "play/arcade/:gameId", "/dashboard/play/arcade/snakes_ladders", "learner", (403,)),
    # ^ a new learner has no unlocks: the locked screen must render; playing unlocked games is in test_mod_arcade.py
    Route("play_game", "play/:gameId", "/dashboard/play/output_oracle", "learner", ()),
    Route("trending", "trending", "/dashboard/trending", "learner", ()),
    Route("challenges", "challenges", "/dashboard/challenges", "learner", ()),
    Route("community", "community", "/dashboard/community", "learner", ()),
    Route("org_compete", "org-compete", "/dashboard/org-compete", "org_admin", ()),
    Route("reference", "reference", "/dashboard/reference", "learner", ()),
    Route("explains", "explains", "/dashboard/explains", "learner", ()),
    Route("explain_generated", "explains/generated/:id", "/dashboard/explains/generated/{explain_id}", "learner", ()),
    Route("explain_essay", "explains/:slug", "/dashboard/explains/gradient-descent", "learner", ()),
    Route("live_tutor", "live-tutor", "/dashboard/live-tutor", "learner", ()),
    Route("profile", "profile", "/dashboard/profile", "learner", ()),
    Route("org_setup", "org/setup", "/dashboard/org/setup", "learner", ()),
    Route("org_console", "org", "/dashboard/org", "org_admin", ()),
    Route("super_admin", "admin", "/dashboard/admin", "super_admin", ()),
]

# App.jsx routes that only redirect (<Navigate>); covered by asserting where they land.
REDIRECTS = {
    "/signup": "/login", "/register": "/login", "/playground": "/dashboard/playground",
    "learn": "/dashboard/classroom", "learn/:id": "/dashboard/classroom",
    "evolution": "/dashboard/paths", "evolution/:pathId": "/dashboard/paths/x",   # keeps the path id (test uses x)
}
# The "/dashboard" layout route itself renders only through its children.
LAYOUTS = {"/dashboard"}
