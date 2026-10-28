"""Stack Explainer renderer — turns a stack_explainer.py spec into a short
looping MP4, styled after real "X, explained" LinkedIn infographics (clean
white background, one bold color per numbered tier, a flat icon, a short
colored chip, a tight description) with an animated connector — a line that
draws downward plus a traveling pulse dot — between every tier, so the
*flow* between steps is the visible, animated thing (founder feedback,
2026-10-28: the reference posts' key quality is a clearly animated flow
between steps, not just boxes fading in independently).

Pipeline: populate an HTML/CSS/JS template -> headless Chromium (Playwright)
renders it and is screenshotted at a fixed cadence while its own CSS
animation plays in real time -> ffmpeg assembles the PNG frames into an
H.264 MP4 (reuses find_ffmpeg()/_run() from generate_videos.py).

Degrades gracefully: if Playwright (or its Chromium browser) is unavailable,
render_stack_video() returns {"status": "skipped: playwright missing"} and
the caller falls back to the existing static Pillow banner. Never raises.
"""

import html
import os
import shutil
import tempfile

from pipeline.video.generate_videos import find_ffmpeg, _run
from pipeline.utils.logger import get_logger

log = get_logger("actor.stack_render")

CANVAS_W, CANVAS_H = 1080, 1350
FPS = 12

LEAD_IN = 1.0          # title/subtitle fade-in
TIER_INTERVAL = 1.0    # seconds between successive tier reveals
TIER_SETTLE = 1.0      # pause after the last tier settles before the takeaway/footer
HOLD_TAIL = 2.0         # static hold with takeaway/footer visible

CONNECTOR_DRAW = 0.35   # connector line draw duration
CONNECTOR_LEAD = 0.30   # tier box starts revealing this long after its connector starts
PULSE_TRAVEL = 0.45     # dot travel duration down the connector

TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{{margin:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}}
  html,body{{width:{w}px;height:{h}px;overflow:hidden;background:#ffffff;}}
  .stage{{width:{w}px;height:{h}px;background:#ffffff;padding:56px 64px 40px;
    display:flex;flex-direction:column;position:relative;}}
  .brand{{display:flex;align-items:center;gap:10px;opacity:0;animation:fadeIn 0.5s ease forwards;}}
  .brand .mark{{width:28px;height:28px;border-radius:7px;
    background:linear-gradient(135deg,#2563eb,#7c3aed);}}
  .brand .word{{font-weight:800;font-size:19px;letter-spacing:1.5px;color:#0f172a;}}
  h1{{color:#0f172a;font-size:40px;font-weight:800;line-height:1.14;margin-top:18px;
    opacity:0;animation:fadeUp 0.6s ease 0.15s forwards;max-width:940px;}}
  .subtitle{{color:#475569;font-size:21px;margin-top:10px;max-width:920px;
    opacity:0;animation:fadeUp 0.6s ease 0.35s forwards;}}
  .stack{{margin-top:26px;display:flex;flex-direction:column;}}
  .connector{{height:26px;display:flex;align-items:center;padding-left:28px;position:relative;}}
  .connector .line{{width:4px;height:0;background:var(--c);border-radius:2px;
    transform-origin:top;animation:drawLine {cd}s ease forwards;animation-delay:{delay}s;}}
  .connector .pulse{{position:absolute;left:21px;top:0;width:10px;height:10px;border-radius:50%;
    background:var(--c);opacity:0;animation:pulseTravel {pd}s ease forwards;
    animation-delay:{pulse_delay}s;}}
  .tier{{opacity:0;transform:translateY(16px);animation:fadeUp 0.5s ease forwards;
    animation-delay:{reveal}s;border-radius:16px;background:#f8fafc;
    border:1.5px solid #e2e8f0;padding:16px 20px;display:flex;align-items:center;gap:16px;}}
  .tier .num{{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--c);
    color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;}}
  .tier .icon{{flex:0 0 auto;width:48px;height:48px;border-radius:12px;background:#fff;
    border:1.5px solid var(--c);font-size:24px;display:flex;align-items:center;justify-content:center;}}
  .tier .body{{min-width:0;flex:1;}}
  .tier .chip{{display:inline-block;background:var(--c);color:#fff;font-weight:700;
    font-size:15px;border-radius:7px;padding:3px 11px;margin-bottom:6px;}}
  .tier .desc{{color:#1e293b;font-size:16.5px;line-height:1.32;font-weight:500;}}
  .takeaway{{margin-top:22px;padding-top:18px;border-top:2px solid #e2e8f0;color:#0f172a;
    font-size:20px;font-weight:700;opacity:0;animation:fadeUp 0.5s ease forwards;
    animation-delay:{takeaway_delay}s;}}
  .footer{{display:flex;justify-content:space-between;margin-top:14px;font-weight:700;
    font-size:17px;opacity:0;animation:fadeIn 0.5s ease forwards;animation-delay:{takeaway_delay}s;}}
  .footer .site{{color:#2563eb;}}
  .footer .tags{{color:#64748b;}}
  @keyframes fadeIn{{to{{opacity:1}}}}
  @keyframes fadeUp{{from{{opacity:0;transform:translateY(16px)}}to{{opacity:1;transform:translateY(0)}}}}
  @keyframes drawLine{{to{{height:100%}}}}
  @keyframes pulseTravel{{0%{{opacity:1;top:0}}85%{{opacity:1}}100%{{opacity:0;top:100%}}}}
</style></head>
<body>
<div class="stage">
  <div class="brand"><div class="mark"></div><div class="word">PYMASTERS</div></div>
  <h1>{title}</h1>
  <div class="subtitle">{subtitle}</div>
  <div class="stack">
    {rows}
  </div>
  <div class="takeaway">{takeaway}</div>
  <div class="footer"><span class="site">pymasters.net</span><span class="tags">{hashtags}</span></div>
</div>
</body></html>"""

TIER_HTML = """<div class="connector" style="--c:{color}">
  <div class="line" style="--cd:{cd};animation-delay:{conn_delay}s"></div>
  <div class="pulse" style="animation-delay:{pulse_delay}s"></div>
</div>
<div class="tier" style="--c:{color};animation-delay:{reveal_delay}s">
  <div class="num">{number}</div>
  <div class="icon">{icon}</div>
  <div class="body">
    <div class="chip">{chip}</div>
    <div class="desc">{description}</div>
  </div>
</div>"""


def _build_html(stack: dict) -> tuple[str, float]:
    """Populate the template from a validated stack_explainer spec.

    Returns (html_string, total_duration_seconds).
    """
    layers = stack["layers"]
    rows = []
    t = LEAD_IN
    for i, layer in enumerate(layers):
        conn_delay = t
        reveal_delay = t + CONNECTOR_LEAD
        pulse_delay = t + CONNECTOR_DRAW * 0.5
        if i == 0:
            # First tier has no connector above it — reveal right after lead-in.
            rows.append(f'<div class="tier" style="--c:{layer["color"]};'
                        f'animation-delay:{LEAD_IN}s">'
                        f'<div class="num">{layer["number"]}</div>'
                        f'<div class="icon">{html.escape(layer["icon"])}</div>'
                        f'<div class="body"><div class="chip">{html.escape(layer["chip"])}</div>'
                        f'<div class="desc">{html.escape(layer["description"])}</div></div></div>')
            t = LEAD_IN + TIER_INTERVAL
            continue
        rows.append(TIER_HTML.format(
            color=layer["color"], cd=CONNECTOR_DRAW, conn_delay=conn_delay,
            pulse_delay=pulse_delay, pd=PULSE_TRAVEL, reveal_delay=reveal_delay,
            number=layer["number"], icon=html.escape(layer["icon"]),
            chip=html.escape(layer["chip"]), description=html.escape(layer["description"]),
        ))
        t += TIER_INTERVAL

    last_reveal_end = LEAD_IN + (len(layers) - 1) * TIER_INTERVAL + 0.5
    takeaway_delay = last_reveal_end + TIER_SETTLE
    total_duration = takeaway_delay + HOLD_TAIL

    page = TEMPLATE.format(
        w=CANVAS_W, h=CANVAS_H,
        title=html.escape(stack["title"]), subtitle=html.escape(stack["subtitle"]),
        rows="\n".join(rows), takeaway=html.escape(stack["takeaway"]),
        hashtags=html.escape(stack["hashtags"]),
        takeaway_delay=round(takeaway_delay, 2),
        cd=CONNECTOR_DRAW, delay=0, pd=PULSE_TRAVEL, pulse_delay=0,  # unused top-level placeholders
        reveal=0,
    )
    return page, total_duration


def playwright_available() -> bool:
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


def _capture_frames(html_path: str, duration: float, out_dir: str) -> list[str]:
    """Load html_path headlessly and screenshot it at FPS while its CSS
    animation plays in real time. Returns ordered frame paths."""
    from playwright.sync_api import sync_playwright

    frame_paths = []
    frame_interval = 1.0 / FPS
    n_frames = int(duration * FPS)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": CANVAS_W, "height": CANVAS_H})
        page.goto(f"file:///{html_path}")
        import time
        start = time.monotonic()
        for i in range(n_frames):
            target = start + i * frame_interval
            now = time.monotonic()
            if target > now:
                time.sleep(target - now)
            fp = os.path.join(out_dir, f"frame_{i:04d}.png")
            page.screenshot(path=fp)
            frame_paths.append(fp)
        browser.close()
    return frame_paths


def _encode_mp4(frame_dir: str, out_path: str) -> None:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found")
    _run([ffmpeg, "-y", "-framerate", str(FPS),
          "-i", os.path.join(frame_dir, "frame_%04d.png"),
          "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
          "-movflags", "+faststart", out_path])


def render_stack_video(stack: dict, out_path: str) -> dict:
    """Render a validated stack_explainer spec to an MP4 at out_path.

    Returns {"status": "rendered", "path": out_path, "duration": float} on
    success, or {"status": "skipped: <reason>"} / {"status": "error: <reason>"}
    on any failure — never raises.
    """
    if not playwright_available():
        return {"status": "skipped: playwright missing (pip install playwright "
                           "&& playwright install chromium)"}
    if not find_ffmpeg():
        return {"status": "skipped: ffmpeg missing"}

    work_dir = tempfile.mkdtemp(prefix="pm_stack_render_")
    try:
        page_html, duration = _build_html(stack)
        html_path = os.path.join(work_dir, "stage.html").replace("\\", "/")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(page_html)

        frame_dir = os.path.join(work_dir, "frames")
        os.makedirs(frame_dir, exist_ok=True)
        _capture_frames(html_path, duration, frame_dir)

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        _encode_mp4(frame_dir, out_path)
        log.info(f"Stack explainer video rendered: {out_path} ({duration:.1f}s)")
        return {"status": "rendered", "path": out_path, "duration": duration}
    except Exception as e:
        log.error(f"Stack video render failed: {e}")
        return {"status": f"error: {e}"}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    from pipeline.actors.stack_explainer import generate_stack
    demo_stack = generate_stack(
        "Sentence embeddings with all-MiniLM-L6-v2",
        context="Fast local semantic search with a 22M-param model, the default encoder in many RAG pipelines.",
    )
    if not demo_stack:
        print("content generation failed")
    else:
        result = render_stack_video(demo_stack, "C:/Users/muthu.MSG/AppData/Local/Temp/pm_stack_demo.mp4")
        print(result)
