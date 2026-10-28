"""Weekly YouTube compilation — stitches the week's daily Shorts into one
recap video, with a brief title card between each day's clip.

Runs from pipeline/main.py on WEEKLY_VIDEO_DAY (default Sunday), reusing the
existing daily 06:30 Task Scheduler trigger rather than adding a new one.
Degrades gracefully: with fewer than MIN_SHORTS_FOR_WEEKLY clips available
(e.g. early in the week, or some days' video generation failed/was skipped)
it returns a "skipped" status instead of building a thin, low-value video.
"""

import json
import os
import subprocess
from datetime import datetime, timedelta

from pipeline.video.generate_videos import (
    SOCIAL_DIR, find_ffmpeg, find_ffprobe, _run, _fix_text, _render_title_slide,
)
from pipeline.utils.claude import ask_claude_json
from pipeline.utils.logger import get_logger

log = get_logger("video.weekly")

MIN_SHORTS_FOR_WEEKLY = 3
TARGET_W, TARGET_H, FPS = 1080, 1920, 30
TITLE_CARD_SECONDS = 2.0

WEEKLY_METADATA_PROMPT = """You are the YouTube channel manager for PyMasters (pymasters.net),
a platform where Python developers learn AI/ML by building.

This week we published daily 60-second Shorts on these topics (oldest first):

{topics}

Write upload metadata for a weekly recap video that stitches these Shorts together.
Rules:
- title: <= 90 characters, specific (name 2-3 of the topics), NO clickbait, no ALL CAPS.
- description: 2-3 short paragraphs, naming what was covered this week; must include
  https://pymasters.net and end with a line of 5-8 hashtags.
- tags: 10-15 short search tags (no # symbol).

Return ONLY a JSON object:
{{"title": "...", "description": "...", "tags": ["...", "..."]}}"""


def collect_week_shorts(end_date: datetime | None = None, days: int = 7) -> list[dict]:
    """Return {date, path, title}, oldest first, for each of the last `days`
    calendar days that has a short.mp4 + metadata.json with a "short" entry."""
    end_date = end_date or datetime.now()
    items = []
    for i in range(days - 1, -1, -1):
        day = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        video_dir = os.path.join(SOCIAL_DIR, day, "video")
        short_path = os.path.join(video_dir, "short.mp4")
        meta_path = os.path.join(video_dir, "metadata.json")
        if not (os.path.isfile(short_path) and os.path.isfile(meta_path)):
            continue
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            title = _fix_text(str(meta.get("short", {}).get("title", day)))
        except Exception:
            title = day
        items.append({"date": day, "path": short_path, "title": title})
    return items


def _has_audio_stream(path: str) -> bool:
    ffprobe = find_ffprobe()
    if not ffprobe:
        return True
    proc = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    return bool(proc.stdout.strip())


def _normalize_segment(path: str, out_path: str) -> None:
    """Re-encode a clip to a common codec/resolution/fps, adding a silent
    audio track if it has none — required so the final concat has uniform
    streams across every day's clip and every title card."""
    ffmpeg = find_ffmpeg()
    has_audio = _has_audio_stream(path)
    cmd = [ffmpeg, "-y", "-i", path]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono"]
    cmd += ["-vf", f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,"
                   f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2,fps={FPS}",
            "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100"]
    if not has_audio:
        cmd += ["-shortest"]
    cmd += [out_path]
    _run(cmd)


def _title_card_segment(date: str, title: str, index: int, total: int, out_path: str,
                        work_dir: str) -> None:
    card_png = os.path.join(work_dir, f"card_{index:02d}.png")
    _render_title_slide(card_png, title, f"DAY {index + 1}/{total} · {date}", vertical=True)
    ffmpeg = find_ffmpeg()
    _run([ffmpeg, "-y", "-loop", "1", "-framerate", str(FPS), "-i", card_png,
          "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
          "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-t", f"{TITLE_CARD_SECONDS:.2f}", "-shortest", out_path])


