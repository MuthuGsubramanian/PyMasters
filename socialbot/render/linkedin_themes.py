"""Enterprise Design System & Layout Randomizer for PyMasters LinkedIn Posts.

Eliminates feed monotony by rotating across:
- 6 Executive Color Architectures (3 Editorial Light/Paper palettes + 3 Institutional Dark/Terminal palettes)
- 4 Enterprise Layout Shells & Aspect Ratios:
  1. `portrait_brief`    (1080x1350, 4:5 Executive Brief — top masthead + dot-matrix canvas)
  2. `swiss_dossier`     (1080x1080, 1:1 Swiss Architectural Grid — inset border + blueprint grid)
  3. `boardroom_slide`   (1280x960,  4:3 Boardroom Deck — left accent spine + consulting header rule)
  4. `vertical_monograph`(1080x1200, 9:10 Enterprise Monograph — subtle geometric arcs + pill counter)

Consecutive LinkedIn posts never repeat the last 4 themes or the last 2 layouts."""
from __future__ import annotations

import random
from PIL import Image, ImageDraw

from socialbot import store
from socialbot.render import scenes as S
from socialbot.render import theme as T

ENTERPRISE_THEMES: dict[str, dict] = {
    "executive_ivory": {
        "label": "Executive Ivory",
        "palette": {
            "IS_LIGHT": True,
            "BG_TOP": (251, 249, 244),
            "BG_BOTTOM": (243, 239, 230),
            "SURFACE": (255, 255, 255),
            "SURFACE_2": (246, 244, 238),
            "BORDER": (206, 212, 224),
            "TEXT": (15, 23, 42),
            "MUTED": (82, 95, 118),
            "VIOLET": (30, 64, 175),
            "CYAN": (13, 148, 136),
            "GREEN": (21, 128, 61),
            "AMBER": (180, 83, 9),
            "RED": (185, 28, 28),
            "HIGHLIGHT_BG": (224, 236, 255),
            "LINE_NUM": (140, 152, 172),
            "NODE_ACTIVE_BG": (228, 242, 254),
            "TRACE_FLASH_BG": (219, 234, 254),
            "BADGE_BG": (232, 244, 243),
            "CAPTION_BG": (15, 23, 42),
            "CAPTION_TEXT": (248, 250, 252),
            "BRAND_PRIMARY": (15, 23, 42),
            "BRAND_ACCENT": (29, 78, 216),
            "AXIS_COLOR": (148, 163, 184),
            "LANE_RULE": (203, 213, 225),
            "BAR_TEXT": (255, 255, 255),
        },
    },
    "midnight_sapphire": {
        "label": "Midnight Sapphire",
        "palette": {
            "IS_LIGHT": False,
            "BG_TOP": (8, 18, 38),
            "BG_BOTTOM": (14, 29, 58),
            "SURFACE": (18, 35, 68),
            "SURFACE_2": (24, 44, 82),
            "BORDER": (51, 82, 132),
            "TEXT": (241, 245, 249),
            "MUTED": (148, 168, 198),
            "VIOLET": (96, 165, 250),
            "CYAN": (56, 189, 248),
            "GREEN": (52, 211, 153),
            "AMBER": (250, 204, 21),
            "RED": (248, 113, 113),
            "HIGHLIGHT_BG": (30, 58, 108),
            "LINE_NUM": (96, 122, 162),
            "NODE_ACTIVE_BG": (28, 56, 104),
            "TRACE_FLASH_BG": (37, 74, 132),
            "BADGE_BG": (16, 36, 70),
            "CAPTION_BG": (6, 13, 28),
            "CAPTION_TEXT": (241, 245, 249),
            "BRAND_PRIMARY": (248, 250, 252),
            "BRAND_ACCENT": (250, 204, 21),
            "AXIS_COLOR": (71, 102, 148),
            "LANE_RULE": (42, 68, 108),
            "BAR_TEXT": (8, 18, 38),
        },
    },
    "swiss_paper": {
        "label": "Swiss Architectural Paper",
        "palette": {
            "IS_LIGHT": True,
            "BG_TOP": (246, 248, 252),
            "BG_BOTTOM": (237, 242, 249),
            "SURFACE": (255, 255, 255),
            "SURFACE_2": (241, 245, 251),
            "BORDER": (203, 213, 225),
            "TEXT": (17, 24, 39),
            "MUTED": (75, 85, 99),
            "VIOLET": (79, 70, 229),
            "CYAN": (2, 132, 199),
            "GREEN": (5, 150, 105),
            "AMBER": (217, 119, 6),
            "RED": (220, 38, 38),
            "HIGHLIGHT_BG": (224, 231, 255),
            "LINE_NUM": (148, 163, 184),
            "NODE_ACTIVE_BG": (224, 242, 254),
            "TRACE_FLASH_BG": (224, 231, 255),
            "BADGE_BG": (224, 242, 254),
            "CAPTION_BG": (17, 24, 39),
            "CAPTION_TEXT": (249, 250, 251),
            "BRAND_PRIMARY": (17, 24, 39),
            "BRAND_ACCENT": (79, 70, 229),
            "AXIS_COLOR": (148, 163, 184),
            "LANE_RULE": (203, 213, 225),
            "BAR_TEXT": (255, 255, 255),
        },
    },
    "emerald_terminal": {
        "label": "Emerald Risk Terminal",
        "palette": {
            "IS_LIGHT": False,
            "BG_TOP": (8, 21, 19),
            "BG_BOTTOM": (12, 34, 30),
            "SURFACE": (16, 42, 37),
            "SURFACE_2": (22, 52, 46),
            "BORDER": (42, 92, 82),
            "TEXT": (236, 253, 245),
            "MUTED": (142, 182, 172),
            "VIOLET": (45, 212, 191),
            "CYAN": (52, 211, 153),
            "GREEN": (110, 231, 183),
            "AMBER": (251, 191, 36),
            "RED": (248, 113, 113),
            "HIGHLIGHT_BG": (20, 68, 58),
            "LINE_NUM": (86, 132, 120),
            "NODE_ACTIVE_BG": (22, 72, 62),
            "TRACE_FLASH_BG": (26, 86, 74),
            "BADGE_BG": (14, 46, 40),
            "CAPTION_BG": (5, 14, 12),
            "CAPTION_TEXT": (236, 253, 245),
            "BRAND_PRIMARY": (240, 253, 250),
            "BRAND_ACCENT": (52, 211, 153),
            "AXIS_COLOR": (62, 112, 100),
            "LANE_RULE": (36, 76, 68),
            "BAR_TEXT": (8, 21, 19),
        },
    },
    "platinum_fintech": {
        "label": "Platinum Sovereign Ledger",
        "palette": {
            "IS_LIGHT": True,
            "BG_TOP": (241, 245, 249),
            "BG_BOTTOM": (230, 237, 245),
            "SURFACE": (255, 255, 255),
            "SURFACE_2": (245, 248, 252),
            "BORDER": (192, 205, 220),
            "TEXT": (15, 23, 42),
            "MUTED": (71, 85, 105),
            "VIOLET": (15, 118, 110),
            "CYAN": (30, 64, 175),
            "GREEN": (22, 101, 52),
            "AMBER": (180, 83, 9),
            "RED": (185, 28, 28),
            "HIGHLIGHT_BG": (219, 234, 254),
            "LINE_NUM": (140, 154, 172),
            "NODE_ACTIVE_BG": (204, 251, 241),
            "TRACE_FLASH_BG": (219, 234, 254),
            "BADGE_BG": (226, 238, 252),
            "CAPTION_BG": (15, 23, 42),
            "CAPTION_TEXT": (248, 250, 252),
            "BRAND_PRIMARY": (15, 23, 42),
            "BRAND_ACCENT": (15, 118, 110),
            "AXIS_COLOR": (148, 163, 184),
            "LANE_RULE": (203, 213, 225),
            "BAR_TEXT": (255, 255, 255),
        },
    },
    "carbon_graphite": {
        "label": "Carbon Systems Graphite",
        "palette": {
            "IS_LIGHT": False,
            "BG_TOP": (17, 19, 25),
            "BG_BOTTOM": (26, 29, 38),
            "SURFACE": (31, 35, 46),
            "SURFACE_2": (39, 44, 58),
            "BORDER": (68, 76, 98),
            "TEXT": (244, 245, 248),
            "MUTED": (156, 163, 179),
            "VIOLET": (167, 139, 250),
            "CYAN": (56, 189, 248),
            "GREEN": (74, 222, 128),
            "AMBER": (251, 146, 60),
            "RED": (248, 113, 113),
            "HIGHLIGHT_BG": (48, 56, 78),
            "LINE_NUM": (108, 116, 138),
            "NODE_ACTIVE_BG": (46, 54, 76),
            "TRACE_FLASH_BG": (56, 66, 94),
            "BADGE_BG": (28, 36, 52),
            "CAPTION_BG": (11, 13, 18),
            "CAPTION_TEXT": (244, 245, 248),
            "BRAND_PRIMARY": (248, 250, 252),
            "BRAND_ACCENT": (56, 189, 248),
            "AXIS_COLOR": (88, 96, 118),
            "LANE_RULE": (52, 58, 76),
            "BAR_TEXT": (17, 19, 25),
        },
    },
}

