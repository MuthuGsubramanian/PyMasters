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
