# Machine inventory & utilization — 2026-07-17

This laptop is the PyMasters ops/scheduler box (the product itself runs on Cloud Run,
project `pymasters-app`). Full read-only inventory taken 2026-07-17; this doc records
what the machine has, what was newly enabled today and why, and what's flagged.

## What this machine is

- AMD Ryzen 7 3750H (4c/8t), 13.9 GB RAM, Radeon iGPU + RX 5500M (4 GB, no CUDA), 57 GB free disk.
- No servers run here. It drives automation: the 3-min auto-shipper (`PyMasters-ReleaseNow`
  → GitHub Actions → Cloud Run), the 06:30 daily intelligence pipeline, and fleet agent
  tasks (ContentStudio 06:00, GrowthInsights 4×/day, SiteSteward 08:30).
- Authenticated tooling: `gh` (MSG-88), `gcloud` (muthu@pymasters.net / pymasters-app),
  git, node 24, Python 3.11/3.12/3.14 (pipeline pinned to 3.12; repo venv 3.11).

## Newly enabled today (and why)

| What | Why |
|---|---|
| **ffmpeg** (winget `Gyan.FFmpeg`) | Required by the new daily YouTube video pipeline (`pipeline/video/`) — slide+narration assembly and encoding happen on this machine. |
| **`PyMasters-UptimeWatchdog` scheduled task** (5-min, from `ops/uptime-watchdog/`) | The machine had NO working outside-in uptime monitoring: `\PyMasters\HealthSentinel` has been failing (LastTaskResult=1, its `fleet\uptime_log.csv` never created) and this documented watchdog was never installed. First probe: OK (health/db/front/api all green). Self-heal stays OFF (opt-in `PYM_WATCHDOG_AUTOHEAL=1`). |
| **edge-tts + Google API Python packages** (into Python312) | TTS narration + (gated) YouTube upload for the video pipeline. |

## Flagged / needs attention

1. **`\PyMasters\HealthSentinel` still failing** (every 15 min, exit 1; script exists at
   `Documents\Claude\Projects\Pymasters\ops\fleet\health-sentinel\`). Function now covered
   by the repo watchdog; either fix or unregister HealthSentinel to stop noise.
2. **`\PyMasters\AutoPushFixes`** (hourly) stale since Jun 30 — redundant with ReleaseNow;
   candidate for removal.
3. **LinkedIn autopost is draft-only**: no `LINKEDIN_*` env vars in the pipeline's runtime;
   token cache stale (2026-06-17). Needs owner to set env per `pipeline/LINKEDIN_SETUP.md`.
4. **Disk headroom 57 GB (~12%)** — video generation adds MP4s under `pipeline/social/<date>/video/`;
   worth a periodic cleanup of old day-folders.
5. Python version drift (3.11 PATH / 3.12 pipeline / 3.14 py default) — works, but consolidating
   on one interpreter would reduce surprise.
6. Local AI capability is limited: no ollama/CUDA here; local inference beyond CPU embeddings
   isn't practical. Vaathiyaar inference correctly lives on remote providers (qubrid + hosted
   ollama per backend/.env).
