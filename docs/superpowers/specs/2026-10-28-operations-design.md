# PyMasters operations — identity, lifecycle, content and social jobs, manager loop (Design)

Date: 2026-10-28 · Author: Claude (autonomous; founder 05:45 IST directives, no approval gates) · Status: building

## Founder directives (verbatim, 2026-10-28 05:45–05:47 IST)

1. "muthu@pymasters.net is always and the only superadmin with a backup email muthu.g.subramanian@gmail.com."
2. "All the games are unlocked by default for admin."
3. "auto remove accounts that are idle more than 21 days."
4. "the content generation should run as a job in the backend and generate contents automatically"
5. "as linkedin and youtube connections are live now ensure that periodical posts are made effectively and in a professional way not just some basic content. consider yourself as a manager of pymasters and regularly manage the page and the socials."
6. "if this machine is idle for more than 30 minutes ensure that any new task is being worked upon constantly"

## Decisions

**Identity.** `SUPER_ADMINS` is a fixed set in code: the primary and the backup email. `SUPER_ADMIN_EMAILS`
no longer widens it. Every boot grants the flag to accounts whose email or username matches and revokes it
from everyone else (bootstrap `admin`, the `claude-qa` service account included). The e2e scripts keep
using the service login as a learner; admin consoles are checked through the founder's own session when
needed.

**Arcade for the admin.** Super admins see every game and board unlocked with the full question pool; no
unlock rows, no notifications.

**Lifecycle.** 18 days idle → one notice (in-app + email when mail is back), 3 more days → removal via the
same purge the self-serve delete uses. Deletion is on by default. Never touched: super admins, org
admins/owners/super_admins, accounts with a successful payment. Runs daily at 08:00 IST from the backend
scheduler; every action lands in `lifecycle_log`.

**Backend scheduler.** `backend/jobs/scheduler.py`: a daemon thread (on when `PYMASTERS_JOBS=1`, set in the
VM compose file only) ticks each minute; `job_runs(job, window)` makes each job run once per window across
restarts and keeps the result for the admin console (`GET /api/admin/jobs`).

**Content job (nightly 02:00 IST).** `backend/jobs/content_job.py` takes the next topic from `content_queue`
(seeded with ~40 gap topics from the content playbook), runs the existing five-stage lesson pipeline
(`modules.pipeline.run_pipeline`) as the system author, then applies the **QA gate**: every practice
challenge's reference solution must reproduce its `expected_output` in the real sandbox, the narrative must
be ≥ 600 characters in English, and the lesson id must be new. Passing lessons are published to the
platform track **"Fresh lessons"** (a `published_to = 'platform'` flag on `generated_lessons`, listed for
every learner); failures are logged and the topic re-queued with a backoff. One lesson per night, more
when the provider has headroom. The founder can unpublish from the admin console. (This refines the
2026-08-03 note: generated lessons ship only through this gate; flagship Explains essays stay authored.)

**Social job.** LinkedIn (member profile, app 253120161): Mon/Wed/Fri 09:30 IST. Each post is built from
real platform material, not filler: the newest Fresh lesson or Explains essay (a concrete takeaway with a
3–6 line code snippet), an arcade game spotlight (what it teaches, how to play), a learner-community
number (anonymous), or a Python/AI insight tied to a lesson. The copy is drafted by the tutor model under
a strict professional style guide (no clickbait, no emoji walls, one idea, a reason to click, three
hashtags, 900–1300 characters), checked for banned phrases and length, paired with the branded image
generator, posted through the validated token, and recorded in `social_posts`. `LINKEDIN_AUTOPOST=1` is
now authorised. YouTube: the token refreshes correctly; video rendering stays on the laptop pipeline
(`pipeline/video/generate_videos.py` + `upload_youtube.py`) on a weekly Windows task because the e2-micro
VM cannot render video; the manager loop checks the upload log.

**Manager loop.** At the end of any turn with nothing pending, Claude schedules a wake-up (≤ 30 min) and
works the backlog: deploy health, live sweep, job runs, socials calendar, content queue, review findings,
founder items. Recorded in memory as a standing rule.

## Not in scope now
Email-based notices while Workspace is suspended (queued, delivered when mail returns); YouTube rendering on
the VM; a Social Studio UI beyond the existing console.

## Implementation rulings (2026-10-28, built this session)

**QA gate narrowed from the design above.** `modules.pipeline.stage_4_challenges` does not produce a
reference solution — its own prompt asks for `test_code` as "starter code or None" (a stub for the
learner), not a working solution — so there is nothing to diff against `expected_output` the way the
content playbook's hand-authored Procedure C does. `backend/jobs/content_job.py::qa_check` instead
requires every structural field used downstream (title, a ≥600-char English narrative, every challenge's
instruction/expected_output/hints), rejects mojibake, and — only where `test_code` is actually present —
executes it in the real sandbox and requires it not to raise. A true solution-vs-output diff would need a
new field added to stage_4; left as a deferred enhancement, not built.

