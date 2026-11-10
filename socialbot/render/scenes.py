"""Frame drawing for every scene kind. Pure Pillow: each call draws one frame of one scene at
progress t in [0, 1]. Layout adapts to portrait (Shorts), landscape (tutorials) and square (LinkedIn)."""
import math
import re

from PIL import Image, ImageChops, ImageDraw
from pygments.lexers import PythonLexer

from socialbot.render import theme as T

_LEXER = PythonLexer()


# ---------- helpers ----------
def ease(t):  # ease-out cubic
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def seg(t, a, b):
    """Progress of t within [a, b], clamped to [0, 1]."""
    return 0.0 if t <= a else 1.0 if t >= b else (t - a) / (b - a)


def lerp_color(c1, c2, k):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * k) for i in range(3))


def gradient(w, h):
    img = Image.new("RGB", (w, h), T.BG_TOP)
    px = ImageDraw.Draw(img)
    for y in range(h):
        px.line([(0, y), (w, y)], fill=lerp_color(T.BG_TOP, T.BG_BOTTOM, y / max(1, h - 1)))
    # soft violet glow, top-right
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(max(w, h) * 0.55)
    for i in range(24, 0, -1):
        k = i / 24
        col = tuple(int(c * 0.10 * (1 - k)) for c in T.VIOLET)
        gd.ellipse([w - r * k - r * 0.2, -r * k * 0.6, w + r * k * 0.6, r * k * 0.9], fill=col)
    return ImageChops.add(img, glow)


def wrap(text, fnt, max_w, draw):
    words, lines, cur = (text or "").split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


