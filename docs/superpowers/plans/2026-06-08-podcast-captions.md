# Podcast Captions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-synced captions to the pre-rendered podcasts: offline, generate a script-accurate WebVTT (Whisper word timestamps + our exact script, proportional fallback); in the player, highlight/auto-scroll the active line and click-to-seek.

**Architecture:** The offline generator emits a `.vtt` alongside each MP3 and records `captions_url` in the manifest. `PodcastPlayer` parses the VTT and syncs it to the `<audio>`; falls back to the static transcript when absent.

**Tech Stack:** Python (faster-whisper, CTranslate2, CPU) offline; React 19 frontend.

**Spec:** `docs/superpowers/specs/2026-06-08-podcast-captions-design.md`

**Verification:** Live user testing. Per-task: `python -m py_compile`, `npx eslint`, `npm run build`. Offline caption generation is user-driven (needs `faster-whisper`).

## Git hygiene (every task)
~400 pre-existing dirty files. **Stage only the exact file(s) each task touches** — never `git add -A`/`.`/`-a`. Branch `feat/podcast-captions` (checked out). End commit bodies with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure
- **Modify** `backend/podcasts/generate_podcasts.py` — caption helpers + wire `captions_url`.
- **Modify** `frontend/src/components/PodcastPlayer.jsx` — VTT parse + synced caption view.

---

## Task CAP-1: Offline caption generation

**Files:** Modify `backend/podcasts/generate_podcasts.py`

- [ ] **Step 1: Add the caption helpers**

Add these functions at module scope (e.g. after `synth_piper` / before `synth_and_upload`). `WHISPER_MODEL` reads from env. Heavy import is lazy inside `whisper_words`.

```python
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_LANGS = {"en", "ta", "te", "ml", "fr", "es", "it", "ko"}


def split_cues(script, max_chars=140):
    """Split the narration into caption cues (text = exact script)."""
    import re
    cues = []
    for s in re.split(r"(?<=[.!?।॥])\s+", script.strip()):
        s = s.strip()
        if not s:
            continue
        if len(s) <= max_chars:
            cues.append(s)
        else:
            buf = ""
            for part in re.split(r"(?<=[,;])\s+", s):
                if len(buf) + len(part) + 1 > max_chars and buf:
                    cues.append(buf.strip()); buf = part
                else:
                    buf = (buf + " " + part) if buf else part
            if buf.strip():
                cues.append(buf.strip())
    return cues or [script.strip()]


def _norm(w):
    import re
    return re.sub(r"[^\w]", "", w.lower())


def whisper_words(mp3_path, lang):
    """faster-whisper word timestamps -> [(norm_word, start, end)]. [] on any failure."""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        segments, _ = model.transcribe(
            mp3_path, language=(lang if lang in WHISPER_LANGS else None), word_timestamps=True)
        words = []
        for seg in segments:
            for w in (seg.words or []):
                n = _norm(w.word)
                if n:
                    words.append((n, float(w.start), float(w.end)))
        return words
    except Exception as e:
        print(f"    captions: whisper unavailable/failed ({e}) — proportional fallback")
        return []


def _proportional(cues, duration):
    total = sum(len(c) for c in cues) or 1
    out, t = [], 0.0
    for c in cues:
        span = (len(c) / total) * duration
        out.append((t, min(duration, t + span), c))
        t += span
    return out


def align_cues(cues, ww, duration):
    """Assign each cue [start,end] from matched Whisper word timestamps; fill gaps proportionally."""
    import difflib
    our = []  # (cue_idx, norm_word)
    for i, c in enumerate(cues):
        for tok in c.split():
            n = _norm(tok)
            if n:
                our.append((i, n))
    if not our or not ww:
        return _proportional(cues, duration)
    our_norm = [n for _, n in our]
    wh_norm = [n for n, _, _ in ww]
    ts = [None] * len(our)
    sm = difflib.SequenceMatcher(a=our_norm, b=wh_norm, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            ts[a + k] = (ww[b + k][1], ww[b + k][2])
    cue_t = [[None, None] for _ in cues]
    for (ci, _), t in zip(our, ts):
        if t is None:
            continue
        s, e = t
        if cue_t[ci][0] is None or s < cue_t[ci][0]:
            cue_t[ci][0] = s
        if cue_t[ci][1] is None or e > cue_t[ci][1]:
            cue_t[ci][1] = e
    matched = sum(1 for c in cue_t if c[0] is not None)
    if matched < max(1, len(cues) // 3):
        return _proportional(cues, duration)  # too sparse -> proportional
    # forward/backward fill + monotonic, clamped to [0, duration]
    prev_end = 0.0
    out = []
    for i, (c, (cs, ce)) in enumerate(zip(cues, cue_t)):
        start = cs if cs is not None else prev_end
        start = max(prev_end, min(start, duration))
        if ce is not None:
            end = max(start + 0.3, min(ce, duration))
        else:
            # estimate by char proportion of the remaining text/time
            rem_chars = sum(len(x) for x in cues[i:]) or 1
            rem_time = max(0.3, duration - start)
            end = min(duration, start + (len(c) / rem_chars) * rem_time)
        end = max(end, start + 0.3)
        out.append((start, end, c))
        prev_end = end
    return out


def _vtt_ts(sec):
    sec = max(0.0, sec)
    h = int(sec // 3600); m = int((sec % 3600) // 60); s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def to_vtt(timed):
    lines = ["WEBVTT", ""]
    for start, end, text in timed:
        lines.append(f"{_vtt_ts(start)} --> {_vtt_ts(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def build_captions(mp3_path, script, lang, duration):
    """Returns a WebVTT string (Whisper-timed where possible, proportional fallback)."""
    cues = split_cues(script)
    ww = whisper_words(mp3_path, lang)
    timed = align_cues(cues, ww, float(duration or 0) or _safe_dur(timed_total=cues))
    return to_vtt(timed)
```

