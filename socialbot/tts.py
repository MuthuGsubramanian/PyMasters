"""Speech synthesis for YouTube Shorts & Longs:
1. Primary ($0.00): Gemini 2.5 Flash TTS (`gemini-2.5-flash-preview-tts`) via `GEMINI_FREE_API_KEY`
   bound strictly to unbilled GCP project `eternity-os-11012219` (`billingEnabled: false`).
   - Shorts: 1 batched single-speaker (`Charon`) call per Short ("Vanakkam nanba and nanbis!").
   - Longs: 1 batched 2-speaker (`Vaathiyaar` + `Ananya`) NotebookLM-style conversational call per chapter.
2. Automatic Zero-Downtime Fallback ($0.00 local): Kokoro-82M (`am_michael` for Vaathiyaar, `af_heart` for Ananya)."""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Sequence

import numpy as np
import requests

from socialbot import config

log = logging.getLogger("socialbot.tts")
SR = 24000
_PIPE = None
_SPEAKER_LINE_RE = re.compile(r"^\s*(Vaathiyaar|Ananya|Host\s*\d?|Mentor|Learner)\s*:\s*", re.I)
_SPEAKER_INLINE_RE = re.compile(r"\b(Vaathiyaar|Ananya|Host\s*\d?|Mentor|Learner)\s*:\s*", re.I)


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


