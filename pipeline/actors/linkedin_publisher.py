"""Publish a post to the PyMasters LinkedIn company page.

SAFE BY DEFAULT: nothing is ever posted until you explicitly opt in via env.
  LINKEDIN_AUTOPOST=1        master switch (unset/0 => generate draft only)
  LINKEDIN_ACCESS_TOKEN=...  OAuth2 token with the w_organization_social scope
  LINKEDIN_ORG_URN=urn:li:organization:<id>   the PyMasters company page URN

Until those are set, the daily pipeline just writes the LinkedIn draft to
pipeline/social/<date>/linkedin.txt for review. See pipeline/LINKEDIN_SETUP.md.

Uses the LinkedIn UGC Posts API (stdlib urllib only — no extra dependency).
"""

import os
import json
import urllib.request
import urllib.error

from pipeline.utils.logger import get_logger

log = get_logger("actor.linkedin")

UGC_ENDPOINT = "https://api.linkedin.com/v2/ugcPosts"
_TRUTHY = {"1", "true", "yes", "on"}


def linkedin_enabled() -> bool:
    """True only when autopost is switched on AND credentials are present."""
    return (
        os.getenv("LINKEDIN_AUTOPOST", "").strip().lower() in _TRUTHY
        and bool(os.getenv("LINKEDIN_ACCESS_TOKEN"))
        and bool(os.getenv("LINKEDIN_ORG_URN"))
    )


def publish_linkedin(text: str) -> dict:
    """Post `text` to the company page. Returns a status dict; never raises."""
    if not linkedin_enabled():
        log.info("LinkedIn autopost disabled/unconfigured — draft saved, not posted.")
        return {"status": "disabled"}

    token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    org_urn = os.getenv("LINKEDIN_ORG_URN")

    payload = {
        "author": org_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    req = urllib.request.Request(
        UGC_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            post_id = resp.headers.get("x-restli-id") or resp.headers.get("X-RestLi-Id")
            log.info(f"LinkedIn post published (id={post_id})")
            return {"status": "posted", "post_id": post_id}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:300]
        log.error(f"LinkedIn post failed: HTTP {e.code} {body}")
        return {"status": "error", "code": e.code, "detail": body}
    except Exception as e:  # network/timeout/etc.
        log.error(f"LinkedIn post failed: {e}")
        return {"status": "error", "detail": str(e)}
