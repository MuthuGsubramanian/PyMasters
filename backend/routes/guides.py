"""
guides.py — Public SEO-friendly Python & AI Engineering Guides API.

Prefix: /api/guides
Reads curated metadata from `backend/content/seo/*.json` and hydrates full
tutorial prose and runnable examples from the corresponding static lessons.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/guides", tags=["guides"])

SEO_DIR = Path(__file__).resolve().parent.parent / "content" / "seo"
LESSONS_DIR = Path(__file__).resolve().parent.parent / "lessons"

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")
_PT_MINUTES_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?$", re.IGNORECASE)
_SCRIPT_TAG_RE = re.compile(r"<\s*/?\s*script[^>]*>", re.IGNORECASE)

_guides_cache: dict = {"sig": -1.0, "list": [], "by_slug": {}}


def _sanitize_str(val: object, max_len: int = 20000) -> str:
    text = str(val or "").strip()
    text = _SCRIPT_TAG_RE.sub("", text)
    return text[:max_len]


def _parse_reading_minutes(structured: dict, fallback_text: str = "") -> int:
    raw = str((structured or {}).get("timeRequired") or "").strip()
    m = _PT_MINUTES_RE.match(raw)
    if m:
        hours = int(m.group(1) or 0)
        mins = int(m.group(2) or 0)
        total = hours * 60 + mins
        if total > 0:
            return total
    words = len((fallback_text or "").split())
    return max(5, round(words / 200)) if words else 15


def _clean_tag(tag: object) -> str:
    t = _sanitize_str(tag, 80)
    if "_" in t and " " not in t:
        t = t.replace("_", " ").title()
    return t


def _load_lesson_by_id(lesson_id: str) -> Optional[dict]:
    if not lesson_id or not re.fullmatch(r"[A-Za-z0-9_\-]{1,120}", lesson_id):
        return None
    if not LESSONS_DIR.exists():
        return None
    for track_dir in sorted(LESSONS_DIR.iterdir()):
        if track_dir.is_dir() and track_dir.name != "__pycache__":
            fp = track_dir / f"{lesson_id}.json"
            if fp.exists():
                try:
                    return json.loads(fp.read_text(encoding="utf-8"))
                except Exception:
                    return None
    return None


def _dir_signature() -> float:
    if not SEO_DIR.exists():
        return 0.0
    sig = SEO_DIR.stat().st_mtime
    for fp in SEO_DIR.glob("*.json"):
        try:
            sig = max(sig, fp.stat().st_mtime)
        except OSError:
            continue
    return sig


def _build_guides_index() -> tuple[list[dict], dict[str, dict]]:
    sig = _dir_signature()
    if _guides_cache["sig"] == sig and _guides_cache["list"]:
        return _guides_cache["list"], _guides_cache["by_slug"]

    summaries: list[dict] = []
    by_slug: dict[str, dict] = {}

    if not SEO_DIR.exists():
        return [], {}

    try:
        from vaathiyaar.lesson_code import example_code
    except Exception:
        example_code = lambda _l: None  # noqa: E731

    for fp in sorted(SEO_DIR.glob("*.json")):
        try:
            raw = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue

        structured = raw.get("structured_data") if isinstance(raw.get("structured_data"), dict) else {}
        stem_slug = re.sub(r"[^a-z0-9-]+", "-", fp.stem.lower().replace("_", "-")).strip("-")
        canonical = _sanitize_str(raw.get("canonical_slug") or stem_slug, 140).lower()
        slug = canonical if _SLUG_RE.fullmatch(canonical) else stem_slug
        if not slug or not _SLUG_RE.fullmatch(slug):
            continue

        lesson_id = _sanitize_str(raw.get("lesson_id") or fp.stem, 120)
        lesson = _load_lesson_by_id(lesson_id) or {}

        story_variants = lesson.get("story_variants") if isinstance(lesson.get("story_variants"), dict) else {}
        body_md = _sanitize_str(story_variants.get("en") or "", 30000)

        title = _sanitize_str(
            raw.get("og_title")
            or structured.get("name")
            or raw.get("meta_title")
            or (lesson.get("title") or {}).get("en")
            or slug.replace("-", " ").title(),
            200,
        )
        description = _sanitize_str(
            raw.get("meta_description")
            or raw.get("og_description")
            or structured.get("description")
            or (lesson.get("description") or {}).get("en")
            or "",
            500,
        )
        reading_minutes = _parse_reading_minutes(structured, body_md)

        raw_teaches = structured.get("teaches") if isinstance(structured.get("teaches"), list) else []
        raw_keywords = raw.get("keywords") if isinstance(raw.get("keywords"), list) else []
        tags_source = raw_teaches if raw_teaches else raw_keywords
        tags = [t for t in (_clean_tag(x) for x in tags_source[:8]) if t]

        updated_at = _sanitize_str(raw.get("updated_at"), 40)
        if not updated_at:
            mtime = fp.stat().st_mtime
            updated_at = datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%d")

        level = _sanitize_str(structured.get("educationalLevel") or "Intermediate", 40)
        code_sample = _sanitize_str(example_code(lesson) or "", 8000) if lesson else ""
        uth = lesson.get("under_the_hood") if isinstance(lesson.get("under_the_hood"), dict) else None

        summary_item = {
            "slug": slug,
            "title": title,
            "description": description,
            "reading_minutes": reading_minutes,
            "tags": tags,
            "updated_at": updated_at,
            "level": level,
            "lesson_id": lesson_id,
        }
        full_item = {
            **summary_item,
            "meta_title": _sanitize_str(raw.get("meta_title") or title, 200),
            "meta_description": _sanitize_str(raw.get("meta_description") or description, 500),
            "og_title": _sanitize_str(raw.get("og_title") or title, 200),
            "og_description": _sanitize_str(raw.get("og_description") or description, 500),
            "keywords": [_sanitize_str(k, 100) for k in raw_keywords[:16] if _sanitize_str(k, 100)],
            "content_markdown": body_md,
            "example_code": code_sample,
            "under_the_hood": uth,
            "structured_data": structured,
        }
        summaries.append(summary_item)
        by_slug[slug] = full_item
        if stem_slug and _SLUG_RE.fullmatch(stem_slug) and stem_slug not in by_slug:
            by_slug[stem_slug] = full_item

    summaries.sort(key=lambda g: (g["title"].lower(), g["slug"]))
    _guides_cache.update({"sig": sig, "list": summaries, "by_slug": by_slug})
    return summaries, by_slug


@router.get("")
@router.get("/")
def list_guides():
    """Return all public Python & AI guides sorted cleanly."""
    guides, _ = _build_guides_index()
    return {"guides": guides}


@router.get("/{slug}")
def get_guide(slug: str):
    """Return a full sanitized guide by slug; rejects invalid slugs to prevent path traversal."""
    if not slug or not _SLUG_RE.fullmatch(slug):
        raise HTTPException(status_code=400, detail="Invalid guide slug.")
    _, by_slug = _build_guides_index()
    guide = by_slug.get(slug)
    if not guide:
        raise HTTPException(status_code=404, detail="Guide not found.")
    return guide
