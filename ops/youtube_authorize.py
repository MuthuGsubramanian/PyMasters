"""One-time YouTube upload authorization for the daily pipeline.

Run from the repo root on the ops laptop (any shell):

    python ops/youtube_authorize.py

What it does: opens the Google consent page in your default browser for the
PyMasters OAuth client (redirect URI http://localhost:8765/ is registered on
the "PyMasters" web client in project pymasters-app), waits for you to click
Allow as muthu@pymasters.net (the account that owns the PyMasters channel),
and caches the refresh token at pipeline/.youtube_token.json — the file
pipeline/video/upload_youtube.py reads and auto-refreshes from then on.

Prerequisite (console, one click): Google Auth Platform -> Audience ->
"Make internal" (Workspace-only app: no Google verification review and no
7-day refresh-token expiry that External/Testing apps suffer from).
Afterwards set the User env var YOUTUBE_UPLOAD=1 so the 06:30 pipeline uploads:

    [Environment]::SetEnvironmentVariable('YOUTUBE_UPLOAD','1','User')
"""
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
os.environ.setdefault(
    "YOUTUBE_CLIENT_SECRETS_FILE",
    os.path.join(os.path.expanduser("~"), ".pymasters", "youtube_client_secret.json"),
)

from google_auth_oauthlib.flow import InstalledAppFlow  # noqa: E402
from pipeline.video import upload_youtube as uy  # noqa: E402

PORT = 8765


def main() -> int:
    secrets = os.environ["YOUTUBE_CLIENT_SECRETS_FILE"]
    if not os.path.isfile(secrets):
        print(f"Client secret file not found: {secrets}")
        return 1
    flow = InstalledAppFlow.from_client_secrets_file(secrets, uy.SCOPES)
    creds = flow.run_local_server(
        port=PORT, open_browser=True, access_type="offline", prompt="consent",
        authorization_prompt_message="If the browser did not open, visit:\n{url}\n",
        success_message="PyMasters YouTube authorization complete. You can close this tab.",
    )
    with open(uy.TOKEN_PATH, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    print(f"Token saved to {uy.TOKEN_PATH}"
          + ("" if creds.refresh_token else "  (WARNING: no refresh token — re-run with a fresh consent)"))
    print("Now set YOUTUBE_UPLOAD=1 (User env var) and the daily pipeline will upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
