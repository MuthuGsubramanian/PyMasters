"""Meme-style YouTube Shorts — Python concepts explained through relatable
internet meme formats (Expectation vs Reality, "POV:", "Nobody asked, but",
drake-style two-choice, etc).

This exists purely to break the monotony of the daily AI-discovery Short:
pick_short_format() in generate_videos.py calls into this module a few days
a week instead of the standard explainer, cycling through a fixed pool of
core Python concepts (never tied to the day's AI news item). Same hard QA
gate pattern as pipeline/actors/stack_explainer.py: a script that fails
validation is dropped with NO generic fallback — the caller falls back to
the standard Short format instead of publishing something generic.
"""

import json
import os
import random

from pipeline.utils.claude import ask_claude_json
from pipeline.utils.logger import get_logger

log = get_logger("video.meme_shorts")

HISTORY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "social", "_state", "short_variety.json"
)

CONCEPT_POOL = [
    "Mutable default arguments",
    "The Global Interpreter Lock (GIL)",
    "is vs ==",
    "List comprehensions vs for-loops",
    "*args and **kwargs",
    "Decorators",
    "Generators and yield",
    "Context managers (the with statement)",
    "Closures and late binding in loops",
    "Shallow copy vs deep copy",
    "Duck typing",
    "The walrus operator :=",
    "f-strings vs .format() vs %",
    "Virtual environments",
    "async/await vs threading",
]

BANNED_PHRASES = [
    "game changer", "game-changer", "revolutionize", "unleash", "supercharge",
    "next level", "mind-blowing", "insane", "crazy good", "unlock the power",
]

MEME_SCRIPT_PROMPT = """You write meme-style YouTube Shorts for PyMasters (pymasters.net),
teaching Python concepts through relatable, funny-but-accurate internet meme formats
(Expectation vs Reality, "Nobody asked but", "POV:", drake-style two-choice,
"it's not X it's Y", etc).

Today's concept: {concept}

Pick ONE meme format that fits this concept well, and write a short (3-4 panel) meme
explaining it. Be genuinely funny to a Python developer, not generic or hypey — never
use words like "game changer", "revolutionize", "insane", "mind-blowing". Every panel's
on-screen caption must be meme-short (under 12 words); the narration can be a little
longer and spoken aloud. The joke must still teach the ACTUAL correct behavior — a
developer should walk away understanding {concept} correctly, not just laughing.

Return ONLY a JSON object:
{{
  "format_label": "<punchy meme format name shown as the on-screen kicker, e.g. EXPECTATION VS REALITY>",
  "title": "<video title, <=60 chars, specific to {concept}>",
  "panels": [
    {{"tag": "<short panel label like EXPECTATION, REALITY, SETUP, PUNCHLINE>",
      "caption": "<on-screen meme caption, under 12 words>",
      "narration": "<spoken line, 1-2 sentences>",
      "code": "<optional short python snippet illustrating this panel, omit key if none>"}}
  ],
  "lesson": "<one sentence: the real, correct technical takeaway>",
  "cta": "<one sentence inviting viewers to pymasters.net>"
}}

Return exactly 3 or 4 panels."""


def _looks_hype(text: str) -> bool:
    low = text.lower()
    return any(p in low for p in BANNED_PHRASES)


def validate_meme_script(script: dict) -> dict | None:
    """Hard QA gate. Returns a cleaned script dict, or None on any failure —
    callers must fall back to the standard explainer Short, never publish a
    generic meme in its place."""
    try:
        panels = script["panels"]
        if not isinstance(panels, list) or not (3 <= len(panels) <= 4):
            return None
        clean_panels = []
        for p in panels:
            caption = str(p["caption"]).strip()
            narration = str(p["narration"]).strip()
            tag = str(p.get("tag", "")).strip() or "BEAT"
            if not caption or not narration:
                return None
            if len(caption.split()) > 16:  # meme captions must stay punchy
                return None
            if _looks_hype(caption) or _looks_hype(narration):
                return None
            entry = {"tag": tag, "caption": caption, "narration": narration}
            if p.get("code"):
                entry["code"] = str(p["code"])
            clean_panels.append(entry)
        title = str(script.get("title", "")).strip()
        lesson = str(script.get("lesson", "")).strip()
        cta = str(script.get("cta", "")).strip()
        format_label = str(script.get("format_label", "")).strip().upper() or "CODE MEMES"
        if not title or not lesson or not cta:
            return None
        if _looks_hype(lesson) or _looks_hype(title):
            return None
        return {
            "format_label": format_label, "title": title, "panels": clean_panels,
            "lesson": lesson, "cta": cta,
        }
    except (KeyError, TypeError, ValueError):
        return None


