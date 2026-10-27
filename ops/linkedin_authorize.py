"""One-time LinkedIn authorisation for posting (member profile via Share on LinkedIn).

    python ops/linkedin_authorize.py [--client-id-name LINKEDIN_POST_CLIENT_ID] [--port 8766]

Reads the app's client id/secret from the vault (LINKEDIN_CLIENT_ID /
LINKEDIN_CLIENT_SECRET: the "PyMasters" app 253120161, which holds Share on
LinkedIn + Sign In with OpenID Connect; the separate Publisher app was deleted
2026-10-27), opens the LinkedIn consent page for scopes w_member_social +
openid + profile (member posting; page posting needs the Community Management
API, which this app does not have), receives the code on
http://localhost:<port>/ (register exactly that URL under the app's Auth tab →
Authorised redirect URLs), exchanges it for access + refresh tokens, stores them
in the vault (LINKEDIN_ACCESS_TOKEN / LINKEDIN_REFRESH_TOKEN) and in
pipeline/.linkedin_tokens.json (the publisher's cache), resolves the member URN
via /v2/userinfo and stores LINKEDIN_AUTHOR_URN (urn:li:person:…); if the token
also carries organisation scopes it stores LINKEDIN_ORG_URN. Then sets
LINKEDIN_AUTOPOST=1. After this the 06:30 pipeline and the social worker post
without further input.
"""

import argparse
import http.server
import json
import os
import secrets
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, "ops", "vault"))
from pmvault import Vault  # noqa: E402

SCOPES = os.environ.get("LINKEDIN_AUTH_SCOPES", "w_member_social openid profile")
AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
ACL_URL = ("https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR"
           "&state=APPROVED&projection=(elements*(organization~(localizedName,vanityName)))")
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
STORE_PATH = os.path.join(REPO, "pipeline", ".linkedin_tokens.json")


class _Handler(http.server.BaseHTTPRequestHandler):
    code = None
    state = None

    def do_GET(self):  # noqa: N802
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        _Handler.code = (q.get("code") or [None])[0]
        _Handler.state = (q.get("state") or [None])[0]
        err = (q.get("error_description") or q.get("error") or [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(("<h3>PyMasters LinkedIn authorisation " + ("failed: " + err if err else "complete") +
                          ". You can close this tab.</h3>").encode())

    def log_message(self, *a):  # silence
        pass


def _post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def _get_json(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}",
                                               "X-Restli-Protocol-Version": "2.0.0",
                                               "LinkedIn-Version": "202409"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id-name", default="LINKEDIN_CLIENT_ID")
    ap.add_argument("--client-secret-name", default="LINKEDIN_CLIENT_SECRET")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()

    v = Vault()
    cid = v.get(a.client_id_name) or v.get("LINKEDIN_CLIENT_ID")
    sec = v.get(a.client_secret_name) or v.get("LINKEDIN_CLIENT_SECRET")
    if not cid or not sec:
        print("LinkedIn client id/secret not in vault. Store them first:\n"
              "  python ops/vault/pmvault.py set LINKEDIN_CLIENT_ID --value ...\n"
              "  python ops/vault/pmvault.py set LINKEDIN_CLIENT_SECRET")
        return 1
    redirect = f"http://localhost:{a.port}/"
    state = secrets.token_urlsafe(16)
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": cid, "redirect_uri": redirect, "state": state, "scope": SCOPES})
    srv = http.server.HTTPServer(("127.0.0.1", a.port), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print("AUTH_URL:", url, flush=True)
    if not a.no_browser:
        webbrowser.open(url)
    deadline = time.time() + 600
    while _Handler.code is None and time.time() < deadline:
        time.sleep(1)
    srv.shutdown()
    if not _Handler.code:
        print("no authorisation code received (timeout or denied)")
        return 2
    if _Handler.state != state:
        print("state mismatch — aborting")
        return 3
    tok = _post_form(TOKEN_URL, {"grant_type": "authorization_code", "code": _Handler.code,
                                 "redirect_uri": redirect, "client_id": cid, "client_secret": sec})
    access, refresh = tok.get("access_token"), tok.get("refresh_token")
    if not access:
        print("token exchange failed:", tok)
        return 4
    now = int(time.time())
    store = {"access_token": access, "refresh_token": refresh,
             "access_expires_at": now + int(tok.get("expires_in", 0)),
             "refresh_expires_at": now + int(tok.get("refresh_token_expires_in", 0)),
             "client_id": cid}
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
    v.set("LINKEDIN_ACCESS_TOKEN", access, used_by="pipeline/actors/linkedin_publisher.py",
          note=f"issued {time.strftime('%Y-%m-%d')} by app {cid}; expires in {tok.get('expires_in')}s")
    if refresh:
        v.set("LINKEDIN_REFRESH_TOKEN", refresh, used_by="pipeline/actors/linkedin_auth.py",
              note=f"issued {time.strftime('%Y-%m-%d')} by app {cid}")
    v.set("LINKEDIN_CLIENT_ID", cid, used_by="pipeline LinkedIn auth (posting app)", note="posting app client id")
    v.set("LINKEDIN_CLIENT_SECRET", sec, used_by="pipeline LinkedIn auth (posting app)", note="posting app client secret")
    try:
        me = _get_json(USERINFO_URL, access)
        if me.get("sub"):
            v.set("LINKEDIN_AUTHOR_URN", f"urn:li:person:{me['sub']}", used_by="pipeline LinkedIn publisher",
                  note=f"member profile of {me.get('name', '?')} (Share on LinkedIn, w_member_social)")
            print(f"member: {me.get('name')} -> urn:li:person:{me['sub']}")
    except Exception as exc:  # noqa: BLE001
        print("userinfo lookup failed:", exc)
    try:
        acls = _get_json(ACL_URL, access) if "organization" in SCOPES else {"elements": []}
        orgs = [(e.get("organization"), (e.get("organization~") or {}).get("localizedName"))
                for e in acls.get("elements", [])]
    except Exception as exc:  # noqa: BLE001
        orgs = []
        print("organizationAcls lookup failed:", exc)
    if orgs:
        urn, name = orgs[0]
        v.set("LINKEDIN_ORG_URN", urn, used_by="pipeline LinkedIn publisher", note=f"company page: {name}")
        print(f"page: {name} -> {urn}")
    v.set("LINKEDIN_AUTOPOST", "1", used_by="pipeline/main.py, social_worker", note="master switch for daily LinkedIn posting")
    print("LinkedIn authorisation complete: tokens + author URN in vault, LINKEDIN_AUTOPOST=1."
          + ("" if refresh else "  NOTE: no refresh token returned — app lacks refresh-token grant; re-run before the 60-day expiry."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
