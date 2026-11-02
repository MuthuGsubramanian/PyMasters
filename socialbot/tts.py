"""Kokoro text-to-speech (local, CPU) with word timestamps for burned-in captions and SRT."""
import os
import re

import numpy as np

from socialbot import config

SR = 24000
_PIPE = None


def _pipe():
    global _PIPE
    if _PIPE is None:
        config.ensure_dirs()
        os.environ.pop("VIRTUAL_ENV", None)
        import torch
        torch.set_num_threads(int(os.getenv("OMP_NUM_THREADS", "2")))   # heat: keep the laptop cool
        from kokoro import KPipeline
        _PIPE = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    return _PIPE


def speakable(text: str) -> str:
    """Make code-ish narration pronounceable: `x.append()` -> x dot append, etc."""
    t = text.replace("`", "")
    t = re.sub(r"\bpymasters\.net\b", "pymasters dot net", t, flags=re.I)
    t = re.sub(r"(\d)\.(\d)", r"\1 point \2", t)
    t = re.sub(r"([A-Za-z_)\]])\.([A-Za-z_])", r"\1 dot \2", t)
    t = t.replace("()", "").replace("__", " dunder ")
    t = t.replace("->", " returns ").replace("==", " equals ").replace("!=", " not equal to ")
    return re.sub(r"\s+", " ", t).strip()


def synth(text: str, voice: str = config.TTS_VOICE, speed: float = config.TTS_SPEED):
    """Returns (audio float32 @24k, words [(word, start_s, end_s)])."""
    chunks, words, offset = [], [], 0.0
    for r in _pipe()(speakable(text), voice=voice, speed=speed):
        a = r.audio.numpy() if hasattr(r.audio, "numpy") else np.asarray(r.audio)
        for tok in (r.tokens or []):
            tt = tok.text or ""
            if not re.search(r"\w", tt):
                if words and tt.strip() in {".", ",", "?", "!", ":", ";"}:
                    words[-1] = (words[-1][0] + tt.strip(), words[-1][1], words[-1][2])  # keep punctuation
                continue
            if tok.start_ts is None:
                continue
            words.append((tt, offset + tok.start_ts, offset + (tok.end_ts or tok.start_ts + 0.2)))
        chunks.append(a)
        offset += len(a) / SR
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    return audio.astype(np.float32), words
