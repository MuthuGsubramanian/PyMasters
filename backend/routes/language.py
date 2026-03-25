"""
language.py — FastAPI APIRouter for language support queries.

Prefix: /api/languages
"""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/languages", tags=["languages"])

# Supported languages: code -> name
SUPPORTED_LANGUAGES = {
    "en": "English",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "ko": "Korean",
}

# Blocked languages: code -> message
BLOCKED_LANGUAGES = {
    "hi": "Hindi is not supported on PyMasters. Please choose another language.",
}


@router.get("")
def list_languages():
    """Return all supported and blocked languages."""
    supported = [{"code": code, "name": name} for code, name in SUPPORTED_LANGUAGES.items()]
    blocked = [{"code": code, "message": msg} for code, msg in BLOCKED_LANGUAGES.items()]
    return {"supported": supported, "blocked": blocked}


@router.get("/check/{code}")
def check_language(code: str):
    """
    Check if a language code is supported.

    - 400 for blocked languages (e.g. 'hi')
    - 404 for unknown language codes
    - 200 with {code, name, supported: true} for valid supported codes
    """
    code = code.lower()

    if code in BLOCKED_LANGUAGES:
        raise HTTPException(status_code=400, detail=BLOCKED_LANGUAGES[code])

    if code not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=404, detail=f"Language code '{code}' is not recognised.")

    return {"code": code, "name": SUPPORTED_LANGUAGES[code], "supported": True}
