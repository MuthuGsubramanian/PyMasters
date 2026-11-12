"""YouTube Data API v3: scheduled upload + thumbnail + captions + playlist, and stats for the feedback loop."""
import json
import logging
from datetime import datetime, timezone

from socialbot import config

log = logging.getLogger("socialbot.youtube")

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.force-ssl",
          "https://www.googleapis.com/auth/yt-analytics.readonly"]
CLIENT_FILE = config.CONFIG_DIR / "youtube_client.json"   # Desktop OAuth client from pymasters-app
TOKEN_FILE = config.CONFIG_DIR / "youtube_token.json"

TRACK_PLAYLISTS = {  # lesson track -> playlist title (created on first use)
    "python_internals": "Python Internals, Explained", "async_concurrency": "Async & Concurrency in Python",
    "performance_optimization": "Fast Python", "ai_engineering": "AI Engineering with Python",
    "ai_agents": "AI Agents with Python", "transformers_scratch": "Transformers from Scratch",
    "machine_learning": "Machine Learning in Python", "deep_learning_complete": "Deep Learning in Python",
    "dsa": "Data Structures & Algorithms in Python",
}


def _creds():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    if not TOKEN_FILE.exists():
        raise RuntimeError("YouTube is not authorised yet: run `python -m socialbot auth youtube`")
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds.valid:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json())
        TOKEN_FILE.chmod(0o600)
    return creds


def client():
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=_creds(), cache_discovery=False)


def _playlist_id(yt, title):
    resp = yt.playlists().list(part="snippet", mine=True, maxResults=50).execute()
    for p in resp.get("items", []):
        if p["snippet"]["title"] == title:
            return p["id"]
    body = {"snippet": {"title": title, "description": f"{title}: short, precise lessons from PyMasters ({config.SITE})."},
            "status": {"privacyStatus": "public"}}
    return yt.playlists().insert(part="snippet,status", body=body).execute()["id"]


PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=net.pymasters.app"
TELEGRAM_COMMUNITY_URL = "https://t.me/boost/PyMasterscommunity"


def build_description(d: dict, media: dict, kind: str) -> str:
    """Build YouTube video description with Web, Google Play, and Telegram community links."""
    desc = (d.get("description") or "").strip()
    if media.get("space_url") and media["space_url"] not in desc:
        desc += f"\n\nTry the live Hugging Face Space: {media['space_url']}"
    if media.get("lesson_url") and media["lesson_url"] not in desc:
        desc += f"\n\nFull interactive lesson (free): {media['lesson_url']}"
    if kind == "long" and media.get("chapters_text"):
        desc += "\n\nChapters\n" + media["chapters_text"]
    desc += (
        f"\n\nPyMasters — learn Python and AI engineering by doing: {config.SITE}"
        f"\nGet PyMasters on Google Play: {PLAY_STORE_URL}"
        f"\nTelegram Support & Discussion: {TELEGRAM_COMMUNITY_URL}"
    )
    if kind == "short":
        desc += "\n#Shorts #Python #PyMasters"
    return desc


def upload(item: dict) -> dict:
    """Upload as private with publishAt (YouTube releases it on schedule). Returns {id, url}."""
    from googleapiclient.http import MediaFileUpload
    d, media, kind = item["draft"], item["media"], item["kind"]
    desc = build_description(d, media, kind)
    publish_at = item.get("publish_at")
    status = {"privacyStatus": "private", "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True,
              "embeddable": True, "license": "youtube"}
    if publish_at and publish_at > datetime.now(timezone.utc).isoformat():
        status["publishAt"] = publish_at.replace("+00:00", "Z")
    else:
        status["privacyStatus"] = "public"
    body = {"snippet": {"title": d["title"][:100], "description": desc[:4900], "tags": (d.get("tags") or [])[:15],
                        "categoryId": "27", "defaultLanguage": "en", "defaultAudioLanguage": "en"},
            "status": status}
    yt = client()
    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(media["video"], chunksize=8 * 1024 * 1024, resumable=True,
                                                        mimetype="video/mp4"))
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    vid = resp["id"]
    log.info("uploaded %s -> %s (%s)", item["id"], vid, status.get("publishAt", "public now"))
    extras = {}
    try:
        if media.get("thumbnail") and kind == "long":   # Shorts use a frame; custom thumbs need a verified channel
            yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(media["thumbnail"], mimetype="image/jpeg")).execute()
            extras["thumbnail"] = "set"
    except Exception as e:
        extras["thumbnail"] = f"skipped: {str(e)[:120]}"
    try:
        if media.get("srt"):
            yt.captions().insert(part="snippet", body={"snippet": {"videoId": vid, "language": "en", "name": "English",
                                                                   "isDraft": False}},
                                 media_body=MediaFileUpload(media["srt"], mimetype="application/octet-stream")).execute()
            extras["captions"] = "uploaded"
    except Exception as e:
        extras["captions"] = f"skipped: {str(e)[:120]}"
    try:
        track = item["source_key"].split(":", 1)[1].split("/")[0]
        if track in TRACK_PLAYLISTS:
            pid = _playlist_id(yt, TRACK_PLAYLISTS[track])
            yt.playlistItems().insert(part="snippet", body={"snippet": {"playlistId": pid, "resourceId": {
                "kind": "youtube#video", "videoId": vid}}}).execute()
            extras["playlist"] = TRACK_PLAYLISTS[track]
    except Exception as e:
        extras["playlist"] = f"skipped: {str(e)[:120]}"
    url = f"https://youtube.com/shorts/{vid}" if kind == "short" else f"https://youtu.be/{vid}"
    return {"id": vid, "url": url, "extras": extras}


def stats(video_ids):
    if not video_ids:
        return {}
    out = {}
    yt = client()
    for i in range(0, len(video_ids), 50):
        resp = yt.videos().list(part="statistics", id=",".join(video_ids[i:i + 50])).execute()
        for v in resp.get("items", []):
            s = v.get("statistics", {})
            out[v["id"]] = {"views": int(s.get("viewCount", 0)), "likes": int(s.get("likeCount", 0)),
                            "comments": int(s.get("commentCount", 0))}
    return out
