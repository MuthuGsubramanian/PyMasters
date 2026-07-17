"""
social_worker.py — executes Social Studio jobs queued by the super-admin console.

Runs on the local ops machine (Task Scheduler, every 5 min): claims the oldest
pending job from prod, generates the requested content with the same modules
the daily pipeline uses (topic + style direction from the job), publishes where
credentials allow, and reports the result back so the console shows it.

Auth: X-Worker-Token header == SOCIAL_WORKER_TOKEN env (both here and on
Cloud Run). Exit fast and silent when there is no pending work.

    python -m pipeline.social_worker           # claim + run one job if pending
"""

import json
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests

from pipeline.utils.logger import get_logger

log = get_logger("pipeline.social_worker")

API_BASE = os.getenv("PYMASTERS_API", "https://pymasters.net/api")
TOKEN = os.getenv("SOCIAL_WORKER_TOKEN", "")
PYTHON = sys.executable


def _headers():
    return {"X-Worker-Token": TOKEN, "Content-Type": "application/json"}


def _claim():
    r = requests.post(f"{API_BASE}/social-worker/claim", headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json().get("job")


def _report(job_id: str, status: str, result: dict):
    requests.post(
        f"{API_BASE}/social-worker/jobs/{job_id}/result",
        headers=_headers(), json={"status": status, "result": result}, timeout=30,
    ).raise_for_status()


def _synthetic_item(topic: str, style_notes: str | None) -> dict:
    """Shape the requested topic like a pipeline scored-item so the existing
    generators need no special casing."""
    return {
        "title": topic,
        "description": f"On-demand editorial request from the PyMasters team: {topic}",
        "opportunity": style_notes or "Teach it hands-on for Python developers.",
        "url": "",
        "source": "social-studio",
        "relevance_score": 10,
    }


def run_job(job: dict) -> dict:
    from pipeline.video.generate_videos import generate_daily_videos
    from pipeline.actors.social_content import generate_linkedin_post, _clean_linkedin_post  # noqa: F401
    from pipeline.actors.linkedin_media import generate_post_image
    from pipeline.actors.linkedin_publisher import publish_linkedin, linkedin_enabled

    topic = job["topic"]
    style = job.get("style_notes")
    channels = job.get("channels") or []
    items = [_synthetic_item(topic, style)]
    result: dict = {"topic": topic, "channels": channels}
    today = datetime.now().strftime("%Y-%m-%d")

    video_meta = None
    if "youtube" in channels:
        log.info(f"[job {job['id'][:8]}] generating videos for: {topic}")
        vid = generate_daily_videos(items, style_notes=style)
        result["video_status"] = vid.get("status")
        result["tts_engine"] = vid.get("tts_engine")
        video_meta = vid.get("metadata")
        if vid.get("short_path"):
            # Upload iff enabled + credentials present; graceful otherwise.
            if os.getenv("YOUTUBE_UPLOAD") == "1" and os.getenv("YOUTUBE_CLIENT_SECRETS_FILE"):
                up = subprocess.run(
                    [PYTHON, "-m", "pipeline.video.upload_youtube", "--date", today],
                    capture_output=True, text=True, timeout=1800,
                    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                )
                result["upload_exit"] = up.returncode
                # Re-read metadata for the URLs the uploader wrote back.
                try:
                    with open(vid["metadata_path"], encoding="utf-8") as f:
                        video_meta = json.load(f)
                    result["youtube_urls"] = {
                        k: v.get("youtube_url") for k, v in video_meta.items()
                        if isinstance(v, dict)
                    }
                except Exception as e:
                    result["upload_note"] = f"metadata re-read failed: {e}"
            else:
                result["youtube_urls"] = None
                result["upload_note"] = "YouTube upload not configured (YOUTUBE_UPLOAD/OAuth) — videos generated locally"

    if "linkedin" in channels:
        log.info(f"[job {job['id'][:8]}] generating LinkedIn post for: {topic}")
        text = generate_linkedin_post(items, video_meta=video_meta, style_notes=style)
        day_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "social", today)
        os.makedirs(day_dir, exist_ok=True)
        draft_path = os.path.join(day_dir, f"ondemand-{job['id'][:8]}-linkedin.txt")
        with open(draft_path, "w", encoding="utf-8") as f:
            f.write(text)
        result["linkedin_draft"] = draft_path
        result["linkedin_preview"] = text[:280]
        image_bytes = None
        try:
            image_bytes = generate_post_image(topic)
        except Exception as e:
            result["banner_note"] = f"banner failed: {e}"
        if linkedin_enabled():
            pub = publish_linkedin(text, image_bytes=image_bytes)
            result["linkedin_status"] = pub.get("status")
            if pub.get("post_urn"):
                result["linkedin_post"] = pub.get("post_urn")
        else:
            result["linkedin_status"] = "draft_only (LinkedIn credentials not configured)"

    return result


def main() -> int:
    if not TOKEN:
        log.error("SOCIAL_WORKER_TOKEN not set — worker cannot authenticate.")
        return 1
    try:
        job = _claim()
    except Exception as e:
        log.error(f"claim failed: {e}")
        return 1
    if not job:
        return 0  # nothing to do — stay silent
    log.info(f"claimed job {job['id']}: {job['topic']!r} channels={job['channels']}")
    try:
        result = run_job(job)
        _report(job["id"], "done", result)
        log.info(f"job {job['id'][:8]} done: {json.dumps(result)[:300]}")
    except Exception as e:
        log.error(f"job {job['id'][:8]} failed: {e}")
        try:
            _report(job["id"], "error", {"error": str(e)[:500]})
        except Exception:
            pass
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
