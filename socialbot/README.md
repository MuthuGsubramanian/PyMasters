# socialbot — PyMasters YouTube + LinkedIn bot

Replaces the Windows-only `pipeline/` social/video automation (thin trending-item input, static slides,
template fallbacks, no quality gate). Runs on the PyMasters ops laptop (Linux, Eternity) from a systemd user timer.

**What it makes** (owner decisions, 2026-11-02): a YouTube Short and a LinkedIn post every day + 1 long
tutorial (6–10 min) a week, auto-published when the quality gate passes.

## How a piece is made
1. **Source** (`sources.py`): a real PyMasters lesson with substance and runnable code, weighted toward topics
   the channel's own stats favour (specific, practical Python + AI engineering). No lesson repeats within 120 days.
2. **Write** (`briefs.py`, `llm.py`): Claude Code CLI headless — pinned model, no tools, JSON Schema output.
   LinkedIn uses the "jargon, made simple" format: one intimidating term, one original adult analogy mapped
   step-for-step (and where it breaks), the precise definition, real code, the takeaway.
3. **Gate** (`quality.py`): hard checks (length, banned phrases, hashtags, link, code compiles, shown output equals
   real output — snippets are executed in a resource-limited subprocess) + an independent critic (calibrated,
   factual errors and blockers must be zero, score >= 7.5). Up to 4 revise rounds, keeping the best; otherwise the
   draft is dropped. Nothing generic is ever published in its place.
4. **Render** (`render/`, `tts.py`): Pillow frames piped to ffmpeg. Scene kinds: code typing with syntax colours and
   moving highlight, live output, step-by-step variable trace, flow diagrams, concurrency timelines, function plots,
   before/after or analogy/mechanism comparisons, reveals. Shorts 1080x1920 with word-highlighted captions; tutorials
   1920x1080 with chapters; LinkedIn 1080x1080 silent looping MP4 (+ GIF fallback). Kokoro TTS (local).
5. **Publish** (`publish/`): YouTube Data API (private + `publishAt`, captions SRT, playlist per track, synthetic
   media disclosure); LinkedIn REST Posts API (multipart video upload, waits for AVAILABLE, GIF fallback,
   little-text escaping). LinkedIn posts as the PyMasters page once the Community Management API is approved for the
   "PyMasters Publisher" app (`auth linkedin-page`); until then as the owner via the existing "PyMasters" app.

## Operate
```
cd ~/Documents/Development/PyMasters
B="env -u VIRTUAL_ENV PYTHONPATH=$PWD $HOME/pymasters-ops/social-venv/bin/python -m socialbot"
$B status | report | produce {short|long|linkedin} | publish [--dry-run] | tick | metrics
$B auth youtube | auth linkedin | auth linkedin-page
journalctl --user -u pymasters-social.service -f
```
Timer: `socialbot/systemd/pymasters-social.{service,timer}` (every 15 min; renders 01:00–06:00 IST).
State `~/.local/share/pymasters-social/state.db`; secrets `~/.config/pymasters-social/` (0600, never in git);
models + renders `/mnt/eternity-store/EternityModels/pymasters-social/`. Daily status email includes `report`.
Optional music beds: drop royalty-free tracks into `.../pymasters-social/music/`.