ENTERPRISE_LAYOUTS: dict[str, dict] = {
    "portrait_brief": {
        "w": 1080,
        "h": 1350,
        "gif_w": 720,
        "gif_h": 900,
        "label": "Executive Portrait Brief (4:5)",
    },
    "swiss_dossier": {
        "w": 1080,
        "h": 1080,
        "gif_w": 720,
        "gif_h": 720,
        "label": "Swiss Grid Dossier (1:1)",
    },
    "boardroom_slide": {
        "w": 1200,
        "h": 960,
        "gif_w": 800,
        "gif_h": 640,
        "label": "Boardroom Deck Slide (5:4)",
    },
    "vertical_monograph": {
        "w": 1080,
        "h": 1200,
        "gif_w": 720,
        "gif_h": 800,
        "label": "Enterprise Monograph (9:10)",
    },
}


def pick_linkedin_design(rng=None) -> dict:
    """Randomly pick a non-repeating `(theme_id, layout_id)` pair for the next LinkedIn post.
    Alternates between Light and Dark palettes when possible and avoids the last 4 themes and last 2 layouts."""
    rng = rng if rng is not None else random.Random()
    recent_themes: list[str] = []
    recent_layouts: list[str] = []
    last_is_light: bool | None = None

    try:
        for it in store.items(kind="linkedin", limit=15):
            if it.get("status") in ("rejected", "failed"):
                continue
            med = it.get("media") or {}
            th = med.get("design_theme")
            ly = med.get("design_layout")
            if th in ENTERPRISE_THEMES:
                if last_is_light is None:
                    last_is_light = bool(ENTERPRISE_THEMES[th]["palette"].get("IS_LIGHT"))
                if th not in recent_themes:
                    recent_themes.append(th)
            if ly in ENTERPRISE_LAYOUTS and ly not in recent_layouts:
                recent_layouts.append(ly)
    except Exception:
        pass

    avail_themes = [t for t in ENTERPRISE_THEMES if t not in recent_themes[:4]] or list(ENTERPRISE_THEMES)
    if last_is_light is not None:
        flipped = [t for t in avail_themes if bool(ENTERPRISE_THEMES[t]["palette"].get("IS_LIGHT")) != last_is_light]
        if flipped:
            avail_themes = flipped

    avail_layouts = [l for l in ENTERPRISE_LAYOUTS if l not in recent_layouts[:2]] or list(ENTERPRISE_LAYOUTS)
    theme_id = rng.choice(avail_themes)
    layout_id = rng.choice(avail_layouts)
    return {
        "theme_id": theme_id,
        "layout_id": layout_id,
        "theme": ENTERPRISE_THEMES[theme_id],
        "layout": ENTERPRISE_LAYOUTS[layout_id],
    }


