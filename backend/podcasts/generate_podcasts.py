"""
generate_podcasts.py — OFFLINE batch podcast generator (run on the laptop).

Per (lesson|section, language): resolve localized source text -> local Ollama
writes a single-narrator podcast script in that language -> local Piper synth ->
ffmpeg -> MP3 + transcript -> upload to gs://pymasters-podcasts -> update
backend/podcasts/manifest.json.

Dry-run by default (prints a source preview; no Ollama/Piper/GCS/manifest writes).

TTS engine per language (research-backed best fit, all free + CPU + commercial license):
  - en/ta/te/ml -> ai4bharat/indic-parler-tts (Apache-2.0, VITS/Parler, covers Dravidian)
  - fr/es/it/ko -> Piper (.onnx voices, fast on CPU)
Override the map with TTS_ENGINE_MAP_JSON.

Prereqs (user, offline):
  - local Ollama + script model (script generation)
  - for parler langs: `pip install parler-tts transformers torch soundfile` and accept the
    gated model terms at https://hf.co/ai4bharat/indic-parler-tts (huggingface-cli login)
  - for piper langs: the `piper` binary + per-language .onnx voices (PIPER_VOICES_JSON)
  - ffmpeg (+ ffprobe); gsutil auth; a public gs://pymasters-podcasts bucket

Env:
  LOCAL_OLLAMA_URL        default http://localhost:11434
  PODCAST_SCRIPT_MODEL    default qwen2.5:7b
  TTS_ENGINE_MAP_JSON     override per-language engine, e.g. {"ko":"parler"}
  PARLER_MODEL            default ai4bharat/indic-parler-tts
  PARLER_DESCRIPTIONS_JSON override per-language voice descriptions
  PIPER_BIN               default 'piper'
  PIPER_VOICES_JSON       JSON map {"fr":"/path/fr.onnx","it":"/path/it.onnx",...}
  PODCAST_BUCKET          default pymasters-podcasts
  PODCAST_PUBLIC_BASE     default https://storage.googleapis.com/pymasters-podcasts

Usage:
  python backend/podcasts/generate_podcasts.py --langs en,ta --lesson adv_async        # dry-run
  python backend/podcasts/generate_podcasts.py --langs en,ta --lesson adv_async --write
  python backend/podcasts/generate_podcasts.py --langs en --section python_fundamentals --write
"""
import argparse
import glob
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

# Per-language TTS engine. Default: "parler" (ai4bharat/indic-parler-tts, Apache-2.0,
# CPU-runnable, covers en/ta/te/ml incl. Dravidian) for the Indian languages + English;
# "piper" (fast CPU, good fr/es/it/ko voices) for the rest. Override TTS_ENGINE_MAP_JSON.
DEFAULT_ENGINE_MAP = {"en": "parler", "ta": "parler", "te": "parler", "ml": "parler",
                      "fr": "piper", "es": "piper", "it": "piper", "ko": "piper"}
PARLER_MODEL = os.getenv("PARLER_MODEL", "ai4bharat/indic-parler-tts")

# indic-parler-tts picks the voice from a natural-language DESCRIPTION (use a recommended
# speaker name per language; see the model card). Override PARLER_DESCRIPTIONS_JSON.
DEFAULT_PARLER_DESCRIPTIONS = {
    "en": "Mary speaks in a warm, clear voice with expressive, friendly delivery at a moderate pace, with very high recording quality and no background noise.",
    "ta": "Jaya speaks in a warm, clear Tamil voice with expressive, friendly delivery at a moderate pace, with very high recording quality and no background noise.",
    "te": "Prakash speaks in a warm, clear Telugu voice with expressive, friendly delivery at a moderate pace, with very high recording quality and no background noise.",
    "ml": "Anjali speaks in a warm, clear Malayalam voice with expressive, friendly delivery at a moderate pace, with very high recording quality and no background noise.",
}

_PARLER = {}  # lazy-loaded cache: {model, desc_tok, prompt_tok}


def _engine_map():
    try:
        m = dict(DEFAULT_ENGINE_MAP)
        m.update(json.loads(os.getenv("TTS_ENGINE_MAP_JSON", "{}")))
        return m
    except Exception:
        return dict(DEFAULT_ENGINE_MAP)


def _parler_descriptions():
    try:
        d = dict(DEFAULT_PARLER_DESCRIPTIONS)
        d.update(json.loads(os.getenv("PARLER_DESCRIPTIONS_JSON", "{}")))
        return d
    except Exception:
        return dict(DEFAULT_PARLER_DESCRIPTIONS)


def _voices():
    try:
        return json.loads(os.getenv("PIPER_VOICES_JSON", "{}"))
    except Exception:
        return {}


def _chunk(text, max_chars=350):
    """Split long narration so each parler generation stays within a sane length."""
    import re
    parts, buf = [], ""
    for s in re.split(r"(?<=[.!?।॥])\s+", text):
        if len(buf) + len(s) + 1 > max_chars and buf:
            parts.append(buf.strip()); buf = s
        else:
            buf = (buf + " " + s) if buf else s
    if buf.strip():
        parts.append(buf.strip())
    return parts or [text]


