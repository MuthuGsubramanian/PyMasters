"""PyMasters visual identity for rendered media ("Deep Void" default + pluggable Enterprise LinkedIn palettes)."""
from contextlib import contextmanager
from functools import lru_cache

from PIL import ImageFont

IS_LIGHT = False
BG_TOP = (10, 10, 20)
BG_BOTTOM = (20, 14, 38)
SURFACE = (22, 22, 36)
SURFACE_2 = (30, 30, 48)
BORDER = (58, 52, 92)
TEXT = (236, 236, 245)
MUTED = (150, 150, 175)
VIOLET = (139, 92, 246)
CYAN = (34, 211, 238)
GREEN = (74, 222, 128)
AMBER = (251, 191, 36)
RED = (248, 113, 113)

HIGHLIGHT_BG = (48, 40, 84)
LINE_NUM = (90, 90, 120)
NODE_ACTIVE_BG = (46, 36, 88)
TRACE_FLASH_BG = (60, 50, 110)
BADGE_BG = (26, 34, 62)
CAPTION_BG = (6, 6, 12)
CAPTION_TEXT = (236, 236, 245)
BRAND_PRIMARY = (248, 250, 252)
BRAND_ACCENT = (229, 190, 103)
AXIS_COLOR = (70, 70, 100)
LANE_RULE = (45, 45, 68)
BAR_TEXT = (12, 12, 20)

# Pygments token type (prefix) -> colour, One Dark-ish default
SYNTAX_DARK = {
    "Token.Keyword": (198, 120, 221),
    "Token.Name.Builtin": (86, 182, 194),
    "Token.Name.Function": (97, 175, 239),
    "Token.Name.Class": (229, 192, 123),
    "Token.Name.Decorator": (229, 192, 123),
    "Token.Literal.String": (152, 195, 121),
    "Token.Literal.Number": (209, 154, 102),
    "Token.Comment": (110, 118, 140),
    "Token.Operator": (86, 182, 194),
    "Token.Name": (224, 226, 235),
    "Token.Punctuation": (171, 178, 191),
}

# Enterprise One-Light / GitHub Light high-contrast syntax palette for Light/Ivory LinkedIn cards
SYNTAX_LIGHT = {
    "Token.Keyword": (124, 58, 237),
    "Token.Name.Builtin": (3, 105, 161),
    "Token.Name.Function": (29, 78, 216),
    "Token.Name.Class": (180, 83, 9),
    "Token.Name.Decorator": (180, 83, 9),
    "Token.Literal.String": (21, 128, 61),
    "Token.Literal.Number": (194, 65, 12),
    "Token.Comment": (100, 116, 139),
    "Token.Operator": (15, 118, 110),
    "Token.Name": (15, 23, 42),
    "Token.Punctuation": (51, 65, 85),
}

SYNTAX = dict(SYNTAX_DARK)

FONT_SANS = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
FONT_SANS_BOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
FONT_SANS_REG = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Medium.ttf"
FONT_MONO_BOLD = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"


@lru_cache(maxsize=64)
def font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


def syntax_color(ttype) -> tuple:
    s = str(ttype)
    while s:
        if s in SYNTAX:
            return SYNTAX[s]
        s = s.rsplit(".", 1)[0] if "." in s else ""
    return TEXT


@contextmanager
def use_palette(overrides: dict | None):
    """Temporarily activate an Enterprise LinkedIn palette while preserving thread/test isolation."""
    if not overrides:
        yield
        return
    g = globals()
    saved = {k: g[k] for k in overrides if k in g}
    saved["SYNTAX"] = dict(SYNTAX)
    try:
        for k, v in overrides.items():
            if k == "SYNTAX":
                g["SYNTAX"] = dict(v)
            elif k in g:
                g[k] = v
        if overrides.get("IS_LIGHT") and "SYNTAX" not in overrides:
            g["SYNTAX"] = dict(SYNTAX_LIGHT)
        yield
    finally:
        for k, v in saved.items():
            g[k] = v
