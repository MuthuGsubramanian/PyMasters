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