def synth_parler(script, lang, wav_path):
    """Synthesize with ai4bharat/indic-parler-tts on CPU. Heavy deps are lazy-imported
    (transformers, torch, parler_tts, soundfile, numpy) so dry-run/py_compile don't need them."""
    import numpy as np
    import soundfile as sf
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    if not _PARLER:
        model = ParlerTTSForConditionalGeneration.from_pretrained(PARLER_MODEL)
        model.eval()
        _PARLER["model"] = model
        _PARLER["desc_tok"] = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
        _PARLER["prompt_tok"] = AutoTokenizer.from_pretrained(PARLER_MODEL)
    model, desc_tok, prompt_tok = _PARLER["model"], _PARLER["desc_tok"], _PARLER["prompt_tok"]
    descs = _parler_descriptions()
    description = descs.get(lang) or descs.get("en")
    desc = desc_tok(description, return_tensors="pt")
    chunks = []
    for chunk in _chunk(script):
        p = prompt_tok(chunk, return_tensors="pt")
        with torch.no_grad():
            gen = model.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask,
                                 prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
        chunks.append(gen.cpu().numpy().squeeze())
    audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    sf.write(wav_path, audio, model.config.sampling_rate)


def synth_piper(script, lang, wav_path):
    voice = _voices().get(lang)
    if not voice:
        raise RuntimeError(f"no Piper voice configured for '{lang}' (set PIPER_VOICES_JSON)")
    subprocess.run([PIPER_BIN, "--model", voice, "--output_file", wav_path],
                   input=script.encode("utf-8"), check=True)


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
        return _proportional(cues, duration)
    prev_end = 0.0
    out = []
    for i, (c, (cs, ce)) in enumerate(zip(cues, cue_t)):
        start = cs if cs is not None else prev_end
        start = max(prev_end, min(start, duration))
        if ce is not None:
            end = max(start + 0.3, min(ce, duration))
        else:
            rem_chars = sum(len(x) for x in cues[i:]) or 1
            rem_time = max(0.3, duration - start)
            end = min(duration, start + (len(c) / rem_chars) * rem_time)
        end = min(duration, max(end, start + 0.3)) if start < duration else duration
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
    dur = float(duration or 0) or max(1.0, len(script) / 15.0)
    timed = align_cues(cues, ww, dur)
    return to_vtt(timed)


def loc(field, lang):
    """resolveText-equivalent: field can be a locale-map or a plain string."""
    if isinstance(field, dict):
        return field.get(lang) or field.get("en") or next(iter(field.values()), "")
    return field or ""


def find_lesson(lesson_id):
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
    """Synthesize (engine per language: parler|piper) -> ffmpeg MP3 -> captions -> gsutil upload.
    Returns (audio_url, transcript_url, duration, captions_url) or raises."""
    engine = _engine_map().get(lang, "piper")
    safe_id = content_id.replace(":", "_")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "out.wav")
        mp3 = os.path.join(tmp, f"{safe_id}.mp3")
        txt = os.path.join(tmp, f"{safe_id}.txt")
        with open(txt, "w", encoding="utf-8") as f:
            f.write(script)
        if engine == "parler":
            synth_parler(script, lang, wav)
        else:
            synth_piper(script, lang, wav)
        subprocess.run(["ffmpeg", "-y", "-i", wav, "-b:a", "96k", mp3], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dur = 0
        try:
            out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "default=noprint_wrappers=1:nokey=1", mp3],
                                 capture_output=True, text=True, check=True)
            dur = int(float(out.stdout.strip()))
        except Exception:
            pass
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
        def get_source(lg):
            return section_source_text(args.section, lg)
    else:
        d, path = find_lesson(args.lesson)
        if not d:
            print(f"lesson '{args.lesson}' not found", file=sys.stderr); sys.exit(1)
        content_id = args.lesson
        def get_source(lg):
            return lesson_source_text(d, lg)

    manifest = load_manifest()
    print(f"content_id={content_id} | langs={langs} | write={args.write}")
    for lang in langs:
        if not args.overwrite and manifest.get(content_id, {}).get(lang):
            print(f"  [{lang}] already in manifest — skip"); continue
        source = get_source(lang)
        if not source.strip():
            print(f"  [{lang}] no source text — skip"); continue
        if args.write:
            print(f"  [{lang}] generating script…")
            try:
                script = write_script(source, LANG_NAMES[lang])
            except Exception as e:
                print(f"  [{lang}] script failed: {e}"); continue
            print(f"    script chars: {len(script)} — synthesizing + uploading…")
            try:
                audio_url, transcript_url, dur, captions_url = synth_and_upload(script, lang, content_id)
            except Exception as e:
                print(f"  [{lang}] synth/upload failed: {e}"); continue
            entry = {"audio_url": audio_url, "transcript_url": transcript_url, "duration": dur}
            if captions_url:
                entry["captions_url"] = captions_url
            manifest.setdefault(content_id, {})[lang] = entry
            save_manifest(manifest)
            print(f"  [{lang}] done: {audio_url} ({dur}s)")
        else:
            preview = (source[:200] + "…") if len(source) > 200 else source
            engine = _engine_map().get(lang, "piper")
            print(f"  [{lang}] engine={engine} | source preview: {preview}")
            print(f"    (dry-run) would generate script + synth via {engine} + upload to gs://{PODCAST_BUCKET}/{lang}/{content_id}.mp3")
    print("manifest:", MANIFEST_PATH)


if __name__ == "__main__":
    main()
