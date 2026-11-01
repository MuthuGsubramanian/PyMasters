"""PyMasters visual identity for rendered media ("Deep Void": dark surface, violet + cyan accents)."""
from functools import lru_cache

from PIL import ImageFont

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

# Pygments token type (prefix) -> colour, One Dark-ish
SYNTAX = {
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
