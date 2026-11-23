---
name: pymasters-posts
description: Create branded PyMasters social media posts, promotional graphics, YouTube thumbnails, LinkedIn/Reddit/Telegram updates, and marketing assets featuring the official PyMasters presenter avatar. Use whenever asked to draft, design, or publish any PyMasters post, announcement, thumbnail, or campaign visual.
---

# PyMasters Posts — Branded Visual & Copy Workflow

Use this skill whenever drafting, designing, updating, or publishing any PyMasters LinkedIn update, Reddit thread, Telegram announcement, X post, YouTube thumbnail/description, or launch banner.

## Step 1: Load Live Curriculum Metrics (Never Hardcode Stale Numbers)
Before writing copy, query exact live counts directly from the repository (`backend/paths/definitions.py`, `backend/lessons/*/*.json`, `backend/graph/concepts.py`, `frontend/src/i18n/*.json`):

```bash
python .agents/skills/pymasters-posts/scripts/generate_post_pack.py --stats
```

Always cite the returned live counts (tracks, static lessons, curated learning paths, concept-graph nodes, supported locales).

## Step 2: Anchor Every Human Visual on Official Reference Assets
Read [references/presenter-spec.md](references/presenter-spec.md) and [references/platform-playbooks.md](references/platform-playbooks.md).

**Hard Visual Rules:**
1. **Never generate presenter faces from text prompts alone.** Always invoke `scripts/generate_post_pack.py` or pass `assets/avatar-headshot.jpg` (close-ups, quote cards, YouTube thumbnails) and `assets/avatar-fullbody.jpg` (keynote banners, launch scenes) as multimodal reference inputs. For 9:16 motion loops, anchor on `assets/avatar-stage.gif`.
2. Verify asset checksums against `assets/manifest.json` when auditing or publishing.
3. Keep AI-rendered text minimal (0–4 words max). Prefer `hybrid` or `composite` mode so headlines, syntax-highlighted Python code, and the vector **PYM shield-monogram crest** are composited deterministically via Playwright (`scripts/templates/presenter_card.html`) with zero text distortion.
4. Every Python snippet displayed in copy or graphics MUST pass `ast.parse()`.

## Step 3: Generate a Complete Post Pack via CLI
Run the self-contained post-pack generator (never hardcode API keys; `GEMINI_API_KEY` or `GOOGLE_API_KEY` is read strictly from the environment):

```bash
python .agents/skills/pymasters-posts/scripts/generate_post_pack.py \
  --platform linkedin \
  --topic "How Python recursion frames unwind on the call stack" \
  --mode hybrid \
  --aspect 4:5 \
  --out-dir artifacts/posts/recursion
```

### Supported CLI Options
- `--platform`: `linkedin` | `youtube` | `telegram` | `reddit` | `x` | `banner`
- `--mode`:
  - `hybrid` (default): Synthesizes a presenter scene using `avatar-headshot.jpg` + `avatar-fullbody.jpg` when `GEMINI_API_KEY` / `GOOGLE_API_KEY` is set, then overlays crisp code, headlines, and the PYM crest via Playwright; falls back cleanly to `composite` offline.
  - `composite`: Deterministic, zero-API-cost Playwright HTML compositor (or FFmpeg `9:16` MP4/GIF loop from `avatar-stage.gif`).
  - `multimodal`: Direct Gemini multimodal image generation anchored on the reference photos.
- `--aspect`: `4:5` (`1080×1350`), `16:9` (`1280×720`), `1.91:1` (`1200×627`), `1:1` (`1080×1080`), or `9:16` (`1080×1920` motion/static).
- `--code` / `--code-file`: Optional Python snippet (strictly gated by `ast.parse()`).
- `--headline` / `--subheadline` / `--eyebrow`: Optional overrides for card typography.

Each run outputs `post_copy.md`, `visual.png` (or `visual.mp4` for `9:16` motion), and `metadata.json` (hashes, dimensions, live metrics, and canonical CTA URLs).

## Step 4: Verify Quality & Positioning Before Publishing
Confirm every output satisfies:
- Accurate positioning for **PyMasters** (`https://pymasters.net`), **Vaar (*Vaathiyaar*)** personal AI teacher, **"Watch It Run"** visual execution, and `LearnAnything` on-demand lessons.
- Channel-appropriate CTAs (`https://pymasters.net` everywhere; `https://t.me/boost/PyMasterscommunity` for Telegram, Shorts/YouTube descriptions, and community announcements).
- Zero Hindi/Hinglish words, zero unverified claims, zero raw markdown in LinkedIn copy, and zero leaked secrets inside `.agents/skills/pymasters-posts/`.

## Step 5: Optional `socialbot` Opt-In Integration
Automated `socialbot` runs support presenter-anchored thumbnails and visuals via `PMSOCIAL_USE_PRESENTER_AVATAR=1` (`config.USE_PRESENTER_AVATAR`) or CLI flag `--presenter-avatar` without disturbing existing systemd timers or the 80°C thermal guard.
