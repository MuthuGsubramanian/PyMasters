# Podcast Mode — Pre-rendered Single-Narrator Lesson/Section Audio (multilingual)

**Date:** 2026-06-08
**Status:** Design — approved, proceeding to plan + build
**Surface:** new `backend/podcasts/generate_podcasts.py` (offline CLI) · `backend/podcasts/manifest.json` · new `backend/routes/podcasts.py` · `frontend/src/components/PodcastPlayer.jsx` + Classroom entry point · `frontend/src/api.js` · new `gs://pymasters-podcasts` bucket (infra)

---

## 1. Goal & Context

Let a learner **listen to a lesson or section as a podcast** in their selected language: an AI-scripted, single-narrator episode (hook → segments → recap) spoken with a real voice, streamable + downloadable, with a transcript. This is request #2.

### Decisions locked during brainstorming
- **Full podcast:** AI-scripted narration + real TTS audio + transcript + download + player (not just read-aloud).
- **Engine:** **local/self-hosted TTS (Piper)** — free/offline. No GPU on laptop or Cloud Run, so quality is "good Piper TTS where a voice exists," weaker for Tamil/Telugu/Malayalam until better local voices exist.
- **Generation locus:** **offline laptop batch → GCS** (mirrors the translation pipeline). Covers **pre-rendered** lessons/sections, NOT arbitrary on-demand topics. Keeps load off the single Cloud Run instance.
- **Format:** **single narrator** (Vaathiyaar-style), structured episode; one voice per language.
- **Script engine:** **local Ollama** model writes the script in the selected language (consistent with the local-everything approach).
- **Serving:** offline tool uploads MP3 + transcript to a **public `gs://pymasters-podcasts` bucket** and updates a committed **`backend/podcasts/manifest.json`**; a backend endpoint serves the manifest; the player streams from GCS.

### Existing context
- Lessons are JSON under `backend/lessons/<track>/<id>.json` with `id`, `track`, `module`, and locale-map text fields (`title`, `description`, `story_variants`, `practice_challenges`, `tags.concepts_taught`). `resolveText` + `preferred_language` already localize content.
- Browser TTS (`useTTS`) reads text aloud today (kept as a fallback). No server TTS, no audio files.
- Routers register via `from routes.X import router` + `app.include_router(...)` in `backend/main.py`.
- `Classroom.currentLesson` holds the active lesson object (`.id`); `ProfileContext` exposes `language`.

### Out of scope
- On-demand podcasts for arbitrary user-typed topics (needs server-side TTS — not in this offline-batch design).
- Two-host/multi-voice format (single narrator only).
- Word-level karaoke transcript sync (transcript is shown, not time-synced — segment scroll only).

---

## 2. Architecture Overview

```
OFFLINE (laptop):  backend/podcasts/generate_podcasts.py
   per (lesson|section, lang):
     gather localized source text  ->  local Ollama writes single-narrator script (in lang)
        ->  local Piper synthesizes WAV  ->  ffmpeg -> MP3  ->  transcript .txt
        ->  upload MP3+txt to gs://pymasters-podcasts/{lang}/{id}.{mp3,txt} (public)
        ->  update backend/podcasts/manifest.json
   (commit manifest + deploy)

RUNTIME:
   backend/routes/podcasts.py:  GET /api/podcasts/manifest  -> serves manifest.json
   frontend:  PodcastPlayer reads manifest -> if entry for (lesson.id, language) -> stream GCS audio
```

The runtime is read-only (serve a small JSON + stream public audio). No new heavy infra on Cloud Run.

---

## 3. Offline generation tool — `backend/podcasts/generate_podcasts.py`

### 3.1 Config (env + CLI)
- `LOCAL_OLLAMA_URL` (default `http://localhost:11434`), `PODCAST_SCRIPT_MODEL` (default `qwen2.5:7b`).
- `PIPER_BIN` (path to the `piper` executable), `PIPER_VOICES` — a JSON/dict mapping `lang -> voice.onnx path` (env `PIPER_VOICES_JSON` or a `--voices` file). Languages without a configured voice are skipped with a warning.
- `PODCAST_BUCKET` (default `pymasters-podcasts`), `PODCAST_PUBLIC_BASE` (default `https://storage.googleapis.com/pymasters-podcasts`).
- CLI: `--langs`, `--track`, `--lesson <id>`, `--section <track>` (whole-section episode), `--write` (default dry-run), `--overwrite`, `--limit`.