def generate_meme_script(concept: str, style_notes: str | None = None) -> dict | None:
    """Claude-written meme Short script for one Python concept.

    Returns None on any failure or QA rejection — the caller must fall back
    to the standard explainer Short rather than publish generic content.
    """
    prompt = MEME_SCRIPT_PROMPT.format(concept=concept)
    if style_notes:
        prompt += f"\n\nEditor's style direction — follow it: {style_notes.strip()}"
    try:
        raw = ask_claude_json(prompt)
        script = validate_meme_script(raw)
        if script is None:
            log.warning(f"Meme script for '{concept}' failed QA — no fallback, "
                        "caller will use the standard Short instead")
            return None
        script["concept"] = concept
        log.info(f"Meme script generated: {script['title']} ({script['format_label']})")
        return script
    except Exception as e:
        log.error(f"Meme script generation failed for '{concept}': {e}")
        return None


# ── Rotation / variety tracking ───────────────────────────────────────────────


def load_history(path: str = HISTORY_PATH) -> dict:
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data.setdefault("recent_formats", [])
                    data.setdefault("used_concepts", [])
                    return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"recent_formats": [], "used_concepts": []}


def save_history(history: dict, path: str = HISTORY_PATH) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)


def pick_short_format(history: dict, rng: "random.Random | None" = None) -> str:
    """Decide today's Short format: 'standard' or 'meme'.

    Meme Shorts land roughly 2 days out of 5 so the channel stays varied
    without going all-meme or all-explainer. Never three 'standard' days
    running, and never two 'meme' days running, so the mix is visibly mixed
    rather than a coin flip that could streak either way.
    """
    rng = rng or random.Random()
    recent = history.get("recent_formats", [])[-2:]
    if recent.count("standard") >= 2:
        return "meme"
    if recent and recent[-1] == "meme":
        return "standard"
    return "meme" if rng.random() < 0.4 else "standard"


def pick_concept(history: dict, rng: "random.Random | None" = None) -> str:
    """Next Python concept for a meme Short. Cycles the whole pool once
    before any concept repeats."""
    rng = rng or random.Random()
    used = history.get("used_concepts", [])
    remaining = [c for c in CONCEPT_POOL if c not in used]
    if not remaining:
        remaining = list(CONCEPT_POOL)
        used = []
    choice = rng.choice(remaining)
    used.append(choice)
    history["used_concepts"] = used
    return choice


def record_format(history: dict, fmt: str) -> None:
    history.setdefault("recent_formats", []).append(fmt)
    history["recent_formats"] = history["recent_formats"][-10:]


# ── Slide rendering (reuses the PIL helpers from generate_videos) ────────────


def narration_panels(script: dict) -> list[dict]:
    """The meme's panels plus a closing 'real lesson' panel, in render/TTS
    order. Shared by render_meme_slides and the caller's narration synthesis
    so both walk the exact same sequence."""
    return list(script["panels"]) + [{
        "tag": "THE REAL LESSON",
        "caption": script["lesson"],
        "narration": f"{script['lesson']} {script['cta']}",
    }]


