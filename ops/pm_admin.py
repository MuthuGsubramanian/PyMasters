"""pm_admin — super-admin API calls from the ops laptop, authenticated with the
vault's ops token (no personal password anywhere).

    python ops/pm_admin.py get  /api/admin/vaathiyaar/health
    python ops/pm_admin.py post /api/admin/vaathiyaar/refresh-model
    python ops/pm_admin.py get  /api/admin/overview
    python ops/pm_admin.py get  "/api/admin/users?limit=5"
    python ops/pm_admin.py post /api/admin/lifecycle/run '{"dry_run": true}'

Env PYMASTERS_API (default https://pymasters.net) selects the deployment; the
VPS can be targeted the same way after the migration.
"""

import json
import os
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)
from pipeline.utils.secrets import load_secrets  # noqa: E402

load_secrets()
BASE = os.getenv("PYMASTERS_API", "https://pymasters.net").rstrip("/")


def _request(method: str, path: str, body=None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json",
                                          **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]


def admin_session() -> str:
    ops = os.getenv("PYMASTERS_OPS_TOKEN", "").strip()
    if not ops:
        raise SystemExit("PYMASTERS_OPS_TOKEN not in vault/env")
    status, out = _request("POST", "/api/admin/service-login", {"token": ops})
    if status != 200:
        raise SystemExit(f"service-login failed: {status} {out}")
    return out["access_token"]


def main(argv) -> int:
    if len(argv) < 2 or argv[0] not in ("get", "post", "put", "delete"):
        print(__doc__)
        return 2
    method, path = argv[0].upper(), argv[1]
    # Git Bash rewrites a leading "/api/..." into a Windows path; accept both forms.
    path = "/" + path.split("/api/", 1)[-1].lstrip("/") if "/api/" in path or path.startswith("api/") else path
    if path.startswith("/") and not path.startswith("/api/"):
        path = "/api/" + path.lstrip("/")
    body = json.loads(argv[2]) if len(argv) > 2 else None
    status, out = _request(method, path, body, admin_session())
    print(status)
    print(json.dumps(out, indent=2, ensure_ascii=False) if not isinstance(out, str) else out)
    return 0 if status < 400 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
