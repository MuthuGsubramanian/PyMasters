"""Daily Video Generator — turn the top pipeline discovery into YouTube-ready videos.

Produces two videos per day under pipeline/social/<date>/video/:
  - short.mp4      1080x1920 vertical, <= 60s (YouTube Short)
  - explainer.mp4  1920x1080 horizontal, 2-4 minutes
  - metadata.json  per-video title/description/tags ready for upload

Pipeline per video: Claude writes the script (template fallback) -> PIL renders
branded slides -> TTS narrates (edge-tts, then pyttsx3, then silent-with-captions)
-> ffmpeg assembles H.264/AAC with faststart.

Degrades gracefully at every step: no Claude -> template scripts; no TTS ->
silent video with captions burned onto the slides; no ffmpeg -> returns a
skipped status without raising.
"""

import os
import re
import sys
import json
import shutil
import subprocess
import textwrap
from datetime import datetime

from pipeline.utils.claude import ask_claude_json
from pipeline.utils.logger import get_logger

log = get_logger("video.generate")

SOCIAL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "social")

# ── PyMasters brand ───────────────────────────────────────────────────────────
BG_TOP = (10, 15, 30)        # #0a0f1e deep dark
BG_BOTTOM = (16, 21, 45)     # slightly lifted for the gradient
VIOLET = (124, 58, 237)      # #7c3aed
CYAN = (6, 182, 212)         # #06b6d4
WHITE = (245, 247, 250)
MUTED = (148, 163, 184)
CODE_BG = (17, 24, 39)       # #111827 panel

_FONTS_BOLD = ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/arialbd.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
_FONTS_REG = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
_FONTS_MONO = ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]

TTS_VOICE = "en-US-ChristopherNeural"  # edge-tts voice
SILENT_SLIDE_SECONDS = 6.0             # per-slide duration when no TTS is available
SHORT_MAX_SECONDS = 60.0

# ── ffmpeg discovery ──────────────────────────────────────────────────────────


def find_ffmpeg() -> str | None:
    """Locate ffmpeg: FFMPEG_BIN env override, PATH, then known install locations."""
    override = os.environ.get("FFMPEG_BIN", "")
    if override and os.path.isfile(override):
        return override
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"),
        r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
    ]
    # winget portable installs land under WinGet\Packages\Gyan.FFmpeg*\...\bin
    pkg_root = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if os.path.isdir(pkg_root):
        for name in os.listdir(pkg_root):
            if name.lower().startswith("gyan.ffmpeg"):
                pkg = os.path.join(pkg_root, name)
                for root, _dirs, files in os.walk(pkg):
                    if "ffmpeg.exe" in files:
                        candidates.append(os.path.join(root, "ffmpeg.exe"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    # Last resort: the imageio-ffmpeg wheel bundles a static ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def find_ffprobe() -> str | None:
    """Locate ffprobe (usually sits beside ffmpeg)."""
    exe = shutil.which("ffprobe")
    if exe:
        return exe
    ffmpeg = find_ffmpeg()
    if ffmpeg:
        sibling = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
        if os.path.isfile(sibling):
            return sibling
        sibling = os.path.join(os.path.dirname(ffmpeg), "ffprobe")
        if os.path.isfile(sibling):
            return sibling
    return None


def _run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    """Run a subprocess quietly, raising on failure with stderr in the message."""
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = (proc.stderr or "")[-800:]
        raise RuntimeError(f"Command failed ({os.path.basename(cmd[0])}): {tail}")
    return proc


def media_duration(path: str) -> float:
    """Duration in seconds via ffprobe, falling back to parsing `ffmpeg -i`."""
    ffprobe = find_ffprobe()
    if ffprobe:
        try:
            proc = _run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                         "-of", "default=noprint_wrappers=1:nokey=1", path])
            return float(proc.stdout.strip())
        except Exception:
            pass
    ffmpeg = find_ffmpeg()
    if ffmpeg:
        proc = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", proc.stderr or "")
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    raise RuntimeError(f"Could not determine duration of {path}")


# ── Script generation ─────────────────────────────────────────────────────────

