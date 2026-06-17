"""Publish a post (with optional branded image) to the PyMasters LinkedIn page.

SAFE BY DEFAULT: nothing is posted until you opt in via env.
  LINKEDIN_AUTOPOST=1                          master switch
  LINKEDIN_ORG_URN=urn:li:organization:<id>    the company page
  + a usable access token, via either:
      LINKEDIN_ACCESS_TOKEN (raw, ~60-day), or
      LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET + LINKEDIN_REFRESH_TOKEN (auto-refresh)

Token lifetime is handled by linkedin_auth.get_access_token() (auto-refresh).
Images use the LinkedIn Assets register-upload flow; on any image failure the
post still goes out as text-only. Stdlib urllib only. Never raises.
"""

import os
import json
import urllib.request
import urllib.error

from pipeline.utils.logger import get_logger
from pipeline.actors.linkedin_auth import get_access_token

log = get_logger("actor.linkedin")

UGC_ENDPOINT = "https://api.linkedin.com/v2/ugcPosts"
REGISTER_ENDPOINT = "https://api.linkedin.com/v2/assets?action=registerUpload"
_TRUTHY = {"1", "true", "yes", "on"}


def linkedin_enabled() -> bool:
    return (
        os.getenv("LINKEDIN_AUTOPOST", "").strip().lower() in _TRUTHY
        and bool(os.getenv("LINKEDIN_ORG_URN"))
        and bool(get_access_token())
    )


def _post_json(url, token, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        }, method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp, (resp.read().decode("utf-8") if resp.length != 0 else "")


def _upload_image(token: str, owner: str, image_bytes: bytes) -> str | None:
    """Register + upload an image, returning its asset URN (or None on failure)."""
    try:
        reg_payload = {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": owner,
                "serviceRelationships": [
                    {"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}
                ],
            }
        }
        _, body = _post_json(REGISTER_ENDPOINT, token, reg_payload)
        data = json.loads(body)["value"]
        asset = data["asset"]
        upload_url = data["uploadMechanism"][
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]["uploadUrl"]

        put = urllib.request.Request(
            upload_url, data=image_bytes,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "image/png"},
            method="PUT",
        )
        urllib.request.urlopen(put, timeout=60).read()
        log.info(f"Image uploaded (asset={asset})")
        return asset
    except Exception as e:
        log.error(f"Image upload failed (posting text-only): {e}")
        return None


def _build_post(org_urn: str, text: str, asset_urn: str | None) -> dict:
    share = {"shareCommentary": {"text": text}, "shareMediaCategory": "NONE"}
    if asset_urn:
        share["shareMediaCategory"] = "IMAGE"
        share["media"] = [{
            "status": "READY",
            "media": asset_urn,
            "title": {"text": "PyMasters"},
            "description": {"text": "Learn Python & AI by building — pymasters.net"},
        }]
    return {
        "author": org_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": share},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }


def publish_linkedin(text: str, image_bytes: bytes | None = None) -> dict:
    """Post `text` (+ optional image) to the company page. Returns status; never raises."""
    if os.getenv("LINKEDIN_AUTOPOST", "").strip().lower() not in _TRUTHY:
        log.info("LinkedIn autopost disabled — draft saved, not posted.")
        return {"status": "disabled"}
    org_urn = os.getenv("LINKEDIN_ORG_URN")
    if not org_urn:
        return {"status": "error", "detail": "LINKEDIN_ORG_URN not set"}

    token = get_access_token()
    if not token:
        return {"status": "no_token", "detail": "no access/refresh token available"}

    asset_urn = _upload_image(token, org_urn, image_bytes) if image_bytes else None

    for attempt in (1, 2):  # retry once on 401 with a forced token refresh
        try:
            resp, _ = _post_json(UGC_ENDPOINT, token, _build_post(org_urn, text, asset_urn))
            post_id = resp.headers.get("x-restli-id") or resp.headers.get("X-RestLi-Id")
            log.info(f"LinkedIn post published (id={post_id}, image={'yes' if asset_urn else 'no'})")
            return {"status": "posted", "post_id": post_id, "with_image": bool(asset_urn)}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")[:300]
            if e.code == 401 and attempt == 1:
                log.info("401 from LinkedIn — refreshing token and retrying once.")
                token = get_access_token(force_refresh=True)
                if not token:
                    return {"status": "error", "code": 401, "detail": "refresh produced no token"}
                continue
            log.error(f"LinkedIn post failed: HTTP {e.code} {body}")
            return {"status": "error", "code": e.code, "detail": body}
        except Exception as e:
            log.error(f"LinkedIn post failed: {e}")
            return {"status": "error", "detail": str(e)}
    return {"status": "error", "detail": "unreachable"}