NOTE: `build_captions` references a fallback duration. Simplify it — `duration` is always passed (the MP3 duration computed by ffprobe). If `duration` is 0/unknown, default to `len(script)/15` seconds (≈ speaking rate). Replace the last two lines of `build_captions` with:

```python
    dur = float(duration or 0) or max(1.0, len(script) / 15.0)
    timed = align_cues(cues, ww, dur)
    return to_vtt(timed)
```
(Remove the `_safe_dur` reference entirely — it does not exist.)

- [ ] **Step 2: Wire captions into `synth_and_upload`**

In `synth_and_upload`, after `dur` is computed and the MP3/txt are uploaded, generate + upload the VTT and return it. Change the function's tail. Find the existing upload block:
```python
        base = f"gs://{PODCAST_BUCKET}/{lang}/{safe_id}"
        subprocess.run(["gsutil", "cp", "-a", "public-read", mp3, base + ".mp3"], check=True)
        subprocess.run(["gsutil", "cp", "-a", "public-read", txt, base + ".txt"], check=True)
        return (f"{PUBLIC_BASE}/{lang}/{safe_id}.mp3", f"{PUBLIC_BASE}/{lang}/{safe_id}.txt", dur)
```
Replace it with:
```python
        base = f"gs://{PODCAST_BUCKET}/{lang}/{safe_id}"
        subprocess.run(["gsutil", "cp", "-a", "public-read", mp3, base + ".mp3"], check=True)
        subprocess.run(["gsutil", "cp", "-a", "public-read", txt, base + ".txt"], check=True)
        captions_url = None
        try:
            vtt_text = build_captions(mp3, script, lang, dur)
            vtt = os.path.join(tmp, f"{safe_id}.vtt")
            with open(vtt, "w", encoding="utf-8") as f:
                f.write(vtt_text)
            subprocess.run(["gsutil", "cp", "-a", "public-read", vtt, base + ".vtt"], check=True)
            captions_url = f"{PUBLIC_BASE}/{lang}/{safe_id}.vtt"
        except Exception as e:
            print(f"    captions: skipped ({e})")
        return (f"{PUBLIC_BASE}/{lang}/{safe_id}.mp3", f"{PUBLIC_BASE}/{lang}/{safe_id}.txt", dur, captions_url)
```

