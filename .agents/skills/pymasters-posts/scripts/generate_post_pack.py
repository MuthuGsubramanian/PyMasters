#!/usr/bin/env python3
"""PyMasters Presenter-Anchored Social Post & Visual Pack Generator.

Generates platform-tailored copy (`post_copy.md`), pixel-perfect visuals (`visual.png` or `visual.mp4`),
and integrity metadata (`metadata.json`) anchored strictly to the official PyMasters presenter avatars
in `.agents/skills/pymasters-posts/assets/`.

Visual modes:
  - `composite`: Deterministic zero-API-cost headless Playwright + HTML/SVG compositor (or FFmpeg 9:16 loop).
  - `multimodal`: Gemini multimodal image generation anchored on `avatar-headshot.jpg` + `avatar-fullbody.jpg`
    using `GEMINI_API_KEY` / `GOOGLE_API_KEY` from the environment (never hardcoded).
  - `hybrid`: Multimodal presenter scene + Playwright overlay pass for razor-sharp code, PYM crest, and headlines
    (gracefully falls back to `composite` when no API key is configured).
"""
from __future__ import annotations

import argparse
import ast
import base64
import glob
import hashlib
import html
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

log = logging.getLogger("pymasters_posts")

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = SKILL_DIR / "assets"
REFS_DIR = SKILL_DIR / "references"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
REPO_ROOT = SKILL_DIR.parents[2]

SITE_URL = "https://pymasters.net"
TELEGRAM_BOOST_URL = "https://t.me/boost/PyMasterscommunity"

ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "4:5": (1080, 1350),
    "16:9": (1280, 720),
    "1.91:1": (1200, 627),
    "1:1": (1080, 1080),
    "9:16": (1080, 1920),
}

PLATFORM_DEFAULT_ASPECT: dict[str, str] = {
    "linkedin": "4:5",
    "youtube": "16:9",
    "banner": "1.91:1",
    "reddit": "1.91:1",
    "telegram": "4:5",
    "x": "16:9",
}

PYM_CREST_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="52" height="52" fill="none">
  <defs>
    <linearGradient id="cObs" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0B132B"/><stop offset="0.55" stop-color="#060B19"/><stop offset="1" stop-color="#03060E"/>
    </linearGradient>
    <linearGradient id="cRim" x1="10" y1="8" x2="90" y2="92" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#38BDF8"/><stop offset="0.5" stop-color="#1D4ED8"/><stop offset="1" stop-color="#E0B95E"/>
    </linearGradient>
    <linearGradient id="cPlat" x1="12" y1="14" x2="76" y2="84" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8FAFC"/><stop offset="0.36" stop-color="#DCE4EE"/><stop offset="0.72" stop-color="#96A6BA"/><stop offset="1" stop-color="#68788E"/>
    </linearGradient>
    <linearGradient id="cGold" x1="28" y1="20" x2="88" y2="84" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FDE8A3"/><stop offset="0.42" stop-color="#E0B95E"/><stop offset="0.78" stop-color="#B58934"/><stop offset="1" stop-color="#875F1A"/>
    </linearGradient>
    <linearGradient id="cSap" x1="36" y1="36" x2="74" y2="76" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#38BDF8"/><stop offset="0.48" stop-color="#1D4ED8"/><stop offset="1" stop-color="#0E256E"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#cObs)"/>
  <rect x="1.5" y="1.5" width="97" height="97" rx="20.5" stroke="url(#cRim)" stroke-opacity="0.75" stroke-width="2.2"/>
  <g transform="translate(5 5) scale(0.9)">
    <path d="M35.8 59.2L45.8 54L50 58.2L75.5 32.7V46.2L50 75.4Z" fill="url(#cSap)" stroke="#0B1D56" stroke-width="0.7"/>
    <polyline points="38.2,60.8 50,73.1 73.2,46.8" stroke="#38BDF8" stroke-width="1.25" fill="none"/>
    <path d="M10 14H33.2C45.4 14 54.2 22.8 54.2 35C54.2 47.2 45.4 56 33.2 56H22V72.5L13 63.5V21.8L22 30.8V47.4H33C40.4 47.4 45.4 42.3 45.4 35C45.4 27.7 40.4 22.6 33 22.6H18.6ZM24.6 26.2H32.2L40.8 35L32.2 43.8H24.6L33.3 35ZM44.6 14H56.6L64.8 22.2L58.5 28.5ZM78 14H90L53.6 50.4L58 34ZM65.2 61L74.5 51.7V76.2L65.2 85.5Z" fill="url(#cPlat)" stroke="#475569" stroke-width="0.65"/>
    <path d="M38 59.2L46.4 55.8L50 59.4L89 20.4V33L50 71.6ZM25.5 59.2H33.6L34.8 60.4V85.5L25.5 76.2ZM78.2 48.4L87.4 39.2V63.5L78.2 72.7Z" fill="url(#cGold)" stroke="#6B4A12" stroke-width="0.65"/>
  </g>