### 3.2 Per-unit flow
1. **Resolve source text.** For a lesson: load its JSON; pull the localized (`resolveText`-style: `field[lang] || field['en']`) `title`, `description`, `story_variants`, each `practice_challenges[*]` instruction, and `tags.concepts_taught`. For a section (`--section <track>`): concatenate each lesson's title+description (localized) in `order`.
2. **Script generation (local Ollama).** Prompt the local model to write a **single-narrator podcast script in {LanguageName}**: a short hook, 2–5 segments that teach the concepts in plain spoken language, and a recap/outro. Rules: spoken prose only (no markdown, no code blocks; describe code conceptually, don't read it); natural pacing; target ~3–6 minutes for a lesson. Output plain text.
3. **TTS (local Piper).** Pipe the script text to `piper --model {voice} --output_file tmp.wav`; convert to MP3 with `ffmpeg -i tmp.wav -b:a 96k {id}.mp3`. (Long scripts: split into paragraphs, synth each, concatenate WAVs before encoding.)
4. **Transcript.** Write the script text as `{id}.txt`.
5. **Upload.** Put MP3 + txt to `gs://{PODCAST_BUCKET}/{lang}/{id}.mp3` and `.txt` via `gsutil`/`google-cloud-storage`, public-read. Compute MP3 duration (via `ffprobe` or mutagen) for the manifest.
6. **Manifest update.** Merge into `backend/podcasts/manifest.json`:
   ```json
   { "adv_async": { "ta": { "audio_url": "https://storage.googleapis.com/pymasters-podcasts/ta/adv_async.mp3",
                            "transcript_url": "https://storage.googleapis.com/pymasters-podcasts/ta/adv_async.txt",
                            "duration": 214 } } }
   ```
   (Section episodes keyed under `section:<track>`.)

### 3.3 Properties
- **Idempotent:** an existing `(id, lang)` manifest entry is skipped unless `--overwrite`.
- **Dry-run default:** prints the resolved source + generated script (and would-upload paths) without calling Piper/GCS or writing the manifest, so it's reviewable and CI-safe.
- **Safe failures:** a missing Piper voice / Ollama / gsutil error for one unit logs and skips; never corrupts the manifest (write atomically: load → merge → write).
- **Runbook** (in docstring + plan): install Ollama + model; install Piper + download per-language `.onnx` voices; `ffmpeg`; create the public bucket; run dry-run → review → `--write`.

---

## 4. Backend — manifest endpoint (`backend/routes/podcasts.py`)
- `backend/podcasts/manifest.json` committed (starts as `{}`).
- New router `routes/podcasts.py`: `GET /api/podcasts/manifest` → reads and returns the JSON file (small; read each call or cache in memory). Registered in `main.py` via `from routes.podcasts import router as podcasts_router` + `app.include_router(podcasts_router)`.
- (No auth needed — manifest is non-sensitive public availability data; audio is public.)

---

## 5. Frontend — player & entry point
### 5.1 API client
- `getPodcastManifest()` → `GET /api/podcasts/manifest` (cache the result in module scope / context after first fetch).

### 5.2 `PodcastPlayer` component (`frontend/src/components/PodcastPlayer.jsx`)
- Props: `contentId`, `language`, `manifest`, `onClose` (if modal) or inline.
- Looks up `manifest[contentId]?.[language]`. If present, renders an HTML5 `<audio src={audio_url}>` with: play/pause, a seek bar (current/total time), speed control (0.75/1/1.25/1.5×), ±15s skip, a **Download** link (the MP3 URL), and the **transcript** (fetched from `transcript_url`) shown in a scrollable panel below.
- If absent for `language`: show "Podcast not available in {language} yet" with (a) an offer to play the **English** episode if `manifest[contentId]?.en` exists, and (b) a note that the existing read-aloud (browser TTS) still works.
- Theme tokens; reduced-motion respected; accessible controls (labels, keyboard).

### 5.3 Entry point
- In **Classroom**, add a "Listen as podcast" button (headphones icon) on the lesson view, shown when `manifest[currentLesson.id]` has any entry; clicking opens the `PodcastPlayer` (drawer/modal) for `(currentLesson.id, language)`.
- (Section-level entry on a track/Paths view is a later add; the tool can already produce `section:<track>` episodes.)

---

## 6. Infrastructure (documented, user-owned)
- Create bucket `gs://pymasters-podcasts`, region `us-central1`, **public-read** (`allUsers:objectViewer`) so `<audio>` can stream and Download works. (Same GCP project; the runtime SA needs no access since serving is direct-from-GCS public URLs.)
- Runbook in the tool docstring + plan.

---

## 7. Error Handling & Edge Cases
- No manifest entry for the lesson at all → no "Listen as podcast" button (feature simply absent there).
- Entry exists for some languages but not the user's → graceful fallback message + optional English episode.
- Manifest file missing/corrupt at runtime → endpoint returns `{}` (no crash); player shows nothing.
- Audio URL 404 (bucket object removed) → `<audio>` error handler shows "couldn't load audio."
- Tool: long lessons split + concatenated; non-ASCII handled (UTF-8); dry-run never touches GCS/Piper; manifest merge is read-modify-write (no clobber of other entries).
- Piper lacks a voice for a language → tool skips that language (logged); manifest simply has no entry → player falls back.

---

## 8. Verification — Live User Testing
1. **Tool dry-run** on one lesson for `en` + `ta`: prints resolved source + generated script in-language; no GCS/Piper calls. Review script quality.
2. **Tool write** (after installing Piper + a voice + ffmpeg + bucket) on that lesson: MP3 produced + playable locally; uploaded to GCS (URL opens); `manifest.json` updated with the entry + duration.
3. **Deploy** (commit manifest): `GET /api/podcasts/manifest` returns the entry.
4. **App:** open that lesson at language=ta → "Listen as podcast" appears → streams the ta audio, transcript shows, Download works, speed/seek/skip work.
5. **Fallback:** open the lesson at a language with no entry → graceful message (+ English episode offer if present).
6. **Idempotency:** re-run the tool → existing `(id, lang)` skipped; manifest unchanged.

**Done when:** the player streams a pre-rendered in-language episode with transcript + download for a lesson that has a manifest entry, falls back gracefully otherwise, and the offline tool reproducibly generates+uploads+manifests an episode.

---

## 9. Implementation Order (for the plan)
1. `backend/podcasts/manifest.json` (`{}`) + `backend/routes/podcasts.py` (`GET /api/podcasts/manifest`) + register in `main.py`.
2. `frontend/src/api.js`: `getPodcastManifest`.
3. `frontend/src/components/PodcastPlayer.jsx` (player + transcript + download + fallback).
4. Classroom: fetch manifest + "Listen as podcast" entry wired to the player.
5. `backend/podcasts/generate_podcasts.py` (offline tool: source → local Ollama script → Piper → ffmpeg → GCS → manifest), dry-run default, idempotent.
6. Live user-testing pass (§8); bucket creation + Piper install + corpus run are user-driven offline steps.
