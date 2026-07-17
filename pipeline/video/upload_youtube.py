"""YouTube uploader — resumable uploads for the daily generated videos.

Reads OAuth client secrets from env YOUTUBE_CLIENT_SECRETS_FILE, caches the
user token at pipeline/.youtube_token.json (gitignored), and uploads
short.mp4 / explainer.mp4 from pipeline/social/<date>/video/ using the
metadata.json written by generate_videos.py. After a successful upload the
video's youtube_url is written back into metadata.json.

Safe by default: if credentials are missing it prints setup instructions and
returns {"status": "credentials_missing"} — it NEVER raises into the pipeline.

CLI:
    python -m pipeline.video.upload_youtube --dry-run          # today's videos
    python -m pipeline.video.upload_youtube --date 2026-07-17  # a specific day
"""

import os
import sys
import json
import argparse
from datetime import datetime

# Allow running directly: python pipeline/video/upload_youtube.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from pipeline.utils.logger import get_logger

log = get_logger("video.upload")

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOCIAL_DIR = os.path.join(PIPELINE_DIR, "social")
TOKEN_PATH = os.path.join(PIPELINE_DIR, ".youtube_token.json")

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

SETUP_INSTRUCTIONS = """
YouTube upload is not configured yet. One-time setup:

  1. In Google Cloud Console (https://console.cloud.google.com), pick/create a
     project and enable the "YouTube Data API v3".
  2. Configure the OAuth consent screen (External, add your Google account as
     a test user) and create an OAuth client ID of type "Desktop app".
  3. Download the client secrets JSON and point the pipeline at it:
         set YOUTUBE_CLIENT_SECRETS_FILE=C:\\path\\to\\client_secret.json
  4. Set YOUTUBE_UPLOAD=1 where the pipeline runs, then run once interactively
     (a browser window opens to authorize; the token is cached at
     pipeline/.youtube_token.json and refreshes automatically afterwards).

Full details: pipeline/video/README.md
"""


def credentials_available() -> bool:
    """True if the OAuth client secrets file is configured and exists."""
    secrets = os.environ.get("YOUTUBE_CLIENT_SECRETS_FILE", "")
    return bool(secrets) and os.path.isfile(secrets)