</svg>"""


class CodeSyntaxValidationError(ValueError):
    """Raised when a Python code snippet fails `ast.parse()` validation."""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_python_code(code: str) -> str:
    """Strictly verify a Python snippet via `ast.parse()`. Raises `CodeSyntaxValidationError` on invalid syntax."""
    cleaned = textwrap.dedent(code or "").strip("\n")
    if not cleaned.strip():
        return ""
    try:
        ast.parse(cleaned)
    except SyntaxError as exc:
        raise CodeSyntaxValidationError(
            f"Python code snippet failed ast.parse() at line {exc.lineno}: {exc.msg}"
        ) from exc
    return cleaned


def load_live_stats(repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Query live curriculum counts directly from `definitions.py`, `backend/lessons/`, `concepts.py`, and `i18n/`."""
    lessons_dir = repo_root / "backend" / "lessons"
    track_dirs = sorted(p.name for p in lessons_dir.iterdir() if p.is_dir() and not p.name.startswith(".")) if lessons_dir.is_dir() else []
    lesson_files = sorted(glob.glob(str(lessons_dir / "*" / "*.json"))) if lessons_dir.is_dir() else []

    # Curated learning paths from backend/paths/definitions.py (parsed safely without requiring DB side effects)
    paths_count = 0
    defs_file = repo_root / "backend" / "paths" / "definitions.py"
    if defs_file.is_file():
        try:
            tree = ast.parse(defs_file.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and target.id == "PATH_DEFINITIONS" and isinstance(node.value, ast.List):
                            paths_count = len(node.value.elts)
        except Exception:
            paths_count = 0

    # Concept graph nodes from backend/graph/concepts.py
    concepts_count = 0
    concepts_file = repo_root / "backend" / "graph" / "concepts.py"
    if concepts_file.is_file():
        try:
            tree = ast.parse(concepts_file.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and target.id == "CONCEPTS":
                            if isinstance(node.value, ast.Dict):
                                concepts_count = len(node.value.keys)
                            elif isinstance(node.value, ast.List):
                                concepts_count = len(node.value.elts)
        except Exception:
            concepts_count = 0

    i18n_dir = repo_root / "frontend" / "src" / "i18n"
    locales = sorted(p.stem for p in i18n_dir.glob("*.json")) if i18n_dir.is_dir() else []

    return {
        "tracks_count": len(track_dirs),
        "lessons_count": len(lesson_files),
        "learning_paths_count": paths_count,
        "concept_nodes_count": concepts_count,
        "locales_count": len(locales),
        "locales": locales,
        "source_of_truth": {
            "definitions": str(defs_file.relative_to(repo_root)) if defs_file.is_file() else "",
            "lessons_dir": str(lessons_dir.relative_to(repo_root)) if lessons_dir.is_dir() else "",
            "concepts": str(concepts_file.relative_to(repo_root)) if concepts_file.is_file() else "",
        },
    }


def verify_asset_manifest() -> dict[str, Any]:
    """Verify all reference avatar assets exist and match `assets/manifest.json` SHA-256 checksums."""
    manifest_path = ASSETS_DIR / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing avatar manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for fname, entry in (manifest.get("assets") or {}).items():
        p = ASSETS_DIR / fname
        if not p.is_file():
            raise FileNotFoundError(f"Missing avatar asset listed in manifest: {p}")
        actual = sha256_file(p)
        if actual != entry.get("sha256"):
            raise ValueError(f"Checksum mismatch for {fname}: expected {entry.get('sha256')}, got {actual}")
    return manifest


def _highlight_python_html(code: str) -> str:
    """Syntax-highlight AST-verified Python code into inline HTML spans using Pygments (with clean fallback)."""
    if not code:
        return ""
    try:
        from pygments.lexers import PythonLexer

        lexer = PythonLexer()
        out = []
        for ttype, val in lexer.get_tokens(code):
            esc = html.escape(val)
            ts = str(ttype)
            cls = ""
            if ts.startswith("Token.Keyword"):
                cls = "tok-kw"
            elif ts.startswith("Token.Name.Builtin"):
                cls = "tok-bi"
            elif ts.startswith("Token.Name.Function"):
                cls = "tok-fn"
            elif ts.startswith("Token.Name.Class") or ts.startswith("Token.Name.Decorator"):
                cls = "tok-cls"
            elif ts.startswith("Token.Literal.String"):
                cls = "tok-str"
            elif ts.startswith("Token.Literal.Number"):
                cls = "tok-num"
            elif ts.startswith("Token.Comment"):
                cls = "tok-cmt"
            elif ts.startswith("Token.Operator"):
                cls = "tok-op"
            out.append(f'<span class="{cls}">{esc}</span>' if cls else esc)
        return "".join(out).rstrip("\n")
    except Exception:
        return html.escape(code)


def _default_snippet_for_topic(topic: str) -> str:
    low = topic.lower()
    if "recurs" in low or "stack" in low:
        return (
            "def countdown(n: int) -> list[int]:\n"
            "    if n <= 0:\n"
            "        return []\n"
            "    return [n] + countdown(n - 1)\n\n"
            "print(countdown(3))  # [3, 2, 1]"
        )
    if "async" in low or "event loop" in low:
        return (
            "import asyncio\n\n"
            "async def fetch(name: str) -> str:\n"
            "    await asyncio.sleep(0.05)\n"
            "    return f'ready:{name}'\n"
        )
    if "dict" in low or "hash" in low:
        return (
            "slots = 8\n"
            "for key in ('py', 'ai', 'ml'):\n"
            "    print(key, '->', hash(key) % slots)"
        )
    return (
        "def trace_steps(items: list[int]) -> int:\n"
        "    total = 0\n"
        "    for value in items:\n"
        "        total += value\n"
        "    return total\n\n"
        "print(trace_steps([4, 8, 15]))  # 27"
    )


def _short_visual_headline(topic: str, platform: str) -> str:
    words = re.findall(r"[A-Za-z0-9_+.#-]+", topic)
    if platform == "youtube":
        # YouTube thumbnail rule: 2-4 crisp high-impact words
        trimmed = [w for w in words if w.lower() not in {"how", "the", "a", "an", "on", "in", "to", "of", "for"}][:4]
        return " ".join(trimmed or words[:4]).title()
    return topic.strip() if len(topic.strip()) <= 54 else " ".join(words[:7]) + "..."


def _data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _select_presenter_asset(platform: str, aspect: str, avatar_choice: str) -> Path:
    if avatar_choice == "headshot":
        return ASSETS_DIR / "avatar-headshot.jpg"
    if avatar_choice == "fullbody":
        return ASSETS_DIR / "avatar-fullbody.jpg"
    if avatar_choice == "stage":
        return ASSETS_DIR / "avatar-stage.gif"
    # Auto selection following presenter-spec.md
    if platform in ("banner",) or aspect == "1.91:1":
        return ASSETS_DIR / "avatar-fullbody.jpg"
    if aspect == "9:16":
        return ASSETS_DIR / "avatar-stage.gif"
    return ASSETS_DIR / "avatar-headshot.jpg"


def _generate_multimodal_scene(
    topic: str,
    platform: str,
    aspect: str,
    out_png: Path,
    negative_space_for_overlay: bool,
) -> Path | None:
    """Synthesize a presenter-anchored visual using Gemini multimodal image generation (`GEMINI_API_KEY` / `GOOGLE_API_KEY`).
    Returns saved PNG path on success, or None if unavailable."""
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        return None

    headshot = ASSETS_DIR / "avatar-headshot.jpg"
    fullbody = ASSETS_DIR / "avatar-fullbody.jpg"
    spec_text = (REFS_DIR / "presenter-spec.md").read_text(encoding="utf-8")[:1800]
    model = os.environ.get("PYMASTERS_GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

    layout_hint = (
        "Frame the presenter cleanly on the right 42% of the composition looking warmly at the camera, "
        "leaving clean, uncluttered dark obsidian-navy negative space on the left 55% for deterministic code and headline overlays. "
        "Include ZERO text inside the generated image."
        if negative_space_for_overlay
        else "Keep any background studio text minimal and crisp; make the presenter the clear focal point."
    )
    prompt = (
        f"Create a broadcast-quality {aspect} studio visual for a PyMasters {platform} post about: {topic}.\n"
        f"Preserve the exact facial likeness, hair, salt-and-pepper beard, warm expression, and navy blazer / light slate-blue shirt "
        f"wardrobe of the presenter in the two provided reference photos.\n"
        f"{layout_hint}\n"
        f"Environment: sleek deep-navy obsidian developer studio with subtle electric-sapphire (#38BDF8) and champagne-gold (#E5BE67) rim lighting.\n"
        f"Reference identity guidelines:\n{spec_text}"
    )

    # 1) Try google-genai SDK first when installed
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore

        client = genai.Client(api_key=api_key)
        contents = [
            prompt,
            types.Part.from_bytes(data=headshot.read_bytes(), mime_type="image/jpeg"),
            types.Part.from_bytes(data=fullbody.read_bytes(), mime_type="image/jpeg"),
        ]
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        )
        for cand in getattr(resp, "candidates", []) or []:
            for part in getattr(cand.content, "parts", []) or []:
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None):
                    out_png.parent.mkdir(parents=True, exist_ok=True)
                    out_png.write_bytes(inline.data)
                    return out_png
    except ImportError:
        pass
    except Exception as exc:
        log.warning("google-genai SDK multimodal generation failed: %s", exc)

    # 2) Fallback to official Gemini REST API using the same env key & inline reference images
    try:
        import urllib.request

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(headshot.read_bytes()).decode("ascii")}},
                        {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(fullbody.read_bytes()).decode("ascii")}},
                    ]
                }
            ],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for cand in data.get("candidates") or []:
            for part in (cand.get("content") or {}).get("parts") or []:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    out_png.parent.mkdir(parents=True, exist_ok=True)
                    out_png.write_bytes(base64.b64decode(inline["data"]))
                    return out_png
    except Exception as exc:
        log.warning("Gemini REST multimodal generation failed: %s", exc)
    return None


