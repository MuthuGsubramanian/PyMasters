"""Assemble rendered frames + narration into finished media.

Each scene's narration is synthesised first so the visuals are timed to the voice (no speed-ups,
no hard trims). Frames stream straight into ffmpeg as raw RGB."""
import glob
import json
import random
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import ImageDraw

from socialbot import config, tts
from socialbot.render import scenes as S
from socialbot.render import theme as T

FPS = 30
GAP = 0.35          # breath between scenes (s)


class FFmpegWriter:
    def __init__(self, path, w, h, fps=FPS, audio=None, crf=19, extra=None):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
               "-r", str(fps), "-i", "-"]
        if audio:
            cmd += ["-i", str(audio)]
        cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
                "-profile:v", "high", "-movflags", "+faststart"]
        if audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += (extra or []) + [str(path)]
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    def write(self, img):
        self.p.stdin.write(img.tobytes())

    def close(self):
        self.p.stdin.close()
        if self.p.wait() != 0:
            raise RuntimeError("ffmpeg failed")


def _music_bed(duration):
    tracks = sorted(glob.glob(str(config.MUSIC_DIR / "*.mp3")) + glob.glob(str(config.MUSIC_DIR / "*.wav")))
    return random.choice(tracks) if tracks else None


def _mix(voice_wav, out_wav, duration):
    """Voice + optional quiet music bed (ducked), loudness-normalised for YouTube (-14 LUFS)."""
    bed = _music_bed(duration)
    if bed:
        fc = ("[1:a]volume=0.10,afade=t=in:d=1,afade=t=out:st={:.2f}:d=1.5[m];[0:a][m]amix=inputs=2:duration=first,"
              "loudnorm=I=-14:TP=-1.5:LRA=11").format(max(0, duration - 1.5))
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_wav), "-stream_loop", "-1", "-i", bed,
               "-filter_complex", fc, "-ar", "48000", str(out_wav)]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_wav), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
               "-ar", "48000", str(out_wav)]
    subprocess.run(cmd, check=True)


def _srt_time(s):
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(sec):02},{int((sec % 1) * 1000):03}"


def write_srt(words, path, per=7):
    lines = []
    for i in range(0, len(words), per):
        grp = words[i:i + per]
        lines.append(f"{len(lines) + 1}\n{_srt_time(grp[0][1])} --> {_srt_time(grp[-1][2])}\n"
                     f"{' '.join(w[0] for w in grp)}\n")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def render_narrated(segments, out_dir: Path, w, h, captions=True):
    """segments: [{"narration": str, "visual": {...}, "chapter": str|None}]
    Returns dict(video, srt, duration, chapters=[(start_s, title)])."""
    out_dir.mkdir(parents=True, exist_ok=True)
    F = S.Frame(w, h)
    audio_parts, all_words, timeline, chapters, t0 = [], [], [], [], 0.0
    gap = np.zeros(int(GAP * tts.SR), dtype=np.float32)
    for seg_ in segments:
        a, words = tts.synth(seg_["narration"])
        dur = len(a) / tts.SR
        if seg_.get("chapter"):
            chapters.append((t0, seg_["chapter"]))
        timeline.append((t0, t0 + dur + GAP, seg_["visual"]))
        all_words += [(wd, s + t0, e + t0) for wd, s, e in words]
        audio_parts += [a, gap]
        t0 += dur + GAP
    total = t0 + 0.6
    voice = np.concatenate(audio_parts + [np.zeros(int(0.6 * tts.SR), dtype=np.float32)])
    sf.write(out_dir / "voice.wav", voice, tts.SR)
    _mix(out_dir / "voice.wav", out_dir / "audio.wav", total)
    video = out_dir / "video.mp4"
    wr = FFmpegWriter(video, w, h, audio=out_dir / "audio.wav")
    n = int(total * FPS)
    si = 0
    for fi in range(n):
        now = fi / FPS
        while si < len(timeline) - 1 and now >= timeline[si][1]:
            si += 1
        a, b, vis = timeline[si]
        t = min(1.0, (now - a) / max(0.01, (b - a)))
        wr.write(S.draw_frame(F, vis, t, now / total, words=all_words if captions else None, now=now))
    wr.close()
    write_srt(all_words, out_dir / "captions.srt")
    (out_dir / "voice.wav").unlink(missing_ok=True)
    return {"video": str(video), "srt": str(out_dir / "captions.srt"), "duration": round(total, 2),
            "chapters": chapters}


def render_loop(anim: dict, out_dir: Path, size=1080):
    """Silent looping explainer for LinkedIn: opening title, beats, closing brand card.
    Returns dict(video, gif, duration)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    F = S.Frame(size, size)
    beats = [{"kind": "reveal", "big": anim.get("title", ""), "sub": "PyMasters", "caption": "", "_dur": 2.4}]
    for b in anim.get("beats") or []:
        b = dict(b)
        b["_dur"] = {"trace": 2.0 + 0.9 * len(b.get("steps") or []), "timeline": 4.5, "flow": 4.5,
                     "code": 4.8, "compare": 4.5, "reveal": 2.8}.get(b.get("kind"), 3.5)
        beats.append(b)
    beats.append({"kind": "reveal", "big": "pymasters.net", "sub": "Free interactive lesson", "caption": "", "_dur": 2.2})
    total = sum(b["_dur"] for b in beats)
    video = out_dir / "loop.mp4"
    wr = FFmpegWriter(video, size, size, crf=18)
    frames_for_gif = []
    t_acc = 0.0
    for b in beats:
        n = int(b["_dur"] * FPS)
        for fi in range(n):
            t = fi / max(1, n - 1)
            img = S.draw_frame(F, b, min(1.0, t * 1.15), (t_acc + fi / FPS) / total,
                               caption=b.get("caption"), caption_k=S.seg(t, 0.05, 0.3))
            wr.write(img)
            if fi % 3 == 0:            # 10 fps for the GIF fallback
                frames_for_gif.append(img.resize((720, 720)))
        t_acc += b["_dur"]
    wr.close()
    gif = out_dir / "loop.gif"
    frames_for_gif = frames_for_gif[:240]   # LinkedIn GIF limit is 250 frames
    pal = [f.convert("P", palette=1, colors=128) for f in frames_for_gif]
    pal[0].save(gif, save_all=True, append_images=pal[1:], duration=100, loop=0, optimize=True)
    return {"video": str(video), "gif": str(gif), "duration": round(total, 2)}


def thumbnail(text: str, subtitle: str, code: str, path: Path, w=1280, h=720):
    F = S.Frame(w, h)
    img = F.bg.copy()
    d = ImageDraw.Draw(img)
    if code:
        S.draw_code_card(img, F, (int(w * 0.50), int(h * 0.16), w - F.px(40), h - F.px(60)),
                         "\n".join(code.splitlines()[:7]), title="")
    f = T.font(T.FONT_SANS_BOLD, F.px(118))
    lines = S.wrap(text.upper(), f, int(w * 0.46), d)[:3]
    y = h * 0.20
    for i, ln in enumerate(lines):
        d.text((F.px(56), y), ln, font=f, fill=T.CYAN if i == len(lines) - 1 else T.TEXT)
        y += int(f.size * 1.05)
    if subtitle:
        d.text((F.px(60), y + F.px(20)), subtitle[:34], font=T.font(T.FONT_SANS, F.px(44)), fill=T.MUTED)
    S.chrome(img, F, 1.0)
    img.save(path, quality=92)
    return str(path)
