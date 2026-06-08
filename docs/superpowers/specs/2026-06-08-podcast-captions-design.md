# Podcast Captions — Whisper-timed, script-accurate WebVTT + synced player

**Date:** 2026-06-08
**Status:** Design — approved, proceeding to plan + build
**Surface:** `backend/podcasts/generate_podcasts.py` (offline caption step) · `backend/podcasts/manifest.json` (adds `captions_url`) · `frontend/src/components/PodcastPlayer.jsx` (synced caption view)

---

## 1. Goal & Context

Add **time-synced captions** to the pre-rendered podcasts: as the audio plays, the transcript highlights + auto-scrolls the current line, and clicking a line seeks to it. Caption **text is our exact narration script**; Whisper provides only **timing** (the "hybrid" choice).

### Current state (just built)
- `generate_podcasts.py` produces, per (lesson|section, language): an MP3 + a transcript `.txt` (the exact script) + a manifest entry `{audio_url, transcript_url, duration}` (TTS engine map: indic-parler for en/ta/te/ml, Piper for fr/es/it/ko).
- `PodcastPlayer.jsx` streams the MP3 and shows the transcript as **static** text (fetched from `transcript_url`).
- Offline-batch-then-GCS pattern; runtime serves a committed manifest + public GCS audio.

### Decisions locked during brainstorming
- **Hybrid captions:** **faster-whisper** word timestamps for timing + **our script** for text (perfect text, no STT drift, consistent across all 8 languages).
- **Robust matching (Approach A):** word-level alignment of our script words to Whisper's word stream (`difflib`), per-cue `[start,end]` from matched words, **proportional interpolation** for gaps.
- **Built-in fallback (Approach C):** if faster-whisper is unavailable/fails or alignment is too sparse, distribute cues across the known `duration` by character length — captions always exist, just rougher.
- **Format:** **WebVTT** (`.vtt`), uploaded to GCS; manifest entry gains optional `captions_url`.
- **Efficiency:** faster-whisper (CTranslate2, **CPU, int8**), model via `WHISPER_MODEL` (default `base`). Lazy-imported so dry-run/`py_compile` need no deps.

### Out of scope
- Word-level karaoke highlighting (we do **sentence/cue-level** highlight).
- On-demand/runtime captioning (offline only).
- Editing captions in-app.

---

## 2. Architecture Overview

```
OFFLINE (in generate_podcasts.py, after MP3 is made):
  faster-whisper(mp3, word_timestamps=True, language=lang)  -> [(word, start, end)]
  split our script into sentence cues (text = our exact script)
  align script words -> whisper words (difflib) -> per-cue [start,end]; proportional fill
  (if whisper missing/sparse -> proportional-by-char fallback over `duration`)
  write WebVTT -> upload gs://pymasters-podcasts/{lang}/{id}.vtt
  manifest entry gains "captions_url"

RUNTIME (PodcastPlayer): fetch .vtt -> parse cues -> on audio timeupdate, highlight + scroll
  the active cue; click a cue to seek; captions on/off toggle; fall back to static transcript
  when no captions_url.
```

No runtime infra change beyond the player parsing an extra file. The manifest endpoint is unchanged (it already returns the whole entry).

---

## 3. Offline — caption generation (`generate_podcasts.py`)

### 3.1 New helpers
- `split_cues(script, max_chars=140)` — split the script into caption cues: sentence-split on `[.!?।॥]` (Latin + Indic enders); further split over-long sentences on `[,;]`; cue text is the exact script substring.
- `_norm(w)` — lowercase + strip non-word chars, for alignment matching.
- `whisper_words(mp3_path, lang)` — lazy-import `faster_whisper.WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")`; `transcribe(mp3, language=lang if supported else None, word_timestamps=True)`; flatten to `[(norm_word, start, end)]`. Returns `[]` on any import/runtime error (caller falls back).
- `align_cues(cues, whisper_words, duration)` — `difflib.SequenceMatcher` between our normalized word list (tagged with cue index) and whisper's; assign each our-word its matched timestamp; per cue, `start=min`, `end=max` of its matched words; then **fill + monotonic pass**: any cue lacking a start inherits the previous cue's end; any lacking an end gets `start + (cue_chars / remaining_chars) * remaining_duration`; clamp `[0, duration]`, enforce non-overlap/monotonic, minimum cue length ~0.5s.
- `proportional_cues(cues, duration)` — fallback: assign each cue a span proportional to its character length across `[0, duration]`.
- `vtt(cues_with_times)` — emit `WEBVTT\n\n` + per cue `HH:MM:SS.mmm --> HH:MM:SS.mmm\n{text}\n\n`.
- `build_captions(mp3_path, script, lang, duration)` — orchestrates: `cues = split_cues(script)`; `ww = whisper_words(...)`; `timed = align_cues(...)` if `ww` else `proportional_cues(...)`; return `vtt(timed)`.