def render_meme_slides(script: dict, out_dir: str, burn_captions: bool) -> list[str]:
    """Render the title slide + one slide per meme panel + a closing lesson
    slide. Returns PNG paths in order. Always vertical (Shorts only)."""
    from pipeline.video.generate_videos import _render_title_slide

    os.makedirs(out_dir, exist_ok=True)
    paths = []
    title_path = os.path.join(out_dir, "slide_00_title.png")
    _render_title_slide(title_path, script["title"], f"PYMASTERS · {script['format_label']}", vertical=True)
    paths.append(title_path)

    panels = narration_panels(script)
    total = len(panels)
    for i, panel in enumerate(panels, 1):
        p = os.path.join(out_dir, f"slide_{i:02d}_panel.png")
        _render_meme_panel(p, panel, i, total, burn_captions)
        paths.append(p)
    return paths


def _render_meme_panel(path: str, panel: dict, index: int, total: int, burn_captions: bool) -> None:
    from PIL import ImageDraw
    from pipeline.video.generate_videos import (
        _base_canvas, _font, _wrap, _accent_bar, _brand_footer, CYAN, WHITE, MUTED, CODE_BG, VIOLET,
    )
    import textwrap

    w, h = 1080, 1920
    img, w, h = _base_canvas(w, h)
    draw = ImageDraw.Draw(img)
    margin = 80
    col = w - 2 * margin

    # Panel tag pill (e.g. "EXPECTATION")
    tag = panel["tag"].upper()
    tag_f = _font(32, "bold")
    tw = draw.textlength(tag, font=tag_f)
    pad_x, pad_y = 28, 14
    pill_y = int(h * 0.12)
    draw.rounded_rectangle([margin, pill_y, margin + tw + pad_x * 2, pill_y + 32 + pad_y * 2],
                            radius=28, fill=VIOLET + (90,), outline=CYAN, width=2)
    draw.text((margin + pad_x, pill_y + pad_y), tag, font=tag_f, fill=WHITE)

    draw.text((margin, pill_y - 44), f"{index:02d} / {total:02d}", font=_font(26, "bold"), fill=MUTED)

    # Big meme caption — the punchline, bold and centered
    caption = panel["caption"]
    csize = 76
    cf = _font(csize, "bold")
    clines = _wrap(draw, caption, cf, col)
    while len(clines) > 4 and csize > 40:
        csize = int(csize * 0.85)
        cf = _font(csize, "bold")
        clines = _wrap(draw, caption, cf, col)
    y = pill_y + 32 + pad_y * 2 + 60
    for ln in clines:
        lw = draw.textlength(ln, font=cf)
        draw.text(((w - lw) / 2, y), ln, font=cf, fill=WHITE)
        y += int(csize * 1.22)
    _accent_bar(draw, margin, y + 20, 240, 8)
    y += 80

    code = panel.get("code")
    if code:
        mono = _font(32, "mono")
        raw_lines = [ln.rstrip() for ln in code.strip().splitlines()][:10]
        code_lines = []
        for ln in raw_lines:
            wrapped = textwrap.wrap(ln, width=42, subsequent_indent="    ") or [""]
            code_lines.extend(wrapped)
        code_lines = code_lines[:12]
        pad = 32
        line_h = int(mono.size * 1.5)
        panel_h = pad * 2 + line_h * len(code_lines)
        draw.rounded_rectangle([margin, y, w - margin, y + panel_h], radius=18,
                                fill=CODE_BG, outline=VIOLET + (140,), width=2)
        cy = y + pad
        for ln in code_lines:
            draw.text((margin + pad, cy), ln, font=mono, fill=(203, 213, 225))
            cy += line_h
        y += panel_h + 50

    # Captions burned in only when there's no TTS audio (silent-video fallback)
    if burn_captions:
        body = panel["narration"]
        bf = _font(40)
        blines = _wrap(draw, body, bf, col)
        max_lines = max(2, (h - y - 160) // int(40 * 1.4))
        blines = blines[:max_lines]
        for ln in blines:
            draw.text((margin, y), ln, font=bf, fill=(226, 232, 240))
            y += int(40 * 1.4)

    _brand_footer(draw, w, h, 1.0)
    img.convert("RGB").save(path, "PNG")