def _build_card_html(
    *,
    width: int,
    height: int,
    platform: str,
    headline: str,
    subheadline: str,
    eyebrow: str,
    code: str,
    stats: dict[str, Any],
    presenter_path: Path,
    bg_scene_path: Path | None,
) -> str:
    template = (TEMPLATES_DIR / "presenter_card.html").read_text(encoding="utf-8")
    is_landscape = width > height
    is_fullbody = presenter_path.name == "avatar-fullbody.jpg"
    has_bg = bg_scene_path is not None and bg_scene_path.is_file()

    hl_words = headline.split()
    if len(hl_words) >= 2:
        hl_html = html.escape(" ".join(hl_words[:-1])) + f' <span class="accent">{html.escape(hl_words[-1])}</span>'
    else:
        hl_html = f'<span class="accent">{html.escape(headline)}</span>'

    code_html = _highlight_python_html(code)
    code_block = (
        f"""<div class="code-card">
          <div class="code-bar">
            <div class="dots"><span></span><span></span><span></span></div>
            <div class="code-meta">watch_it_run.py · AST verified</div>
          </div>
          <div class="code-body">{code_html}</div>
        </div>"""
        if code
        else ""
    )

    presenter_uri = _data_uri(presenter_path, "image/gif" if presenter_path.suffix == ".gif" else "image/jpeg")
    presenter_card = (
        ""
        if has_bg
        else f"""<div class="presenter-frame">
          <img src="{presenter_uri}" alt="PyMasters Presenter" />
          <div class="presenter-tag">VAAR · PYMASTERS</div>
        </div>"""
    )

    stats_line = f"{stats['lessons_count']} Lessons · {stats['tracks_count']} Tracks · {stats['concept_nodes_count']} Concepts"
    footer_cta = "pymasters.net" if platform != "telegram" else "pymasters.net  ·  t.me/boost/PyMasterscommunity"

    if is_landscape:
        body_markup = f"""<div class="inner">
          <div class="copy-col">
            <div class="brand-bar">
              <div class="brand-left">
                <div class="crest-wrap">{PYM_CREST_SVG}</div>
                <div class="brand-word">Py<span>Masters</span></div>
              </div>
              <div class="eyebrow-pill"><span class="eyebrow-dot"></span>{html.escape(eyebrow)}</div>
            </div>
            <div>
              <h1 class="headline">{hl_html}</h1>
              {f'<p class="subheadline">{html.escape(subheadline)}</p>' if subheadline and platform != 'youtube' else ''}
            </div>
            {code_block}
            <div class="footer-bar">
              <div class="footer-cta">{html.escape(footer_cta)}</div>
              <div class="footer-stats">{html.escape(stats_line)}</div>
            </div>
          </div>
          <div class="presenter-col">
            {presenter_card}
          </div>
        </div>"""
    else:
        body_markup = f"""<div class="inner">
          <div class="brand-bar">
            <div class="brand-left">
              <div class="crest-wrap">{PYM_CREST_SVG}</div>
              <div class="brand-word">Py<span>Masters</span></div>
            </div>
            <div class="eyebrow-pill"><span class="eyebrow-dot"></span>{html.escape(eyebrow)}</div>
          </div>
          <div class="hero-row">
            <div>
              <h1 class="headline">{hl_html}</h1>
              {f'<p class="subheadline">{html.escape(subheadline)}</p>' if subheadline else ''}
            </div>
            {presenter_card}
          </div>
          {code_block}
          <div class="footer-bar">
            <div class="footer-cta">{html.escape(footer_cta)}</div>
            <div class="footer-stats">{html.escape(stats_line)}</div>
          </div>
        </div>"""

    bg_tag = ""
    if has_bg and bg_scene_path is not None:
        bg_uri = _data_uri(bg_scene_path, "image/png")
        bg_tag = f'<img class="bg-scene-img" src="{bg_uri}" alt="" /><div class="bg-scrim"></div>'

    if platform == "youtube":
        hl_size = 76 if len(headline) <= 22 else 62
        sub_size = 24
        code_size = 20
        pres_max_h = height - 84
    elif is_landscape:
        hl_size = 54 if len(headline) <= 36 else 44
        sub_size = 22
        code_size = 18
        pres_max_h = height - 80
    else:
        hl_size = 62 if len(headline) <= 34 else 50
        sub_size = 25
        code_size = 24 if len(code.splitlines()) <= 7 else 20
        pres_max_h = 460 if height >= 1200 else 360

    replacements = {
        "__WIDTH__": str(width),
        "__HEIGHT__": str(height),
        "__LAYOUT_CLASS__": "layout-landscape" if is_landscape else "layout-portrait",
        "__BG_SCENE_CLASS__": "has-bg-scene" if has_bg else "",
        "__FULLBODY_CLASS__": "fullbody-mode" if is_fullbody else "",
        "__BG_SCENE_TAG__": bg_tag,
        "__BODY_MARKUP__": body_markup,
        "__HEADLINE_SIZE__": str(hl_size),
        "__SUBHEADLINE_SIZE__": str(sub_size),
        "__CODE_SIZE__": str(code_size),
        "__PRESENTER_MAX_H__": str(pres_max_h),
    }
    rendered = template
    for key, val in replacements.items():
        rendered = rendered.replace(key, val)
    return rendered


