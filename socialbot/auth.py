"""One-time OAuth. Both flows open the consent page in the default browser (Eighty on this machine) and catch
the redirect on localhost. The owner approves access themselves; tokens are stored 0600 in CONFIG_DIR."""
import http.server
import json
import secrets
import threading
import time
import urllib.parse
import webbrowser

import requests

from socialbot import config
from socialbot.publish import drive as gd
from socialbot.publish import linkedin as li
from socialbot.publish import youtube as yt


def youtube():
    from google_auth_oauthlib.flow import InstalledAppFlow
    if not yt.CLIENT_FILE.exists():
        raise SystemExit(f"Missing {yt.CLIENT_FILE}: create a Desktop OAuth client in GCP project pymasters-app "
                         "and save its JSON there.")
    flow = InstalledAppFlow.from_client_secrets_file(str(yt.CLIENT_FILE), yt.SCOPES)
    print("Opening Google consent in the browser. Choose the PyMasters channel (brand account) when asked.")
    creds = flow.run_local_server(port=8766, prompt="consent select_account", open_browser=True,
                                  success_message="PyMasters bot: YouTube access saved. You can close this tab.")
    yt.TOKEN_FILE.write_text(creds.to_json())
    yt.TOKEN_FILE.chmod(0o600)
    me = yt.client().channels().list(part="snippet", mine=True).execute()
    ch = me.get("items", [{}])[0]
    print(f"Authorised for channel: {ch.get('snippet', {}).get('title')} ({ch.get('id')})")
    if ch.get("id") != config.YOUTUBE_CHANNEL_ID:
        print(f"WARNING: expected channel {config.YOUTUBE_CHANNEL_ID}; re-run and pick the PyMasters channel.")


def drive():
    import subprocess
    target = config.GOOGLE_DRIVE_EMAIL
    cfile = gd.client_file()
    if cfile.exists():
        from google_auth_oauthlib.flow import InstalledAppFlow
        flow = InstalledAppFlow.from_client_secrets_file(str(cfile), gd.SCOPES)
        print(f"Opening Google consent in the browser. Sign in with {target} to approve Google Drive backup.")
        creds = flow.run_local_server(
            port=8767,
            prompt="consent select_account",
            login_hint=target,
            open_browser=True,
            success_message="PyMasters bot: Google Drive access saved. You can close this tab.",
        )
        gd.TOKEN_FILE.write_text(creds.to_json())
        gd.TOKEN_FILE.chmod(0o600)
    else:
        print(f"Opening Google consent in Eighty via gcloud for {target} (with Drive access, keeping active gcloud account unchanged).")
        subprocess.run(
            ["gcloud", "auth", "login", target, "--enable-gdrive-access", "--no-activate", "--force"],
            check=True,
        )
        gd.TOKEN_FILE.write_text(json.dumps({
            "mode": "gcloud",
            "account": target,
            "quota_project": gd.DEFAULT_QUOTA_PROJECT,
        }, indent=2))
        gd.TOKEN_FILE.chmod(0o600)
    try:
        email = gd.account_email()
    except Exception:
        gd.TOKEN_FILE.unlink(missing_ok=True)
        raise
    print(f"Authorised Google Drive account: {email}")
    if target and email.lower() != target.lower():
        raise SystemExit(f"Authorised account {email!r} does not match expected {target!r}; re-run and pick {target}.")


def linkedin(profile=None):
    """profile 'org' (company page; needs Community Management API approval) or 'member' (owner's profile).
    Default: org if its app is approved enough to try, else member."""
    profile = profile or ("org" if li.PROFILES["org"]["token"].exists() else "member")
    cfg = li.PROFILES[profile]
    if not cfg["app"].exists():
        raise SystemExit(f"Missing {cfg['app']} with the LinkedIn app's client_id and client_secret.")
    app = json.loads(cfg["app"].read_text())
    redirect = cfg["redirect"]
    port = int(urllib.parse.urlparse(redirect).port)
    state = secrets.token_urlsafe(24)
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] == state:
                got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h3>PyMasters bot: LinkedIn access received. You can close this tab.</h3>")

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = "https://www.linkedin.com/oauth/v2/authorization?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": app["client_id"], "redirect_uri": redirect, "state": state,
        "scope": " ".join(cfg["scopes"])})
    print(f"Opening LinkedIn consent in the browser ({profile}).")
    webbrowser.open(url)
    for _ in range(600):
        if "code" in got or "error" in got:
            break
        time.sleep(1)
    srv.shutdown()
    if "code" not in got:
        raise SystemExit(f"LinkedIn authorisation failed: {got.get('error_description') or got.get('error') or 'timeout'}")
    r = requests.post("https://www.linkedin.com/oauth/v2/accessToken", timeout=30, data={
        "grant_type": "authorization_code", "code": got["code"], "redirect_uri": redirect,
        "client_id": app["client_id"], "client_secret": app["client_secret"]})
    r.raise_for_status()
    tok = r.json()
    tok["expires_at"] = time.time() + tok.get("expires_in", 0)
    cfg["token"].write_text(json.dumps(tok))
    cfg["token"].chmod(0o600)
    print(f"LinkedIn access saved (expires in {tok.get('expires_in', 0) // 86400} days; refresh token: "
          f"{'yes' if tok.get('refresh_token') else 'no'}).")
