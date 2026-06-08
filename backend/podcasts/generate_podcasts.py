"""
generate_podcasts.py — OFFLINE batch podcast generator (run on the laptop).

Per (lesson|section, language): resolve localized source text -> local Ollama
writes a single-narrator podcast script in that language -> local Piper synth ->
ffmpeg -> MP3 + transcript -> upload to gs://pymasters-podcasts -> update
backend/podcasts/manifest.json.

Dry-run by default (prints a source preview; no Ollama/Piper/GCS/manifest writes).

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
    """Piper -> ffmpeg -> gsutil upload. Returns (audio_url, transcript_url, duration) or raises."""
    voice = _voices().get(lang)
    if not voice:
        raise RuntimeError(f"no Piper voice configured for '{lang}' (set PIPER_VOICES_JSON)")
    safe_id = content_id.replace(":", "_")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "out.wav")
        mp3 = os.path.join(tmp, f"{safe_id}.mp3")
        txt = os.path.join(tmp, f"{safe_id}.txt")
        with open(txt, "w", encoding="utf-8") as f:
            f.write(script)
        subprocess.run([PIPER_BIN, "--model", voice, "--output_file", wav],
                       input=script.encode("utf-8"), check=True)
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
        return (f"{PUBLIC_BASE}/{lang}/{safe_id}.mp3", f"{PUBLIC_BASE}/{lang}/{safe_id}.txt", dur)


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
                audio_url, transcript_url, dur = synth_and_upload(script, lang, content_id)
            except Exception as e:
                print(f"  [{lang}] synth/upload failed: {e}"); continue
            manifest.setdefault(content_id, {})[lang] = {
                "audio_url": audio_url, "transcript_url": transcript_url, "duration": dur}
            save_manifest(manifest)
            print(f"  [{lang}] done: {audio_url} ({dur}s)")
        else:
            preview = (source[:200] + "…") if len(source) > 200 else source
            print(f"  [{lang}] source preview: {preview}")
            print(f"    (dry-run) would generate script + synth + upload to gs://{PODCAST_BUCKET}/{lang}/{content_id}.mp3")
    print("manifest:", MANIFEST_PATH)


if __name__ == "__main__":
    main()