**Social posting reuses `social_jobs`, not a new `social_posts` table.** `routes/social_studio.py` already
queues jobs that `pipeline/social_worker.py` polls every 5 minutes on the laptop (Task Scheduler
`PyMasters-SocialWorker`, confirmed Ready/enabled) — where the LinkedIn credentials, Pillow, and the
drafting prompt (`pipeline/actors/social_content.py`) already live, because the backend's Docker image
never ships `pipeline/`. `backend/jobs/social_job.py` only picks real material (newest Fresh lesson Monday,
an arcade game spotlight Wednesday, a tip-bank insight Friday, deduped 6 days) and queues it the same way
the admin console does — one system of record, visible at `GET /api/admin/social/jobs`.

**Built:** `backend/jobs/content_job.py` (queue, system author, QA gate, platform publish, backoff
re-queue), `backend/jobs/social_job.py` (Mon/Wed/Fri material selection + queuing), the
`generated_lessons.published_to` migration, the "Fresh lessons" listing in `routes/classroom.py`
(`_list_all_lessons`, track `"fresh"`, shown to every learner unconditionally), and
`GET/POST /api/admin/content/*` for queue visibility, fresh-lesson listing, and unpublish. `LINKEDIN_AUTOPOST`
set to `1` in the vault per the founder's directive that posts actually go out, not just draft.

**Regression caught and fixed in the same pass:** removing `claude-qa@pymasters.net` from `SUPER_ADMINS`
(per the identity directive) silently reopened `claude-qa` for public registration, because
`is_reserved_identifier()` in `routes/admin.py` had reused the super-admin set to also mean "reserved service
identifier". Split into a separate `RESERVED_SERVICE_IDENTIFIERS` set so claude-qa stays unclaimable without
being a super admin again. Caught by the existing `test_ops_auth.py::test_service_account_cannot_be_registered_by_public`.

## Follow-up (2026-10-28, same day): animated LinkedIn explainers + weekly YouTube recap

**Founder directive (verbatim, 2026-10-28 13:33–13:49 IST):** "the linkedin posts should be live like, check
sample or reference posts in linkedin where a gif image explains topics, i want similar posts done daily. For
youtube i need a clear explained with example topics daily as shorts and weekly as videos which can be a
combination of shorts... no compraize in quality or the content uniqueness." Plus a general standing rule:
"Ensure that the quality of the content generated for anything should be of high quality, unique and
professional always" (saved to memory as `feedback_content_quality_bar`).

**Visual direction — corrected from real references, not guessed.** The founder shared three real LinkedIn
infographic posts (`media.licdn.com` images: "Traditional AI vs Agentic AI vs Agentic RAG", "From LLM →
Agentic AI", "LLM vs RAG vs Agent Evals"). Common thread: clean **white** background, one bold color per
numbered tier/branch, flat icons, short chip labels, dense-but-concrete text, author/brand credit line — the
opposite of PyMasters' existing dark navy/violet video brand. Founder's explicit follow-up correction: the
references were *animated* ("live") with a *clearly animated flow between steps* — not just boxes fading in
independently. Both points are load-bearing in the implementation below.

**Also independently learned from the founder's own prior Claude Design session** (`claude.ai/design` project
"PyMasters LinkedIn content", read via browser this session): LinkedIn does **not** animate GIF/image
attachments in the feed — only native video posts auto-play/loop. Confirms the white-infographic look must
ship as an actual LinkedIn video upload, not a GIF/PNG attachment, to satisfy "live".

**Built:**
- `pipeline/actors/stack_explainer.py` — topic → validated JSON spec (title, subtitle, 5-7 numbered tiers each
  with an emoji icon + colored chip + one concrete 1-2 line fact, takeaway, 3 hashtags). `validate_stack()` is
  a hard QA gate (structural + `BANNED_PHRASES` hype-language check); **no generic template fallback** — unlike
  every other generator in this repo, a failure here returns `None` and the caller falls back to the existing
  static Pillow banner, because a generic animated explainer is worse than no animation. Colors cycle through
  `TIER_COLORS` (blue/orange/violet/red/green/cyan/pink), matching the references' one-color-per-tier look.