class Frame:
    """Geometry for one output format."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.portrait = h > w * 1.2
        self.square = abs(w - h) < 10
        self.stack = h >= w * 0.95         # portrait and square: panels stack vertically
        self.s = min(w, h) / 1080          # scale unit
        self.fs = 1.32 if self.portrait else 1.0   # type scale: phones need bigger text
        # space kept free at the bottom for note banner + karaoke captions (portrait/landscape) or caption bar (square)
        self.bottom = int((500 if self.portrait else 215 if self.square else 230) * self.s)
        self.pad = int(70 * self.s)
        self.bg = gradient(w, h)

    def px(self, v):
        return int(v * self.s)


# ---------- code layout ----------
def code_tokens(code):
    """[(line_no, [(text, color), ...]), ...]"""
    lines, cur = [], []
    for ttype, val in _LEXER.get_tokens(code.rstrip("\n")):
        parts = val.split("\n")
        for i, p in enumerate(parts):
            if i > 0:
                lines.append(cur)
                cur = []
            if p:
                cur.append((p, T.syntax_color(ttype)))
    lines.append(cur)
    while lines and not lines[-1]:
        lines.pop()
    return lines


def is_python(text):
    try:
        compile(text or "", "<x>", "exec")
        return True
    except SyntaxError:
        return False


def plain_tokens(text):
    return [[(ln, T.TEXT)] if ln else [] for ln in (text or "").rstrip("\n").split("\n")]


def draw_code_card(img, F, box, code, reveal=1.0, highlight=None, title="main.py", font_size=None, plain=None):
    """Code window. reveal: fraction of characters typed. highlight: 1-based line to highlight.
    plain: render as plain text (no syntax colours); default = auto (anything that isn't valid Python)."""
    d = ImageDraw.Draw(img)
    if plain is None:
        plain = not is_python(code)
    x0, y0, x1, y1 = box
    rounded(d, box, F.px(22), fill=T.SURFACE, outline=T.BORDER, width=max(1, F.px(2)))
    # title bar
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = x0 + F.px(30) + i * F.px(26)
        d.ellipse([cx - F.px(8), y0 + F.px(26) - F.px(8), cx + F.px(8), y0 + F.px(26) + F.px(8)], fill=c)
    d.text((x0 + F.px(120), y0 + F.px(12)), title, font=T.font(T.FONT_MONO, F.px(22)), fill=T.MUTED)
    lines = plain_tokens(code) if plain else code_tokens(code)
    n = max(1, len(lines))
    longest = max([sum(len(t) for t, _ in ln) for ln in lines] + [20])
    avail_w, avail_h = (x1 - x0) - F.px(110), (y1 - y0) - F.px(80)
    size = font_size or max(F.px(18), min(F.px(40 * F.fs), int(avail_w / (longest * 0.62)), int(avail_h / (n * 1.55))))
    mono = T.font(T.FONT_MONO, size)
    lh = int(size * 1.5)
    total = sum(sum(len(t) for t, _ in ln) for ln in lines)
    budget = int(total * reveal)
    ty = y0 + F.px(66)
    for i, ln in enumerate(lines, start=1):
        if highlight == i:
            d.rectangle([x0 + F.px(4), ty - F.px(4), x1 - F.px(4), ty + lh - F.px(6)], fill=(48, 40, 84))
            d.rectangle([x0 + F.px(4), ty - F.px(4), x0 + F.px(10), ty + lh - F.px(6)], fill=T.CYAN)
        if plain:
            tx = x0 + F.px(34)
        else:
            d.text((x0 + F.px(28), ty), f"{i:>2}", font=mono, fill=(90, 90, 120))
            tx = x0 + F.px(28) + int(size * 2.2)
        for text, col in ln:
            if budget <= 0:
                break
            piece = text[:budget]
            budget -= len(piece)
            d.text((tx, ty), piece, font=mono, fill=col)
            tx += d.textlength(piece, font=mono)
        if budget <= 0 and reveal < 1.0:
            # blinking caret at the typing position
            d.rectangle([tx + 2, ty + F.px(4), tx + max(2, size // 10) + 2, ty + lh - F.px(10)], fill=T.CYAN)
            break
        ty += lh
    return lh


def draw_terminal(img, F, box, text, reveal=1.0):
    d = ImageDraw.Draw(img)
    rounded(d, box, F.px(18), fill=(8, 10, 16), outline=(40, 70, 60), width=max(1, F.px(2)))
    x0, y0, x1, y1 = box
    d.text((x0 + F.px(24), y0 + F.px(14)), "output", font=T.font(T.FONT_MONO, F.px(20)), fill=(90, 140, 120))
    lines = (text or "").rstrip("\n").split("\n")
    longest = max([len(l) for l in lines] + [16])
    size = max(F.px(18), min(F.px(34 * F.fs), int(((x1 - x0) - F.px(50)) / (longest * 0.62)),
                             int(((y1 - y0) - F.px(56)) / (max(1, len(lines)) * 1.5))))
    mono = T.font(T.FONT_MONO, size)
    budget = int(sum(len(l) for l in lines) * reveal)
    ty = y0 + F.px(48)
    for ln in lines:
        if budget <= 0:
            break
        piece = ln[:budget]
        budget -= max(1, len(ln))
        d.text((x0 + F.px(24), ty), piece, font=mono, fill=T.GREEN)
        ty += int(size * 1.5)


def heading(img, F, text, y, size=58, color=T.TEXT, k=1.0, center=True, max_w=None):
    d = ImageDraw.Draw(img)
    f = T.font(T.FONT_SANS_BOLD, F.px(size * F.fs))
    max_w = max_w or (F.w - 2 * F.pad)
    lines = wrap(text, f, max_w, d)
    lh = int(F.px(size * F.fs) * 1.18)
    for i, ln in enumerate(lines):
        kk = ease(seg(k, i * 0.12, i * 0.12 + 0.6))
        col = lerp_color(T.BG_TOP, color, kk)
        w = d.textlength(ln, font=f)
        x = (F.w - w) / 2 if center else F.pad
        d.text((x, y + i * lh + (1 - kk) * F.px(24)), ln, font=f, fill=col)
    return y + len(lines) * lh


# ---------- scene kinds ----------
def scene_title(img, F, spec, t):
    head = spec.get("heading") or spec.get("big") or ""
    sub = spec.get("sub") or ""
    y = F.h * (0.36 if F.portrait else 0.32)
    y = heading(img, F, head, y, size=84 if F.portrait else 76, k=ease(t * 2.2))
    if sub:
        heading(img, F, sub, y + F.px(26), size=40, color=T.CYAN, k=ease(seg(t, 0.25, 0.8)))
    d = ImageDraw.Draw(img)
    bw = int((F.w * 0.32) * ease(seg(t, 0.1, 0.6)))
    d.rectangle([(F.w - bw) / 2, y - F.px(6), (F.w + bw) / 2, y - F.px(2)], fill=T.VIOLET)


def _content_top(F, img, spec, t):
    y = F.pad + F.px(210 if F.portrait else 30)
    badge = (spec.get("step_badge") or "").strip()
    if badge:
        d = ImageDraw.Draw(img)
        bf = T.font(T.FONT_MONO, F.px(24 if F.portrait else 22))
        tw = d.textlength(badge.upper(), font=bf)
        pw, ph = tw + F.px(44), F.px(42)
        px0 = (F.w - pw) / 2
        rounded(d, [px0, y, px0 + pw, y + ph], F.px(21), fill=(26, 34, 62), outline=T.CYAN, width=max(1, F.px(2)))
        d.text((px0 + F.px(22), y + F.px(7)), badge.upper(), font=bf, fill=T.CYAN)
        y += ph + F.px(18)
    if spec.get("heading"):
        return heading(img, F, spec["heading"], y, size=54 if F.portrait else 50, k=ease(t * 4)) + F.px(28)
    return y + F.px(30)


def scene_code(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    code = spec.get("code") or ""
    out = spec.get("output") or ""
    hl = spec.get("highlight_lines") or []
    bottom_reserved = F.bottom
    if out and not F.stack:
        code_box = (F.pad, top, int(F.w * 0.64), F.h - F.pad - F.px(120))
        term_box = (int(F.w * 0.64) + F.px(30), top, F.w - F.pad, top + int((F.h - top) * 0.55))
    else:
        term_h = F.px(200) if out else 0
        code_h = F.h - top - bottom_reserved - F.px(30) - (term_h + F.px(24) if out else 0)
        code_box = (F.pad, top, F.w - F.pad, top + max(F.px(260), code_h))
        term_box = (F.pad, code_box[3] + F.px(24), F.w - F.pad, code_box[3] + F.px(24) + term_h)
    typing = ease(seg(t, 0.0, 0.55 if out else 0.7))
    cur_hl = None
    if hl and t > 0.55:
        cur_hl = hl[min(len(hl) - 1, int(seg(t, 0.55, 0.98) * len(hl)))]
    draw_code_card(img, F, code_box, code, reveal=typing, highlight=cur_hl)
    if out:
        draw_terminal(img, F, term_box, out, reveal=ease(seg(t, 0.6, 0.85)))


def scene_output(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    box = (F.pad, top, F.w - F.pad, min(F.h - F.bottom - F.px(30), top + F.px(560)))
    draw_terminal(img, F, box, spec.get("code") or spec.get("output") or "", reveal=ease(seg(t, 0.05, 0.6)))


def scene_bullets(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    bullets = spec.get("bullets") or []
    f = T.font(T.FONT_SANS, F.px(42 * F.fs))
    n = max(1, len(bullets))
    row = F.px(130 * F.fs)
    y = top + F.px(20) + max(0, ((F.h - F.bottom - top) - n * row) / 2 - F.px(40)) if F.portrait else top + F.px(20)
    for i, b in enumerate(bullets):
        k = ease(seg(t, 0.08 + i * 0.7 / n, 0.08 + i * 0.7 / n + 0.25))
        if k <= 0:
            continue
        x = F.pad + F.px(30) + (1 - k) * F.px(60)
        col = lerp_color(T.BG_TOP, T.TEXT, k)
        rounded(d, [x - F.px(30), y - F.px(14), F.w - F.pad, y + int(row * 0.66)], F.px(18),
                fill=lerp_color(T.BG_TOP, T.SURFACE, k), outline=lerp_color(T.BG_TOP, T.BORDER, k))
        d.ellipse([x, y + int(row * 0.2), x + F.px(20), y + int(row * 0.2) + F.px(20)], fill=lerp_color(T.BG_TOP, T.CYAN, k))
        lines = wrap(b, f, F.w - 2 * F.pad - F.px(110), d)
        for j, ln in enumerate(lines[:2]):
            d.text((x + F.px(44), y + F.px(8) + j * int(f.size * 1.2)), ln, font=f, fill=col)
        y += row + (int(f.size * 1.2) if len(lines) > 1 else 0)


def _split_label(s):
    s = s or ""
    if "\n" in s:
        a, b = s.split("\n", 1)
        if len(a) <= 28 and not a.strip().startswith(("def ", "for ", "import ", "print", "class ")):
            return a.strip().rstrip(":"), b
    return "", s


def scene_compare(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    lt, lbody = spec.get("left_title") or "", spec.get("left") or ""
    rt, rbody = spec.get("right_title") or "", spec.get("right") or ""
    if not lt:
        lt, lbody = _split_label(lbody)
    if not rt:
        rt, rbody = _split_label(rbody)
    lt, rt = lt or "Before", rt or "After"
    versus = spec.get("style") == "versus" or bool(re.search(r"before|after|wrong|right|slow|fast|bad|good|don't|do this|naive|fixed|bug",
                                                              (lt + " " + rt).lower()))
    gap = F.px(34)
    if F.stack:
        h = (F.h - top - F.bottom - F.px(30) - gap) // 2 - F.px(27)
        boxes = [(F.pad, top, F.w - F.pad, top + h), (F.pad, top + h + gap + F.px(54), F.w - F.pad, top + 2 * h + gap + F.px(54))]
    else:
        w = (F.w - 2 * F.pad - gap) // 2
        boxes = [(F.pad, top, F.pad + w, F.h - F.pad - F.px(110)), (F.pad + w + gap, top, F.w - F.pad, F.h - F.pad - F.px(110))]
    cols = (T.RED, T.GREEN) if versus else (T.VIOLET, T.CYAN)
    for i, (box, title, body, col) in enumerate([(boxes[0], lt, lbody, cols[0]), (boxes[1], rt, rbody, cols[1])]):
        k = ease(seg(t, 0.05 + i * 0.35, 0.4 + i * 0.35))
        if k <= 0:
            continue
        x0, y0, x1, y1 = box
        lab = T.font(T.FONT_SANS_BOLD, F.px(34))
        d.text((x0 + F.px(6), y0), title, font=lab, fill=lerp_color(T.BG_TOP, col, k))
        draw_code_card(img, F, (x0, y0 + F.px(54), x1, y1), body, reveal=k, title="")
        if versus:
            mark = "✗" if i == 0 else "✓"
            d.text((x1 - F.px(56), y0 - F.px(4)), mark, font=T.font(T.FONT_SANS_BOLD, F.px(44)),
                   fill=lerp_color(T.BG_TOP, col, k))
        elif i == 1 and k > 0.6:
            # mapping style: a connector between the two cards
            ImageDraw.Draw(img).text((F.w / 2 - F.px(20), y0 - F.px(gap // 2 + 52)) if F.stack else
                                     (x0 - F.px(30), (y0 + y1) / 2), "↓" if F.stack else "→",
                                     font=T.font(T.FONT_SANS_BOLD, F.px(44)), fill=T.MUTED)


def scene_trace(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    steps = spec.get("steps") or []
    code = spec.get("code") or ""
    if F.stack:
        avail = F.h - top - F.bottom - F.px(30)
        code_box = (F.pad, top, F.w - F.pad, top + int(avail * 0.56))
        var_box = (F.pad, code_box[3] + F.px(24), F.w - F.pad, top + avail)
    else:
        code_box = (F.pad, top, int(F.w * 0.6), F.h - F.pad - F.px(110))
        var_box = (int(F.w * 0.6) + F.px(30), top, F.w - F.pad, F.h - F.pad - F.px(110))
    typed = ease(seg(t, 0, 0.18))
    idx = min(len(steps) - 1, int(seg(t, 0.2, 0.98) * len(steps))) if steps and t >= 0.2 else -1
    cur = steps[idx] if idx >= 0 else None
    draw_code_card(img, F, code_box, code, reveal=typed, highlight=(cur or {}).get("line"))
    rounded(d, var_box, F.px(20), fill=T.SURFACE_2, outline=T.BORDER, width=max(1, F.px(2)))
    d.text((var_box[0] + F.px(26), var_box[1] + F.px(18)), "variables", font=T.font(T.FONT_MONO, F.px(24)), fill=T.MUTED)
    if cur:
        prev = steps[idx - 1]["vars"] if idx > 0 else {}
        step_t = seg(t, 0.2 + idx * 0.78 / len(steps), 0.2 + (idx + 1) * 0.78 / len(steps))
        names = list(cur["vars"].keys())[:6]
        rows = max(1, len(names))
        rh = min(F.px(84), ((var_box[3] - var_box[1]) - F.px(80)) // rows)
        f = T.font(T.FONT_MONO, max(F.px(20), int(rh * 0.42)))
        for j, name in enumerate(names):
            val = str(cur["vars"][name])
            changed = prev.get(name) != cur["vars"][name]
            y = var_box[1] + F.px(70) + j * rh
            if changed:
                fl = 1 - ease(step_t * 1.6)
                rounded(d, [var_box[0] + F.px(14), y - F.px(6), var_box[2] - F.px(14), y + rh - F.px(14)], F.px(12),
                        fill=lerp_color(T.SURFACE_2, (60, 50, 110), fl))
            d.text((var_box[0] + F.px(30), y), name, font=f, fill=T.CYAN)
            vx = var_box[0] + F.px(30) + d.textlength(name + " = ", font=f)
            d.text((var_box[0] + F.px(30) + d.textlength(name, font=f), y), " = ", font=f, fill=T.MUTED)
            maxc = max(4, int((var_box[2] - vx - F.px(30)) / (f.size * 0.62)))
            d.text((vx, y), val if len(val) <= maxc else val[:maxc - 1] + "…", font=f,
                   fill=T.AMBER if changed else T.TEXT)


def scene_flow(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    nodes = (spec.get("nodes") or [])[:6]
    edges = spec.get("edges") or [[i, i + 1, ""] for i in range(len(nodes) - 1)]
    n = max(1, len(nodes))
    f = T.font(T.FONT_SANS_BOLD, F.px(34 if n <= 4 else 28))
    pos = []
    avail_top, avail_bot = top + F.px(20), F.h - F.bottom - F.px(30)
    if F.portrait or n > 4 and F.square:
        bw, bh = F.w - 2 * F.pad - F.px(160), min(F.px(120), (avail_bot - avail_top) // (2 * n))
        step = (avail_bot - avail_top - bh) / max(1, n - 1)
        for i in range(n):
            cx, cy = F.w / 2, avail_top + bh / 2 + i * step
            pos.append((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
    else:
        cols = n
        bw = min(F.px(300), (F.w - 2 * F.pad - (cols - 1) * F.px(60)) / cols)
        bh = F.px(140)
        step = (F.w - 2 * F.pad - bw) / max(1, cols - 1)
        cy = (avail_top + avail_bot) / 2
        for i in range(n):
            cx = F.pad + bw / 2 + i * step
            pos.append((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
    ne = max(1, len(edges))
    lit = set()
    for e_i, e in enumerate(edges):
        try:
            a, b = int(e[0]), int(e[1])
        except (TypeError, ValueError, IndexError):
            continue
        if not (0 <= a < n and 0 <= b < n):
            continue
        k = seg(t, 0.12 + e_i * 0.8 / ne, 0.12 + (e_i + 1) * 0.8 / ne)
        if k <= 0:
            continue
        lit.add(a)
        A, B = pos[a], pos[b]
        if F.portrait or (n > 4 and F.square):
            p1, p2 = ((A[0] + A[2]) / 2, A[3]), ((B[0] + B[2]) / 2, B[1])
        else:
            p1, p2 = (A[2], (A[1] + A[3]) / 2), (B[0], (B[1] + B[3]) / 2)
        kk = ease(k)
        pe = (p1[0] + (p2[0] - p1[0]) * kk, p1[1] + (p2[1] - p1[1]) * kk)
        d.line([p1, pe], fill=T.CYAN, width=max(2, F.px(6)))
        if k >= 1:
            lit.add(b)
            ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
            ah = F.px(22)
            d.polygon([p2, (p2[0] - ah * math.cos(ang - 0.45), p2[1] - ah * math.sin(ang - 0.45)),
                       (p2[0] - ah * math.cos(ang + 0.45), p2[1] - ah * math.sin(ang + 0.45))], fill=T.CYAN)
        else:
            d.ellipse([pe[0] - F.px(12), pe[1] - F.px(12), pe[0] + F.px(12), pe[1] + F.px(12)], fill=T.TEXT)
        label = str(e[2]) if len(e) > 2 and e[2] else ""
        if label and k > 0.5:
            lf = T.font(T.FONT_MONO, F.px(24))
            mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
            d.text((mx + F.px(14), my - F.px(30)), label[:22], font=lf, fill=T.AMBER)
    for i, (box, label) in enumerate(zip(pos, nodes)):
        k = ease(seg(t, 0.0 + i * 0.05, 0.18 + i * 0.05))
        on = i in lit
        rounded(d, box, F.px(22), fill=lerp_color(T.BG_TOP, (46, 36, 88) if on else T.SURFACE, k),
                outline=lerp_color(T.BG_TOP, T.VIOLET if on else T.BORDER, k), width=max(2, F.px(4 if on else 2)))
        lines = wrap(label, f, box[2] - box[0] - F.px(30), d)[:2]
        for j, ln in enumerate(lines):
            w = d.textlength(ln, font=f)
            yy = (box[1] + box[3]) / 2 - len(lines) * f.size * 0.6 + j * f.size * 1.2
            d.text(((box[0] + box[2] - w) / 2, yy), ln, font=f, fill=lerp_color(T.BG_TOP, T.TEXT, k))


def scene_timeline(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    lanes = (spec.get("lanes") or [])[:6]
    n = max(1, len(lanes))
    lf = T.font(T.FONT_SANS_BOLD, F.px(30))
    label_w = max([d.textlength(str(l.get("label", ""))[:18], font=lf) for l in lanes] + [F.px(120)])
    x0, x1 = F.pad + label_w + F.px(30), F.w - F.pad
    y0, y1 = top + F.px(30), F.h - F.bottom - F.px(30)
    lh = min(F.px(130), (y1 - y0) / n)
    y0 += max(0, ((y1 - y0) - lh * n) / 2)       # centre a few lanes vertically
    sweep = ease(seg(t, 0.08, 0.95)) * 10
    bf = T.font(T.FONT_MONO, F.px(24))
    palette = [T.VIOLET, T.CYAN, T.GREEN, T.AMBER, (244, 114, 182), (96, 165, 250)]
    for i, lane in enumerate(lanes):
        y = y0 + i * lh
        d.text((F.pad, y + lh * 0.3), str(lane.get("label", ""))[:18], font=lf, fill=T.MUTED)
        d.line([(x0, y + lh * 0.5), (x1, y + lh * 0.5)], fill=(45, 45, 68), width=max(1, F.px(2)))
        for bar in lane.get("bars") or []:
            try:
                s, e = float(bar[0]), float(bar[1])
            except (TypeError, ValueError, IndexError):
                continue
            if sweep <= s:
                continue
            ee = min(e, sweep)
            bx0, bx1 = x0 + (x1 - x0) * s / 10, x0 + (x1 - x0) * ee / 10
            rounded(d, [bx0, y + lh * 0.18, max(bx0 + 4, bx1), y + lh * 0.82], F.px(12), fill=palette[i % len(palette)])
            txt = str(bar[2]) if len(bar) > 2 else ""
            if txt and bx1 - bx0 > d.textlength(txt, font=bf) + F.px(16):
                d.text((bx0 + F.px(10), y + lh * 0.36), txt, font=bf, fill=(12, 12, 20))
    sx = x0 + (x1 - x0) * sweep / 10
    d.line([(sx, y0 - F.px(10)), (sx, y0 + n * lh)], fill=T.TEXT, width=max(1, F.px(3)))


def scene_reveal(img, F, spec, t):
    big = spec.get("big") or spec.get("heading") or ""
    sub = spec.get("sub") or ""
    k = ease(t * 2.5)
    d = ImageDraw.Draw(img)
    size = F.px(96 if len(big) < 22 else 76)
    f = T.font(T.FONT_SANS_BOLD, int(size * (0.85 + 0.15 * k)))
    lines = wrap(big, f, F.w - 2 * F.pad, d)
    y = F.h * 0.38 - len(lines) * f.size * 0.6
    for ln in lines:
        w = d.textlength(ln, font=f)
        d.text(((F.w - w) / 2, y), ln, font=f, fill=lerp_color(T.BG_TOP, T.TEXT, k))
        y += int(f.size * 1.15)
    if sub:
        heading(img, F, sub, y + F.px(30), size=42, color=T.CYAN, k=ease(seg(t, 0.3, 0.8)))


_SAFE_EXPR = re.compile(r"^(?:[\d\s.+\-*/(),x]|math\.(?:exp|log|log2|log10|sqrt|sin|cos|tanh|pi|e)|\*\*|abs|min|max)+$")


def _make_fn(expr):
    """Compile a curve expression in x. Only numbers, x, arithmetic and a few math functions are allowed."""
    expr = (expr or "").strip()
    if not expr or not _SAFE_EXPR.match(expr):
        return None
    code = compile(expr, "<plot>", "eval")
    return lambda x: eval(code, {"__builtins__": {}, "math": math, "abs": abs, "min": min, "max": max}, {"x": x})


def scene_plot(img, F, spec, t):
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    fns = [f for f in (_make_fn(spec.get("fn")), _make_fn(spec.get("fn2"))) if f]
    if not fns:
        return scene_reveal(img, F, {"big": spec.get("caption", "")}, t)
    xr = spec.get("x_range") or [-6, 6]
    xs = [xr[0] + (xr[1] - xr[0]) * i / 200 for i in range(201)]
    curves = []
    for f in fns:
        ys = []
        for x in xs:
            try:
                v = float(f(x))
                ys.append(v if math.isfinite(v) else None)
            except Exception:
                ys.append(None)
        curves.append(ys)
    vals = [v for c in curves for v in c if v is not None]
    yr = spec.get("y_range") or [min(vals + [0]), max(vals + [1])]
    if yr[1] - yr[0] < 1e-9:
        yr = [yr[0] - 1, yr[1] + 1]
    x0, x1 = F.pad + F.px(90), F.w - F.pad - F.px(20)
    y0, y1 = top + F.px(20), F.h - F.bottom - F.px(110)
    X = lambda x: x0 + (x - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)
    Y = lambda y: y1 - (y - yr[0]) / (yr[1] - yr[0]) * (y1 - y0)
    axis = (70, 70, 100)
    d.line([(x0, y1), (x1, y1)], fill=axis, width=max(1, F.px(3)))
    d.line([(x0, y0), (x0, y1)], fill=axis, width=max(1, F.px(3)))
    lf = T.font(T.FONT_MONO, F.px(24))
    for v, anchor in ((yr[0], y1), (yr[1], y0)):
        d.text((x0 - F.px(84), anchor - F.px(14)), f"{v:g}"[:6], font=lf, fill=T.MUTED)
    d.text((x1 - F.px(60), y1 + F.px(12)), f"{xr[1]:g}", font=lf, fill=T.MUTED)
    d.text((x0, y1 + F.px(12)), f"{xr[0]:g}", font=lf, fill=T.MUTED)
    if spec.get("x_label"):
        d.text(((x0 + x1) / 2 - F.px(60), y1 + F.px(40)), spec["x_label"][:24], font=lf, fill=T.MUTED)
    if spec.get("y_label"):
        d.text((x0 + F.px(14), y0 - F.px(6)), spec["y_label"][:24], font=lf, fill=T.MUTED)
    thr = spec.get("threshold")
    if isinstance(thr, (int, float)) and yr[0] <= thr <= yr[1]:
        k = ease(seg(t, 0.55, 0.75))
        yy = Y(thr)
        for xx in range(int(x0), int(x0 + (x1 - x0) * k), F.px(24)):
            d.line([(xx, yy), (xx + F.px(12), yy)], fill=T.AMBER, width=max(1, F.px(3)))
        if k > 0.9:
            d.text((x1 - F.px(160), yy - F.px(36)), f"y = {thr:g}", font=lf, fill=T.AMBER)
    draw_k = ease(seg(t, 0.05, 0.55))
    cols = [T.CYAN, T.VIOLET]
    labels = spec.get("labels") or []
    for ci, ys in enumerate(curves):
        upto = int(len(xs) * draw_k)
        pts = [(X(x), Y(max(yr[0], min(yr[1], y)))) for x, y in zip(xs[:upto], ys[:upto]) if y is not None]
        if len(pts) > 1:
            d.line(pts, fill=cols[ci], width=max(2, F.px(7)), joint="curve")
        if ci < len(labels) and labels[ci] and draw_k > 0.95:
            d.text((x1 - F.px(260), y0 + F.px(10) + ci * F.px(40)), "— " + labels[ci][:18], font=lf, fill=cols[ci])
    f0 = fns[0]
    pts = spec.get("points") or []
    for i, p in enumerate(pts[:6]):
        try:
            px_, lab = float(p[0]), str(p[1]) if len(p) > 1 else ""
            py_ = float(f0(px_))
        except Exception:
            continue
        k = ease(seg(t, 0.55 + i * 0.07, 0.7 + i * 0.07))
        if k <= 0:
            continue
        cx, cy = X(px_), Y(max(yr[0], min(yr[1], py_)))
        r = F.px(14) * k
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=T.TEXT, outline=T.CYAN, width=max(1, F.px(3)))
        if lab:
            tw = d.textlength(lab, font=lf)
            d.text((min(cx + F.px(18), x1 - tw), cy - F.px(46)), lab, font=lf, fill=T.TEXT)


def scene_metric(img, F, spec, t):
    """Self-explanatory KPI / Business & Engineering stat cards with animated accent bars."""
    top = _content_top(F, img, spec, t)
    d = ImageDraw.Draw(img)
    metrics = (spec.get("metrics") or [])[:4]
    if not metrics:
        return scene_bullets(img, F, spec, t)
    n = len(metrics)
    avail_h = F.h - top - F.bottom - F.px(30)
    gap = F.px(24)
    palette = [T.CYAN, T.AMBER, T.GREEN, T.VIOLET]
    if F.portrait or n <= 2:
        card_h = min(F.px(240), (avail_h - gap * max(0, n - 1)) // max(1, n))
        y0 = top + max(0, (avail_h - (card_h * n + gap * max(0, n - 1))) // 2)
        boxes = [(F.pad, y0 + i * (card_h + gap), F.w - F.pad, y0 + i * (card_h + gap) + card_h) for i in range(n)]
    else:
        cols = 2
        rows = (n + 1) // 2
        cw = (F.w - 2 * F.pad - gap) // cols
        ch = min(F.px(250), (avail_h - gap * max(0, rows - 1)) // max(1, rows))
        boxes = []
        for i in range(n):
            r, c = divmod(i, cols)
            x = F.pad + c * (cw + gap)
            y = top + r * (ch + gap)
            boxes.append((x, y, x + cw, y + ch))
    vf = T.font(T.FONT_SANS_BOLD, F.px(64 if F.portrait else 58))
    lf = T.font(T.FONT_SANS_BOLD, F.px(30))
    sf = T.font(T.FONT_SANS, F.px(26))
    for i, (box, m) in enumerate(zip(boxes, metrics)):
        k = ease(seg(t, 0.06 + i * 0.16, 0.38 + i * 0.16))
        if k <= 0:
            continue
        x0, y0, x1, y1 = box
        col = palette[i % len(palette)]
        rounded(d, box, F.px(22), fill=lerp_color(T.BG_TOP, T.SURFACE, k),
                outline=lerp_color(T.BG_TOP, col, k), width=max(2, F.px(3)))
        # Left accent bar
        d.rounded_rectangle([x0 + F.px(10), y0 + F.px(18), x0 + F.px(20), y1 - F.px(18)], radius=F.px(5),
                            fill=lerp_color(T.BG_TOP, col, k))
        val = str(m.get("value") or "")[:18]
        lab = str(m.get("label") or "")[:34]
        sub = str(m.get("sub") or "")[:48]
        d.text((x0 + F.px(42), y0 + F.px(20)), lab.upper(), font=lf, fill=lerp_color(T.BG_TOP, T.MUTED, k))
        d.text((x0 + F.px(42), y0 + F.px(62)), val, font=vf, fill=lerp_color(T.BG_TOP, col, k))
        if sub:
            d.text((x0 + F.px(42), y1 - F.px(46)), sub, font=sf, fill=lerp_color(T.BG_TOP, T.TEXT, k))


KINDS = {"plot": scene_plot, "title": scene_title, "code": scene_code, "output": scene_output, "bullets": scene_bullets,
         "compare": scene_compare, "trace": scene_trace, "flow": scene_flow, "timeline": scene_timeline,
         "reveal": scene_reveal, "metric": scene_metric}


# ---------- overlays ----------
# Option 4 PyMasters mark ("Modern FinTech Mobius P Ribbon"): continuous folded gradient ribbon forming a slanted P
# (indigo/violet -> electric cyan -> luminous emerald) with three ascending white mastery bars inside the bowl.
_MOBIUS_INNER = [(27, 64), (34, 33), (42, 20), (56, 15), (69, 19), (77, 30), (75, 44), (66, 55), (50, 57), (38, 57),
                 (42, 42), (48, 29), (58, 24), (67, 29), (68, 40), (60, 48), (35, 56)]
_MOBIUS_ARCH = [(25, 66), (32, 32), (38, 19), (52, 13), (67, 15), (76, 21), (80, 32), (73, 22), (61, 19),
                (47, 20), (39, 28), (35, 41), (29, 63)]
_MOBIUS_SWEEP = [(67, 15), (77, 20), (82, 32), (80, 46), (74, 58), (61, 64), (45, 65), (33, 69), (22, 86),
                 (34, 84), (39, 73), (49, 69), (65, 66), (76, 59), (81, 45), (82, 31), (76, 19)]
_MOBIUS_TAIL = [(22, 86), (27, 74), (35, 67), (44, 65), (39, 73), (34, 84)]
_MOBIUS_BARS = [
    [(44, 52), (49.5, 51.4), (53, 41), (47.5, 41.6)],
    [(52, 51.1), (57.5, 50.5), (63, 34), (57.5, 34.6)],
    [(60, 50.2), (65.5, 49.6), (73, 27), (67.5, 27.6)],
]
_BADGE_CACHE = {}


def brand_badge(size):
    """Dark navy rounded badge with the Option 4 Modern FinTech Mobius 'P' Ribbon mark + 3 ascending white mastery bars,
    as RGBA. Uses the high-resolution master mark asset (with vector polygon fallback); cached per size."""
    if size in _BADGE_CACHE:
        return _BADGE_CACHE[size]
    from pathlib import Path
    mark_path = Path(__file__).resolve().parent.parent / "assets" / "pymasters_logo_opt4_mark.png"
    S = 4
    n = size * S
    k = n / 100
    if mark_path.exists():
        body = Image.open(mark_path).convert("RGBA").resize((n, n), Image.LANCZOS)
        d = ImageDraw.Draw(body)
        d.rounded_rectangle([1.5 * k, 1.5 * k, n - 1.5 * k, n - 1.5 * k], radius=22.5 * k,
                            outline=(34, 211, 238, 175), width=max(1, int(2.6 * k)))
    else:
        body = Image.new("RGBA", (n, n), (7, 11, 24, 255))
        d = ImageDraw.Draw(body)
        d.rounded_rectangle([1.5 * k, 1.5 * k, n - 1.5 * k, n - 1.5 * k], radius=22.5 * k,
                            outline=(34, 211, 238, 150), width=max(1, int(2.6 * k)))
        d.polygon([(x * k, y * k) for x, y in _MOBIUS_INNER], fill=(30, 58, 138, 255))
        d.polygon([(x * k, y * k) for x, y in _MOBIUS_ARCH], fill=(99, 102, 241, 255))
        d.polygon([(x * k, y * k) for x, y in _MOBIUS_SWEEP], fill=(34, 211, 238, 255))
        d.polygon([(x * k, y * k) for x, y in _MOBIUS_TAIL], fill=(16, 185, 129, 255))
        for i, bar in enumerate(_MOBIUS_BARS):
            d.polygon([(x * k, y * k) for x, y in bar], fill=(255, 255, 255, 225 + 15 * i))
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=24 * k, fill=255)
    body.putalpha(ImageChops.multiply(body.getchannel("A"), mask))
    _BADGE_CACHE[size] = body.resize((size, size), Image.LANCZOS)
    return _BADGE_CACHE[size]


def chrome(img, F, progress, brand=True):
    d = ImageDraw.Draw(img)
    if brand:
        f = T.font(T.FONT_SANS_BOLD, F.px(30))
        badge = brand_badge(F.px(44))
        img.paste(badge, (F.pad, F.px(34)), badge)
        x = F.pad + F.px(58)
        d.text((x, F.px(38)), "Py", font=f, fill=T.TEXT)
        d.text((x + d.textlength("Py", font=f), F.px(38)), "Masters", font=f, fill=(165, 243, 252))
    d.rectangle([0, 0, int(F.w * progress), F.px(8)], fill=T.CYAN)


_GROUP_CACHE = {}


def _caption_groups(words, f, max_w, d):
    """Split words into on-screen phrases: <= 4 words, never wider than the screen, breaking after punctuation."""
    key = (id(words), f.size, max_w)
    if key in _GROUP_CACHE:
        return _GROUP_CACHE[key]
    groups, start, width = [], 0, 0.0
    for i, w in enumerate(words):
        ww = d.textlength(w[0] + " ", font=f)
        if i > start and (width + ww > max_w or i - start >= 4):
            groups.append((start, i)); start, width = i, 0.0
        width += ww
        if w[0][-1:] in ".?!,:;":
            groups.append((start, i + 1)); start, width = i + 1, 0.0
    if start < len(words):
        groups.append((start, len(words)))
    _GROUP_CACHE[key] = groups
    return groups


def karaoke(img, F, words, now):
    """Burned-in captions: a short phrase around the current word, the current word highlighted."""
    if not words:
        return
    cur = next((i for i, w in enumerate(words) if w[1] <= now < w[2] + 0.25), None)
    if cur is None:
        return
    d = ImageDraw.Draw(img)
    f = T.font(T.FONT_SANS_BOLD, F.px(64 if F.portrait else 48))
    groups = _caption_groups(words, f, F.w - 2 * F.pad - F.px(60), d)
    start, end = next(((a, b) for a, b in groups if a <= cur < b), (cur, cur + 1))
    texts = [w[0] for w in words[start:end]]
    total = sum(d.textlength(x + " ", font=f) for x in texts)
    y = F.h * (0.835 if F.portrait else 0.88)
    x = (F.w - total) / 2
    bx = [x - F.px(28), y - F.px(18), x + total + F.px(14), y + f.size * 1.25]
    d.rounded_rectangle(bx, radius=F.px(22), fill=(6, 6, 12))
    for i, w in enumerate(texts):
        active = start + i == cur
        d.text((x, y), w, font=f, fill=T.AMBER if active else T.TEXT)
        x += d.textlength(w + " ", font=f)


def caption_bar(img, F, text, k):
    if not text:
        return
    d = ImageDraw.Draw(img)
    f = T.font(T.FONT_SANS, F.px(40))
    lines = wrap(text, f, F.w - 2 * F.pad - F.px(40), d)[:2]
    h = len(lines) * int(f.size * 1.3) + F.px(40)
    y = F.h - F.pad - h
    d.rounded_rectangle([F.pad, y, F.w - F.pad, y + h], radius=F.px(20),
                        fill=lerp_color(T.BG_BOTTOM, (6, 6, 12), ease(k)))
    for i, ln in enumerate(lines):
        w = d.textlength(ln, font=f)
        d.text(((F.w - w) / 2, y + F.px(20) + i * int(f.size * 1.3)), ln, font=f,
               fill=lerp_color(T.BG_BOTTOM, T.TEXT, ease(k)))


def note_banner(img, F, text, k):
    """Self-explanatory callout strip shown above karaoke captions on YouTube Shorts & Tutorials so any frame
    makes complete sense even on mute."""
    if not text:
        return
    d = ImageDraw.Draw(img)
    f = T.font(T.FONT_SANS_BOLD, F.px(30 if F.portrait else 28))
    lines = wrap(text, f, F.w - 2 * F.pad - F.px(60), d)[:2]
    h = len(lines) * int(f.size * 1.28) + F.px(26)
    y = F.h - F.bottom + F.px(4)
    rounded(d, [F.pad, y, F.w - F.pad, y + h], F.px(16),
            fill=lerp_color(T.BG_BOTTOM, (16, 24, 46), ease(k)),
            outline=lerp_color(T.BG_BOTTOM, T.CYAN, ease(k)), width=max(1, F.px(2)))
    for i, ln in enumerate(lines):
        w = d.textlength(ln, font=f)
        d.text(((F.w - w) / 2, y + F.px(12) + i * int(f.size * 1.28)), ln, font=f,
               fill=lerp_color(T.BG_BOTTOM, T.CYAN if i == 0 else T.TEXT, ease(k)))


def draw_frame(F, spec, t, progress, words=None, now=0.0, caption=None, caption_k=1.0):
    img = F.bg.copy()
    KINDS.get(spec.get("type") or spec.get("kind"), scene_bullets)(img, F, spec, t)
    chrome(img, F, progress)
    if words:
        if spec.get("note"):
            note_banner(img, F, spec.get("note"), seg(t, 0.05, 0.35))
        karaoke(img, F, words, now)
    elif caption:
        caption_bar(img, F, caption, caption_k)
    return img
