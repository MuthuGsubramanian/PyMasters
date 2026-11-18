"""Assemble rendered frames + narration into finished media.

Each scene's narration is synthesised first so the visuals are timed to the voice (no speed-ups,
no hard trims). Frames stream straight into ffmpeg as raw RGB."""
import glob
import json
import os
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
        cmd += ["-threads", os.getenv("PMSOCIAL_FFMPEG_THREADS", "2"),
                "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
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


def _verify_rendered_mp4(mp4_path: Path) -> None:
    """Assert zero FFmpeg decoder/container errors on finished MP4 before returning."""
    res = subprocess.run(
        ["ffmpeg", "-threads", os.getenv("PMSOCIAL_FFMPEG_THREADS", "2"), "-v", "error", "-i", str(mp4_path), "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if res.returncode != 0 or res.stderr.strip():
        raise RuntimeError(f"Rendered MP4 failed integrity verification ({mp4_path}): {res.stderr[:400]}")


def render_narrated(segments, out_dir: Path, w, h, captions=True, live_influencer=None, conversational=None, presenter_mp4: Path | None = None):
    """segments: [{"narration": str, "visual": {...}, "chapter": str|None}]
    - Daily 9:16 Shorts (`live_influencer=True`): Broadcast-grade Google Vids (Veo 3 Realistic) `1280x720` lip-synced
      full-motion presenter video (`presenter_veo.mp4`) — Hero Cinema Card on Hook/CTA + Top-Right Live Video PiP on
      walkthrough scenes, verified by `vids_avatar.verify_broadcast_presenter_mp4`.
    - Weekly 16:9 Longs (`live_influencer=False`, `conversational=True`): chapter-batched 2-host (`Vaathiyaar` + `Ananya`)
      NotebookLM-style conversational audio over visual scenes (no on-camera presenter).
    Returns dict(video, srt, duration, chapters=[(start_s, title)])."""
    from socialbot import vids_avatar
    from socialbot.render import presenter_overlay as PO

    out_dir.mkdir(parents=True, exist_ok=True)
    F = S.Frame(w, h)
    if live_influencer is None:
        live_influencer = config.SHORT_LIVE_INFLUENCER if F.portrait else config.LONG_LIVE_PRESENTER
    if conversational is None:
        conversational = (not F.portrait) and config.LONG_CONVERSATIONAL_AUDIO

    veo_mp4_path: Path | None = None
    if live_influencer and F.portrait:
        veo_mp4_path = Path(presenter_mp4) if presenter_mp4 else (out_dir / "presenter_veo.mp4")
        if not veo_mp4_path.is_file():
            if "PYTEST_CURRENT_TEST" in os.environ:
                PO.build_offline_test_presenter_mp4(segments, veo_mp4_path, fps=FPS)
            else:
                spoken = vids_avatar.spoken_script_for_vids(segments)
                vids_avatar.generate_vids_avatar_mp4(spoken, veo_mp4_path, expected_min_s=18.0)
        else:
            vids_avatar.verify_broadcast_presenter_mp4(veo_mp4_path, expected_min_s=1.5 if "PYTEST_CURRENT_TEST" in os.environ else 18.0)

        raw_voice = PO.extract_presenter_audio_24k(veo_mp4_path, out_dir / "voice_raw.wav")
        timeline, all_words, chapters = PO.align_segments_to_presenter_audio(segments, raw_voice, sr=tts.SR)
        voice = np.concatenate([raw_voice, np.zeros(int(0.45 * tts.SR), dtype=np.float32)])
        total = len(voice) / tts.SR
        if timeline:
            a_last, _b_last, vis_last, idx_last = timeline[-1]
            timeline[-1] = (a_last, total, vis_last, idx_last)
        (out_dir / "voice_raw.wav").unlink(missing_ok=True)
    else:
        synth_results = []
        if conversational:
            groups = []
            for seg_ in segments:
                if seg_.get("chapter") or not groups:
                    groups.append([seg_["narration"]])
                else:
                    groups[-1].append(seg_["narration"])
            for grp in groups:
                synth_results.extend(tts.synth_segments_hybrid(grp, conversational=True))
        else:
            synth_results = tts.synth_segments_hybrid([s["narration"] for s in segments], conversational=False)

        audio_parts, all_words, timeline, chapters, t0 = [], [], [], [], 0.0
        gap = np.zeros(int(GAP * tts.SR), dtype=np.float32)
        for idx, (seg_, (a, words)) in enumerate(zip(segments, synth_results)):
            dur = len(a) / tts.SR
            if seg_.get("chapter"):
                chapters.append((t0, seg_["chapter"]))
            timeline.append((t0, t0 + dur + GAP, seg_["visual"], idx))
            all_words += [(wd, s + t0, e + t0) for wd, s, e in words]
            audio_parts += [a, gap]
            t0 += dur + GAP
        total = t0 + 0.6
        voice = np.concatenate(audio_parts + [np.zeros(int(0.6 * tts.SR), dtype=np.float32)])

    sf.write(out_dir / "voice.wav", voice, tts.SR)
    _mix(out_dir / "voice.wav", out_dir / "audio.wav", total)
    env = PO.compute_speech_envelope(voice, tts.SR, FPS) if (live_influencer and F.portrait) else None
    video = out_dir / "video.mp4"
    wr = FFmpegWriter(video, w, h, audio=out_dir / "audio.wav")
    n = int(total * FPS)
    si = 0
    last_seg_idx = len(timeline) - 1
    veo_stream = PO.VeoFrameStream(veo_mp4_path, fps=FPS) if veo_mp4_path else None
    try:
        for fi in range(n):
            now = fi / FPS
            while si < last_seg_idx and now >= timeline[si][1]:
                si += 1
            a, b, vis, seg_idx = timeline[si]
            t = min(1.0, max(0.0, (now - a) / max(0.01, (b - a))))
            prog = now / total
            if live_influencer and F.portrait and veo_stream is not None:
                lvl = float(env[min(fi, len(env) - 1)])
                vframe = veo_stream.next_frame()
                if seg_idx == 0 or seg_idx == last_seg_idx:
                    frame = PO.draw_short_hero_presenter(
                        F.bg.copy(), F, vis, t, prog, lvl, now,
                        words=all_words if captions else None,
                        is_cta=(seg_idx == last_seg_idx),
                        veo_frame=vframe,
                    )
                else:
                    frame = S.draw_frame(F, vis, t, prog, words=all_words if captions else None, now=now)
                    PO.draw_short_pip_presenter(frame, F, lvl, now, veo_frame=vframe)
                wr.write(frame)
            else:
                wr.write(S.draw_frame(F, vis, t, prog, words=all_words if captions else None, now=now))
    finally:
        if veo_stream is not None:
            veo_stream.close()
        wr.close()
    _verify_rendered_mp4(video)
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
