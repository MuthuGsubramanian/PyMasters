"""
translator.py — translate lesson content into a target language while
preserving Markdown structure and leaving code untouched.

Powers two things:
  1. An offline backfill that writes translations into lesson JSON (core tracks).
  2. An on-demand, DB-cached translation path for the long tail of
     (lesson, language) pairs that were never pre-authored (see
     routes/classroom.get_lesson).

Translation goes through the same provider chain as Vaathiyaar (engine.complete),
so it inherits qubrid/ollama failover.
"""
import hashlib
import re
import sqlite3

from vaathiyaar.modelfile import LANG_NAMES

# Fenced code blocks must survive translation byte-for-byte. GLM sometimes drops
# them when asked to translate a whole story, so we split them out and translate
# only the prose between them (see translate_text).
_FENCE = re.compile(r"(```.*?```)", re.DOTALL)

# Fields we translate + cache. Values are short labels used in the cache key.
TRANSLATABLE_FIELDS = ("story", "title", "instruction")


def build_translation_messages(text: str, target_lang: str, kind: str = "story") -> list:
    """Messages for a faithful, structure-preserving translation.

    We deliberately do NOT use the Vaathiyaar teaching persona here — this is a
    translation task, not a tutoring turn, so the model must translate the given
    text rather than reply to it. Code, identifiers, and Python keywords stay in
    their original form; only natural-language prose/headings are translated."""
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    if kind == "title":
        detail = "This is a short lesson title. Translate it naturally and concisely."
    elif kind == "instruction":
        detail = ("This is a coding-exercise instruction. Translate the prose but keep "
                  "code, function names, variable names, and Python keywords unchanged.")
    else:
        detail = ("This is a Markdown lesson body. Preserve EVERY Markdown element exactly: "
                  "## headings, bullet/numbered lists, tables, > blockquotes, and **bold**. "
                  "Do NOT translate anything inside ``` code fences ``` or `inline code` — "
                  "keep all code, Python keywords, function/variable names, and technical "
                  "identifiers in their original form. Translate only the natural-language text.")
    system = (
        f"You are an expert technical translator localizing a Python learning platform "
        f"into {lang_name}. {detail} Keep well-known technical terms accurate (transliterate "
        f"rather than invent awkward words when no natural term exists). Output ONLY the "
        f"translated text — no preamble, no explanation, no code fences around the whole output."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]


def _translate_chunk(text: str, target_lang: str, kind: str) -> str:
    """One LLM translation call for a prose chunk (no fenced code inside)."""
    from vaathiyaar.engine import complete
    messages = build_translation_messages(text, target_lang, kind)
    # Low temperature for faithful translation; generous budget for long prose.
    out = complete(messages, {"temperature": 0.2, "num_predict": 6000})
    return (out or "").strip()


def translate_text(text: str, target_lang: str, kind: str = "story") -> str:
    """Translate `text` into `target_lang`. Raises on provider failure so callers
    can decide whether to fall back (on-demand path) or abort (backfill).

    For story bodies, fenced ``` code blocks are pulled out and preserved
    byte-for-byte; only the prose between them is translated. This structurally
    guarantees code fidelity instead of trusting the model to leave code alone
    (which it didn't for ~20% of lessons on the first backfill, 2026-07-08)."""
    if not text or not text.strip():
        return text
    if target_lang == "en":
        return text
    if kind != "story" or "```" not in text:
        return _translate_chunk(text, target_lang, kind)
    parts = _FENCE.split(text)
    out = []
    for part in parts:
        if part.startswith("```"):
            out.append(part)                       # code block verbatim
        elif part.strip():
            out.append(_translate_chunk(part, target_lang, kind))
        else:
            out.append(part)                       # whitespace between segments
    return "".join(out)


def source_hash(text: str) -> str:
    """Stable hash of the English source, so a cached translation can be
    invalidated when the source lesson content changes."""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def get_cached_translation(db_path: str, lesson_id: str, lang: str, field: str,
                           source_text: str):
    """Return the cached translation iff it exists AND matches the current source
    hash (stale entries are ignored). None on any miss/error (fail to English)."""
    try:
        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute(
                "SELECT content, source_hash FROM lesson_translations "
                "WHERE lesson_id = ? AND lang = ? AND field = ?",
                [lesson_id, lang, field],
            ).fetchone()
        finally:
            conn.close()
        if row and row[1] == source_hash(source_text):
            return row[0]
    except Exception:
        pass
    return None


def store_translation(db_path: str, lesson_id: str, lang: str, field: str,
                      content: str, source_text: str) -> None:
    """Upsert a translation into the cache. Best-effort."""
    try:
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                "INSERT INTO lesson_translations (lesson_id, lang, field, content, source_hash) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(lesson_id, lang, field) DO UPDATE SET "
                "content = excluded.content, source_hash = excluded.source_hash, "
                "created_at = CURRENT_TIMESTAMP",
                [lesson_id, lang, field, content, source_hash(source_text)],
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def translate_and_cache(db_path: str, lesson_id: str, lang: str, field: str,
                        source_text: str):
    """Cache-first translation for the on-demand path. Returns the translated
    text, or None if translation fails (caller falls back to English). Never
    raises — a translation failure must not break lesson loading."""
    if not source_text or not source_text.strip() or lang == "en":
        return None
    cached = get_cached_translation(db_path, lesson_id, lang, field, source_text)
    if cached is not None:
        return cached
    try:
        translated = translate_text(source_text, lang, kind=field)
    except Exception:
        return None
    if not translated:
        return None
    store_translation(db_path, lesson_id, lang, field, translated, source_text)
    return translated
