"""Zero-cost Live AI Influencer studio overlay & standalone presenter renderer.

Drives our 4 pixel-aligned studio `Vaathiyaar` viseme plates (`rest`, `talk_mid`, `talk_open`, `smile`) directly
from the 24 kHz speech RMS envelope + syllable cadence at 30 FPS, with:
- Full-focus Hero Studio Presenter layout on Short hooks ("Vanakkam nanba and nanbis!") & closing CTAs (`1080x1920`).
- Non-occluding Top-Right Picture-in-Picture (`212x212`, `y=42..254`, strictly above `_content_top=280`) during
  Short walkthrough scenes so code, diagrams, and captions are never covered.
- Standalone `render_studio_presenter_mp4` for `socialbot produce influencer` without paid HeyGen/Tavus keys."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw

from socialbot import config
from socialbot.render import scenes as S
from socialbot.render import theme as T

_PLATE_CACHE: dict[tuple[str, int], Image.Image] = {}
_PLATE_NAMES = ("vaathiyaar_rest.jpg", "vaathiyaar_talk_mid.jpg", "vaathiyaar_talk_open.jpg", "vaathiyaar_smile.jpg")


def _procedural_fallback_plate(mode: str, size: int) -> Image.Image:
    """Clean vector studio presenter fallback if asset files are absent in isolated unit-test temp dirs."""
    img = Image.new("RGB", (size, size), (14, 20, 38))
    d = ImageDraw.Draw(img)
    cx, cy = size // 2, int(size * 0.42)
    r_head = int(size * 0.18)
    # Shoulders + blazer
    d.pieslice([int(size * 0.16), int(size * 0.60), int(size * 0.84), int(size * 1.28)], 180, 360, fill=(26, 38, 68))
    # Head
    d.ellipse([cx - r_head, cy - r_head, cx + r_head, cy + r_head], fill=(198, 148, 112))
    # Mouth state
    mw = int(size * 0.055)
    mh = {"open": int(size * 0.032), "mid": int(size * 0.018), "smile": int(size * 0.012)}.get(mode, int(size * 0.006))
    my = cy + int(r_head * 0.42)
    d.rounded_rectangle([cx - mw, my - mh, cx + mw, my + mh], radius=max(2, mh), fill=(60, 28, 32))
    return img


def _load_plates(size: int) -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}
    search_dirs = [config.PRESENTER_ASSETS_DIR, config.PRESENTER_PLATES_DIR]
    mapping = {
        "rest": "vaathiyaar_rest.jpg",
        "mid": "vaathiyaar_talk_mid.jpg",
        "open": "vaathiyaar_talk_open.jpg",
        "smile": "vaathiyaar_smile.jpg",
    }
    for key, fname in mapping.items():
        cache_k = (key, size)
        if cache_k in _PLATE_CACHE:
            out[key] = _PLATE_CACHE[cache_k]
            continue
        loaded = None
        for d in search_dirs:
            p = Path(d) / fname
            if p.is_file():
                loaded = Image.open(p).convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
                break
        if loaded is None:
            loaded = _procedural_fallback_plate(key, size)
        _PLATE_CACHE[cache_k] = loaded
        out[key] = loaded
    return out


def compute_speech_envelope(audio_f32: np.ndarray, sr: int, fps: int) -> np.ndarray:
    """Return normalized `[0.0, 1.0]` per-video-frame speech mouth-openness envelope from `audio_f32`."""
    total_s = len(audio_f32) / max(1, sr)
    n_frames = max(1, int(total_s * fps) + 4)
    hop = max(1, sr // fps)
    env = np.zeros(n_frames, dtype=np.float32)
    for fi in range(n_frames):
        a = fi * hop
        b = min(len(audio_f32), a + hop)
        if b > a:
            seg = audio_f32[a:b]
            env[fi] = float(np.sqrt(np.mean(seg * seg) + 1e-12))
    peak = float(np.percentile(env, 96)) if np.any(env > 0) else 1.0
    norm = np.clip(env / max(peak, 1e-4), 0.0, 1.0)
    # Light 3-frame smoothing so mouth transitions look organic, never jittery
    norm = np.convolve(norm, np.array([0.22, 0.56, 0.22], dtype=np.float32), mode="same")
    return norm


def _animated_presenter_frame(size: int, level: float, now_s: float, smile_bias: float = 0.0) -> Image.Image:
    """Blend our 4 aligned Vaathiyaar studio plates according to instantaneous speech energy + syllable cadence."""
    plates = _load_plates(size)
    # Add natural ~5.2 Hz syllable articulation ripple when actively speaking (`level > 0.14`)
    syllable = 0.5 + 0.5 * math.sin(now_s * 2.0 * math.pi * 5.2) if level > 0.14 else 0.0
    mouth = min(1.0, max(0.0, level * (0.68 + 0.42 * syllable)))

    if mouth < 0.10:
        base = Image.blend(plates["rest"], plates["smile"], min(1.0, max(0.15, smile_bias)))
    elif mouth < 0.52:
        k = (mouth - 0.10) / 0.42
        base = Image.blend(plates["rest"], plates["mid"], k)
    else:
        k = min(1.0, (mouth - 0.52) / 0.42)
        base = Image.blend(plates["mid"], plates["open"], k)

    # Subtle 1.2% studio camera breathing motion so the frame feels alive
    zoom = 1.012 + 0.008 * math.sin(now_s * 1.35)
    crop_sz = int(size / zoom)
    margin = max(0, (size - crop_sz) // 2)
    dx = int(margin * 0.35 * math.sin(now_s * 0.9))
    dy = int(margin * 0.25 * math.cos(now_s * 1.1))
    x0 = max(0, min(size - crop_sz, margin + dx))
    y0 = max(0, min(size - crop_sz, margin + dy))
    return base.crop((x0, y0, x0 + crop_sz, y0 + crop_sz)).resize((size, size), Image.Resampling.BILINEAR)


def _rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_short_pip_presenter(img: Image.Image, F: S.Frame, level: float, now_s: float) -> None:
    """Overlay non-occluding top-right `208x208` Live Influencer PiP badge (`y=42..250`, above `_content_top=280`)."""
    sz = F.px(208)
    rad = F.px(28)
    x0 = F.w - F.pad - sz
    y0 = F.px(42)

    d = ImageDraw.Draw(img)
    glow_col = S.lerp_color(T.VIOLET, T.CYAN, min(1.0, level * 1.25))
    # Voice-reactive outer studio halo
    pad_g = F.px(4 + int(4 * level))
    S.rounded(d, [x0 - pad_g, y0 - pad_g, x0 + sz + pad_g, y0 + sz + pad_g], rad + pad_g, fill=(14, 20, 38), outline=glow_col, width=max(2, F.px(3)))

    face = _animated_presenter_frame(sz, level, now_s)
    img.paste(face, (x0, y0), _rounded_mask(sz, rad))

    # Crisp bottom-center "VAATHIYAAR" pill inside PiP bottom edge
    bf = T.font(T.FONT_MONO, F.px(16))
    label = "● VAATHIYAAR"
    tw = d.textlength(label, font=bf)
    pw, ph = int(tw + F.px(22)), F.px(26)
    px0, py0 = x0 + (sz - pw) // 2, y0 + sz - ph - F.px(8)
    S.rounded(d, [px0, py0, px0 + pw, py0 + ph], F.px(13), fill=(10, 15, 30), outline=glow_col, width=1)
    d.text((px0 + F.px(11), py0 + F.px(4)), label, font=bf, fill=T.CYAN if level > 0.15 else T.TEXT)


def draw_short_hero_presenter(
    img: Image.Image,
    F: S.Frame,
    spec: dict,
    t: float,
    prog: float,
    level: float,
    now_s: float,
    words=None,
    is_cta: bool = False,
) -> Image.Image:
    """Render full-focus `1080x1920` Live Influencer Hook / CTA frame with `680x680` studio host + title + captions."""
    d = ImageDraw.Draw(img)
    sz = F.px(660)
    rad = F.px(40)
    x0 = (F.w - sz) // 2
    y0 = F.px(175)

    glow_col = S.lerp_color(T.VIOLET, T.CYAN, min(1.0, level * 1.3))
    halo = F.px(6 + int(6 * level))
    S.rounded(d, [x0 - halo, y0 - halo, x0 + sz + halo, y0 + sz + halo], rad + halo, fill=(14, 20, 38), outline=glow_col, width=max(2, F.px(4)))

    face = _animated_presenter_frame(sz, level, now_s, smile_bias=0.65 if is_cta else 0.25)
    img.paste(face, (x0, y0), _rounded_mask(sz, rad))

    # Live mentor pill at top of studio frame
    bf = T.font(T.FONT_MONO, F.px(24))
    badge = "● LIVE EXPLAINER · VAATHIYAAR"
    tw = d.textlength(badge, font=bf)
    pw, ph = int(tw + F.px(38)), F.px(42)
    bx0, by0 = (F.w - pw) // 2, y0 - ph // 2
    S.rounded(d, [bx0, by0, bx0 + pw, by0 + ph], F.px(21), fill=(12, 18, 36), outline=T.CYAN, width=max(1, F.px(2)))
    d.text((bx0 + F.px(19), by0 + F.px(7)), badge, font=bf, fill=T.CYAN)

    # Headline / CTA card right beneath presenter (`y = 875..1340`)
    head = spec.get("heading") or spec.get("big") or ""
    sub = spec.get("sub") or ("Practice interactively · free" if is_cta else "Plain English · Zero Jargon")
    ty = y0 + sz + F.px(48)
    if head:
        ty = S.heading(img, F, head, ty, size=62 if not is_cta else 68, color=T.CYAN if is_cta else T.TEXT, k=S.ease(t * 2.2))
    if sub:
        S.heading(img, F, sub, ty + F.px(18), size=34, color=T.VIOLET if not is_cta else T.TEXT, k=S.ease(S.seg(t, 0.15, 0.75)))

    S.chrome(img, F, prog)
    if words:
        S.karaoke(img, F, words, now_s)
    return img


def render_studio_presenter_mp4(
    script_text: str,
    out_mp4: Path,
    width: int = 1280,
    height: int = 720,
    fps: int = 30,
) -> tuple[Path, float]:
    """Render a standalone lip-envelope-synced Vaathiyaar studio presenter MP4 + normalized audio at `$0.00` cost."""
    import soundfile as sf
    from socialbot import tts
    from socialbot.render import video as V

    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    [(audio, _words)] = tts.synth_segments_hybrid([script_text], conversational=False)
    dur_s = max(1.0, len(audio) / tts.SR)
    raw_wav = out_mp4.parent / f"{out_mp4.stem}_voice.wav"
    mix_wav = out_mp4.parent / f"{out_mp4.stem}_audio.wav"
    sf.write(raw_wav, audio, tts.SR)
    V._mix(raw_wav, mix_wav, dur_s)

    env = compute_speech_envelope(audio, tts.SR, fps)
    F = S.Frame(width, height)
    card_sz = min(width, height) - F.px(80)
    rad = F.px(32)
    mask = _rounded_mask(card_sz, rad)

    wr = V.FFmpegWriter(out_mp4, width, height, fps=fps, audio=mix_wav)
    n_frames = max(1, int(dur_s * fps))
    for fi in range(n_frames):
        now_s = fi / fps
        lvl = float(env[min(fi, len(env) - 1)])
        frame = F.bg.copy()
        face = _animated_presenter_frame(card_sz, lvl, now_s, smile_bias=0.35 if now_s > dur_s - 2.0 else 0.15)
        x0, y0 = (width - card_sz) // 2, (height - card_sz) // 2
        d = ImageDraw.Draw(frame)
        glow_col = S.lerp_color(T.VIOLET, T.CYAN, min(1.0, lvl * 1.3))
        S.rounded(d, [x0 - 4, y0 - 4, x0 + card_sz + 4, y0 + card_sz + 4], rad + 4, outline=glow_col, width=3)
        frame.paste(face, (x0, y0), mask)
        wr.write(frame)
    wr.close()
    raw_wav.unlink(missing_ok=True)
    mix_wav.unlink(missing_ok=True)
    return out_mp4, round(dur_s, 2)