- [ ] **Step 3: Update the caller (`main`) to store `captions_url`**

Find where `synth_and_upload` is called in `main()`:
```python
                audio_url, transcript_url, dur = synth_and_upload(script, lang, content_id)
```
Change to unpack the 4th value and store it:
```python
                audio_url, transcript_url, dur, captions_url = synth_and_upload(script, lang, content_id)
```
And update the manifest write to include `captions_url` when present:
```python
            entry = {"audio_url": audio_url, "transcript_url": transcript_url, "duration": dur}
            if captions_url:
                entry["captions_url"] = captions_url
            manifest.setdefault(content_id, {})[lang] = entry
```
(Replace the existing `manifest.setdefault(content_id, {})[lang] = {...}` assignment with the above.)

- [ ] **Step 4: Verify** — `python -m py_compile backend/podcasts/generate_podcasts.py` → exit 0. Dry-run (no whisper/audio needed; dry-run never calls synth): `python backend/podcasts/generate_podcasts.py --langs en --lesson adv_async` → still prints the dry-run lines, `manifest.json` unchanged. Also sanity-check the pure helpers offline:
```bash
python -c "import sys; sys.path.insert(0,'backend/podcasts'); import generate_podcasts as g; cues=g.split_cues('Hello world. This is a test, with a clause; and more. End.'); print('cues:', cues); print(g.to_vtt(g._proportional(cues, 12.0)))"
```
Expected: prints cues and a valid `WEBVTT` block with increasing timestamps. Paste output.

- [ ] **Step 5: Commit**
```bash
git add backend/podcasts/generate_podcasts.py
git commit -m "feat(podcasts): Whisper-timed script-accurate WebVTT captions (proportional fallback)"
```

---

## Task CAP-2: Synced caption view in the player

**Files:** Modify `frontend/src/components/PodcastPlayer.jsx`

- [ ] **Step 1: Add VTT parsing + state**

Read the file. Add a module-scope VTT parser (above the component):
```jsx
function parseVtt(text) {
  if (!text) return [];
  const cues = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  const toSec = (t) => {
    const m = t.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) return null;
    return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4]) / 1000);
  };
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const tl = lines.find((l) => l.includes('-->'));
    if (!tl) continue;
    const [a, bb] = tl.split('-->');
    const start = toSec(a); const end = toSec(bb);
    if (start == null || end == null) continue;
    const text2 = lines.slice(lines.indexOf(tl) + 1).join(' ').trim();
    if (text2) cues.push({ start, end, text: text2 });
  }
  return cues;
}
```
Inside the component, add state: `const [cues, setCues] = useState([]);`, `const [showCaptions, setShowCaptions] = useState(true);`, `const [activeCue, setActiveCue] = useState(-1);`, and `const cueRefs = useRef([]);`.

- [ ] **Step 2: Fetch the VTT (alongside the existing transcript fetch)**

Where the component fetches the transcript (the effect on `entry`), also fetch `entry.captions_url` and parse it:
```jsx
  useEffect(() => {
    setCues([]); setActiveCue(-1);
    if (entry?.captions_url) {
      fetch(entry.captions_url).then((r) => r.ok ? r.text() : '').then((t) => setCues(parseVtt(t))).catch(() => {});
    }
  }, [entry]);
```
(Keep the existing transcript-text fetch effect as-is for the fallback.)

- [ ] **Step 3: Track the active cue on timeupdate**

Change the `<audio onTimeUpdate>` handler to also compute the active cue:
```jsx
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  setCur(t);
                  if (cues.length) {
                    const idx = cues.findIndex((c) => t >= c.start && t < c.end);
                    if (idx !== -1 && idx !== activeCue) setActiveCue(idx);
                  }
                }}
```
Add an effect to auto-scroll the active cue into view:
```jsx
  useEffect(() => {
    if (activeCue >= 0 && cueRefs.current[activeCue]) {
      cueRefs.current[activeCue].scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [activeCue, reduced]);
```