def get_authenticated_service():
    """Build an authenticated YouTube API client (cached + auto-refreshed token).

    Returns None (after logging why) if credentials are unavailable — never raises
    for missing configuration.
    """
    if not credentials_available():
        log.warning("YouTube credentials missing (set YOUTUBE_CLIENT_SECRETS_FILE).")
        print(SETUP_INSTRUCTIONS)
        return None

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    if os.path.isfile(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception as e:
            log.warning(f"Cached token unreadable, re-authorizing: {e}")
            creds = None

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as e:
            log.warning(f"Token refresh failed, re-authorizing: {e}")
            creds = None

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            os.environ["YOUTUBE_CLIENT_SECRETS_FILE"], SCOPES)
        # Opens a local browser once; afterwards the cached token refreshes itself.
        creds = flow.run_local_server(port=0, open_browser=True)
        with open(TOKEN_PATH, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        log.info(f"Token cached: {TOKEN_PATH}")

    return build("youtube", "v3", credentials=creds)


def upload_video(youtube, video_path: str, meta: dict, is_short: bool = False) -> str | None:
    """Resumable-upload one video. Returns the watch URL, or None on failure."""
    from googleapiclient.http import MediaFileUpload

    tags = list(meta.get("tags", []))
    description = meta.get("description", "")
    if is_short and "#Shorts" not in description:
        description += "\n\n#Shorts"

    body = {
        "snippet": {
            "title": meta.get("title", "PyMasters daily video")[:100],
            "description": description,
            "tags": tags[:15],
            "categoryId": meta.get("category", "27"),
        },
        "status": {
            "privacyStatus": os.environ.get("YOUTUBE_PRIVACY", "public"),
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(video_path, chunksize=4 * 1024 * 1024, resumable=True,
                            mimetype="video/mp4")
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            log.info(f"  upload progress: {int(status.progress() * 100)}%")
    video_id = response.get("id")
    if not video_id:
        log.error(f"Upload returned no video id: {response}")
        return None
    url = f"https://www.youtube.com/watch?v={video_id}"
    log.info(f"Uploaded {os.path.basename(video_path)} -> {url}")
    return url


def upload_daily_videos(video_dir: str | None = None, dry_run: bool = False) -> dict:
    """Upload today's short.mp4 and explainer.mp4 with their metadata.

    Args:
        video_dir: directory containing the MP4s + metadata.json
                   (defaults to pipeline/social/<today>/video).
        dry_run:   print what would be uploaded without touching the API.

    Returns:
        dict with status ("uploaded", "dry_run", "credentials_missing",
        "no_videos", "error") and, when uploaded, the updated metadata dict.
        Never raises for expected conditions.
    """
    if video_dir is None:
        today = datetime.now().strftime("%Y-%m-%d")
        video_dir = os.path.join(SOCIAL_DIR, today, "video")

    metadata_path = os.path.join(video_dir, "metadata.json")
    if not os.path.isfile(metadata_path):
        log.warning(f"No metadata.json in {video_dir} — nothing to upload.")
        return {"status": "no_videos", "metadata": None}

    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    videos = []
    for key, filename in (("short", "short.mp4"), ("explainer", "explainer.mp4")):
        path = os.path.join(video_dir, filename)
        if key in metadata and os.path.isfile(path):
            videos.append((key, path))
    if not videos:
        log.warning(f"No MP4 files found in {video_dir}.")
        return {"status": "no_videos", "metadata": metadata}

    if dry_run:
        print(f"[dry-run] Would upload {len(videos)} video(s) from {video_dir}:")
        for key, path in videos:
            meta = metadata[key]
            size_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"  - {key}: {path} ({size_mb:.1f} MB)")
            print(f"      title:    {meta.get('title', '?')}")
            print(f"      tags:     {', '.join(meta.get('tags', [])[:6])}...")
            print(f"      category: {meta.get('category', '27')} (Education)")
        if not credentials_available():
            print("\n[dry-run] NOTE: credentials are not configured — a real run "
                  "would print setup instructions and skip.")
        return {"status": "dry_run", "metadata": metadata}

    if not credentials_available():
        print(SETUP_INSTRUCTIONS)
        return {"status": "credentials_missing", "metadata": metadata}

    try:
        youtube = get_authenticated_service()
        if youtube is None:
            return {"status": "credentials_missing", "metadata": metadata}
        uploaded = 0
        for key, path in videos:
            if metadata[key].get("youtube_url"):
                log.info(f"  {key} already uploaded: {metadata[key]['youtube_url']}")
                continue
            url = upload_video(youtube, path, metadata[key], is_short=(key == "short"))
            if url:
                metadata[key]["youtube_url"] = url
                uploaded += 1
                # Persist after each upload so a later failure loses nothing
                with open(metadata_path, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
        log.info(f"Upload complete: {uploaded} video(s); metadata updated: {metadata_path}")
        return {"status": "uploaded", "uploaded_count": uploaded, "metadata": metadata}
    except Exception as e:
        log.error(f"YouTube upload failed: {e}")
        return {"status": "error", "error": str(e), "metadata": metadata}


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload PyMasters daily videos to YouTube.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be uploaded without calling the API.")
    parser.add_argument("--date", default=None,
                        help="Day to upload (YYYY-MM-DD, default: today).")
    args = parser.parse_args()

    video_dir = None
    if args.date:
        video_dir = os.path.join(SOCIAL_DIR, args.date, "video")

    result = upload_daily_videos(video_dir=video_dir, dry_run=args.dry_run)
    print(f"Status: {result.get('status')}")
    # Missing credentials / videos are expected conditions, not failures.
    return 0


if __name__ == "__main__":
    sys.exit(main())
