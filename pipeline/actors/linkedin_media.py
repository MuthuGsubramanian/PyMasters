"""On-brand, per-post-unique banner images for LinkedIn.

Generates a 1200x627 (LinkedIn ratio) branded card. Each post gets a visually
DISTINCT image — the palette, background motif, accent geometry and kicker line
all vary, chosen deterministically from a hash of the headline+date (so it's
reproducible for a given post but new across posts). Branding stays constant
(PYMASTERS wordmark, reactor mark, pymasters.net footer) so it's recognizable.

Pure Pillow — no external image API. Degrades gracefully: if Pillow/fonts are
missing, generate_post_image() returns None and the poster falls back to text-only.
"""

import io
import os
import math
import random
import hashlib
import textwrap
from datetime import datetime

from pipeline.utils.logger import get_logger

log = get_logger("actor.linkedin.media")

W, H = 1200, 627
WHITE = (255, 255, 255)
MUTED = (148, 163, 184)

# Brand-consistent palettes: (bg_top, bg_bottom, accent_a, accent_b)
PALETTES = [
    ((10, 15, 30),  (22, 13, 51),  (34, 211, 238), (168, 85, 247)),   # navy → violet / cyan-purple
    ((9, 12, 28),   (12, 28, 51),  (56, 189, 248), (59, 130, 246)),   # navy → blue / sky-blue
    ((18, 10, 36),  (33, 12, 44),  (217, 70, 239), (139, 92, 246)),   # plum → magenta / fuchsia-violet
    ((8, 18, 26),   (10, 30, 38),  (45, 212, 191), (34, 211, 238)),   # teal-dark / teal-cyan
    ((14, 11, 30),  (28, 16, 38),  (251, 146, 60), (236, 72, 153)),   # dark / sunset orange-pink
    ((10, 14, 24),  (16, 22, 48),  (129, 140, 248),(34, 211, 238)),   # indigo / indigo-cyan
]

KICKERS = [
    "TODAY IN PYTHON & AI", "PYTHON TIP", "AI INSIGHT", "FROM THE LAB",
    "DAILY BYTE", "LEARN BY BUILDING", "DEV NOTE",
]

MOTIFS = ["reactor", "rings", "grid", "constellation", "bokeh", "code"]

_FONTS_BOLD = ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/seguisb.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
_FONTS_REG = ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def _font(size, bold=False):
    from PIL import ImageFont
    for path in (_FONTS_BOLD if bold else _FONTS_REG):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _gradient(top, bot):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img.convert("RGBA")


# ── background motifs (drawn faintly onto an RGBA overlay) ────────────────────
def _reactor_points(cx, cy, r, scale=1.0):
    return [(cx, cy - r * scale), (cx + r * 0.92 * scale, cy + r * 0.62 * scale),
            (cx - r * 0.92 * scale, cy + r * 0.62 * scale)]


def _motif(name, draw, rng, accent):
    a = accent
    if name == "reactor":
        cx, cy, r = W - 250, H // 2, 195
        draw.polygon(_reactor_points(cx, cy, r), outline=a + (90,), width=4)
        draw.polygon(_reactor_points(cx, cy, r, 0.55), outline=a + (70,), width=3)
        cyc = cy + int(r * 0.18)
        draw.ellipse([cx - 26, cyc - 26, cx + 26, cyc + 26], fill=WHITE + (235,))
    elif name == "rings":
        cx, cy = rng.choice([(W - 230, 150), (W - 200, H - 160), (W - 250, H // 2)])
        for i in range(6):
            rr = 60 + i * 55
            draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=a + (max(20, 110 - i * 16),), width=3)
    elif name == "grid":
        step = rng.choice([46, 54, 62])
        for x in range(W // 2, W, step):
            for y in range(0, H, step):
                draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=a + (70,))
    elif name == "constellation":
        pts = [(rng.randint(W // 2, W - 40), rng.randint(40, H - 40)) for _ in range(14)]
        for i, p in enumerate(pts):
            for q in pts[i + 1:]:
                if math.dist(p, q) < 230:
                    draw.line([p, q], fill=a + (45,), width=1)
        for p in pts:
            draw.ellipse([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=a + (160,))
    elif name == "bokeh":
        for _ in range(7):
            cx, cy = rng.randint(W // 2, W), rng.randint(0, H)
            rr = rng.randint(60, 170)
            draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=a + (22,))
    elif name == "code":
        glyphs = ["{ }", "[ ]", "< >", "def", "()", "=>", "::", "ai", "py", "#!"]
        f = _font(40, bold=True)
        for _ in range(11):
            x, y = rng.randint(W // 2, W - 80), rng.randint(20, H - 60)
            draw.text((x, y), rng.choice(glyphs), font=f, fill=a + (40,))


def _draw_brand_reactor(draw, cx, cy, r, accent):
    draw.polygon(_reactor_points(cx, cy, r), outline=accent, width=5)
    draw.polygon(_reactor_points(cx, cy, r, 0.55), outline=accent, width=3)
    core = int(r * 0.16); cyc = cy + int(r * 0.18)
    draw.ellipse([cx - core, cyc - core, cx + core, cyc + core], fill=WHITE)


def generate_post_image(headline: str, subtitle: str = "Learn Python & AI by building",
                        seed: str | None = None) -> bytes | None:
    """Return PNG bytes for a per-post-unique branded banner, or None if Pillow missing."""
    try:
        from PIL import Image, ImageDraw  # noqa: F401
    except ImportError:
        log.info("Pillow not installed — text-only (pip install Pillow to enable banners).")
        return None
    try:
        head = (headline or "Today in Python & AI").strip()
        key = seed or (head + datetime.now().strftime("%Y-%m-%d"))
        rng = random.Random(int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16))

        top, bot, acc_a, acc_b = rng.choice(PALETTES)
        kicker = rng.choice(KICKERS)
        motif = rng.choice(MOTIFS)

        img = _gradient(top, bot)
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        _motif(motif, odraw, rng, acc_a)
        img = Image.alpha_composite(img, overlay)
        draw = ImageDraw.Draw(img)

        # Brand row: small reactor + wordmark
        _draw_brand_reactor(draw, 95, 92, 42, acc_a)
        draw.text((150, 68), "PYMASTERS", font=_font(40, bold=True), fill=WHITE)

        # Kicker (varies per post)
        draw.text((92, 178), kicker, font=_font(26, bold=True), fill=acc_a)

        # Headline (wrapped, auto-sized)
        size = 70 if len(head) <= 42 else 56 if len(head) <= 70 else 46
        hf = _font(size, bold=True)
        lines = textwrap.wrap(head, width=max(14, int(820 / (size * 0.56))))[:3]
        y = 222
        for ln in lines:
            draw.text((92, y), ln, font=hf, fill=WHITE)
            y += int(size * 1.18)

        # Accent underline (acc_a → acc_b)
        x1, x2 = 92, 92 + 230
        for i in range(x1, x2):
            t = (i - x1) / (x2 - x1)
            c = tuple(int(acc_a[k] + (acc_b[k] - acc_a[k]) * t) for k in range(3))
            draw.line([(i, y + 16), (i, y + 22)], fill=c)

        # Footer
        draw.text((92, H - 96), subtitle, font=_font(30), fill=MUTED)
        draw.text((92, H - 56), "pymasters.net", font=_font(30, bold=True), fill=acc_a)
        draw.text((W - 300, H - 56), "#Python  #AI", font=_font(26, bold=True), fill=acc_b)

        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        log.error(f"Banner generation failed: {e}")
        return None
