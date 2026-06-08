# Podcast Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners listen to a lesson/section as a single-narrator podcast in their language — pre-rendered offline (local Ollama script + local Piper audio), uploaded to public GCS, surfaced via a committed manifest and a player with transcript + download.

**Architecture:** Runtime is read-only: a backend endpoint serves a committed `manifest.json`; the frontend player streams public GCS audio when an entry exists for `(lesson.id, language)`, else falls back gracefully. An offline laptop CLI generates the audio + updates the manifest.

**Tech Stack:** FastAPI + SQLite backend; React 19 + Vite + Tailwind frontend; offline: local Ollama, Piper TTS, ffmpeg, GCS.

**Spec:** `docs/superpowers/specs/2026-06-08-podcast-mode-design.md`

**Verification:** Live user testing (no unit suites). Per-task checks are code-level (`python -m py_compile`, `npx eslint`, `npm run build`); the live pass + offline generation are LS-6/user-driven.

## Git hygiene (every task)
~400 pre-existing dirty files. **Stage only the exact file(s) each task touches** — never `git add -A`/`.`/`-a`. Branch `feat/podcasts` (checked out). End commit bodies with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure
- **Create** `backend/podcasts/manifest.json` (`{}`) + `backend/podcasts/__init__.py`.
- **Create** `backend/routes/podcasts.py` — `GET /api/podcasts/manifest`.
- **Modify** `backend/main.py` — register the router.
- **Modify** `frontend/src/api.js` — `getPodcastManifest`.
- **Create** `frontend/src/components/PodcastPlayer.jsx`.
- **Modify** `frontend/src/pages/Classroom.jsx` — manifest fetch + "Listen as podcast" entry.
- **Create** `backend/podcasts/generate_podcasts.py` — offline generator.

---

## Task PC-1: Manifest file + endpoint + registration

**Files:** Create `backend/podcasts/manifest.json`, `backend/podcasts/__init__.py`, `backend/routes/podcasts.py`; Modify `backend/main.py`

- [ ] **Step 1: Create the manifest + package marker**

`backend/podcasts/manifest.json`:
```json
{}
```
`backend/podcasts/__init__.py`: empty file.

- [ ] **Step 2: Create the router**

`backend/routes/podcasts.py`:
```python
"""
podcasts.py — serves the pre-rendered podcast availability manifest.
Prefix: /api/podcasts
"""
import json
import os

from fastapi import APIRouter

router = APIRouter(prefix="/api/podcasts", tags=["podcasts"])

_MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "podcasts", "manifest.json")


@router.get("/manifest")
def get_manifest():
    """Return the podcast manifest: { content_id: { lang: {audio_url, transcript_url, duration} } }."""
    try:
        with open(_MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}
```

- [ ] **Step 3: Register in main.py**

Add the import alongside the other `from routes.X import router as X_router` lines:
```python
from routes.podcasts import router as podcasts_router
```
And the include alongside the other `app.include_router(...)` calls:
```python
app.include_router(podcasts_router)
```

- [ ] **Step 4: Verify** — `python -m py_compile backend/routes/podcasts.py backend/main.py` → exit 0. `python -c "import json; print(json.load(open('backend/podcasts/manifest.json')))"` → `{}`.

- [ ] **Step 5: Commit**
```bash
git add backend/podcasts/manifest.json backend/podcasts/__init__.py backend/routes/podcasts.py backend/main.py
git commit -m "feat(podcasts): manifest file + GET /api/podcasts/manifest endpoint"
```

---

## Task PC-2: Frontend API client

**Files:** Modify `frontend/src/api.js`

- [ ] **Step 1: Add the function** (near the other `export const` API fns)
```javascript
export const getPodcastManifest = () => api.get('/podcasts/manifest');
```

- [ ] **Step 2: Verify** — from `frontend/`: `npx eslint src/api.js` → no new errors.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/api.js
git commit -m "feat(podcasts): getPodcastManifest client fn"
```

---

## Task PC-3: PodcastPlayer component

**Files:** Create `frontend/src/components/PodcastPlayer.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X, Play, Pause, Rewind, FastForward, Download, Headphones } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n/index.js';

