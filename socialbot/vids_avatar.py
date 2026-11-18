"""Broadcast-grade Google Vids (Veo 3 Realistic) AI Presenter generator + strict video quality gate.

Drives Google Vids (`docs.google.com/videos`) in Eighty Browser over CDP (`:9222`) on the Google AI Ultra
session (`$0.00` marginal cost) to render genuine `1280x720` (~1.1-2.9 Mbps H.264 + 48 kHz AAC) full-motion,
lip-synced studio presenter MP4 clips, and enforces `verify_broadcast_presenter_mp4` so degraded or static
presenter footage can NEVER be published."""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from socialbot import config, store

log = logging.getLogger("socialbot.vids_avatar")

DEFAULT_STUDIO_DOC_ID = "1qZiaGk_bjQhpw4b1nJhoiNP-xj6EVy1gi4_h5iCGdfw"


class PresenterQualityError(RuntimeError):
    """Raised when presenter video generation fails or violates broadcast quality checks."""


def spoken_script_for_vids(segments: list[dict]) -> str:
    """Format Short segments into natural spoken text for Google Vids Veo lip-sync."""
    cleaned = []
    for seg in segments:
        txt = (seg.get("narration") or "").strip()
        if not txt:
            continue
        txt = re.sub(r"https?://", "", txt)
        txt = re.sub(r"\bpymasters\.net\b", "pymasters dot net", txt, flags=re.I)
        txt = re.sub(r"\s+", " ", txt).strip()
        if txt[-1] not in ".!?":
            txt += "."
        cleaned.append(txt)
    return " ".join(cleaned)