SHORT_SCRIPT_PROMPT = """You are the video script writer for PyMasters (pymasters.net),
a platform where Python developers learn AI/ML by building.

Write a ~60-second YouTube Short script about this AI discovery:

{item}

The script must have exactly 5 sections in this order:
1. kind "hook"  — one punchy attention-grabbing line (a question or bold claim).
2-4. kind "point" — three short, concrete, punchy points a developer actually learns from.
5. kind "cta"   — wrap up and tell viewers to learn more at pymasters.net.

Total narration across all sections MUST be under 130 words (it has to fit 60 seconds).
Sound knowledgeable and direct, not hypey.

Return ONLY a JSON object:
{{
  "title": "<video working title>",
  "sections": [
    {{"kind": "hook", "heading": "<3-6 word on-screen heading>", "narration": "<spoken text>"}},
    {{"kind": "point", "heading": "...", "narration": "..."}},
    {{"kind": "point", "heading": "...", "narration": "..."}},
    {{"kind": "point", "heading": "...", "narration": "..."}},
    {{"kind": "cta", "heading": "...", "narration": "... learn more at pymasters.net"}}
  ]
}}"""

EXPLAINER_SCRIPT_PROMPT = """You are the video script writer for PyMasters (pymasters.net),
a platform where Python developers learn AI/ML by building.

Write a 2-4 minute YouTube explainer script about this AI discovery:

{item}

The script must have exactly 5 sections in this order:
1. kind "intro"    — welcome the viewer, say what today's video covers and why it matters.
2. kind "concept"  — explain the core concept clearly for a Python developer.
3. kind "code"     — walk through a SHORT illustrative Python example (max 10 lines of
                     code, max 60 chars per line). Put the code in the "code" field and
                     narrate what each part does.
4. kind "takeaway" — the practical takeaway: when to use this, what to watch out for.
5. kind "cta"      — invite viewers to keep learning with hands-on lessons at pymasters.net.

Total narration should be 300-500 words (2-4 minutes of speech).
Sound like a friendly, expert instructor. No hype.

Return ONLY a JSON object:
{{
  "title": "<video working title>",
  "sections": [
    {{"kind": "intro", "heading": "<3-6 word on-screen heading>", "narration": "<spoken text>"}},
    {{"kind": "concept", "heading": "...", "narration": "..."}},
    {{"kind": "code", "heading": "...", "narration": "...", "code": "<python code>"}},
    {{"kind": "takeaway", "heading": "...", "narration": "..."}},
    {{"kind": "cta", "heading": "...", "narration": "... at pymasters.net"}}
  ]
}}"""

METADATA_PROMPT = """You are the YouTube channel manager for PyMasters (pymasters.net),
a platform where Python developers learn AI/ML by building.

Today we published two videos about this discovery:

{item}

Short script title: {short_title}
Explainer script title: {explainer_title}

Write upload metadata for both. Rules:
- title: <= 90 characters, compelling and specific, NO clickbait, no ALL CAPS words.
- description: 2-3 short paragraphs; must include https://pymasters.net and end with
  a line of 5-8 hashtags.
- tags: 10-15 short search tags (no # symbol).

Return ONLY a JSON object:
{{
  "short": {{"title": "...", "description": "...", "tags": ["...", "..."]}},
  "explainer": {{"title": "...", "description": "...", "tags": ["...", "..."]}}
}}"""


def _fix_text(s: str) -> str:
    """Repair UTF-8-as-cp1252 mojibake from CLI captures (e.g. 'â€”' -> '—').

    The Claude CLI emits UTF-8 but subprocess text capture on Windows decodes
    it as cp1252, so em-dashes/quotes arrive garbled in scripts and metadata
    (bad on slides, worse spoken by TTS). No-op for clean text.
    """
    if not isinstance(s, str) or not ("â" in s or "Ã" in s or "€" in s):
        return s
    try:
        return s.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _item_summary(item: dict) -> dict:
    """Extract the key fields from a scored item for the prompts."""
    return {
        "title": item.get("title", "Unknown"),
        "description": item.get("description", "")[:400],
        "opportunity": item.get("opportunity", ""),
        "url": item.get("url", ""),
        "score": item.get("relevance_score", 0),
    }


