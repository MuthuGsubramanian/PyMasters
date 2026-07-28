"""voice.py — server-side speech-to-text (Whisper) for the voice tutor.

Fallback for browsers without the Web Speech API (e.g. Firefox): the client
records audio and POSTs it here; we transcribe with faster-whisper and return
the text. Chromium/Safari keep using the in-browser engine (no server hit).

Model is lazy-loaded + cached (defaults to the small "tiny" model to fit the
1Gi instance; override with VOICE_WHISPER_MODEL). If Whisper can't load, we
return 503 and the client falls back to typing — never crashes the app.
"""

import os
import tempfile

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends

from ratelimit import SlidingWindowRateLimiter
from auth import get_current_user_id

router = APIRouter(prefix="/api/voice", tags=["voice"])

_limiter = SlidingWindowRateLimiter(max_calls=30, window_seconds=60)
_model = None
WHISPER_MODEL = os.getenv("VOICE_WHISPER_MODEL", "tiny")
# app language codes already match Whisper's ISO codes (en, ta, te, ml, fr, es, it, ko)


def _get_model():
    """Lazy-load and cache the Whisper model. Raises if unavailable."""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _model


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    caller: str = Depends(get_current_user_id),
):
    """Transcribe an uploaded audio clip → {text, language}.

    Requires auth: previously this endpoint was unauthenticated and keyed its
    rate limit on a client-supplied `user_id` Form field ("anon" by default), so
    a caller could send a unique id per request and run unbounded CPU-heavy
    Whisper transcription on the single instance (cheap DoS / cost abuse). Now
    the limiter keys off the JWT-verified caller and anonymous calls are refused.
    """
    if not _limiter.allow(caller):
        wait = _limiter.retry_after(caller)
        raise HTTPException(status_code=429, detail=f"Too many requests — wait {wait}s.")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio.")
    if len(data) > 8 * 1024 * 1024:  # ~8 MB cap (short utterances only)
        raise HTTPException(status_code=413, detail="Audio too large.")

    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()

        try:
            model = _get_model()
        except Exception as exc:  # import/load/OOM — let the client fall back to typing
            raise HTTPException(status_code=503, detail=f"Speech recognition unavailable: {exc}")

        lang = language if language and language not in ("auto", "") else None
        try:
            segments, info = model.transcribe(tmp.name, language=lang, vad_filter=True, beam_size=1)
            text = " ".join(s.text.strip() for s in segments).strip()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not transcribe audio: {exc}")

        return {"text": text, "language": getattr(info, "language", lang) or lang}
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