- `pipeline/actors/stack_render.py` — renders a validated spec to a white-background HTML/CSS page (no JS
  framework, no build step — plain Python string templating) with a numbered tier per row, and, between every
  pair of tiers, an animated connector: a line that draws downward plus a small dot that travels along it —
  this is the "flow" the founder flagged as the key quality signal, not just independent fade-ins. Captured
  via headless Chromium (Playwright, newly installed on the laptop: `pip install playwright && playwright
  install chromium`) screenshotting at 12fps while the CSS animation plays in real time, then assembled to
  H.264 MP4 via the existing `find_ffmpeg()`/`_run()` helpers. ~9-12s loop, 1080×1350. Degrades gracefully to
  `{"status": "skipped: ..."}` if Playwright/ffmpeg are missing — never raises.
- `pipeline/actors/linkedin_publisher.py` — added `publish_linkedin_video()` + `_upload_video()`: registers a
  `feedshare-video` asset, uploads the MP4, polls `GET /v2/assets/{id}` for `AVAILABLE` (video needs LinkedIn-
  side processing, unlike images), then shares with `shareMediaCategory: "VIDEO"`. This is the actual fix for
  "GIFs don't move in the feed" — a native video post does. Same never-raises/retry-on-401 shape as the
  existing `publish_linkedin()`.
- **Bug fixed in the same pass:** `pipeline/social_worker.py::run_job()` checked `pub.get("post_urn")` to
  surface the published post's id, but `publish_linkedin()`/`publish_linkedin_video()` actually return the key
  `post_id` — a pre-existing mismatch (flagged earlier this session, not yet fixed) that meant the post id was
  never surfaced into the job result. Fixed to `pub.get("post_id")`.
- Wired into both LinkedIn call sites — `pipeline/social_worker.py::run_job()` (on-demand/queued jobs, which is
  also what the new daily `backend/jobs/social_job.py` queue uses) and `pipeline/actors/social_content.py::
  generate_social_content()` (the daily pipeline's own top-discovery post) — both try the stack-explainer video
  first and fall back to the existing static banner+image post unchanged if content generation, the QA gate,
  Playwright, or ffmpeg aren't available.
- `pipeline/video/weekly_compilation.py` (new) — `run_weekly_compilation()` collects the last 7 days' daily
  Shorts (`collect_week_shorts()`, needs `MIN_SHORTS_FOR_WEEKLY = 3` or it skips rather than building a thin
  video), normalizes each clip + a generated title-card interstitial to a common codec/resolution (a video
  missing an audio stream silently breaks ffmpeg's concat demuxer otherwise), concatenates into one MP4, and
  writes Claude-generated weekly recap metadata (title/description naming the week's actual topics). Wired into
  `pipeline/main.py`'s existing daily 06:30 run, gated by `WEEKLY_VIDEO_DAY` (default `"Sunday"`) — reuses the
  existing Task Scheduler trigger instead of adding a new one. `pipeline/video/upload_youtube.py` gained
  `upload_weekly_video()`, reusing the existing `upload_video()` helper.
- **Real bug fixed along the way:** `pipeline/utils/claude.py::ask_claude()` decoded the Claude CLI's stdout
  with Windows' default codepage (cp1252) instead of UTF-8, which crashes outright (not mangles — crashes) on
  any multi-byte UTF-8 sequence. This was latent until now because nothing before asked the CLI for emoji;
  `stack_explainer.py` does (one emoji icon per tier), so this had to be fixed first. Now explicit
  `encoding="utf-8", errors="replace"`.

**Live-verified before considering this done:**
- `stack_explainer.py` demo run produced genuinely specific content (e.g. "22M params", "384-dim", "WordPiece",
  "FAISS/Chroma", a real contrarian takeaway) — not generic filler.
- `stack_render.py` demo rendered a real MP4; frames pulled and visually inspected matched the reference style
  (white bg, numbered colored tiers, connectors, takeaway/footer) after one layout fix (removed a `flex:1` that
  left an oversized gap before the footer).
- `weekly_compilation.py` run live against real data: with exactly 3 qualifying days (Oct 23/26/28) it built a
  real 164s/3.55MB `weekly.mp4` and genuinely topic-specific metadata — confirms `MIN_SHORTS_FOR_WEEKLY` gate
  and the audio-track normalization both work.
- A real LinkedIn video post was queued through the production `social_jobs` table (topic: "FastAPI dependency
  injection, step by step") to exercise the full path end to end (VM queue → laptop `PyMasters-SocialWorker`
  task → `publish_linkedin_video()` → LinkedIn API) exactly as it runs in production — see the ledger/session
  notes for the outcome, since this spec is written before that result lands.

**Not built / deferred:** retroactively re-coloring/upgrading the fixed 12-topic set the founder explored by
hand in Claude Design (LLM vs RAG vs Agent, Pandas vs Polars vs PySpark, etc.) — `stack_explainer.py` is
topic-general and will cover similar ground organically as daily topics rotate. A real solution-diff QA gate
for `content_job.py` remains deferred (see the ruling above, unrelated to this follow-up).