def generate_weekly_metadata(week_items: list[dict]) -> dict:
    """Upload metadata for the compilation, with a template fallback."""
    topics = "\n".join(f"- {it['title']}" for it in week_items)
    try:
        raw = ask_claude_json(WEEKLY_METADATA_PROMPT.format(topics=topics))
        title = _fix_text(str(raw["title"]).strip())[:90]
        description = _fix_text(str(raw["description"]).strip())
        tags = [_fix_text(str(t).lstrip("#").strip()) for t in raw.get("tags", []) if str(t).strip()]
        if not title or not description or len(tags) < 5:
            raise ValueError("incomplete weekly metadata")
        if "pymasters.net" not in description:
            description += "\n\nLearn Python & AI by building: https://pymasters.net"
        return {"title": title, "description": description, "tags": tags[:15],
                "category": "27", "youtube_url": None}
    except Exception as e:
        log.error(f"Claude weekly metadata failed, using template: {e}")
        names = ", ".join(it["title"] for it in week_items[:3])
        return {
            "title": f"This Week in Python & AI: {names}"[:90],
            "description": (
                f"This week's PyMasters daily briefs, together: {topics}\n\n"
                "Learn Python & AI by building, with sandbox-graded lessons: "
                "https://pymasters.net\n\n#Python #AI #MachineLearning #LearnToCode #Programming"),
            "tags": ["python", "ai", "machine learning", "programming", "weekly recap",
                     "learn python", "pymasters", "coding", "tutorial", "developer"],
            "category": "27", "youtube_url": None,
        }


def build_weekly_video(week_items: list[dict], out_path: str, work_dir: str) -> dict:
    """Concat title-card + clip for each day into one MP4 at out_path."""
    os.makedirs(work_dir, exist_ok=True)
    segments = []
    total = len(week_items)
    for i, item in enumerate(week_items):
        card_path = os.path.join(work_dir, f"seg_card_{i:02d}.mp4")
        _title_card_segment(item["date"], item["title"], i, total, card_path, work_dir)
        segments.append(card_path)

        clip_path = os.path.join(work_dir, f"seg_clip_{i:02d}.mp4")
        _normalize_segment(item["path"], clip_path)
        segments.append(clip_path)

    list_path = os.path.join(work_dir, "concat.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for seg in segments:
            f.write(f"file '{seg.replace(os.sep, '/')}'\n")

    ffmpeg = find_ffmpeg()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    _run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
          "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out_path])
    return {"status": "built", "path": out_path}


def run_weekly_compilation(end_date: datetime | None = None) -> dict:
    """Main entry point: build + save the weekly compilation (upload is the
    caller's job, same as generate_daily_videos()/upload_youtube.py).

    Returns dict with status, video_path, metadata_path, metadata.
    Never raises for expected conditions (too few clips, ffmpeg missing).
    """
    end_date = end_date or datetime.now()
    if not find_ffmpeg():
        log.warning("ffmpeg not found — skipping weekly compilation.")
        return {"status": "skipped: ffmpeg missing"}

    week_items = collect_week_shorts(end_date)
    if len(week_items) < MIN_SHORTS_FOR_WEEKLY:
        log.info(f"Only {len(week_items)} short(s) available this week "
                 f"(need {MIN_SHORTS_FOR_WEEKLY}) — skipping weekly compilation.")
        return {"status": f"skipped: only {len(week_items)} shorts available"}

    today = end_date.strftime("%Y-%m-%d")
    video_dir = os.path.join(SOCIAL_DIR, today, "video")
    work_dir = os.path.join(video_dir, "_weekly_work")
    out_path = os.path.join(video_dir, "weekly.mp4")

    try:
        build_weekly_video(week_items, out_path, work_dir)
    except Exception as e:
        log.error(f"Weekly compilation build failed: {e}")
        return {"status": f"error: {e}"}

    metadata = generate_weekly_metadata(week_items)
    metadata_path = os.path.join(video_dir, "weekly_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump({"weekly": metadata}, f, indent=2, ensure_ascii=False)

    import shutil
    shutil.rmtree(work_dir, ignore_errors=True)
    log.info(f"Weekly compilation built: {out_path} ({len(week_items)} days)")
    return {"status": "generated", "video_path": out_path, "metadata_path": metadata_path,
            "metadata": metadata, "days": len(week_items)}


if __name__ == "__main__":
    print(json.dumps(run_weekly_compilation(), indent=2, default=str))