- [ ] **Step 4: Render the synced caption view (replace the transcript block when cues exist)**

Replace the existing transcript render block:
```jsx
              {transcript ? (
                <div className="border-t border-border-default pt-3">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Transcript</h3>
                  <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{transcript}</div>
                </div>
              ) : null}
```
with:
```jsx
              {(cues.length > 0 || transcript) ? (
                <div className="border-t border-border-default pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-text-secondary">{cues.length > 0 ? 'Captions' : 'Transcript'}</h3>
                    {cues.length > 0 && (
                      <button onClick={() => setShowCaptions((v) => !v)} className="text-xs text-text-muted hover:text-text-secondary">
                        {showCaptions ? 'Hide sync' : 'Show sync'}
                      </button>
                    )}
                  </div>
                  {cues.length > 0 && showCaptions ? (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {cues.map((c, i) => (
                        <p
                          key={i}
                          ref={(el) => { cueRefs.current[i] = el; }}
                          onClick={() => { if (a) a.currentTime = c.start; }}
                          className={`text-sm leading-relaxed cursor-pointer rounded px-2 py-1 transition-colors ${i === activeCue ? 'bg-cyan-500/10 text-text-primary font-medium' : 'text-text-muted hover:bg-bg-elevated'}`}
                        >
                          {c.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">{transcript}</div>
                  )}
                </div>
              ) : null}
```

- [ ] **Step 5: Verify** — from `frontend/`: `npx eslint src/components/PodcastPlayer.jsx` → 0 new errors (the `set-state-in-effect` rule may require the same async/guard pattern already used for the transcript effect — mirror it if eslint complains). Then `npm run build` → `✓ built`.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/PodcastPlayer.jsx
git commit -m "feat(podcasts): synced caption view (VTT highlight + auto-scroll + click-to-seek)"
```

---

## Task CAP-3: Build + deploy + live pass

**Files:** none (verification + deploy)

- [ ] **Step 1: Build + merge + deploy**
```bash
cd frontend && npm run build   # ✓ built
cd .. && git checkout main && git merge feat/podcast-captions && git push origin main
```
Watch: `gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status` → success. (Manifest endpoint already returns the full entry incl. `captions_url`; no backend route change.)

- [ ] **Step 2: Offline (user-driven):** `pip install faster-whisper`; regenerate a podcast (e.g. `--lesson adv_async --langs en --write --overwrite`) → confirm a `.vtt` is uploaded and `captions_url` is in `manifest.json`; commit the manifest; push.

- [ ] **Step 3: Live app:** open that lesson's podcast → the Captions list highlights + auto-scrolls in sync; clicking a line seeks; the sync toggle works; an entry without `captions_url` still shows the static transcript.

- [ ] **Step 4:** Done when captions sync live and degrade gracefully.

---

## Self-Review (completed by author)
- **Spec coverage:** caption helpers + VTT + manifest `captions_url` (CAP-1); player VTT parse + synced view (CAP-2); deploy + live (CAP-3). §3–§6 mapped.
- **Type/name consistency:** `synth_and_upload` now returns a 4-tuple — CAP-1 step 3 updates the sole caller's unpack to match (4 values). `build_captions(mp3, script, lang, dur)` ⇄ wired call. Manifest key `captions_url` consistent backend (CAP-1) ⇄ player (CAP-2). `parseVtt`/`cues`/`activeCue` consistent in CAP-2.
- **Placeholders:** none — CAP-1 step 1 NOTE removes the stray `_safe_dur` reference with explicit replacement code.
- **Risk note:** captions are optional everywhere (offline try/except → `captions_url=None`; player checks for it) so nothing breaks if faster-whisper isn't installed or a VTT is missing.
