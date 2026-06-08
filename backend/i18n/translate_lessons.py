"""
translate_lessons.py — offline batch translator for PyMasters lesson content.

Fills missing languages in EXISTING locale-maps ({"en": "..."}) inside lesson
JSONs, using a LOCAL Ollama model. Because it only ever fills locale-maps, it
can never touch code (code lives in plain-string fields, not locale-maps).

Usage (dry-run by default):
  python backend/i18n/translate_lessons.py --langs ta --file backend/lessons/python_fundamentals/adv_async.json
  python backend/i18n/translate_lessons.py --langs ta,te,ml --track python_fundamentals --write

Env:
  LOCAL_OLLAMA_URL   default http://localhost:11434
  TRANSLATE_MODEL    default qwen2.5:7b
"""
import argparse
import glob
import json
import os
import sys
import urllib.request

LESSONS_DIR = os.path.join(os.path.dirname(__file__), "..", "lessons")
OLLAMA_URL = os.getenv("LOCAL_OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("TRANSLATE_MODEL", "qwen2.5:7b")

LANG_NAMES = {
    "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
    "fr": "French", "es": "Spanish", "it": "Italian", "ko": "Korean",
}


def is_locale_map(d):
    if not isinstance(d, dict) or "en" not in d:
        return False
    return all(isinstance(k, str) and 1 <= len(k) <= 3 and k.isalpha() for k in d.keys())


def translate_text(text, lang_name):
    """Call local Ollama to translate one string. Returns translated text or None."""
    if not text or not str(text).strip():
        return text
    prompt = (
        f"You are a professional translator. Translate the following coding-tutorial text "
        f"from English to {lang_name}. Preserve meaning, tone, and any markdown. Do NOT "
        f"translate code, code identifiers, or anything inside backticks or code fences — "
        f"keep those verbatim. Return ONLY the translated text, with no preamble.\n\n"
        f"TEXT:\n{text}"
    )
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.2},
    }).encode("utf-8")
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            out = (data.get("message") or {}).get("content", "").strip()
            return out or None
        except Exception as e:
            if attempt == 1:
                print(f"    ! translate failed: {e}", file=sys.stderr)
                return None
    return None


def walk_and_fill(node, langs, stats, write):
    """Recursively find locale-maps and fill missing languages."""
    if isinstance(node, dict):
        if is_locale_map(node):
            en = node.get("en")
            if isinstance(en, str) and en.strip():
                for lg in langs:
                    if lg in node and node[lg]:
                        stats["skipped"] += 1
                        continue
                    stats["fields"] += 1
                    if write:
                        t = translate_text(en, LANG_NAMES[lg])
                        if t:
                            node[lg] = t
                            stats["written"] += 1
                        else:
                            stats["failed"] += 1
                    else:
                        preview = en[:60].replace("\n", " ")
                        print(f"    [{lg}] would translate: {preview}…")
            return
        for v in node.values():
            walk_and_fill(v, langs, stats, write)
    elif isinstance(node, list):
        for v in node:
            walk_and_fill(v, langs, stats, write)


def main():
    ap = argparse.ArgumentParser(description="Offline batch translator for lesson locale-maps.")
    ap.add_argument("--langs", default=",".join(LANG_NAMES.keys()),
                    help="comma-separated target language codes (default: all)")
    ap.add_argument("--track", help="only lessons under backend/lessons/<track>/")
    ap.add_argument("--file", help="a single lesson JSON path")
    ap.add_argument("--glob", help="custom glob under lessons dir, e.g. '**/*.json'")
    ap.add_argument("--write", action="store_true", help="write changes (default: dry-run)")
    ap.add_argument("--overwrite", action="store_true", help="re-translate even if present")
    ap.add_argument("--limit", type=int, default=0, help="max lessons to process (0 = all)")
    args = ap.parse_args()

    langs = [l.strip() for l in args.langs.split(",") if l.strip() in LANG_NAMES]
    if not langs:
        print("No valid target languages.", file=sys.stderr); sys.exit(1)

    if args.file:
        files = [args.file]
    else:
        pattern = args.glob or (f"{args.track}/**/*.json" if args.track else "**/*.json")
        files = sorted(glob.glob(os.path.join(LESSONS_DIR, pattern), recursive=True))
    if args.limit:
        files = files[:args.limit]

    print(f"Engine: {MODEL} @ {OLLAMA_URL} | langs={langs} | write={args.write} | files={len(files)}")
    total = {"fields": 0, "written": 0, "skipped": 0, "failed": 0}
    for path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                doc = json.load(f)
        except Exception as e:
            print(f"  skip {path}: {e}"); continue
        stats = {"fields": 0, "written": 0, "skipped": 0, "failed": 0}
        if args.overwrite and args.write:
            def _strip(n):
                if isinstance(n, dict):
                    if is_locale_map(n):
                        for lg in langs:
                            n.pop(lg, None)
                        return
                    for v in n.values():
                        _strip(v)
                elif isinstance(n, list):
                    for v in n:
                        _strip(v)
            _strip(doc)
        walk_and_fill(doc, langs, stats, args.write)
        if args.write and stats["written"]:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(doc, f, ensure_ascii=False, indent=2)
        print(f"  {os.path.relpath(path, LESSONS_DIR)}: "
              f"fields={stats['fields']} written={stats['written']} "
              f"skipped={stats['skipped']} failed={stats['failed']}")
        for k in total:
            total[k] += stats[k]
    print(f"TOTAL: {total}")


if __name__ == "__main__":
    main()
