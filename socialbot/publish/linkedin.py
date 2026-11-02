"""LinkedIn company-page publishing via the current REST APIs (/rest/videos, /rest/images, /rest/posts).

Needs a LinkedIn app with the Community Management API and scopes w_organization_social
(+ r_organization_social for stats), authorised by a page admin."""
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone

import requests

from socialbot import config

log = logging.getLogger("socialbot.linkedin")

API = "https://api.linkedin.com/rest"
def _api_version():
    """LinkedIn only serves versions from roughly the last 12 months; use last month's (YYYYMM) so it never ages out."""
    d = datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)
    return d.strftime("%Y%m")


VERSION = _api_version()
# Two identities. "org" = the PyMasters company page via the PyMasters Publisher app (Community Management API,
# pending LinkedIn review). "member" = the owner's profile via the existing PyMasters app (Share on LinkedIn).
# Posts go out as the page once its token exists, as the member until then.
PROFILES = {
    "org": {"app": config.CONFIG_DIR / "linkedin_app.json", "token": config.CONFIG_DIR / "linkedin_token.json",
            "scopes": ["w_organization_social", "r_organization_social", "rw_organization_admin"],
            "redirect": "http://localhost:8767/callback"},
    "member": {"app": config.CONFIG_DIR / "linkedin_member_app.json",
               "token": config.CONFIG_DIR / "linkedin_member_token.json",
               "scopes": ["openid", "profile", "w_member_social"], "redirect": "http://localhost:8766/"},
}
APP_FILE, TOKEN_FILE, SCOPES = PROFILES["org"]["app"], PROFILES["org"]["token"], PROFILES["org"]["scopes"]


def active_profile():
    return "org" if PROFILES["org"]["token"].exists() else "member"


def author_urn(profile=None):
    profile = profile or active_profile()
    if profile == "org":
        return config.LINKEDIN_ORG_URN
    tok = json.loads(PROFILES["member"]["token"].read_text())
    if not tok.get("person_urn"):
        r = requests.get("https://api.linkedin.com/v2/userinfo", headers={"Authorization": f"Bearer {_token('member')}"},
                         timeout=30)
        r.raise_for_status()
        tok["person_urn"] = f"urn:li:person:{r.json()['sub']}"
        PROFILES["member"]["token"].write_text(json.dumps(tok))
    return tok["person_urn"]


class LinkedInError(RuntimeError):
    pass


def _token(profile=None):
    profile = profile or active_profile()
    TOKEN_FILE, APP_FILE = PROFILES[profile]["token"], PROFILES[profile]["app"]
    if not TOKEN_FILE.exists():
        raise LinkedInError(f"LinkedIn ({profile}) is not authorised yet: run `python -m socialbot auth linkedin`")
    tok = json.loads(TOKEN_FILE.read_text())
    if tok.get("expires_at", 0) - time.time() < 3 * 86400:
        if tok.get("refresh_token") and APP_FILE.exists():
            app = json.loads(APP_FILE.read_text())
            r = requests.post("https://www.linkedin.com/oauth/v2/accessToken", data={
                "grant_type": "refresh_token", "refresh_token": tok["refresh_token"],
                "client_id": app["client_id"], "client_secret": app["client_secret"]}, timeout=30)
            if r.ok:
                new = r.json()
                tok.update(access_token=new["access_token"], expires_at=time.time() + new.get("expires_in", 0))
                if new.get("refresh_token"):
                    tok["refresh_token"] = new["refresh_token"]
                TOKEN_FILE.write_text(json.dumps(tok))
                TOKEN_FILE.chmod(0o600)
            elif tok.get("expires_at", 0) < time.time():
                raise LinkedInError(f"LinkedIn token expired and refresh failed: {r.status_code} {r.text[:200]}")
        elif tok.get("expires_at", 0) < time.time():
            raise LinkedInError("LinkedIn token expired: run `python -m socialbot auth linkedin`")
    return tok["access_token"]


def _h(extra=None):
    h = {"Authorization": f"Bearer {_token()}", "LinkedIn-Version": _api_version(), "X-Restli-Protocol-Version": "2.0.0",
         "Content-Type": "application/json"}
    h.update(extra or {})
    return h


_RESERVED = re.compile(r"([\\|{}@\[\]()<>#*_~])")