def _validate_script(script: dict, min_sections: int = 4) -> dict:
    """Ensure a Claude-generated script has the fields the renderer needs."""
    if not isinstance(script, dict):
        raise ValueError("script is not a dict")
    sections = script.get("sections")
    if not isinstance(sections, list) or len(sections) < min_sections:
        raise ValueError("script has too few sections")
    clean = []
    for sec in sections:
        heading = _fix_text(str(sec.get("heading", "")).strip())
        narration = _fix_text(str(sec.get("narration", "")).strip())
        if not heading or not narration:
            continue
        entry = {"kind": str(sec.get("kind", "point")), "heading": heading,
                 "narration": narration}
        if sec.get("code"):
            entry["code"] = _fix_text(str(sec["code"]))
        clean.append(entry)
    if len(clean) < min_sections:
        raise ValueError("script sections missing headings/narration")
    return {"title": _fix_text(str(script.get("title", "")).strip()) or "Today in Python & AI",
            "sections": clean}


def _style_suffix(style_notes: str | None) -> str:
    """Editor's style direction (super-admin Social Studio) appended to prompts."""
    if not style_notes:
        return ""
    return f"\n\nEditor's style direction — follow it: {style_notes.strip()}"


def generate_short_script(item: dict, style_notes: str | None = None) -> dict:
    """Claude-written ~60s Short script, with a template fallback."""
    try:
        raw = ask_claude_json(SHORT_SCRIPT_PROMPT.format(item=json.dumps(_item_summary(item), indent=2))
                              + _style_suffix(style_notes))
        script = _validate_script(raw)
        log.info(f"Short script generated by Claude: {script['title']}")
        return script
    except Exception as e:
        log.error(f"Claude short script failed, using template: {e}")
        return _fallback_short_script(item)


def _fallback_short_script(item: dict) -> dict:
    """Template Short script when the AI call fails."""
    title = item.get("title", "Today's AI discovery")
    desc = item.get("description", "") or "A new development worth your attention."
    opp = item.get("opportunity", "") or "It opens practical doors for Python developers."
    return {
        "title": f"{title} in 60 seconds",
        "sections": [
            {"kind": "hook", "heading": "60-second AI brief",
             "narration": f"Here's an AI development you should know about today: {title}."},
            {"kind": "point", "heading": "What it is",
             "narration": desc[:220]},
            {"kind": "point", "heading": "Why it matters",
             "narration": opp[:220]},
            {"kind": "point", "heading": "For Python devs",
             "narration": "You can start experimenting with this in Python today — "
                          "small experiments beat big plans."},
            {"kind": "cta", "heading": "Keep learning",
             "narration": "Want hands-on practice with ideas like this? "
                          "Learn more at pymasters.net."},
        ],
    }


def generate_explainer_script(item: dict, style_notes: str | None = None) -> dict:
    """Claude-written 2-4 minute explainer script, with a template fallback."""
    try:
        raw = ask_claude_json(EXPLAINER_SCRIPT_PROMPT.format(item=json.dumps(_item_summary(item), indent=2))
                              + _style_suffix(style_notes))
        script = _validate_script(raw)
        log.info(f"Explainer script generated by Claude: {script['title']}")
        return script
    except Exception as e:
        log.error(f"Claude explainer script failed, using template: {e}")
        return _fallback_explainer_script(item)


def _fallback_explainer_script(item: dict) -> dict:
    """Template explainer script when the AI call fails."""
    title = item.get("title", "Today's AI discovery")
    desc = item.get("description", "") or "A new development in the AI ecosystem."
    opp = item.get("opportunity", "") or "It gives Python developers a practical new tool."
    return {
        "title": f"{title} — explained for Python developers",
        "sections": [
            {"kind": "intro", "heading": "Today's topic",
             "narration": f"Welcome to PyMasters daily. Today we're looking at {title}, "
                          "and why it deserves a spot on your radar as a Python developer."},
            {"kind": "concept", "heading": "The concept",
             "narration": f"{desc} In practical terms, this changes what you can build "
                          "without heavyweight infrastructure."},
            {"kind": "code", "heading": "In Python",
             "narration": "Here's the shape of how you'd use something like this in Python. "
                          "You import the library, load the model or client, and call it "
                          "with your data — the heavy lifting is abstracted away.",
             "code": "from library import Model\n\nmodel = Model.load(\"model-name\")\nresult = model.run(my_data)\nprint(result)"},
            {"kind": "takeaway", "heading": "The takeaway",
             "narration": f"{opp} Start small: reproduce the basic example, then swap in "
                          "your own data and measure whether it actually helps."},
            {"kind": "cta", "heading": "Keep building",
             "narration": "If you want to go deeper with hands-on, sandbox-graded Python "
                          "and AI lessons, visit pymasters.net. See you tomorrow."},
        ],
    }