function langName(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || code;
}
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function PodcastPlayer({ contentId, language, manifest, onClose }) {
  const reduced = useReducedMotion();
  const audioRef = useRef(null);
  const panelRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [transcript, setTranscript] = useState('');
  const [audioErr, setAudioErr] = useState(false);

  const byLang = manifest?.[contentId] || {};
  const entry = byLang[language] || null;
  const enEntry = byLang.en || null;
  const active = entry || (language !== 'en' ? null : null); // chosen-language entry only; en offered separately

  useEffect(() => {
    const prev = typeof document !== 'undefined' ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); try { prev?.focus?.(); } catch { /* gone */ } };
  }, [onClose]);

  useEffect(() => {
    const e = entry;
    setTranscript('');
    if (e?.transcript_url) {
      fetch(e.transcript_url).then((r) => r.ok ? r.text() : '').then(setTranscript).catch(() => {});
    }
  }, [entry]);

  const a = audioRef.current;
  const toggle = () => { if (!a) return; if (a.paused) { a.play(); } else { a.pause(); } };
  const skip = (d) => { if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)); };
  const setSpeed = (r) => { setRate(r); if (a) a.playbackRate = r; };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Podcast player"
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { scale: 0.96, opacity: 0 }} animate={reduced ? false : { scale: 1, opacity: 1 }} exit={reduced ? undefined : { scale: 0.96, opacity: 0 }}
          className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-bg-surface border border-border-default rounded-2xl shadow-2xl focus:outline-none">
          <div className="flex items-center gap-2 p-4 border-b border-border-default">
            <Headphones size={18} className="text-cyan-500" />
            <h2 className="text-base font-bold text-text-primary flex-1">Listen as podcast</h2>
            <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-secondary p-1"><X size={18} /></button>
          </div>

          {entry ? (
            <div className="p-4 space-y-4">
              <audio
                ref={audioRef}
                src={entry.audio_url}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = rate; }}
                onError={() => setAudioErr(true)}
                preload="metadata"
              />
              {audioErr ? <p className="text-sm text-red-500">Couldn't load the audio. Please try again later.</p> : null}

              <div className="flex items-center justify-center gap-4">
                <button onClick={() => skip(-15)} aria-label="Back 15 seconds" className="text-text-secondary hover:text-text-primary"><Rewind size={22} /></button>
                <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 text-white flex items-center justify-center">
                  {playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button onClick={() => skip(15)} aria-label="Forward 15 seconds" className="text-text-secondary hover:text-text-primary"><FastForward size={22} /></button>
              </div>

              <div className="space-y-1">
                <input type="range" min={0} max={dur || 0} value={cur} step="1"
                  onChange={(e) => { if (a) a.currentTime = Number(e.target.value); }}
                  aria-label="Seek" className="w-full accent-cyan-500" />
                <div className="flex justify-between text-[11px] text-text-muted"><span>{fmt(cur)}</span><span>{fmt(dur)}</span></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {[0.75, 1, 1.25, 1.5].map((r) => (
                    <button key={r} onClick={() => setSpeed(r)}
                      className={`text-xs px-2 py-1 rounded-lg border ${rate === r ? 'bg-cyan-500 text-white border-cyan-500' : 'border-border-default text-text-secondary hover:bg-bg-elevated'}`}>{r}×</button>
                  ))}
                </div>
                <a href={entry.audio_url} download className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:text-cyan-700">
                  <Download size={14} /> Download
                </a>
              </div>

              {transcript ? (
                <div className="border-t border-border-default pt-3">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Transcript</h3>
                  <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{transcript}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-text-muted">No podcast in {langName(language)} yet for this lesson.</p>
              {enEntry ? (
                <p className="text-sm text-text-secondary">An English episode is available — <a href={enEntry.audio_url} className="text-cyan-600 font-semibold" target="_blank" rel="noopener noreferrer">play it</a>.</p>
              ) : null}
              <p className="text-xs text-text-muted">You can still use read-aloud in the lesson.</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify** — from `frontend/`: `npx eslint src/components/PodcastPlayer.jsx` → 0 errors (the `active` line is intentionally simple; if eslint flags `active` as unused, remove that line — it's not used in the render). Actually REMOVE the unused `const active = ...` line before committing (it's vestigial). Re-run eslint → clean.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/PodcastPlayer.jsx
git commit -m "feat(podcasts): PodcastPlayer (audio + transcript + download + fallback)"
```

---

## Task PC-4: Classroom entry point

**Files:** Modify `frontend/src/pages/Classroom.jsx`

- [ ] **Step 1: Fetch the manifest + state**

Add imports: `import PodcastPlayer from '../components/PodcastPlayer';` and `import { getPodcastManifest } from '../api';` (and `Headphones` from lucide-react if you use it for the button). In the Classroom component, add state:
```jsx
const [podcastManifest, setPodcastManifest] = useState({});
const [podcastOpen, setPodcastOpen] = useState(false);
```
Add a one-time fetch effect:
```jsx
useEffect(() => { getPodcastManifest().then((r) => setPodcastManifest(r.data || {})).catch(() => {}); }, []);
```

- [ ] **Step 2: Show the button when an episode exists for the active lesson**

Where the lesson view header/actions render (near where `currentLesson` is shown), add — only when the manifest has any entry for the lesson:
```jsx
{currentLesson?.id && podcastManifest[currentLesson.id] && (
  <button
    onClick={() => setPodcastOpen(true)}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-bg-elevated text-text-secondary border border-border-default hover:bg-bg-inset"
  >
    <Headphones size={15} /> Listen as podcast
  </button>
)}
```
(Place it consistently with other lesson action buttons; adapt classes to match.)

- [ ] **Step 3: Render the player**

Near the end of the component render:
```jsx
{podcastOpen && currentLesson?.id && (
  <PodcastPlayer
    contentId={currentLesson.id}
    language={language}
    manifest={podcastManifest}
    onClose={() => setPodcastOpen(false)}
  />
)}
```
(`language` already comes from `useProfile()` in Classroom from the previous feature.)

- [ ] **Step 4: Verify** — from `frontend/`: `npx eslint src/pages/Classroom.jsx` → no new errors. Then `npm run build` → `✓ built`.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Classroom.jsx
git commit -m "feat(podcasts): Listen-as-podcast entry in Classroom"
```

---

## Task PC-5: Offline generator tool

**Files:** Create `backend/podcasts/generate_podcasts.py`

- [ ] **Step 1: Create the tool**

```python
"""
generate_podcasts.py — OFFLINE batch podcast generator (run on the laptop).

Per (lesson|section, language): resolve localized source text -> local Ollama
writes a single-narrator podcast script in that language -> local Piper synth ->
ffmpeg -> MP3 + transcript -> upload to gs://pymasters-podcasts -> update
backend/podcasts/manifest.json.

Dry-run by default (prints script; no Piper/GCS/manifest writes).

Prereqs (user, offline): local Ollama + model; piper + per-language .onnx voices;
ffmpeg; gsutil auth; a public gs://pymasters-podcasts bucket.

Env:
  LOCAL_OLLAMA_URL        default http://localhost:11434
  PODCAST_SCRIPT_MODEL    default qwen2.5:7b
  PIPER_BIN               default 'piper'
  PIPER_VOICES_JSON       JSON map {"en":"/path/en.onnx","ta":"/path/ta.onnx",...}
  PODCAST_BUCKET          default pymasters-podcasts
  PODCAST_PUBLIC_BASE     default https://storage.googleapis.com/pymasters-podcasts

Usage:
  python backend/podcasts/generate_podcasts.py --langs en,ta --lesson adv_async        # dry-run
  python backend/podcasts/generate_podcasts.py --langs en,ta --lesson adv_async --write
  python backend/podcasts/generate_podcasts.py --langs en --section python_fundamentals --write
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(__file__)
LESSONS_DIR = os.path.join(HERE, "..", "lessons")
MANIFEST_PATH = os.path.join(HERE, "manifest.json")

OLLAMA_URL = os.getenv("LOCAL_OLLAMA_URL", "http://localhost:11434")
SCRIPT_MODEL = os.getenv("PODCAST_SCRIPT_MODEL", "qwen2.5:7b")
PIPER_BIN = os.getenv("PIPER_BIN", "piper")
PODCAST_BUCKET = os.getenv("PODCAST_BUCKET", "pymasters-podcasts")
PUBLIC_BASE = os.getenv("PODCAST_PUBLIC_BASE", "https://storage.googleapis.com/pymasters-podcasts")

LANG_NAMES = {"en": "English", "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
              "fr": "French", "es": "Spanish", "it": "Italian", "ko": "Korean"}


def _voices():
    try:
        return json.loads(os.getenv("PIPER_VOICES_JSON", "{}"))
    except Exception:
        return {}


def loc(field, lang):
    """resolveText-equivalent: field can be a locale-map or a plain string."""
    if isinstance(field, dict):
        return field.get(lang) or field.get("en") or next(iter(field.values()), "")
    return field or ""


def find_lesson(lesson_id):
    import glob
    for path in glob.glob(os.path.join(LESSONS_DIR, "**", "*.json"), recursive=True):
        try:
            with open(path, "r", encoding="utf-8") as f:
                d = json.load(f)
            if d.get("id") == lesson_id:
                return d, path
        except Exception:
            continue
    return None, None


def lesson_source_text(d, lang):
    parts = [loc(d.get("title"), lang), loc(d.get("description"), lang), loc(d.get("story_variants"), lang)]
    for ch in d.get("practice_challenges", []) or []:
        parts.append(loc(ch.get("instruction") or ch.get("challenge_instruction"), lang))
    tags = d.get("tags") or {}
    concepts = tags.get("concepts_taught")
    if concepts:
        parts.append("Key concepts: " + (", ".join(concepts) if isinstance(concepts, list) else str(concepts)))
    return "\n\n".join(p for p in parts if p and str(p).strip())


def section_source_text(track, lang):
    import glob
    lessons = []
    for path in sorted(glob.glob(os.path.join(LESSONS_DIR, track, "*.json"))):
        try:
            with open(path, "r", encoding="utf-8") as f:
                d = json.load(f)
            lessons.append((d.get("order", 0), loc(d.get("title"), lang), loc(d.get("description"), lang)))
        except Exception:
            continue
    lessons.sort(key=lambda x: x[0])
    return "\n\n".join(f"{t}. {desc}" for _, t, desc in lessons if t)


def write_script(source, lang_name):
    prompt = (
        f"You are a podcast scriptwriter for a coding course. Using the lesson material below, "
        f"write a single-narrator podcast episode script ENTIRELY in {lang_name}. Structure: a short "
        f"hook, 2-5 segments that teach the ideas in warm, plain spoken language, then a brief recap. "
        f"Rules: spoken prose only — NO markdown, NO code blocks, NO reading code aloud (describe code "
        f"conceptually). Natural pacing, ~3-6 minutes. Output ONLY the narration text.\n\n"
        f"LESSON MATERIAL:\n{source}"
    )
    body = json.dumps({"model": SCRIPT_MODEL, "messages": [{"role": "user", "content": prompt}],
                       "stream": False, "options": {"temperature": 0.6}}).encode("utf-8")
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return (data.get("message") or {}).get("content", "").strip()


def synth_and_upload(script, lang, content_id):
    """Piper -> ffmpeg -> gsutil upload. Returns (audio_url, transcript_url, duration) or raises."""
    voice = _voices().get(lang)
    if not voice:
        raise RuntimeError(f"no Piper voice configured for '{lang}' (set PIPER_VOICES_JSON)")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "out.wav")
        mp3 = os.path.join(tmp, f"{content_id}.mp3")
        txt = os.path.join(tmp, f"{content_id}.txt")
        with open(txt, "w", encoding="utf-8") as f:
            f.write(script)
        subprocess.run([PIPER_BIN, "--model", voice, "--output_file", wav],
                       input=script.encode("utf-8"), check=True)
        subprocess.run(["ffmpeg", "-y", "-i", wav, "-b:a", "96k", mp3], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # duration via ffprobe
        dur = 0
        try:
            out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "default=noprint_wrappers=1:nokey=1", mp3],
                                 capture_output=True, text=True, check=True)
            dur = int(float(out.stdout.strip()))
        except Exception:
            pass
        base = f"gs://{PODCAST_BUCKET}/{lang}/{content_id}"
        subprocess.run(["gsutil", "cp", "-a", "public-read", mp3, base + ".mp3"], check=True)
        subprocess.run(["gsutil", "cp", "-a", "public-read", txt, base + ".txt"], check=True)
        return (f"{PUBLIC_BASE}/{lang}/{content_id}.mp3", f"{PUBLIC_BASE}/{lang}/{content_id}.txt", dur)


def load_manifest():
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_manifest(m):
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser(description="Offline podcast generator.")
    ap.add_argument("--langs", default="en")
    ap.add_argument("--lesson", help="lesson id")
    ap.add_argument("--section", help="track name for a whole-section episode")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    langs = [l.strip() for l in args.langs.split(",") if l.strip() in LANG_NAMES]
    if not langs or not (args.lesson or args.section):
        print("Need --langs and one of --lesson/--section", file=sys.stderr); sys.exit(1)

    if args.section:
        content_id = f"section:{args.section}"
        get_source = lambda lg: section_source_text(args.section, lg)
    else:
        d, path = find_lesson(args.lesson)
        if not d:
            print(f"lesson '{args.lesson}' not found", file=sys.stderr); sys.exit(1)
        content_id = args.lesson
        get_source = lambda lg: lesson_source_text(d, lg)

    manifest = load_manifest()
    print(f"content_id={content_id} | langs={langs} | write={args.write}")
    for lang in langs:
        if not args.overwrite and manifest.get(content_id, {}).get(lang):
            print(f"  [{lang}] already in manifest — skip"); continue
        source = get_source(lang)
        if not source.strip():
            print(f"  [{lang}] no source text — skip"); continue
        print(f"  [{lang}] generating script…")
        try:
            script = write_script(source, LANG_NAMES[lang]) if args.write else \
                     (write_script(source, LANG_NAMES[lang]) if False else "[dry-run] script not generated (use --write to call Ollama)")
        except Exception as e:
            print(f"  [{lang}] script failed: {e}"); continue
        if not args.write:
            preview = (source[:200] + "…") if len(source) > 200 else source
            print(f"    source preview: {preview}")
            print(f"    (dry-run) would synth with Piper + upload to gs://{PODCAST_BUCKET}/{lang}/{content_id}.mp3")
            continue
        print(f"    script chars: {len(script)} — synthesizing + uploading…")
        try:
            audio_url, transcript_url, dur = synth_and_upload(script, lang, content_id)
        except Exception as e:
            print(f"  [{lang}] synth/upload failed: {e}"); continue
        manifest.setdefault(content_id, {})[lang] = {
            "audio_url": audio_url, "transcript_url": transcript_url, "duration": dur}
        save_manifest(manifest)
        print(f"  [{lang}] done: {audio_url} ({dur}s)")
    print("manifest:", MANIFEST_PATH)


if __name__ == "__main__":
    main()
```

NOTE on the dry-run script line: simplify it — in dry-run, do NOT call Ollama. Replace the convoluted ternary with a clean guard so dry-run never hits the model:
```python
        if args.write:
            try:
                script = write_script(source, LANG_NAMES[lang])
            except Exception as e:
                print(f"  [{lang}] script failed: {e}"); continue
        else:
            preview = (source[:200] + "…") if len(source) > 200 else source
            print(f"    source preview: {preview}")
            print(f"    (dry-run) would generate script + synth + upload to gs://{PODCAST_BUCKET}/{lang}/{content_id}.mp3")
            continue
```
Implement it with this clean structure (the block above replaces the messy `script = ...`/dry-run lines).

- [ ] **Step 2: Verify** — `python -m py_compile backend/podcasts/generate_podcasts.py` → exit 0. Dry-run (no Ollama/Piper/GCS needed): `python backend/podcasts/generate_podcasts.py --langs en --lesson adv_async` → prints content_id, a source preview, and a "(dry-run) would generate…" line; no network calls. Report output.

- [ ] **Step 3: Commit**
```bash
git add backend/podcasts/generate_podcasts.py
git commit -m "feat(podcasts): offline generator (Ollama script + Piper TTS + GCS + manifest)"
```

---

## Task PC-6: Build + deploy + live pass

**Files:** none (verification + deploy)

- [ ] **Step 1: Full build + merge + deploy**
```bash
cd frontend && npm run build   # ✓ built
cd .. && git checkout main && git merge feat/podcasts && git push origin main
```
Watch: `gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status` → success. Smoke: `curl -s https://pymasters.net/api/podcasts/manifest` → `{}` (empty until generated).

- [ ] **Step 2: Offline generation (user-driven, documented):** create the public `gs://pymasters-podcasts` bucket; install Ollama + model, Piper + an `en` + `ta` voice, ffmpeg; set `PIPER_VOICES_JSON`; run `--lesson adv_async --langs en,ta` dry-run → review → `--write`; commit the updated `manifest.json`; push (auto-deploy).

- [ ] **Step 3: Live app check:** open lesson `adv_async` at language=ta → "Listen as podcast" appears → streams audio, transcript shows, Download + seek + speed work; a lesson/language with no entry shows no button / graceful fallback; re-run the tool → idempotent (skips existing).

- [ ] **Step 4:** Done when the player streams a generated episode and falls back gracefully otherwise.

---

## Self-Review (completed by author)
- **Spec coverage:** manifest+endpoint (PC-1) · api client (PC-2) · PodcastPlayer (PC-3) · Classroom entry (PC-4) · offline generator (PC-5) · build/deploy/live (PC-6). All §3–§8 mapped (section-level frontend entry intentionally deferred per spec §5.3; tool supports `--section`).
- **Type/name consistency:** `getPodcastManifest` (PC-2) used in PC-4; `PodcastPlayer` props `{contentId, language, manifest, onClose}` match PC-4 usage; manifest shape `{id:{lang:{audio_url,transcript_url,duration}}}` consistent across endpoint/player/generator; `language` from `useProfile()` (already in Classroom).
- **Placeholders:** none — PC-5 step 1 includes a NOTE replacing the messy dry-run line with a clean guard (explicit code), not a TODO.
- **Risk note:** runtime ships an empty manifest (no buttons appear) until the user runs the offline generator and commits entries; this is the intended phased rollout. Audio quality bounded by available Piper voices (Dravidian weak).