def verify_broadcast_presenter_mp4(mp4_path: Path, expected_min_s: float = 6.0) -> dict:
    """Hard quality gate: verify zero decode errors, HD resolution, audio stream, real inter-frame motion,
    and optical sharpness before any presenter clip is accepted."""
    mp4_path = Path(mp4_path)
    if not mp4_path.is_file() or mp4_path.stat().st_size < 150_000:
        raise PresenterQualityError(f"Presenter MP4 missing or too small: {mp4_path}")

    threads = os.getenv("PMSOCIAL_FFMPEG_THREADS", "2")
    dec = subprocess.run(
        ["ffmpeg", "-threads", threads, "-v", "error", "-i", str(mp4_path), "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if dec.returncode != 0 or dec.stderr.strip():
        raise PresenterQualityError(f"Presenter MP4 failed FFmpeg decode check: {dec.stderr[:400]}")

    pr = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,bit_rate:stream=codec_type,codec_name,width,height,sample_rate",
            "-of",
            "json",
            str(mp4_path),
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    meta = json.loads(pr.stdout)
    streams = meta.get("streams") or []
    v_stream = next((s for s in streams if s.get("codec_type") == "video" or s.get("width")), None)
    a_stream = next((s for s in streams if s.get("codec_type") == "audio" or s.get("sample_rate")), None)
    if not v_stream or not a_stream:
        raise PresenterQualityError(f"Presenter MP4 missing video or audio stream: {streams}")

    width = int(v_stream.get("width") or 0)
    height = int(v_stream.get("height") or 0)
    if width < 1280 or height < 720:
        raise PresenterQualityError(f"Presenter MP4 resolution {width}x{height} below 1280x720 HD standard")

    fmt = meta.get("format") or {}
    dur = float(fmt.get("duration") or 0.0)
    bitrate = int(fmt.get("bit_rate") or 0)
    if dur < expected_min_s:
        raise PresenterQualityError(f"Presenter MP4 duration {dur:.2f}s shorter than minimum {expected_min_s:.2f}s")
    if bitrate and bitrate < 650_000:
        raise PresenterQualityError(f"Presenter MP4 bitrate {bitrate} bps below broadcast floor (650 kbps)")

    # Sample 4 frames across clip to prove genuine human motion & optical sharpness (never static/blurry)
    frames_arr = []
    with tempfile.TemporaryDirectory() as tmp:
        for idx, frac in enumerate((0.15, 0.40, 0.65, 0.85)):
            ts = max(0.2, min(dur - 0.2, dur * frac))
            out_png = Path(tmp) / f"f_{idx}.png"
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{ts:.2f}", "-i", str(mp4_path), "-frames:v", "1", str(out_png)],
                check=True,
                timeout=30,
            )
            arr = np.asarray(Image.open(out_png).convert("L"), dtype=np.float32)
            frames_arr.append(arr)

    motion_diffs = [
        float(np.mean(np.abs(frames_arr[i] - frames_arr[j])))
        for i in range(len(frames_arr))
        for j in range(i + 1, len(frames_arr))
    ]
    max_motion = max(motion_diffs) if motion_diffs else 0.0
    if max_motion < 1.2:
        raise PresenterQualityError(f"Presenter MP4 appears static/frozen (max frame delta {max_motion:.2f} < 1.2)")

    h0, h1 = int(height * 0.15), int(height * 0.80)
    w0, w1 = int(width * 0.28), int(width * 0.72)
    roi = frames_arr[1][h0:h1, w0:w1]
    gx = np.abs(np.diff(roi, axis=1))
    gy = np.abs(np.diff(roi, axis=0))
    sharpness = float(np.mean(gx) + np.mean(gy))
    if sharpness < 5.5:
        raise PresenterQualityError(f"Presenter MP4 face ROI too blurry (sharpness {sharpness:.2f} < 5.5)")

    return {
        "width": width,
        "height": height,
        "duration_s": round(dur, 3),
        "bitrate_bps": bitrate,
        "max_motion": round(max_motion, 2),
        "sharpness": round(sharpness, 2),
    }


_PLAYWRIGHT_RUNNER = r'''
import json, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

cfg = json.loads(sys.argv[1])
cdp_url = cfg["cdp_url"]
doc_id_file = Path(cfg["doc_id_file"])
avatar_name = cfg["avatar_name"]
script_text = cfg["script_text"]
out_mp4 = Path(cfg["out_mp4"])
timeout_s = float(cfg["timeout_s"])
expected_min_s = float(cfg["expected_min_s"])

doc_id = doc_id_file.read_text().strip() if doc_id_file.is_file() else cfg["default_doc_id"]

def _vid_id(url: str) -> str:
    m = re.search(r"(?:driveid=|id=|c=)([^&]+)", url or "")
    return m.group(1) if m else (url or "")

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(cdp_url)
    ctx = b.contexts[0]
    pg = ctx.new_page()
    pg.set_viewport_size({"width": 1440, "height": 900})

    try:
        vid_url = f"https://docs.google.com/videos/d/{doc_id}/edit"
        pg.goto(vid_url, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(6000)
        if "/videos/d/" not in pg.url or "Page not found" in pg.title():
            pg.goto("https://docs.google.com/videos/create", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(7000)
            m = pg.url.split("/videos/d/")
            if len(m) > 1:
                doc_id = m[1].split("/")[0]
                doc_id_file.parent.mkdir(parents=True, exist_ok=True)
                doc_id_file.write_text(doc_id)

        pg.keyboard.press("Escape")
        pg.wait_for_timeout(700)

        # Clear any existing objects on the canvas so the scene starts clean
        pg.mouse.click(480, 420)
        pg.wait_for_timeout(250)
        pg.keyboard.press("Control+A")
        pg.wait_for_timeout(200)
        pg.keyboard.press("Delete")
        pg.wait_for_timeout(800)

        # Record any pre-existing video IDs before starting
        pre_vids = pg.evaluate("""() => Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src || '')""")
        pre_ids = {_vid_id(u) for u in pre_vids if u}

        pg.evaluate("""() => {
            const b = document.querySelector('#content-library-rail-avatars-element');
            if (b) b.click();
        }""")
        pg.wait_for_timeout(2200)

        # Cancel any stale preview state
        pg.evaluate("""() => {
            const c = Array.from(document.querySelectorAll('button, [role=button]')).find(
                e => (e.innerText || '').trim() === 'Cancel' && e.getBoundingClientRect().x > 950
            );
            if (c) c.click();
        }""")
        pg.wait_for_timeout(600)

        # Ensure desired Realistic studio avatar (e.g. William) is active
        panel_txt = pg.evaluate("""() => {
            const p = document.querySelector('[aria-label="AI avatar"]');
            return p ? p.innerText : '';
        }""")
        if avatar_name not in panel_txt:
            pg.evaluate("""() => {
                const btn = document.querySelector('[aria-label="Change the avatar"]');
                if (btn) btn.click();
            }""")
            pg.wait_for_timeout(2200)
            pos = pg.evaluate("""(name) => {
                const leaf = Array.from(document.querySelectorAll('*')).find(
                    e => e.children.length === 0 && (e.innerText || '').trim() === name
                );
                if (!leaf) return null;
                let card = leaf;
                while (card.parentElement && card.getBoundingClientRect().height < 80) {
                    card = card.parentElement;
                }
                const r = card.getBoundingClientRect();
                return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
            }""", avatar_name)
            if not pos:
                raise RuntimeError(f"Avatar '{avatar_name}' not found in Google Vids selector")
            pg.mouse.click(pos["x"], pos["y"])
            pg.wait_for_timeout(700)
            sel_pos = pg.evaluate("""() => {
                const sel = Array.from(document.querySelectorAll('button, [role=button]')).find(
                    e => (e.innerText || '').trim() === 'Select' && e.getBoundingClientRect().width > 20
                );
                if (!sel) return null;
                const r = sel.getBoundingClientRect();
                return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
            }""")
            if sel_pos:
                pg.mouse.click(sel_pos["x"], sel_pos["y"])
                pg.wait_for_timeout(1600)

        # Enter spoken script
        srect = pg.evaluate("""() => {
            const f = document.querySelector('[aria-label="Scripts"]');
            return f ? f.getBoundingClientRect().toJSON() : null;
        }""")
        if not srect:
            raise RuntimeError("Google Vids [aria-label='Scripts'] editor not found")
        pg.mouse.click(int(srect["x"] + 90), int(srect["y"] + 85))
        pg.wait_for_timeout(350)
        pg.keyboard.press("Control+A")
        pg.keyboard.press("Backspace")
        pg.wait_for_timeout(250)
        pg.keyboard.insert_text(script_text)
        pg.wait_for_timeout(1500)

        # Click Preview (or Update if shown)
        prev_pos = pg.evaluate("""() => {
            const b = Array.from(document.querySelectorAll('button, [role=button]')).find(
                e => /^(Preview|Update)$/i.test((e.innerText || '').trim()) && e.getBoundingClientRect().x > 950 && !(e.disabled || e.getAttribute('aria-disabled') === 'true')
            );
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
        }""")
        if not prev_pos:
            raise RuntimeError("Google Vids Preview button unavailable or disabled")
        pg.mouse.click(prev_pos["x"], prev_pos["y"])

        # Wait for Generate (Veo Lip-Sync) button, click it, then poll until brand-new HD video arrives
        gen_clicked = False
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout_s:
            pg.wait_for_timeout(5000)
            if not gen_clicked:
                gen_pos = pg.evaluate("""() => {
                    const b = Array.from(document.querySelectorAll('button, [role=button]')).find(
                        e => (e.innerText || '').trim() === 'Generate' && e.getBoundingClientRect().x > 950
                    );
                    if (!b) return null;
                    const r = b.getBoundingClientRect();
                    return {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)};
                }""")
                if gen_pos:
                    pg.mouse.click(gen_pos["x"], gen_pos["y"])
                    gen_clicked = True
                    continue

            vids = pg.evaluate("""() => Array.from(document.querySelectorAll('video')).map(v => ({
                src: v.currentSrc || v.src || '',
                w: v.videoWidth || 0,
                h: v.videoHeight || 0,
                dur: v.duration || 0,
            }))""")
            fresh = [
                v for v in vids
                if v["src"]
                and "gstatic.com" not in v["src"]
                and _vid_id(v["src"]) not in pre_ids
                and v["w"] >= 1280
                and v["dur"] >= expected_min_s
            ]
            if gen_clicked and fresh:
                src_url = fresh[0]["src"]
                resp = ctx.request.get(src_url, timeout=180000)
                if resp.status not in (200, 206):
                    raise RuntimeError(f"Video download returned HTTP {resp.status}")
                body = resp.body()
                out_mp4.parent.mkdir(parents=True, exist_ok=True)
                out_mp4.write_bytes(body)
                print(json.dumps({"ok": True, "bytes": len(body), "dur": fresh[0]["dur"]}))
                sys.exit(0)

        raise RuntimeError(f"Timed out after {timeout_s}s waiting for Google Vids Veo lip-sync render")
    finally:
        pg.close()
'''


def generate_vids_avatar_mp4(
    script_text: str,
    out_mp4: Path,
    avatar_name: str | None = None,
    expected_min_s: float = 6.0,
    timeout_s: int = 720,
    retries: int = 2,
) -> dict:
    """Render a broadcast-grade Veo 3 Realistic lip-synced presenter MP4 via Google Vids CDP and verify quality."""
    pw_python = Path(config.PLAYWRIGHT_PYTHON)
    if not pw_python.is_file():
        raise PresenterQualityError(f"Playwright Python interpreter missing at {pw_python}")

    avatar = (avatar_name or getattr(config, "GOOGLE_VIDS_AVATAR_NAME", "William") or "William").strip()
    out_mp4 = Path(out_mp4)
    doc_id_file = config.STATE_DIR / "vids_studio_doc.txt"

    payload = json.dumps(
        {
            "cdp_url": config.CDP_URL,
            "doc_id_file": str(doc_id_file),
            "default_doc_id": DEFAULT_STUDIO_DOC_ID,
            "avatar_name": avatar,
            "script_text": script_text,
            "out_mp4": str(out_mp4),
            "timeout_s": timeout_s,
            "expected_min_s": expected_min_s,
        }
    )

    last_err = None
    with store.file_lock("vids-avatar.lock", blocking=True):
        for attempt in range(1, retries + 1):
            try:
                log.info("Generating Google Vids Veo presenter '%s' (attempt %d/%d)...", avatar, attempt, retries)
                res = subprocess.run(
                    [str(pw_python), "-c", _PLAYWRIGHT_RUNNER, payload],
                    capture_output=True,
                    text=True,
                    timeout=timeout_s + 90,
                )
                if res.returncode != 0:
                    raise PresenterQualityError(
                        f"Google Vids CDP runner failed (rc={res.returncode}): {(res.stderr or res.stdout)[-500:]}"
                    )
                q_meta = verify_broadcast_presenter_mp4(out_mp4, expected_min_s=expected_min_s)
                log.info("Verified Veo presenter MP4: %s", q_meta)
                return q_meta
            except Exception as exc:
                last_err = exc
                log.warning("Veo presenter attempt %d failed: %s", attempt, exc)
                out_mp4.unlink(missing_ok=True)
    raise PresenterQualityError(f"Could not produce broadcast-verified presenter MP4 after {retries} attempts: {last_err}")