def decorate_canvas_background(bg: Image.Image, F: S.Frame, layout_id: str) -> Image.Image:
    """Add subtle, enterprise-grade architectural texture/framing matching `layout_id`."""
    img = bg.copy()
    d = ImageDraw.Draw(img)
    grid_col = S.lerp_color(T.BG_TOP, T.BORDER, 0.36 if getattr(T, "IS_LIGHT", False) else 0.24)

    if layout_id == "swiss_dossier":
        step = F.px(72)
        for x in range(step, F.w, step):
            d.line([(x, 0), (x, F.h)], fill=grid_col, width=1)
        for y in range(step, F.h, step):
            d.line([(0, y), (F.w, y)], fill=grid_col, width=1)
        m = F.px(18)
        d.rounded_rectangle([m, m, F.w - m, F.h - m], radius=F.px(20), outline=T.BORDER, width=max(1, F.px(2)))
    elif layout_id == "portrait_brief":
        step = F.px(48)
        for x in range(F.px(48), F.w - F.px(32), step):
            for y in range(F.px(120), F.h - F.px(60), step):
                d.point((x, y), fill=grid_col)
        d.line([(F.pad, F.px(98)), (F.w - F.pad, F.px(98))], fill=T.BORDER, width=max(1, F.px(2)))
    elif layout_id == "boardroom_slide":
        # Left vertical consulting accent spine + header rule
        d.rectangle([0, 0, F.px(12), F.h], fill=T.VIOLET)
        d.line([(F.pad, F.px(96)), (F.w - F.pad, F.px(96))], fill=T.BORDER, width=max(1, F.px(2)))
    elif layout_id == "vertical_monograph":
        arc_col = S.lerp_color(T.BG_TOP, T.CYAN, 0.16)
        r = F.px(360)
        d.arc([F.w - r, -r // 2, F.w + r // 2, r], 90, 200, fill=arc_col, width=max(2, F.px(3)))
        d.arc([-r // 2, F.h - r, r, F.h + r // 2], 270, 20, fill=arc_col, width=max(2, F.px(3)))
    return img


def draw_enterprise_header_badge(
    img: Image.Image,
    F: S.Frame,
    domain_label: str,
    beat_idx: int,
    total_beats: int,
) -> None:
    """Render top-right Enterprise Domain Classification pill + step indicator."""
    d = ImageDraw.Draw(img)
    tag = (domain_label or "ENTERPRISE ARCHITECTURE").upper()
    if len(tag) > 28:
        tag = tag[:27].rstrip() + "."
    step_str = f"{beat_idx:02d}/{total_beats:02d}"
    full = f"{tag}  ·  {step_str}"
    bf = T.font(T.FONT_MONO_BOLD, F.px(19))
    tw = d.textlength(full, font=bf)
    pw, ph = int(tw + F.px(32)), F.px(38)
    x0 = F.w - F.pad - pw
    y0 = F.px(37)
    S.rounded(d, [x0, y0, x0 + pw, y0 + ph], F.px(19), fill=T.BADGE_BG, outline=T.BORDER, width=max(1, F.px(2)))
    d.text((x0 + F.px(16), y0 + F.px(7)), full, font=bf, fill=T.CYAN)


def draw_enterprise_cover_card(
    bg: Image.Image,
    F: S.Frame,
    title: str,
    domain_label: str,
    layout_id: str,
    t: float,
    progress: float,
    total_beats: int,
) -> Image.Image:
    """Render a layout-specific Executive Cover Frame instead of a repetitive generic reveal card."""
    img = bg.copy()
    d = ImageDraw.Draw(img)
    k = S.ease(min(1.0, t * 2.2))

    S.chrome(img, F, progress)
    draw_enterprise_header_badge(img, F, domain_label, 1, total_beats)

    card_x0, card_x1 = F.pad, F.w - F.pad
    card_y0, card_y1 = F.px(150), F.h - F.px(140)

    if layout_id in ("portrait_brief", "swiss_dossier"):
        # Left-aligned McKinsey / Stripe Press editorial cover card
        S.rounded(d, [card_x0, card_y0, card_x1, card_y1], F.px(28), fill=T.SURFACE, outline=T.BORDER, width=max(2, F.px(2)))
        d.rounded_rectangle([card_x0 + F.px(44), card_y0 + F.px(56), card_x0 + F.px(136), card_y0 + F.px(66)], radius=F.px(5), fill=T.CYAN)
        eyebrow_f = T.font(T.FONT_MONO_BOLD, F.px(23))
        d.text((card_x0 + F.px(44), card_y0 + F.px(90)), (domain_label or "ARCHITECTURE BRIEF").upper(), font=eyebrow_f, fill=T.VIOLET)

        tf = T.font(T.FONT_SANS_BOLD, F.px(68 if len(title) <= 34 else 56))
        lines = S.wrap(title, tf, (card_x1 - card_x0) - F.px(96), d)[:4]
        ty = card_y0 + F.px(154)
        for ln in lines:
            d.text((card_x0 + F.px(44), ty + (1 - k) * F.px(18)), ln, font=tf, fill=S.lerp_color(T.SURFACE, T.TEXT, k))
            ty += int(tf.size * 1.18)

        sub_f = T.font(T.FONT_SANS, F.px(30))
        d.text(
            (card_x0 + F.px(44), card_y1 - F.px(92)),
            "Complex concepts distilled into clear intuition  ·  pymasters.net",
            font=sub_f,
            fill=T.MUTED,
        )
    else:
        # Centered Executive Monograph / Boardroom Deck Title Slide
        eyebrow_f = T.font(T.FONT_MONO_BOLD, F.px(24))
        eb = f"EXECUTIVE BRIEF  ·  {(domain_label or 'ENGINEERING').upper()}"
        ew = d.textlength(eb, font=eyebrow_f)
        epw, eph = int(ew + F.px(40)), F.px(44)
        ex0, ey0 = (F.w - epw) // 2, int(F.h * 0.25)
        S.rounded(d, [ex0, ey0, ex0 + epw, ey0 + eph], F.px(22), fill=T.BADGE_BG, outline=T.VIOLET, width=max(1, F.px(2)))
        d.text((ex0 + F.px(20), ey0 + F.px(8)), eb, font=eyebrow_f, fill=T.VIOLET)

        ty = S.heading(img, F, title, ey0 + F.px(86), size=68 if len(title) <= 34 else 56, color=T.TEXT, k=k)
        rule_w = int(F.px(220) * k)
        d.rounded_rectangle([(F.w - rule_w) // 2, ty + F.px(24), (F.w + rule_w) // 2, ty + F.px(32)], radius=F.px(4), fill=T.CYAN)
        S.heading(img, F, "pymasters.net  ·  Enterprise Learning Platform", ty + F.px(56), size=30, color=T.MUTED, k=k)

    return img