def _screenshot_html_playwright(html_doc: str, width: int, height: int, out_png: Path) -> bool:
    """Render `html_doc` at exact `width x height` PNG using Playwright (in-process or via e2e-venv)."""
    out_png.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "card.html"
        html_path.write_text(html_doc, encoding="utf-8")

        runner = (
            "from pathlib import Path\n"
            "from playwright.sync_api import sync_playwright\n"
            f"url = 'file://{html_path}'\n"
            f"out_png = {str(out_png)!r}\n"
            f"w, h = {width}, {height}\n"
            "with sync_playwright() as p:\n"
            "    try:\n"
            "        b = p.chromium.launch(headless=True)\n"
            "    except Exception:\n"
            "        shells = sorted(Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell'))\n"
            "        if not shells:\n"
            "            raise\n"
            "        b = p.chromium.launch(headless=True, executable_path=str(shells[-1]))\n"
            "    page = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)\n"
            "    page.goto(url, wait_until='load')\n"
            "    page.wait_for_timeout(150)\n"
            "    page.screenshot(path=out_png, type='png')\n"
            "    b.close()\n"
        )

        # Prefer current Python if playwright is installed, else ops e2e-venv
        candidates = [sys.executable]
        e2e_py = Path(os.environ.get("PMSOCIAL_PLAYWRIGHT_PYTHON", str(Path.home() / "pymasters-ops/e2e-venv/bin/python")))
        if e2e_py.is_file() and str(e2e_py) != sys.executable:
            candidates.append(str(e2e_py))

        for py_bin in candidates:
            try:
                res = subprocess.run([py_bin, "-c", runner], capture_output=True, text=True, timeout=90)
                if res.returncode == 0 and out_png.is_file():
                    return True
            except Exception:
                continue
    return False


