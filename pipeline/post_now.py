"""Post the most recently generated LinkedIn draft to the company page — NOW.

A manual, on-demand trigger (separate from the daily pipeline cron). It publishes
the latest pipeline/social/<date>/linkedin.txt + linkedin.png.

Requires (see pipeline/LINKEDIN_SETUP.md):
  LINKEDIN_AUTOPOST=1
  LINKEDIN_ORG_URN=urn:li:organization:<id>
  a token via LINKEDIN_ACCESS_TOKEN, or CLIENT_ID/SECRET/REFRESH_TOKEN (auto-refresh)

Run from the repo root:
  set PYTHONPATH=.            # (export PYTHONPATH=. on bash)
  python -m pipeline.post_now
"""

import os
import glob

from pipeline.actors.linkedin_publisher import publish_linkedin, linkedin_enabled


def main():
    if not linkedin_enabled():
        print("LinkedIn is not configured/enabled.\n"
              "Set LINKEDIN_AUTOPOST=1, LINKEDIN_ORG_URN, and a token "
              "(see pipeline/LINKEDIN_SETUP.md), then re-run.")
        return

    social = os.path.join(os.path.dirname(__file__), "social")
    days = sorted(glob.glob(os.path.join(social, "*")))
    if not days:
        print("No generated drafts found. Run `python -m pipeline.main` first.")
        return

    latest = days[-1]
    txt = os.path.join(latest, "linkedin.txt")
    png = os.path.join(latest, "linkedin.png")
    if not os.path.exists(txt):
        print(f"No linkedin.txt in {latest}.")
        return

    text = open(txt, encoding="utf-8").read()
    image = open(png, "rb").read() if os.path.exists(png) else None
    print(f"Posting latest draft from {os.path.basename(latest)} "
          f"({'with banner' if image else 'text-only'})...")
    print("Result:", publish_linkedin(text, image_bytes=image))


if __name__ == "__main__":
    main()
