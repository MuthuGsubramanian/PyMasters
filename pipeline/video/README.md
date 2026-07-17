# Daily YouTube video generation — setup

The daily intelligence pipeline (`pipeline/main.py`, already run daily via
`run_pipeline.bat`) now also turns the day's **top discovery** into two videos
under `pipeline/social/<date>/video/` and — **if you opt in** — uploads them to
YouTube automatically:

- `short.mp4` — 1080×1920 vertical, ≤ 60 seconds (YouTube Short): hook, three
  punchy points, CTA.
- `explainer.mp4` — 1920×1080, 2–4 minutes: intro, concept, Python code
  walkthrough, takeaway, CTA.
- `metadata.json` — per-video title/description/tags/category, plus
  `youtube_url` (filled in after upload).

**Safe by default:** with no credentials set, the pipeline only generates the
files locally; it never uploads. You review everything under
`pipeline/social/<date>/video/`.

## How a video is made

`pipeline/video/generate_videos.py::generate_daily_videos()`:

1. **Script** — Claude writes the Short and explainer scripts from the top
   scored item (template fallback if the AI call fails).
2. **Slides** — Pillow renders branded slides (deep dark `#0a0f1e` background,
   violet→cyan accents, code panels in monospace).
3. **Narration** — text-to-speech, first engine that works:
   `edge-tts` (natural online voice) → `pyttsx3` (offline Windows SAPI) →
   none (silent video with the caption text burned onto the slides).
4. **Assembly** — ffmpeg builds H.264/AAC MP4s (`yuv420p`, `+faststart`),
   slides timed to the narration segments.

### Local requirements (generation)

- **ffmpeg on PATH** — `winget install Gyan.FFmpeg` (the generator also finds
  winget/choco install locations even before a PATH refresh). If ffmpeg is
  missing, video generation is skipped gracefully.
- **Pillow** and (optionally) **edge-tts** / **pyttsx3** in the pipeline's
  Python (`C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312`) — all
  already installed; the generator pip-installs `edge-tts` itself if missing.

## What you must do once (YouTube side — only you can do this)

1. **Google Cloud project**: in <https://console.cloud.google.com> pick any
   project (the existing `pymasters-app` is fine) and **enable the
   "YouTube Data API v3"** (APIs & Services → Library).
2. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   External, app name "PyMasters Pipeline", add the Google account that owns
   the YouTube channel as a **test user**. (Staying in "Testing" mode is fine
   for a single-owner uploader; tokens keep refreshing.)
3. **OAuth client** (APIs & Services → Credentials → Create credentials →
   OAuth client ID): application type **Desktop app**. Download the client
   secrets JSON and store it somewhere private, e.g.
   `C:\Users\muthu.MSG\secrets\youtube_client_secret.json`.
4. **First authorization** (one interactive run — a browser window opens):

   ```bat
   set YOUTUBE_CLIENT_SECRETS_FILE=C:\Users\muthu.MSG\secrets\youtube_client_secret.json
   C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe -m pipeline.video.upload_youtube --dry-run
   :: dry-run just previews; drop --dry-run for the real first upload/authorization
   ```

   Sign in with the channel's account and approve. The token is cached at
   `pipeline/.youtube_token.json` (gitignored) and auto-refreshes afterwards —
   no manual rotation.

## Enable it (where the daily pipeline runs)

Set these for the environment that runs `run_pipeline.bat`:

```
YOUTUBE_UPLOAD=1
YOUTUBE_CLIENT_SECRETS_FILE=C:\Users\muthu.MSG\secrets\youtube_client_secret.json
```

Optional knobs:

```
VIDEO_GENERATION=0    # skip video generation entirely (default: on)
YOUTUBE_PRIVACY=unlisted   # default: public (also accepts private)
```

Leave `YOUTUBE_UPLOAD` unset (or `0`) to keep generating videos without
uploading. If `YOUTUBE_UPLOAD=1` but the secrets file is missing, the uploader
prints setup instructions and the pipeline continues normally
(status `credentials_missing` — it never crashes the run).

## How the daily flow works

In `pipeline/main.py`, after analysis and before social content:

1. `generate_daily_videos(scored_items)` builds both videos (skipped when
   `VIDEO_GENERATION=0`; any failure is logged and the pipeline continues).
2. If `YOUTUBE_UPLOAD=1` **and** credentials exist, both videos are uploaded
   (resumable) and the returned watch URLs are written back into
   `metadata.json` as `youtube_url`.
3. The video metadata is passed to the social content generator: when a
   `youtube_url` exists, the day's LinkedIn post references "today's video"
   with the link. With no URL, social content is unchanged.

## Test before trusting the cron

```bat
:: generate only (no upload) — builds today's videos from a smoke-test item
C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe -m pipeline.video.generate_videos

:: preview what an upload would do
C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe -m pipeline.video.upload_youtube --dry-run

:: upload a specific day's videos
C:\Users\muthu.MSG\AppData\Local\Programs\Python\Python312\python.exe -m pipeline.video.upload_youtube --date 2026-07-17
```

## Notes / future improvements

- **Quota:** each upload costs ~1600 YouTube API quota units; the default
  daily quota (10,000) comfortably covers 2 videos/day.
- **Voice:** change `TTS_VOICE` in `generate_videos.py` (e.g.
  `en-US-AriaNeural`, `en-GB-RyanNeural`) for a different narrator.
- **Branding:** slide colors/layout live in `generate_videos.py` (same
  palette as `linkedin_media.py`).
- **Thumbnails:** custom thumbnails via `youtube.thumbnails().set()` would be
  a natural next step (needs channel feature verification).
