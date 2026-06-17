# Daily LinkedIn auto-posting — setup

The daily intelligence pipeline (`pipeline/main.py`, already run daily via
`run_pipeline.bat`) now also writes a ready-to-publish LinkedIn post to
`pipeline/social/<date>/linkedin.txt` and — **if you opt in** — posts it to the
PyMasters company page automatically.

**Safe by default:** with no credentials set, the pipeline only writes the draft;
it never posts. You review drafts under `pipeline/social/<date>/linkedin.txt`.

## What you must do once (LinkedIn side — only you can do this)

1. **Create a LinkedIn app** at <https://www.linkedin.com/developers/apps> and, on
   its **Settings**, set the **associated company page** to the PyMasters page
   (you must be a page admin).
2. **Request API access** under the app's **Products** tab: add **“Community
   Management API”** (this grants the `w_organization_social` scope needed to post
   as an organization). Approval may take a short review.
3. **Generate an access token** with scope `w_organization_social` (use LinkedIn's
   OAuth 2.0 flow / the developer "Token Generator"). ⚠️ These tokens expire
   (~60 days) — when posts stop, regenerate the token and update the env var
   (a refresh-token cron is a future improvement).
4. **Find the company page URN**: it's `urn:li:organization:<id>`. The `<id>` is in
   the page's admin URL (`linkedin.com/company/<id>/admin/`) or via the
   `organizationAcls` API.

## Enable it (where the daily pipeline runs)

Set these environment variables on the machine that runs the scheduled pipeline
(or in a `.env` it loads):

```
LINKEDIN_AUTOPOST=1
LINKEDIN_ACCESS_TOKEN=<your token>
LINKEDIN_ORG_URN=urn:li:organization:<your page id>
```

Leave `LINKEDIN_AUTOPOST` unset (or `0`) to keep generating drafts without posting.

## Test before trusting the cron

```bash
# from the repo root, with the env vars set
set PYTHONPATH=.            # Windows; use `export PYTHONPATH=.` on bash
python -m pipeline.main     # runs the full daily pipeline once
# or check just the draft that would be posted:
type pipeline\social\<today>\linkedin.txt
```

A successful post logs `LinkedIn publish: posted` (with a post id); a
misconfiguration logs `disabled` (draft only) or `error` (with the HTTP detail).

## How the content is generated

`pipeline/actors/social_content.py::generate_linkedin_post()` asks Claude to write
one concise, professional, value-first Python/AI post (with hashtags + a soft
pymasters.net CTA) from the day's top discoveries; `linkedin_publisher.py` posts it
via the LinkedIn UGC Posts API. If the AI call fails, a clean fallback post is used.

## Notes / future improvements

- **Token refresh:** LinkedIn tokens expire; consider storing a refresh token and
  auto-refreshing, or move credentials into Secret Manager if the pipeline ever
  runs on Cloud Run instead of locally.
- **Images:** posts are currently text-only (`shareMediaCategory: NONE`). Adding an
  image/article preview is a follow-up (register an image asset, then reference it).
- **Cadence/curation:** if daily is too frequent or you want approval-before-post,
  flip `LINKEDIN_AUTOPOST` off and post the reviewed `linkedin.txt` manually, or add
  a lightweight approval step.