# ── Slide rendering (PIL) ─────────────────────────────────────────────────────


def _font(size: int, kind: str = "reg"):
    from PIL import ImageFont
    paths = {"bold": _FONTS_BOLD, "reg": _FONTS_REG, "mono": _FONTS_MONO}[kind]
    for path in paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_width: int) -> list[str]:
    """Word-wrap text to a pixel width using measured extents (no overflow)."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = (current + " " + word).strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            # Hard-break pathological words wider than the column
            while draw.textlength(word, font=font) > max_width and len(word) > 1:
                cut = len(word)
                while cut > 1 and draw.textlength(word[:cut], font=font) > max_width:
                    cut -= 1
                lines.append(word[:cut])
                word = word[cut:]
            current = word
    if current:
        lines.append(current)
    return lines


def _base_canvas(w: int, h: int):
    """Brand background: vertical #0a0f1e gradient + violet→cyan glow accents."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (w, h), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)],
               fill=tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    img = img.convert("RGBA")
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    r = int(min(w, h) * 0.55)
    od.ellipse([w - r, -r // 2, w + r, r + r // 2], fill=VIOLET + (26,))
    od.ellipse([-r // 2, h - r, r + r // 2, h + r], fill=CYAN + (22,))
    return Image.alpha_composite(img, overlay), w, h


def _accent_bar(draw, x: int, y: int, width: int, thickness: int = 8):
    """Horizontal violet→cyan gradient bar."""
    for i in range(width):
        t = i / max(1, width - 1)
        c = tuple(int(VIOLET[k] + (CYAN[k] - VIOLET[k]) * t) for k in range(3))
        draw.line([(x + i, y), (x + i, y + thickness)], fill=c)


def _brand_footer(draw, w: int, h: int, scale: float):
    draw.text((int(60 * scale), h - int(70 * scale)), "pymasters.net",
              font=_font(int(34 * scale), "bold"), fill=CYAN)
    label = "PYMASTERS"
    f = _font(int(30 * scale), "bold")
    draw.text((w - draw.textlength(label, font=f) - int(60 * scale), h - int(70 * scale)),
              label, font=f, fill=MUTED)


def _render_title_slide(path: str, title: str, kicker: str, vertical: bool):
    from PIL import ImageDraw
    w, h = (1080, 1920) if vertical else (1920, 1080)
    img, w, h = _base_canvas(w, h)
    draw = ImageDraw.Draw(img)
    scale = 1.0 if vertical else 1.1
    margin = int(80 * scale)
    col = w - 2 * margin

    draw.text((margin, int(h * 0.30) if vertical else int(h * 0.24)),
              kicker, font=_font(int(38 * scale), "bold"), fill=CYAN)
    size = int((84 if vertical else 92) * scale)
    tf = _font(size, "bold")
    lines = _wrap(draw, title, tf, col)
    while len(lines) > 4 and size > 40:  # shrink to fit
        size = int(size * 0.85)
        tf = _font(size, "bold")
        lines = _wrap(draw, title, tf, col)
    y = int(h * 0.36) if vertical else int(h * 0.32)
    for ln in lines:
        draw.text((margin, y), ln, font=tf, fill=WHITE)
        y += int(size * 1.2)
    _accent_bar(draw, margin, y + int(24 * scale), int(300 * scale), int(10 * scale))
    _brand_footer(draw, w, h, scale)
    img.convert("RGB").save(path, "PNG")


def _render_section_slide(path: str, section: dict, index: int, total: int,
                          vertical: bool, burn_captions: bool):
    from PIL import ImageDraw
    w, h = (1080, 1920) if vertical else (1920, 1080)
    img, w, h = _base_canvas(w, h)
    draw = ImageDraw.Draw(img)
    scale = 1.0 if vertical else 1.1
    margin = int(80 * scale)
    col = w - 2 * margin

    # Progress kicker + heading (vertical Shorts start lower — phones crop edges)
    kicker_y = int(h * 0.14) if vertical else int(90 * scale)
    draw.text((margin, kicker_y), f"{index:02d} / {total:02d}",
              font=_font(int(30 * scale), "bold"), fill=MUTED)
    hsize = int((64 if vertical else 72) * scale)
    hf = _font(hsize, "bold")
    hlines = _wrap(draw, section["heading"], hf, col)[:3]
    y = kicker_y + int(60 * scale)
    for ln in hlines:
        draw.text((margin, y), ln, font=hf, fill=WHITE)
        y += int(hsize * 1.15)
    _accent_bar(draw, margin, y + int(14 * scale), int(220 * scale), int(8 * scale))
    y += int(80 * scale)

    # Optional code panel (#111827, monospace)
    code = section.get("code")
    if code:
        mono = _font(int((30 if vertical else 34) * scale), "mono")
        raw_lines = [ln.rstrip() for ln in code.strip().splitlines()][:14]
        code_lines = []
        for ln in raw_lines:
            wrapped = textwrap.wrap(ln, width=48, subsequent_indent="    ") or [""]
            code_lines.extend(wrapped)
        code_lines = code_lines[:16]
        pad = int(34 * scale)
        line_h = int(mono.size * 1.5)
        panel_h = pad * 2 + line_h * len(code_lines)
        draw.rounded_rectangle([margin, y, w - margin, y + panel_h],
                               radius=int(18 * scale), fill=CODE_BG,
                               outline=VIOLET + (140,), width=2)
        cy = y + pad
        for ln in code_lines:
            draw.text((margin + pad, cy), ln, font=mono, fill=(203, 213, 225))
            cy += line_h
        y += panel_h + int(50 * scale)

    # Body: narration text (always shown for code-free slides keeps them readable;
    # when there is no narration audio we are the captions, so never skip it).
    body = section["narration"]
    bsize = int((44 if vertical else 46) * scale)
    bf = _font(bsize)
    blines = _wrap(draw, body, bf, col)
    max_lines = max(3, (h - y - int(160 * scale)) // int(bsize * 1.4))
    if len(blines) > max_lines and not burn_captions:
        blines = blines[:max_lines - 1] + [blines[max_lines - 1] + " …"]
    elif len(blines) > max_lines:
        # captions must fit: shrink instead of truncating
        while len(blines) > max_lines and bsize > 24:
            bsize = int(bsize * 0.88)
            bf = _font(bsize)
            blines = _wrap(draw, body, bf, col)
            max_lines = max(3, (h - y - int(160 * scale)) // int(bsize * 1.4))
        blines = blines[:max_lines]
    for ln in blines:
        draw.text((margin, y), ln, font=bf, fill=(226, 232, 240))
        y += int(bsize * 1.4)

    _brand_footer(draw, w, h, scale)
    img.convert("RGB").save(path, "PNG")


def render_slides(script: dict, out_dir: str, vertical: bool, kicker: str,
                  burn_captions: bool) -> list[str]:
    """Render the title slide + one slide per section. Returns PNG paths in order."""
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    title_path = os.path.join(out_dir, "slide_00_title.png")
    _render_title_slide(title_path, script["title"], kicker, vertical)
    paths.append(title_path)
    total = len(script["sections"])
    for i, section in enumerate(script["sections"], 1):
        p = os.path.join(out_dir, f"slide_{i:02d}_{section.get('kind', 'part')}.png")
        _render_section_slide(p, section, i, total, vertical, burn_captions)
        paths.append(p)
    return paths


# ── TTS ───────────────────────────────────────────────────────────────────────


def _ensure_edge_tts() -> bool:
    """Import edge-tts, pip-installing it into this interpreter if missing."""
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        log.info("edge-tts not installed — attempting pip install...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "edge-tts"],
                           check=True, capture_output=True, timeout=300)
            import edge_tts  # noqa: F401
            return True
        except Exception as e:
            log.warning(f"edge-tts install failed: {e}")
            return False


def _tts_edge(text: str, out_path: str) -> bool:
    """Synthesize with edge-tts (online, natural voice). Returns True on success."""
    try:
        import asyncio
        import edge_tts

        async def _speak():
            communicate = edge_tts.Communicate(text, TTS_VOICE)
            await communicate.save(out_path)

        asyncio.run(_speak())
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 1000
    except Exception as e:
        log.warning(f"edge-tts synthesis failed: {e}")
        return False


def _tts_pyttsx3(text: str, out_path: str) -> bool:
    """Synthesize with pyttsx3 (offline SAPI). Returns True on success."""
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate", 175)
        engine.save_to_file(text, out_path)
        engine.runAndWait()
        try:
            engine.stop()
        except Exception:
            pass
        return os.path.isfile(out_path) and os.path.getsize(out_path) > 1000
    except Exception as e:
        log.warning(f"pyttsx3 synthesis failed: {e}")
        return False


def synthesize_narration(sections: list[dict], out_dir: str) -> tuple[str, list[str]]:
    """Synthesize one audio file per section.

    Probes engines in order: edge-tts -> pyttsx3 -> none. All segments use the
    same engine (consistent voice). Returns (engine_name, audio_paths) where
    engine_name is "edge-tts", "pyttsx3" or "none" (audio_paths empty for none).
    """
    os.makedirs(out_dir, exist_ok=True)
    engines = []
    if _ensure_edge_tts():
        engines.append(("edge-tts", _tts_edge, ".mp3"))
    engines.append(("pyttsx3", _tts_pyttsx3, ".wav"))

    for name, fn, ext in engines:
        paths = []
        ok = True
        for i, section in enumerate(sections):
            p = os.path.join(out_dir, f"seg_{i:02d}{ext}")
            if not fn(section["narration"], p):
                ok = False
                break
            paths.append(p)
        if ok and paths:
            log.info(f"Narration synthesized with {name} ({len(paths)} segments)")
            return name, paths
        log.warning(f"TTS engine '{name}' failed — trying next fallback")
        for p in paths:  # clean partial output
            try:
                os.remove(p)
            except OSError:
                pass
    log.warning("No TTS engine available — producing silent video with captions")
    return "none", []


# ── ffmpeg assembly ───────────────────────────────────────────────────────────


def assemble_video(slides: list[str], audio_paths: list[str], out_path: str,
                   work_dir: str, max_seconds: float | None = None) -> None:
    """Assemble slides (+ optional per-section narration) into an H.264/AAC MP4.

    slides[0] is the title card (short fixed duration); slides[1:] pair 1:1 with
    audio_paths when narrated, or run SILENT_SLIDE_SECONDS each when silent.
    If max_seconds is set, narration is time-stretched (atempo) to fit.
    """
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found on PATH or known install locations")
    os.makedirs(work_dir, exist_ok=True)
    narrated = bool(audio_paths)

    # Decide per-slide durations and any tempo correction for the length cap
    title_dur = 2.5 if narrated else 3.0
    tempo = 1.0
    if narrated:
        seg_durs = [media_duration(p) for p in audio_paths]
        total = title_dur + sum(seg_durs) + 0.5  # concat slack
        if max_seconds and total > max_seconds:
            tempo = min(2.0, sum(seg_durs) / max(1.0, (max_seconds - title_dur - 0.5)))
            log.info(f"Narration {total:.1f}s over {max_seconds:.0f}s cap — atempo {tempo:.2f}")
    else:
        n = len(slides) - 1
        per_slide = SILENT_SLIDE_SECONDS
        if max_seconds:
            per_slide = min(per_slide, (max_seconds - title_dur) / max(1, n))

    segment_files = []

    def encode_segment(idx: int, image: str, audio: str | None, duration: float | None):
        seg = os.path.join(work_dir, f"part_{idx:02d}.mp4")
        cmd = [ffmpeg, "-y", "-loop", "1", "-framerate", "30", "-i", image]
        if audio:  # section slide with narration: video runs for the audio length
            afilter = f"atempo={tempo:.4f}," if tempo > 1.001 else ""
            cmd += ["-i", audio,
                    "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage",
                    "-pix_fmt", "yuv420p",
                    "-af", f"{afilter}aresample=44100", "-c:a", "aac", "-b:a", "128k",
                    "-shortest"]
        elif narrated:  # title card in a narrated video: silent track keeps concat uniform
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                    "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                    "-t", f"{duration:.2f}"]
        else:  # fully silent video: fixed-duration slide, no audio stream
            cmd += ["-c:v", "libx264", "-preset", "medium", "-tune", "stillimage",
                    "-pix_fmt", "yuv420p", "-an", "-t", f"{duration:.2f}"]
        cmd += [seg]
        _run(cmd)
        segment_files.append(seg)

    encode_segment(0, slides[0], None, title_dur)
    for i, slide in enumerate(slides[1:]):
        if narrated:
            encode_segment(i + 1, slide, audio_paths[i], None)
        else:
            encode_segment(i + 1, slide, None, per_slide)

    # Concat (re-encode for clean timestamps) + faststart
    list_path = os.path.join(work_dir, "concat.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for seg in segment_files:
            f.write(f"file '{seg.replace(os.sep, '/')}'\n")
    cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
           "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p"]
    if narrated:
        cmd += ["-c:a", "aac", "-b:a", "128k"]
    if max_seconds:
        cmd += ["-t", f"{max_seconds - 0.1:.2f}"]  # hard safety cap
    cmd += ["-movflags", "+faststart", out_path]
    _run(cmd)
    log.info(f"Assembled {out_path} ({media_duration(out_path):.1f}s)")


# ── Metadata ──────────────────────────────────────────────────────────────────


def generate_metadata(item: dict, short_script: dict, explainer_script: dict) -> dict:
    """YouTube upload metadata for both videos, with a template fallback."""
    try:
        raw = ask_claude_json(METADATA_PROMPT.format(
            item=json.dumps(_item_summary(item), indent=2),
            short_title=short_script["title"],
            explainer_title=explainer_script["title"],
        ))
        meta = {}
        for key in ("short", "explainer"):
            entry = raw[key]
            title = _fix_text(str(entry["title"]).strip())[:90]
            description = _fix_text(str(entry["description"]).strip())
            tags = [_fix_text(str(t).lstrip("#").strip())
                    for t in entry.get("tags", []) if str(t).strip()]
            if not title or not description or len(tags) < 5:
                raise ValueError(f"incomplete metadata for '{key}'")
            if "pymasters.net" not in description:
                description += "\n\nLearn Python & AI by building: https://pymasters.net"
            meta[key] = {"title": title, "description": description,
                         "tags": tags[:15], "category": "27", "youtube_url": None}
        log.info("Video metadata generated by Claude")
        return meta
    except Exception as e:
        log.error(f"Claude metadata failed, using template: {e}")
        return _fallback_metadata(item, short_script, explainer_script)


def _fallback_metadata(item: dict, short_script: dict, explainer_script: dict) -> dict:
    """Template metadata when the AI call fails."""
    topic = item.get("title", "Today's AI discovery")
    base_tags = ["python", "ai", "machine learning", "programming", "coding",
                 "learn python", "ai tools", "developer", "tutorial", "pymasters",
                 "python tutorial", "artificial intelligence"]
    desc_tail = ("\n\nPyMasters turns discoveries like this into hands-on, "
                 "sandbox-graded Python & AI lessons. Learn by building: "
                 "https://pymasters.net"
                 "\n\n#Python #AI #MachineLearning #Coding #LearnToCode #Programming")
    return {
        "short": {
            "title": f"{topic} — in 60 seconds"[:90],
            "description": (f"A 60-second brief on {topic}: what it is, why it matters, "
                            f"and what Python developers can do with it today."
                            + desc_tail),
            "tags": (base_tags + ["shorts", "ai news"])[:15],
            "category": "27",
            "youtube_url": None,
        },
        "explainer": {
            "title": f"{topic} — explained for Python developers"[:90],
            "description": (f"Today's PyMasters explainer covers {topic}: the core concept, "
                            f"a short Python code walkthrough, and the practical takeaway "
                            f"for your own projects." + desc_tail),
            "tags": (base_tags + ["explainer", "code walkthrough"])[:15],
            "category": "27",
            "youtube_url": None,
        },
    }


# ── Main entry point ──────────────────────────────────────────────────────────


def generate_daily_videos(scored_items: list[dict], style_notes: str | None = None) -> dict:
    """Generate the daily Short + explainer videos from the top scored item.

    Args:
        scored_items: Scored items from the pipeline (already sorted by score).
        style_notes: Optional editor's style direction (Social Studio) passed
            into the script prompts.

    Returns:
        dict with keys: status, video_dir, short_path, explainer_path,
        metadata_path, metadata, tts_engine. On failure/skip, status explains why
        and path keys may be empty — never raises for expected conditions.
    """
    if not scored_items:
        log.warning("No items available for video generation.")
        return {"status": "skipped: no items", "metadata": None}

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        log.warning("ffmpeg not found — skipping video generation "
                    "(install ffmpeg and ensure it is on PATH).")
        return {"status": "skipped: ffmpeg missing", "metadata": None}
    log.info(f"Using ffmpeg: {ffmpeg}")

    today = datetime.now().strftime("%Y-%m-%d")
    video_dir = os.path.join(SOCIAL_DIR, today, "video")
    work_dir = os.path.join(video_dir, "_work")
    os.makedirs(work_dir, exist_ok=True)

    top_item = scored_items[0]
    log.info(f"Generating daily videos for: {top_item.get('title', '?')}")

    # 1. Scripts (Claude, template fallback)
    short_script = generate_short_script(top_item, style_notes=style_notes)
    explainer_script = generate_explainer_script(top_item, style_notes=style_notes)

    # 2. Narration (edge-tts -> pyttsx3 -> silent)
    tts_engine, short_audio = synthesize_narration(
        short_script["sections"], os.path.join(work_dir, "audio_short"))
    if tts_engine != "none":
        engine2, explainer_audio = synthesize_narration(
            explainer_script["sections"], os.path.join(work_dir, "audio_explainer"))
        if engine2 == "none":  # engine died mid-run; keep both videos consistent
            tts_engine, short_audio, explainer_audio = "none", [], []
    else:
        explainer_audio = []
    burn_captions = tts_engine == "none"

    # 3. Slides (title + one per section)
    short_slides = render_slides(short_script, os.path.join(work_dir, "slides_short"),
                                 vertical=True, kicker="PYMASTERS · 60-SECOND BRIEF",
                                 burn_captions=burn_captions)
    explainer_slides = render_slides(explainer_script, os.path.join(work_dir, "slides_explainer"),
                                     vertical=False, kicker="PYMASTERS · DAILY EXPLAINER",
                                     burn_captions=burn_captions)

    # 4. Assembly
    result = {"status": "generated", "video_dir": video_dir, "tts_engine": tts_engine,
              "short_path": "", "explainer_path": "", "metadata_path": "", "metadata": None}

    short_path = os.path.join(video_dir, "short.mp4")
    try:
        assemble_video(short_slides, short_audio, short_path,
                       os.path.join(work_dir, "asm_short"), max_seconds=SHORT_MAX_SECONDS)
        result["short_path"] = short_path
    except Exception as e:
        log.error(f"Short assembly failed: {e}")

    explainer_path = os.path.join(video_dir, "explainer.mp4")
    try:
        assemble_video(explainer_slides, explainer_audio, explainer_path,
                       os.path.join(work_dir, "asm_explainer"))
        result["explainer_path"] = explainer_path
    except Exception as e:
        log.error(f"Explainer assembly failed: {e}")

    if not result["short_path"] and not result["explainer_path"]:
        result["status"] = "error: assembly failed"
        return result

    # 5. Metadata
    metadata = generate_metadata(top_item, short_script, explainer_script)
    metadata_path = os.path.join(video_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    result["metadata"] = metadata
    result["metadata_path"] = metadata_path
    log.info(f"Video metadata saved: {metadata_path}")

    # 6. Tidy the work dir (keep slides/audio only if something failed, for debugging)
    if result["short_path"] and result["explainer_path"]:
        shutil.rmtree(work_dir, ignore_errors=True)

    return result


if __name__ == "__main__":
    # Manual smoke test: build videos from a synthetic top item.
    demo_items = [{
        "title": "Sentence embeddings with all-MiniLM-L6-v2",
        "description": "Fast local semantic search with a 22M-param model",
        "opportunity": "On-device semantic search without API costs",
        "url": "https://hf.co/sentence-transformers/all-MiniLM-L6-v2",
        "relevance_score": 9,
    }]
    out = generate_daily_videos(demo_items)
    print(json.dumps({k: v for k, v in out.items() if k != "metadata"}, indent=2))
