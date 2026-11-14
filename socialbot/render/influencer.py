"""Human-influencer YouTube explainer synthesis, dynamic ASS captions, and FFmpeg PiP compositing."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Optional


def _sec_to_ass_ts(seconds: float) -> str:
    sec = max(float(seconds), 0.0)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def generate_ass_subtitles(segments: list[dict[str, Any]], out_ass: Path, width: int = 1920, height: int = 1080) -> Path:
    """Create stylized .ass dynamic captions timed to explainer segments (word-chunked)."""
    out_ass.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {width}\n"
        f"PlayResY: {height}\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Default,DejaVu Sans,46,&H00FFFFFF,&H0000FFFF,&H00101422,&H880B1020,"
        "1,0,0,0,100,100,0,0,3,3,0,2,80,80,58,1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    events: list[str] = []
    for seg in segments:
        t0 = float(seg.get("start_s", 0.0))
        t1 = max(float(seg.get("end_s", t0 + 3.0)), t0 + 0.5)
        words = (seg.get("narration") or "").split()
        if not words:
            continue
        # Group into crisp 7-word chunks for effortless readability
        chunks = [" ".join(words[i : i + 7]) for i in range(0, len(words), 7)]
        step = (t1 - t0) / max(len(chunks), 1)
        for ci, chunk in enumerate(chunks):
            cs = _sec_to_ass_ts(t0 + ci * step)
            ce = _sec_to_ass_ts(t0 + (ci + 1) * step)
            safe_txt = chunk.replace("{", "(").replace("}", ")")
            events.append(f"Dialogue: 0,{cs},{ce},Default,,0,0,0,,{safe_txt}")

    out_ass.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return out_ass


def synthesize_influencer_script(lesson: dict[str, Any], bilingual_hook: bool = False) -> dict[str, Any]:
    """Build a conversational 3-5 minute plain-English explainer script from a PyMasters lesson JSON."""
    raw_title = lesson.get("title", {})
    title = raw_title.get("en") if isinstance(raw_title, dict) else str(raw_title or lesson.get("topic") or "Python Concept")
    raw_desc = lesson.get("description", {})
    desc = raw_desc.get("en") if isinstance(raw_desc, dict) else str(raw_desc or "")
    sv = lesson.get("story_variants") or {}
    story = sv.get("en") if isinstance(sv, dict) else str(sv or "")
    story_clean = re.sub(r"[`#*_\[\]]", "", story or "").strip()

    challenges = lesson.get("practice_challenges") or []
    sample_code = ""
    sample_stdout = ""
    if challenges and isinstance(challenges[0], dict):
        sample_code = (challenges[0].get("solution") or challenges[0].get("starter_code") or "").strip()
        sample_stdout = (challenges[0].get("expected_output") or "").strip()
    if not sample_code:
        sample_code = f"concept = {title!r}\nsteps = ['prepare', 'process', 'verify']\nfor step in steps:\n    print(concept, '->', step)"
        sample_stdout = f"{title} -> prepare\n{title} -> process\n{title} -> verify"

    code_lines = [ln for ln in sample_code.splitlines() if ln.strip()][:10]
    trace_steps = [
        {"line": idx + 1, "vars": {"line": str(idx + 1), "status": "running"}, "explain": f"Line {idx + 1}: {ln.strip()}"}
        for idx, ln in enumerate(code_lines[:6])
    ]

    greeting = "Vanakkam nanba! Today let's break down " if bilingual_hook else "Let's break down "
    intro_text = (
        f"{greeting}{title} in plain, everyday terms so you can follow every single idea effortlessly without any coding background. "
        f"{desc or f'At its heart, {title} helps software organize work cleanly and reliably, just like sorting mail at a post office counter step by step.'} "
        "By the end of the next four minutes, you will see how it works in real life, watch every line of Python run on screen, "
        "and know exactly when to use it yourself."
    )
    analogy_text = (
        f"Think of {title} like running a busy library front desk. Instead of piling returned books on one giant table where finding anything takes hours, "
        "you follow one simple, repeatable rule: check the label, place it on the right shelf immediately, and log one clear entry. "
        + (story_clean[:450] if story_clean else f"That everyday habit is literally what {title} gives your Python code: clarity, speed, and zero guesswork when data grows.")
    )
    walkthrough_text = (
        "Now look at the Watch It Run screen beside me. We start at line one, set up our initial values, and step through line by line while watching memory update on the right. "
        "Notice how nothing happens out of order: Python reads one instruction, updates the box in memory, moves to the next line, and prints the clean result at the bottom."
    )
    impact_text = (
        f"In real engineering teams across banking, healthcare logistics, and AI assistants, {title} prevents silent mistakes before they reach users. "
        "Because every step is explicit and verifiable, new teammates can read your solution in seconds and trust what it prints."
    )
    outro_text = (
        f"Try running this interactive lesson yourself for free at pymasters.net — step through Watch It Run at your own pace and teach the idea back to Vaathiyaar. "
        "Subscribe for simple, practical Python & AI breakdowns every week."
    )

    segments = [
        {"id": "intro", "layout": "full_presenter", "start_s": 0.0, "end_s": 30.0, "narration": intro_text},
        {"id": "core_analogy", "layout": "pip_code", "start_s": 30.0, "end_s": 95.0, "narration": analogy_text},
        {"id": "code_walkthrough", "layout": "pip_code", "start_s": 95.0, "end_s": 175.0, "narration": walkthrough_text},
        {"id": "real_world_impact", "layout": "pip_code", "start_s": 175.0, "end_s": 215.0, "narration": impact_text},
        {"id": "outro", "layout": "full_presenter", "start_s": 215.0, "end_s": 240.0, "narration": outro_text},
    ]
    full_script = "\n\n".join(s["narration"] for s in segments)
    return {
        "title": f"{title} Explained Simply",
        "topic": lesson.get("topic") or title,
        "estimated_duration_s": 240.0,
        "bilingual_hook": bilingual_hook,
        "script_text": full_script,
        "segments": segments,
        "code_lines": code_lines,
        "trace_steps": trace_steps,
        "stdout_text": sample_stdout,
    }


def _probe_has_audio(media_path: Path) -> bool:
    try:
        out = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(media_path),
            ],
            text=True,
            timeout=15,
        )
        return bool(out.strip())
    except Exception:
        return False


def composite_influencer_video(
    presenter_mp4: Path,
    broll_mp4: Path,
    segments: list[dict[str, Any]],
    out_mp4: Path,
    subtitle_ass: Optional[Path] = None,
    width: int = 1920,
    height: int = 1080,
) -> Path:
    """Composite human presenter (full-frame intro/outro + PiP over 1080p60 B-roll) with ASS captions & -14 LUFS."""
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    threads = os.getenv("PMSOCIAL_FFMPEG_THREADS", "2")

    full_wins = [
        f"between(t,{float(s['start_s']):.2f},{float(s['end_s']):.2f})"
        for s in segments
        if s.get("layout") == "full_presenter"
    ]
    pip_wins = [
        f"between(t,{float(s['start_s']):.2f},{float(s['end_s']):.2f})"
        for s in segments
        if s.get("layout") == "pip_code"
    ]
    full_expr = "+".join(full_wins) or "between(t,0,0)"
    pip_expr = "+".join(pip_wins) or "between(t,0,0)"

    pip_w = max(int(width * 0.24), 160)
    pip_h = max(int(pip_w * 9 / 16), 90)
    pip_w -= pip_w % 2
    pip_h -= pip_h % 2

    vf_chain = [
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1[bg]",
        f"[1:v]split=2[p_full_raw][p_pip_raw]",
        f"[p_full_raw]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1[p_full]",
        f"[p_pip_raw]scale={pip_w}:{pip_h}:force_original_aspect_ratio=increase,crop={pip_w}:{pip_h},setsar=1[p_pip]",
        f"[bg][p_pip]overlay=W-w-36:H-h-88:enable='{pip_expr}'[with_pip]",
        f"[with_pip][p_full]overlay=0:0:enable='{full_expr}'[comp]",
    ]
    last_label = "[comp]"
    if subtitle_ass and subtitle_ass.exists():
        # Escape colons/backslashes inside FFmpeg filter path
        safe_ass = str(subtitle_ass).replace("\\", "/").replace(":", "\\:")
        vf_chain.append(f"{last_label}subtitles='{safe_ass}'[vout]")
        last_label = "[vout]"

    has_audio = _probe_has_audio(presenter_mp4)
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-stream_loop",
        "-1",
        "-i",
        str(broll_mp4),
        "-i",
        str(presenter_mp4),
    ]
    if has_audio:
        vf_chain.append("[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
        cmd += ["-filter_complex", ";".join(vf_chain), "-map", last_label, "-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-filter_complex", ";".join(vf_chain), "-map", last_label]

    cmd += [
        "-shortest",
        "-threads",
        threads,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True, timeout=300)
    return out_mp4