def _fallback_pillow_composite(
    *,
    width: int,
    height: int,
    headline: str,
    eyebrow: str,
    code: str,
    presenter_path: Path,
    out_png: Path,
) -> Path:
    """Minimal pure-Pillow fallback when Playwright is completely unavailable (e.g. bare CI container)."""
    from PIL import ImageDraw, ImageFont

    img = Image.new("RGB", (width, height), (7, 14, 34))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, 8], fill=(56, 189, 248))
    with Image.open(presenter_path) as av:
        av_rgb = av.convert("RGB")
        pw = int(width * 0.36)
        ph = int(height * 0.72)
        av_resized = av_rgb.resize((pw, ph), Image.Resampling.LANCZOS)
        img.paste(av_resized, (width - pw - 40, (height - ph) // 2))
    font = ImageFont.load_default()
    d.text((48, 48), f"PYMASTERS · {eyebrow.upper()}", fill=(56, 189, 248), font=font)
    d.text((48, 120), headline[:64], fill=(248, 250, 252), font=font)
    if code:
        d.text((48, 220), code[:400], fill=(152, 195, 121), font=font)
    d.text((48, height - 48), SITE_URL, fill=(229, 190, 103), font=font)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png, format="PNG")
    return out_png


def _render_stage_motion_mp4(width: int, height: int, out_mp4: Path) -> Path:
    """Export a thermal-safe `9:16` vertical presenter loop MP4 from `assets/avatar-stage.gif` via FFmpeg."""
    stage_gif = ASSETS_DIR / "avatar-stage.gif"
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    threads = os.environ.get("PMSOCIAL_FFMPEG_THREADS", "2")
    vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},format=yuv420p"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-stream_loop",
            "2",
            "-i",
            str(stage_gif),
            "-vf",
            vf,
            "-threads",
            threads,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-movflags",
            "+faststart",
            str(out_mp4),
        ],
        check=True,
        timeout=90,
    )
    return out_mp4


