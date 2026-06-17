"""On-brand banner images for LinkedIn posts.

Generates a 1200x627 (LinkedIn's recommended ratio) branded card per post:
the PyMasters dark gradient, the reactor-triangle mark, and the day's headline.
Pure Pillow — no external image API. Degrades gracefully: if Pillow or fonts are
missing, generate_post_image() returns None and the poster falls back to text-only.
"""

import io
import os
import textwrap

from pipeline.utils.logger import get_logger

log = get_logger("actor.linkedin.media")

W, H = 1200, 627
BG_TOP = (10, 15, 30)       # #0a0f1e
BG_BOT = (22, 13, 51)       # #160d33
CYAN = (34, 211, 238)       # #22d3ee
PURPLE = (168, 85, 247)     # #a855f7
WHITE = (255, 255, 255)
MUTED = (148, 163, 184)

_FONT_CANDIDATES_BOLD = [
    "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/seguisb.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
_FONT_CANDIDATES_REG = [
    "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _font(size, bold=False):
    from PIL import ImageFont
    for path in (_FONT_CANDIDATES_BOLD if bold else _FONT_CANDIDATES_REG):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _gradient_bg():
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    # soft purple glow, top-right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i, a in enumerate((22, 18, 14, 10, 6)):
        rad = 150 + i * 70
        gd.ellipse([W - 360 - rad, -rad, W - 360 + rad, rad], fill=(124, 58, 237, a))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"), (0, 0))
    return img


def _draw_reactor(draw, cx, cy, r, stroke, width=6, faint=False):
    """The PyMasters reactor-triangle mark."""
    def tri(scale):
        return [(cx, cy - r * scale), (cx + r * 0.92 * scale, cy + r * 0.62 * scale),
                (cx - r * 0.92 * scale, cy + r * 0.62 * scale)]
    draw.polygon(tri(1.0), outline=stroke, width=width)
    draw.polygon(tri(0.55), outline=stroke, width=max(2, width // 2))
    core = int(r * 0.16)
    cyc = cy + int(r * 0.18)
    if not faint:
        for i, a in enumerate((40, 70, 120)):
            rr = core + (3 - i) * 6
            draw.ellipse([cx - rr, cyc - rr, cx + rr, cyc + rr], fill=stroke + (a,) if len(stroke) == 3 else stroke)
    draw.ellipse([cx - core, cyc - core, cx + core, cyc + core], fill=WHITE)


def generate_post_image(headline: str, subtitle: str = "Learn Python & AI by building") -> bytes | None:
    """Return PNG bytes for a branded banner, or None if Pillow/fonts unavailable."""
    try:
        from PIL import Image, ImageDraw  # noqa: F401
    except ImportError:
        log.info("Pillow not installed — posting text-only (pip install Pillow to enable banners).")
        return None
    try:
        img = _gradient_bg().convert("RGBA")
        draw = ImageDraw.Draw(img)

        # Decorative large faint reactor on the right
        _draw_reactor(draw, W - 250, H // 2, 190, PURPLE, width=4, faint=True)

        # Brand row (top-left): small reactor + wordmark
        _draw_reactor(draw, 95, 95, 42, CYAN, width=5)
        draw.text((150, 70), "PYMASTERS", font=_font(40, bold=True), fill=WHITE)

        # Headline (wrapped). Shrink font for long headlines.
        head = (headline or "Today in Python & AI").strip()
        size = 70 if len(head) <= 42 else 56 if len(head) <= 70 else 46
        hf = _font(size, bold=True)
        lines = textwrap.wrap(head, width=max(14, int(820 / (size * 0.56))))[:3]
        y = 230
        for ln in lines:
            draw.text((92, y), ln, font=hf, fill=WHITE)
            y += int(size * 1.18)

        # Accent underline (cyan→purple)
        ux2 = 92 + 230
        for i in range(92, ux2):
            t = (i - 92) / (ux2 - 92)
            c = (int(CYAN[0] + (PURPLE[0] - CYAN[0]) * t),
                 int(CYAN[1] + (PURPLE[1] - CYAN[1]) * t),
                 int(CYAN[2] + (PURPLE[2] - CYAN[2]) * t))
            draw.line([(i, y + 14), (i, y + 20)], fill=c)

        # Footer
        draw.text((92, H - 96), subtitle, font=_font(30), fill=MUTED)
        draw.text((92, H - 56), "pymasters.net", font=_font(30, bold=True), fill=CYAN)
        draw.text((W - 300, H - 56), "#Python  #AI", font=_font(26, bold=True), fill=(124, 58, 237))

        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        log.error(f"Banner generation failed: {e}")
        return None