def strip_speaker_labels(text: str) -> str:
    """Remove `Vaathiyaar:` / `Ananya:` script prefixes so burned-in captions show clean spoken words."""
    cleaned = _SPEAKER_INLINE_RE.sub("", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def parse_dialogue_turns(text: str) -> list[tuple[str, str]]:
    """Split a narration block into `[(speaker, spoken_text), ...]` turns (defaults to `Vaathiyaar`)."""
    raw = (text or "").strip()
    if not raw:
        return []
    matches = list(_SPEAKER_INLINE_RE.finditer(raw))
    if not matches:
        return [("Vaathiyaar", raw)]
    turns: list[tuple[str, str]] = []
    if matches[0].start() > 0:
        pre = raw[: matches[0].start()].strip()
        if pre:
            turns.append(("Vaathiyaar", pre))
    for i, m in enumerate(matches):
        who = "Ananya" if m.group(1).lower().startswith(("ananya", "learner", "host 2")) else "Vaathiyaar"
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        body = raw[m.end() : end].strip()
        if body:
            turns.append((who, body))
    return turns or [("Vaathiyaar", strip_speaker_labels(raw))]


def speakable(text: str) -> str:
    """Make code-ish narration pronounceable: `x.append()` -> x dot append, etc."""
    t = (text or "").replace("`", "")
    t = re.sub(r"\bpymasters\.net\b", "pymasters dot net", t, flags=re.I)
    t = re.sub(r"(\d)\.(\d)", r"\1 point \2", t)
    t = re.sub(r"([A-Za-z_)\]])\.([A-Za-z_])", r"\1 dot \2", t)
    t = t.replace("()", "").replace("__", " dunder ")
    t = t.replace("->", " returns ").replace("==", " equals ").replace("!=", " not equal to ")
    return re.sub(r"\s+", " ", t).strip()


def _estimate_word_timestamps(text: str, duration_s: float) -> list[tuple[str, float, float]]:
    """Distribute word timestamps proportionally by character weight across `duration_s`."""
    clean = strip_speaker_labels(text)
    tokens = [w for w in clean.split() if re.search(r"\w", w)]
    if not tokens or duration_s <= 0.05:
        return []
    usable = max(0.05, duration_s - 0.08)
    weights = [max(2.0, float(len(re.sub(r"\W+", "", w))) + (1.8 if w.endswith((".", "?", "!", ",", ";", ":")) else 0.0))
               for w in tokens]
    total_w = sum(weights) or 1.0
    out, cur = [], 0.04
    for tok, w in zip(tokens, weights):
        dt = usable * (w / total_w)
        out.append((tok, round(cur, 3), round(cur + dt, 3)))
        cur += dt
    return out


def _split_waveform_by_segments(audio: np.ndarray, texts: Sequence[str]) -> list[np.ndarray]:
    """Slice a batched `24 kHz` waveform into `len(texts)` segments snapped to natural breath/silence valleys."""
    n_segs = len(texts)
    if n_segs <= 1:
        return [audio]
    word_counts = [max(1, len(strip_speaker_labels(t).split())) for t in texts]
    total_words = sum(word_counts)
    total_samples = len(audio)
    if total_samples < n_segs * 2400:
        step = max(1, total_samples // n_segs)
        return [audio[i * step : (total_samples if i == n_segs - 1 else (i + 1) * step)] for i in range(n_segs)]

    # Compute 20ms RMS energy envelope to snap cut points to genuine breath pauses
    hop = int(0.02 * SR)  # 480 samples = 20 ms
    n_frames = max(1, total_samples // hop)
    trimmed = audio[: n_frames * hop].reshape(n_frames, hop)
    rms = np.sqrt(np.mean(trimmed * trimmed, axis=1) + 1e-12)

    cuts = [0]
    acc_words = 0
    for i in range(n_segs - 1):
        acc_words += word_counts[i]
        target_sample = int(total_samples * (acc_words / total_words))
        target_frame = min(n_frames - 2, max(1, target_sample // hop))
        # Search +/- 0.9s around proportional target for deepest silence valley
        radius = int(0.9 / 0.02)
        lo = max(cuts[-1] // hop + 5, target_frame - radius)
        hi = min(n_frames - 5, target_frame + radius)
        if hi > lo:
            # Smooth over 5 frames (100ms) + slight distance penalty from target_frame
            window = np.convolve(rms[lo:hi], np.ones(5) / 5.0, mode="same")
            dist_pen = 0.15 * float(np.max(rms) + 1e-6) * (np.abs(np.arange(lo, hi) - target_frame) / max(1, radius))
            best_frame = lo + int(np.argmin(window + dist_pen))
            cuts.append(best_frame * hop)
        else:
            cuts.append(target_sample)
    cuts.append(total_samples)
    return [audio[cuts[i] : max(cuts[i] + 240, cuts[i + 1])].astype(np.float32) for i in range(n_segs)]


def _call_gemini_tts(prompt_text: str, multi_speaker: bool = False, timeout: int = 75) -> np.ndarray | None:
    """Call free-tier `gemini-2.5-flash-preview-tts` on unbilled project `eternity-os-11012219`. Returns float32 @24k or None."""
    api_key = config.GEMINI_FREE_API_KEY
    if not api_key:
        return None
    if multi_speaker:
        speech_cfg = {
            "multiSpeakerVoiceConfig": {
                "speakerVoiceConfigs": [
                    {"speaker": spk, "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": vname}}}
                    for spk, vname in config.GEMINI_LONG_SPEAKERS
                ]
            }
        }
    else:
        speech_cfg = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": config.GEMINI_SHORT_VOICE}}}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_TTS_MODEL}:generateContent"
    try:
        resp = requests.post(
            url,
            params={"key": api_key},
            json={
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": speech_cfg},
            },
            timeout=timeout,
        )
        if not resp.ok:
            log.warning("Gemini free TTS returned HTTP %s (falling back to Kokoro): %s", resp.status_code, resp.text[:160])
            return None
        parts = (((resp.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        inline = next((p["inlineData"] for p in parts if "inlineData" in p and p["inlineData"].get("data")), None)
        if not inline:
            return None
        pcm = base64.b64decode(inline["data"])
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        return audio if len(audio) > 1200 else None
    except Exception as exc:
        log.warning("Gemini free TTS call failed (falling back to Kokoro): %s", exc)
        return None


def synth(text: str, voice: str = config.TTS_VOICE, speed: float = config.TTS_SPEED):
    """Local Kokoro-82M synthesis. Returns `(audio float32 @24k, words [(word, start_s, end_s)])`."""
    clean_text = strip_speaker_labels(text)
    chunks, words, offset = [], [], 0.0
    for r in _pipe()(speakable(clean_text), voice=voice, speed=speed):
        a = r.audio.numpy() if hasattr(r.audio, "numpy") else np.asarray(r.audio)
        for tok in (r.tokens or []):
            tt = tok.text or ""
            if not re.search(r"\w", tt):
                if words and tt.strip() in {".", ",", "?", "!", ":", ";"}:
                    words[-1] = (words[-1][0] + tt.strip(), words[-1][1], words[-1][2])
                continue
            if tok.start_ts is None:
                continue
            words.append((tt, offset + tok.start_ts, offset + (tok.end_ts or tok.start_ts + 0.2)))
        chunks.append(a)
        offset += len(a) / SR
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    return audio.astype(np.float32), words


def synth_conversational_kokoro(text: str, speed: float = config.TTS_SPEED):
    """Dual-voice local Kokoro-82M fallback (`am_michael` for Vaathiyaar + `af_heart` for Ananya)."""
    turns = parse_dialogue_turns(text)
    if len(turns) == 1 and turns[0][0] == "Vaathiyaar":
        return synth(turns[0][1], voice=config.TTS_VOICE, speed=speed)
    audio_parts, all_words, offset = [], [], 0.0
    pause = np.zeros(int(0.22 * SR), dtype=np.float32)
    for idx, (who, line) in enumerate(turns):
        v = "af_heart" if who == "Ananya" else config.TTS_VOICE
        a, words = synth(line, voice=v, speed=speed)
        all_words += [(wd, s + offset, e + offset) for wd, s, e in words]
        audio_parts.append(a)
        offset += len(a) / SR
        if idx < len(turns) - 1:
            audio_parts.append(pause)
            offset += len(pause) / SR
    full = np.concatenate(audio_parts) if audio_parts else np.zeros(1, dtype=np.float32)
    return full.astype(np.float32), all_words


def synth_segments_hybrid(segments_texts: Sequence[str], conversational: bool = False) -> list[tuple[np.ndarray, list[tuple[str, float, float]]]]:
    """Synthesize a list of scene narrations in 1 batched `$0.00` Gemini 2.5 Flash TTS call (or chapter batch),
    returning `[(audio_f32, words), ...]` per scene with automatic Kokoro-82M fallback."""
    if not segments_texts:
        return []

    if conversational:
        formatted_blocks = []
        for txt in segments_texts:
            turns = parse_dialogue_turns(txt)
            formatted_blocks.append("\n".join(f"{who}: {speakable(line)}" for who, line in turns))
        prompt = (
            "TTS the following warm, clear, natural educational podcast conversation between Vaathiyaar (calm, encouraging mentor) "
            "and Ananya (curious, sharp learner). Leave a natural brief breath pause between paragraphs:\n\n"
            + "\n\n".join(formatted_blocks)
        )
        batched_audio = _call_gemini_tts(prompt, multi_speaker=True, timeout=90)
    else:
        cleaned_blocks = [speakable(strip_speaker_labels(t)) for t in segments_texts]
        prompt = (
            "Speak warmly, clearly, and enthusiastically like a friendly live tech creator explaining a concept in plain everyday English. "
            "Leave a clear natural breath pause between paragraphs:\n\n"
            + "\n\n".join(cleaned_blocks)
        )
        batched_audio = _call_gemini_tts(prompt, multi_speaker=False, timeout=75)

    if batched_audio is not None:
        slices = _split_waveform_by_segments(batched_audio, segments_texts)
        return [(sl, _estimate_word_timestamps(txt, len(sl) / SR)) for sl, txt in zip(slices, segments_texts)]

    # Seamless local fallback ($0.00)
    if conversational:
        return [synth_conversational_kokoro(txt) for txt in segments_texts]
    return [synth(txt) for txt in segments_texts]
