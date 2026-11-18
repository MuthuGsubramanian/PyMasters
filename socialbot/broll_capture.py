"""Headless Playwright 1080p60 'Watch It Run' B-roll capture for YouTube explainers."""

from __future__ import annotations

import html
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from socialbot import config


def build_trace_html(
    title: str,
    code_lines: list[str],
    steps: list[dict[str, Any]],
    stdout_text: str = "",
    caption: str = "",
) -> str:
    """Build a standalone high-contrast HTML scene mirroring PyMasters Watch-It-Run trace view."""
    code_json = json.dumps(code_lines)
    steps_json = json.dumps(steps or [{"line": 1, "vars": {}, "explain": caption or "Step 1"}])
    esc_title = html.escape(title or "Watch It Run — Python Trace")
    esc_stdout = html.escape(stdout_text or "")
    esc_caption = html.escape(caption or "Every line runs top to bottom while Python updates memory.")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    width: 1920px; height: 1080px; overflow: hidden;
    background: #0b1020; color: #f8fafc;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    padding: 48px 56px; display: flex; flex-direction: column; gap: 28px;
  }}
  header {{ display: flex; justify-content: space-between; align-items: center; }}
  .badge {{ background: rgba(99,102,241,.22); color: #a5b4fc; border: 1px solid rgba(129,140,248,.4); padding: 8px 18px; border-radius: 999px; font-size: 20px; font-weight: 700; }}
  h1 {{ font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }}
  .grid {{ display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 32px; flex: 1; min-height: 0; }}
  .panel {{ background: #131b31; border: 1px solid #263253; border-radius: 24px; padding: 28px; display: flex; flex-direction: column; gap: 16px; }}
  .panel-title {{ font-size: 20px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 700; }}
  .code-line {{ font-family: 'JetBrains Mono', monospace; font-size: 27px; line-height: 1.55; padding: 6px 14px; border-radius: 10px; display: flex; gap: 18px; }}
  .code-line.active {{ background: rgba(56,189,248,.22); border-left: 5px solid #38bdf8; color: #ffffff; }}
  .ln {{ color: #64748b; width: 36px; text-align: right; user-select: none; }}
  .vars {{ display: flex; flex-direction: column; gap: 14px; }}
  .var-row {{ background: #0d1426; border: 1px solid #23304f; border-radius: 14px; padding: 14px 18px; display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 24px; }}
  .var-name {{ color: #7dd3fc; font-weight: 700; }}
  .var-val {{ color: #86efac; }}
  .stdout {{ margin-top: auto; background: #070b15; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; font-family: 'JetBrains Mono', monospace; font-size: 22px; color: #a7f3d0; white-space: pre-wrap; }}
  .explain-bar {{ background: #17213c; border: 1px solid #334155; border-radius: 18px; padding: 20px 26px; font-size: 26px; color: #e2e8f0; }}
</style>
</head>
<body>
  <header>
    <div>
      <span class="badge">PyMasters · Watch It Run</span>
      <h1 style="margin-top:12px;">{esc_title}</h1>
    </div>
    <span class="badge" id="step-pill">Step 1</span>
  </header>
  <div class="grid">
    <div class="panel">
      <div class="panel-title">Python Source Code</div>
      <div id="code-box"></div>
    </div>
    <div class="panel">
      <div class="panel-title">Live Variables &amp; Memory</div>
      <div class="vars" id="vars-box"></div>
      <div class="stdout" id="stdout-box">&gt;&gt;&gt; Output:\n{esc_stdout or '(running...)'}</div>
    </div>
  </div>
  <div class="explain-bar" id="explain-box">{esc_caption}</div>
<script>
const CODE = {code_json};
const STEPS = {steps_json};
window.renderTraceStep = function(idx) {{
  const s = STEPS[Math.min(idx, STEPS.length - 1)] || STEPS[0];
  document.getElementById('step-pill').textContent = 'Step ' + (idx + 1) + ' / ' + STEPS.length;
  const codeBox = document.getElementById('code-box');
  codeBox.innerHTML = CODE.map((line, i) => {{
    const active = (i + 1) === Number(s.line || 1) ? ' active' : '';
    return '<div class="code-line' + active + '"><span class="ln">' + (i + 1) + '</span><span>' +
      line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span></div>';
  }}).join('');
  const varsBox = document.getElementById('vars-box');
  const entries = Object.entries(s.vars || {{}});
  varsBox.innerHTML = entries.length
    ? entries.map(([k, v]) => '<div class="var-row"><span class="var-name">' + k + '</span><span class="var-val">' + String(v) + '</span></div>').join('')
    : '<div class="var-row"><span class="var-name">status</span><span class="var-val">initialized</span></div>';
  if (s.explain) document.getElementById('explain-box').textContent = s.explain;
}};
window.renderTraceStep(0);
</script>
</body>
</html>"""


def capture_watch_it_run_broll(
    title: str,
    code_lines: list[str],
    steps: list[dict[str, Any]],
    out_mp4: Path,
    duration_s: float = 12.0,
    stdout_text: str = "",
    caption: str = "",
    fps: int = 60,
    width: int = 1920,
    height: int = 1080,
) -> Path:
    """Capture 1080p60 MP4 B-roll by stepping Playwright HTML scenes into PNG frames and encoding at 60fps."""
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    pw_python = Path(config.PLAYWRIGHT_PYTHON)
    if not pw_python.exists():
        raise RuntimeError(f"Playwright Python interpreter not found at {pw_python}")

    html_doc = build_trace_html(title, code_lines, steps, stdout_text=stdout_text, caption=caption)
    step_list = steps or [{"line": 1, "vars": {}, "explain": caption}]
    per_step_s = max(duration_s / max(len(step_list), 1), 1.0)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        html_path = tmp_dir / "trace.html"
        html_path.write_text(html_doc, encoding="utf-8")

        runner_code = (
            "from pathlib import Path\n"
            "from playwright.sync_api import sync_playwright\n"
            f"url = 'file://{html_path}'\n"
            f"count = {len(step_list)}\n"
            f"out_dir = {str(tmp_dir)!r}\n"
            "with sync_playwright() as p:\n"
            "    try:\n"
            "        b = p.chromium.launch(headless=True)\n"
            "    except Exception:\n"
            "        shells = sorted(Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell'))\n"
            "        if not shells:\n"
            "            raise\n"
            "        b = p.chromium.launch(headless=True, executable_path=str(shells[-1]))\n"
            f"    page = b.new_page(viewport={{'width': {width}, 'height': {height}}})\n"
            "    page.goto(url)\n"
            "    for i in range(count):\n"
            "        page.evaluate(f'window.renderTraceStep({i})')\n"
            "        page.screenshot(path=f'{out_dir}/step_{i:03d}.png')\n"
            "    b.close()\n"
        )
        subprocess.run([str(pw_python), "-c", runner_code], check=True, timeout=120)

        # Build concat file so FFmpeg produces clean 1080p60 H.264 stream with low CPU load
        concat_txt = tmp_dir / "frames.txt"
        lines = []
        for i in range(len(step_list)):
            lines.append(f"file '{tmp_dir / f'step_{i:03d}.png'}'")
            lines.append(f"duration {per_step_s:.3f}")
        lines.append(f"file '{tmp_dir / f'step_{len(step_list) - 1:03d}.png'}'")
        concat_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_txt),
                "-vf",
                f"fps={fps},scale={width}:{height},format=yuv420p",
                "-threads",
                os.getenv("PMSOCIAL_FFMPEG_THREADS", "2"),
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
            timeout=120,
        )
    return out_mp4