def little_text(post: str, hashtags) -> str:
    """Posts API 'commentary' uses LinkedIn's little-text format: reserved characters must be escaped, and
    hashtags are written as {hashtag|\\#|Tag} so they render as real, clickable hashtags."""
    body = _RESERVED.sub(r"\\\1", post.rstrip())
    tags = " ".join("{hashtag|\\#|" + re.sub(r"\W", "", t.lstrip("#")) + "}" for t in hashtags)
    return f"{body}\n\n{tags}" if tags else body


def _upload_video(path: str) -> str:
    import os
    size = os.path.getsize(path)
    r = requests.post(f"{API}/videos?action=initializeUpload", headers=_h(), timeout=60, json={
        "initializeUploadRequest": {"owner": author_urn(), "fileSizeBytes": size,
                                    "uploadCaptions": False, "uploadThumbnail": False}})
    if not r.ok:
        raise LinkedInError(f"video init {r.status_code}: {r.text[:300]}")
    val = r.json()["value"]
    urn, etags = val["video"], []
    with open(path, "rb") as fh:
        for ins in val["uploadInstructions"]:
            fh.seek(ins["firstByte"])
            chunk = fh.read(ins["lastByte"] - ins["firstByte"] + 1)
            up = requests.put(ins["uploadUrl"], data=chunk, headers={"Content-Type": "application/octet-stream"},
                              timeout=300)
            if not up.ok:
                raise LinkedInError(f"video part upload {up.status_code}")
            etags.append(up.headers.get("etag", "").strip('"'))
    r = requests.post(f"{API}/videos?action=finalizeUpload", headers=_h(), timeout=60, json={
        "finalizeUploadRequest": {"video": urn, "uploadToken": val.get("uploadToken", ""), "uploadedPartIds": etags}})
    if not r.ok:
        raise LinkedInError(f"video finalize {r.status_code}: {r.text[:300]}")
    # Wait until LinkedIn has processed it; never post a video that isn't AVAILABLE.
    enc = requests.utils.quote(urn, safe="")
    for _ in range(60):
        s = requests.get(f"{API}/videos/{enc}", headers=_h(), timeout=30)
        st = s.json().get("status") if s.ok else None
        if st == "AVAILABLE":
            return urn
        if st == "PROCESSING_FAILED":
            raise LinkedInError("LinkedIn video processing failed")
        time.sleep(10)
    raise LinkedInError("LinkedIn video still processing after 10 minutes")


def _upload_image(path: str) -> str:
    r = requests.post(f"{API}/images?action=initializeUpload", headers=_h(), timeout=60,
                      json={"initializeUploadRequest": {"owner": author_urn()}})
    if not r.ok:
        raise LinkedInError(f"image init {r.status_code}: {r.text[:300]}")
    val = r.json()["value"]
    with open(path, "rb") as fh:
        up = requests.put(val["uploadUrl"], data=fh.read(), timeout=300,
                          headers={"Authorization": f"Bearer {_token()}"})
    if not up.ok:
        raise LinkedInError(f"image upload {up.status_code}")
    return val["image"]


def _post(commentary: str, media_urn: str, title: str) -> str:
    body = {"author": author_urn(), "commentary": commentary, "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "content": {"media": {"title": title[:200], "id": media_urn}},
            "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False}
    r = requests.post(f"{API}/posts", headers=_h(), json=body, timeout=60)
    if r.status_code != 201:
        raise LinkedInError(f"post {r.status_code}: {r.text[:300]}")
    return r.headers.get("x-restli-id") or r.headers.get("x-linkedin-id", "")


def publish(item: dict) -> dict:
    d, media = item["draft"], item["media"]
    text = little_text(d["post"], d.get("hashtags") or [])
    title = (d.get("animation") or {}).get("title") or item["topic"]
    try:
        urn = _upload_video(media["video"])
        kind = "video"
    except LinkedInError as e:
        log.warning("video path failed (%s); falling back to the animated GIF", e)
        urn = _upload_image(media["gif"])
        kind = "gif"
    post_urn = _post(text, urn, title)
    return {"id": post_urn, "url": f"https://www.linkedin.com/feed/update/{post_urn}/", "media": kind,
            "as": active_profile()}


def stats(post_urns):
    out = {}
    for urn in post_urns:
        enc = requests.utils.quote(urn, safe="")
        r = requests.get(f"{API}/socialActions/{enc}", headers=_h(), timeout=30)
        if r.ok:
            j = r.json()
            out[urn] = {"likes": (j.get("likesSummary") or {}).get("totalLikes", 0),
                        "comments": (j.get("commentsSummary") or {}).get("aggregatedTotalComments", 0)}
    return out