### 3.2 Wire into `synth_and_upload`
After the MP3 + duration are computed and before/with the GCS uploads:
- `caption_vtt = build_captions(mp3, script, lang, dur)` (wrapped in try/except → on failure, `caption_vtt=None`, log, continue — captions are optional).
- If `caption_vtt`: write `{safe_id}.vtt`, `gsutil cp -a public-read` to `gs://{bucket}/{lang}/{safe_id}.vtt`, set `captions_url = {PUBLIC_BASE}/{lang}/{safe_id}.vtt`.
- Return `captions_url` (or `None`) alongside `(audio_url, transcript_url, duration)`.

### 3.3 Manifest
`main()` stores `captions_url` in the entry when present:
```json
{ "adv_async": { "ta": { "audio_url": "...", "transcript_url": "...", "duration": 214, "captions_url": "https://storage.googleapis.com/pymasters-podcasts/ta/adv_async.vtt" } } }
```
Backward-compatible: entries without `captions_url` simply have no synced captions.

### 3.4 Config
- `WHISPER_MODEL` (default `base`; `tiny`/`small` also fine) — efficiency knob.
- Lazy import: `pip install faster-whisper` is a user prereq only for captioning; absence → graceful fallback to proportional (still produces a `.vtt`).

---

## 4. Frontend — synced caption view (`PodcastPlayer.jsx`)

### 4.1 VTT fetch + parse
- When the entry has `captions_url`, fetch it and parse into `cues = [{ start, end, text }]` (a small WebVTT parser: split on blank lines, parse the `HH:MM:SS.mmm --> ...` line to seconds, join remaining lines as text).
- Keep the existing `transcript` fetch as the fallback when there's no `captions_url` or parsing fails.

### 4.2 Sync + interaction
- Track `activeCue` index: on `<audio> timeupdate`, find the cue whose `[start,end]` contains `currentTime` (linear or pointer scan).
- Render the cues as a scrollable list; the active cue gets a highlight (e.g., `bg-cyan-500/10 text-text-primary font-medium`), others muted; **auto-scroll** the active cue into view (`scrollIntoView({ block: 'nearest' })`, respecting `useReducedMotion`).
- **Click a cue → seek** (`audio.currentTime = cue.start`).
- A small **captions on/off** toggle; when off (or no cues), show the plain transcript as today.

### 4.3 Edge cases
- No `captions_url` → static transcript (unchanged behavior).
- VTT fetch/parse error → fall back to static transcript; no crash.
- Cues empty → static transcript.

---

## 5. Error Handling & Edge Cases
- Offline: faster-whisper not installed / model load fails / transcribe throws → `whisper_words` returns `[]` → proportional fallback → still a valid `.vtt`. Caption step never aborts the podcast (try/except).
- Alignment too sparse (few matched words, e.g. weak Dravidian STT) → gaps filled proportionally; monotonic pass prevents overlaps/negative spans.
- Non-ASCII safe (UTF-8 throughout; `.vtt` written UTF-8).
- Player: malformed/zero-length cue spans are skipped; timing clamped to audio duration.
- Re-run idempotency: captions regenerate with the audio (same `--overwrite` semantics as the episode).

---

## 6. Verification — Live User Testing
1. **Offline:** generate a podcast for a lesson (e.g. `adv_async`, `en`) with `faster-whisper` installed → a `{id}.vtt` is produced, uploaded, and `captions_url` appears in the manifest entry. Inspect the `.vtt`: cue **text matches the script exactly**, timestamps increase monotonically within `[0, duration]`.
2. **Fallback:** uninstall/disable faster-whisper (or use a language it handles poorly) → a `.vtt` is still produced via proportional timing (text still exact).
3. **App:** open that lesson's podcast → captions list renders; as audio plays, the active line **highlights + auto-scrolls**; **clicking a line seeks**; the captions on/off toggle works.
4. **Backward-compat:** a podcast entry without `captions_url` still plays and shows the static transcript.

**Done when:** generated episodes carry a script-accurate `.vtt`, the player highlights/scrolls/seeks in sync, and everything degrades gracefully (no captions → static transcript; no Whisper → proportional captions).

---

## 7. Implementation Order (for the plan)
1. `generate_podcasts.py`: caption helpers (`split_cues`, `_norm`, `whisper_words`, `align_cues`, `proportional_cues`, `vtt`, `build_captions`) + wire `captions_url` into `synth_and_upload` + manifest. Lazy faster-whisper, graceful fallback. (dry-run unaffected.)
2. `PodcastPlayer.jsx`: VTT fetch + parse + synced caption view (highlight/scroll/seek + toggle) with static-transcript fallback.
3. Live user-testing pass (§6); offline generation is user-driven (needs `faster-whisper`).