def build_post_copy(
    *,
    platform: str,
    topic: str,
    code: str,
    stats: dict[str, Any],
) -> str:
    """Build platform-aligned copy anchored on accurate PyMasters positioning and live repo metrics."""
    lessons = stats["lessons_count"]
    tracks = stats["tracks_count"]
    concepts = stats["concept_nodes_count"]
    paths = stats["learning_paths_count"]
    locales = stats["locales_count"]
    indented_code = "\n".join(f"    {ln}" for ln in code.splitlines()) if code else ""

    if platform == "linkedin":
        # Strictly plain text (no raw markdown ** or ``` because LinkedIn displays them literally)
        lines = [
            f"{topic} — explained cleanly from first principles.",
            "",
            "Most tutorials bury core Python & AI ideas under jargon before showing what actually happens in memory.",
            "Once you watch every frame, variable, and state transition step by step, the mental model clicks immediately.",
        ]
        if indented_code:
            lines.extend(["", indented_code])
        lines.extend(
            [
                "",
                f"On @PyMasters ({SITE_URL}), you can run this with Watch It Run step-by-step visual execution and learn alongside Vaar (Vaathiyaar), your personal AI teacher with Socratic hints, AST-backed code reviews, and Teach It Back mastery checks.",
                f"Explore {lessons} hands-on lessons across {tracks} tracks, {paths} guided paths, {concepts} concept-graph nodes, and {locales} languages — free to start.",
                "",
                f"Start free: {SITE_URL}",
                f"Community: {TELEGRAM_BOOST_URL}",
                "",
                "#Python #AIEngineering #PyMasters",
            ]
        )
        return "\n".join(lines) + "\n"

    if platform == "reddit":
        parts = [
            f"# {topic}",
            "",
            "When teaching this concept to learners, the biggest unlock is seeing the exact execution state instead of memorizing syntax rules.",
            "",
        ]
        if code:
            parts.extend(["```python", code, "```", ""])
        parts.extend(
            [
                "What makes this intuitive in practice:",
                "1. Trace each step explicitly so you see how state changes before returning.",
                "2. Validate edge cases directly in a sandbox rather than guessing stdout.",
                "",
                f"If you want to step through this visually with an interactive execution tracer (Watch It Run) and AST-verified challenges, we built PyMasters ({SITE_URL}) — free to start with {lessons} lessons across {tracks} tracks, plus on-demand LearnAnything lessons and our Vaar AI tutor.",
            ]
        )
        return "\n".join(parts) + "\n"

    if platform in ("telegram", "x"):
        parts = [
            f"{topic}",
            "",
            "Key takeaways:",
            "- Break down the exact execution flow step by step — zero jargon.",
            "- Step through variables and memory live with Watch It Run on PyMasters.",
            "- Practice with Vaar (Vaathiyaar), your adaptive AI teacher with AST code reviews & Teach It Back checks.",
            f"- {lessons} hands-on lessons · {tracks} tracks · {concepts} concept nodes · {locales} languages (free to start).",
            "",
            f"Learn free: {SITE_URL}",
            f"Boost & join the community: {TELEGRAM_BOOST_URL}",
        ]
        return "\n".join(parts) + "\n"

    if platform == "youtube":
        parts = [
            f"Title: {topic}",
            "",
            "Description:",
            f"{topic} — broken down visually and in plain English so every step makes sense.",
            "",
            "0:00 Hook & Core Mental Model",
            "0:10 Step-by-Step Visual Walkthrough (Watch It Run)",
            "0:30 AST-Verified Python Example",
            "0:45 Key Takeaway & Interactive Practice",
            "",
            f"Practice this interactively for free on PyMasters ({lessons} lessons across {tracks} tracks, {paths} learning paths, and Vaar personal AI tutoring): {SITE_URL}",
            f"Join & boost our Telegram community: {TELEGRAM_BOOST_URL}",
            "",
            "#Python #PyMasters #AIEngineering",
        ]
        return "\n".join(parts) + "\n"

    # Launch banner / general promo
    return (
        f"{topic}\n\n"
        f"PyMasters ({SITE_URL}) brings together {lessons} hands-on lessons across {tracks} tracks, "
        f"{paths} curated paths, {concepts} concept-graph nodes, Watch It Run visual execution, "
        f"LearnAnything on-demand lessons, and Vaar (Vaathiyaar) personal AI tutoring.\n\n"
        f"Start free: {SITE_URL}\n"
        f"Community: {TELEGRAM_BOOST_URL}\n"
    )


def generate_post_pack(
    *,
    platform: str,
    topic: str,
    out_dir: Path,
    mode: str = "hybrid",
    aspect: str | None = None,
    code: str | None = None,
    headline: str | None = None,
    subheadline: str | None = None,
    eyebrow: str | None = None,
    avatar: str = "auto",
    motion: bool = False,
) -> dict[str, Any]:
    """Generate a complete branded PyMasters post pack into `out_dir`."""
    verify_asset_manifest()
    stats = load_live_stats()

    plat = platform.strip().lower()
    if plat not in PLATFORM_DEFAULT_ASPECT:
        raise ValueError(f"Unsupported platform '{platform}'. Choose from {sorted(PLATFORM_DEFAULT_ASPECT)}.")

    chosen_aspect = aspect or PLATFORM_DEFAULT_ASPECT[plat]
    if chosen_aspect not in ASPECT_DIMENSIONS:
        raise ValueError(f"Unsupported aspect '{chosen_aspect}'. Choose from {sorted(ASPECT_DIMENSIONS)}.")
    width, height = ASPECT_DIMENSIONS[chosen_aspect]

    # Strict AST validation on any supplied Python code (empty string allowed when explicitly "")
    if code is None:
        raw_code = "" if plat == "youtube" else _default_snippet_for_topic(topic)
    else:
        raw_code = code
    verified_code = validate_python_code(raw_code)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    visual_headline = headline or _short_visual_headline(topic, plat)
    visual_sub = subheadline if subheadline is not None else (
        "" if plat == "youtube" else "Zero-jargon execution with Vaar AI & Watch It Run"
    )
    visual_eyebrow = eyebrow or {
        "linkedin": "ENTERPRISE BRIEF",
        "youtube": "WATCH IT RUN",
        "telegram": "COMMUNITY DROP",
        "reddit": "PYTHON INTERNALS",
        "x": "PYMASTERS BRIEF",
        "banner": "PYMASTERS PLATFORM",
    }.get(plat, "PYMASTERS")

    presenter_path = _select_presenter_asset(plat, chosen_aspect, avatar)
    effective_mode = mode
    visual_path: Path

    if motion and chosen_aspect == "9:16":
        visual_path = _render_stage_motion_mp4(width, height, out_dir / "visual.mp4")
        effective_mode = "composite_motion"
    else:
        visual_path = out_dir / "visual.png"
        bg_scene: Path | None = None

        if mode in ("multimodal", "hybrid"):
            raw_ai_path = out_dir / ("visual.png" if mode == "multimodal" else "_ai_scene_bg.png")
            bg_scene = _generate_multimodal_scene(
                topic=topic,
                platform=plat,
                aspect=chosen_aspect,
                out_png=raw_ai_path,
                negative_space_for_overlay=(mode == "hybrid"),
            )
            if bg_scene is None:
                if mode == "multimodal":
                    log.warning("GEMINI_API_KEY/GOOGLE_API_KEY unavailable; falling back to composite mode.")
                effective_mode = "composite"
            elif mode == "multimodal":
                # Resize/crop multimodal output to exact target aspect dimensions
                with Image.open(bg_scene) as im:
                    im.convert("RGB").resize((width, height), Image.Resampling.LANCZOS).save(visual_path, format="PNG")
                effective_mode = "multimodal"

        if effective_mode in ("composite", "hybrid"):
            card_html = _build_card_html(
                width=width,
                height=height,
                platform=plat,
                headline=visual_headline,
                subheadline=visual_sub,
                eyebrow=visual_eyebrow,
                code=verified_code,
                stats=stats,
                presenter_path=presenter_path,
                bg_scene_path=bg_scene if effective_mode == "hybrid" else None,
            )
            ok_pw = _screenshot_html_playwright(card_html, width, height, visual_path)
            if not ok_pw:
                _fallback_pillow_composite(
                    width=width,
                    height=height,
                    headline=visual_headline,
                    eyebrow=visual_eyebrow,
                    code=verified_code,
                    presenter_path=presenter_path,
                    out_png=visual_path,
                )
            if bg_scene is not None and bg_scene.name == "_ai_scene_bg.png":
                bg_scene.unlink(missing_ok=True)

    copy_text = build_post_copy(platform=plat, topic=topic, code=verified_code, stats=stats)
    copy_path = out_dir / "post_copy.md"
    copy_path.write_text(copy_text, encoding="utf-8")

    visual_dims: tuple[int, int] = (width, height)
    if visual_path.suffix.lower() == ".png":
        with Image.open(visual_path) as vim:
            visual_dims = vim.size

    metadata = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "platform": plat,
        "topic": topic,
        "requested_mode": mode,
        "effective_mode": effective_mode,
        "aspect": chosen_aspect,
        "dimensions": {"width": visual_dims[0], "height": visual_dims[1]},
        "presenter_asset": presenter_path.name,
        "presenter_sha256": sha256_file(presenter_path),
        "visual_file": visual_path.name,
        "visual_sha256": sha256_file(visual_path),
        "copy_file": copy_path.name,
        "copy_sha256": sha256_file(copy_path),
        "code_ast_verified": bool(verified_code),
        "live_stats": stats,
        "cta_urls": {
            "primary": SITE_URL,
            "telegram_community": TELEGRAM_BOOST_URL,
        },
    }
    meta_path = out_dir / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return {
        "out_dir": str(out_dir),
        "copy_path": str(copy_path),
        "visual_path": str(visual_path),
        "metadata_path": str(meta_path),
        "metadata": metadata,
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="Generate a branded PyMasters social post & presenter visual pack.")
    ap.add_argument("--stats", action="store_true", help="Print live PyMasters curriculum metrics as JSON and exit.")
    ap.add_argument("--platform", choices=sorted(PLATFORM_DEFAULT_ASPECT), default="linkedin")
    ap.add_argument("--topic", default="", help="Topic or announcement headline to generate.")
    ap.add_argument("--mode", choices=["hybrid", "composite", "multimodal"], default="hybrid")
    ap.add_argument("--aspect", choices=sorted(ASPECT_DIMENSIONS), default=None)
    ap.add_argument("--avatar", choices=["auto", "headshot", "fullbody", "stage"], default="auto")
    ap.add_argument("--code", default=None, help="Inline Python code snippet (validated via ast.parse).")
    ap.add_argument("--code-file", default=None, help="Path to a Python file to embed (validated via ast.parse).")
    ap.add_argument("--headline", default=None, help="Optional concise headline override for the visual card.")
    ap.add_argument("--subheadline", default=None, help="Optional subheadline override.")
    ap.add_argument("--eyebrow", default=None, help="Optional eyebrow badge text.")
    ap.add_argument("--motion", action="store_true", help="Render 9:16 MP4 loop from avatar-stage.gif via FFmpeg.")
    ap.add_argument("--out-dir", default="artifacts/posts/latest", help="Output directory for post pack.")
    args = ap.parse_args(argv)

    if args.stats:
        print(json.dumps(load_live_stats(), indent=2))
        return 0

    if not args.topic.strip():
        ap.error("--topic is required unless --stats is specified.")

    code_val = args.code
    if args.code_file:
        code_val = Path(args.code_file).read_text(encoding="utf-8")

    try:
        res = generate_post_pack(
            platform=args.platform,
            topic=args.topic,
            out_dir=Path(args.out_dir),
            mode=args.mode,
            aspect=args.aspect,
            code=code_val,
            headline=args.headline,
            subheadline=args.subheadline,
            eyebrow=args.eyebrow,
            avatar=args.avatar,
            motion=args.motion,
        )
    except CodeSyntaxValidationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(res["metadata"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
