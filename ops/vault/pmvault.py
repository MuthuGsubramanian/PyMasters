#!/usr/bin/env python
"""
pmvault — PyMasters local secret store for the dedicated ops laptop.

Every value is encrypted with Windows DPAPI in CurrentUser scope, so it can
only be decrypted by this Windows account on this machine (no master password
to remember, nothing readable if the file is copied elsewhere). No third-party
packages: DPAPI is called through ctypes.

Store:   %USERPROFILE%\\.pymasters\\vault\\store.json   (encrypted values + metadata)
Index:   %USERPROFILE%\\.pymasters\\SECRETS_INDEX.md     (what is where — names only)

CLI (run with any Python 3.10+ on the laptop):
    python ops/vault/pmvault.py set NAME [--note "..."] [--used-by "..."]   # value from stdin / prompt
    python ops/vault/pmvault.py set NAME --value "..."                      # value inline (avoid in shell history)
    python ops/vault/pmvault.py set-file NAME path\\to\\file                # store a whole file (e.g. OAuth client JSON)
    python ops/vault/pmvault.py get NAME                                    # prints the plaintext value
    python ops/vault/pmvault.py list                                        # names + notes, never values
    python ops/vault/pmvault.py rm NAME
    python ops/vault/pmvault.py import-env path\\to\\.env [--used-by "..."]  # bulk import KEY=VALUE lines
    python ops/vault/pmvault.py run -- <command ...>                        # run a command with every secret in env
    python ops/vault/pmvault.py write-index                                 # regenerate SECRETS_INDEX.md

Python:
    from pmvault import Vault; v = Vault(); v.get("QUBRID2_API_KEY"); v.load_into_env()
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import ctypes.wintypes as wt
import getpass
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

VAULT_DIR = os.path.join(os.path.expanduser("~"), ".pymasters", "vault")
STORE_PATH = os.path.join(VAULT_DIR, "store.json")
INDEX_PATH = os.path.join(os.path.expanduser("~"), ".pymasters", "SECRETS_INDEX.md")
ENTROPY = b"pymasters-vault-v1"  # optional extra entropy bound into every blob


# ---------------------------------------------------------------------------
# DPAPI via ctypes
# ---------------------------------------------------------------------------

class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data: bytes) -> _DATA_BLOB:
    buf = ctypes.create_string_buffer(data, len(data))
    return _DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))


def _blob_bytes(blob: _DATA_BLOB) -> bytes:
    data = ctypes.string_at(blob.pbData, blob.cbData)
    ctypes.windll.kernel32.LocalFree(blob.pbData)
    return data


def dpapi_protect(data: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("pmvault only runs on Windows (DPAPI)")
    inp, ent, out = _blob(data), _blob(ENTROPY), _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptProtectData(ctypes.byref(inp), "pmvault", ctypes.byref(ent),
                                                None, None, 0, ctypes.byref(out))
    if not ok:
        raise ctypes.WinError()
    return _blob_bytes(out)


def dpapi_unprotect(data: bytes) -> bytes:
    inp, ent, out = _blob(data), _blob(ENTROPY), _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp), None, ctypes.byref(ent),
                                                  None, None, 0, ctypes.byref(out))
    if not ok:
        raise ctypes.WinError()
    return _blob_bytes(out)


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

class Vault:
    def __init__(self, store_path: str = STORE_PATH):
        self.store_path = store_path
        self._data = self._read()

    def _read(self) -> dict:
        try:
            with open(self.store_path, encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {"version": 1, "entries": {}}

    def _write(self) -> None:
        os.makedirs(os.path.dirname(self.store_path), exist_ok=True)
        tmp = self.store_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, sort_keys=True)
        os.replace(tmp, self.store_path)
        try:  # keep the vault dir private to this user (icacls is best-effort)
            subprocess.run(["icacls", os.path.dirname(self.store_path), "/inheritance:r",
                            "/grant:r", f"{os.environ.get('USERNAME', '')}:(OI)(CI)F"],
                           capture_output=True, timeout=20)
        except Exception:  # noqa: BLE001
            pass
        write_index(self)

    # -- CRUD -------------------------------------------------------------
    def set(self, name: str, value: str, note: str = "", used_by: str = "", kind: str = "secret") -> None:
        name = name.strip()
        if not name or any(c.isspace() for c in name):
            raise ValueError("secret name must be a single token like QUBRID2_API_KEY")
        enc = base64.b64encode(dpapi_protect(value.encode("utf-8"))).decode("ascii")
        prev = self._data["entries"].get(name, {})
        self._data["entries"][name] = {
            "dpapi": enc,
            "kind": kind,
            "note": note or prev.get("note", ""),
            "used_by": used_by or prev.get("used_by", ""),
            "created_at": prev.get("created_at") or _now(),
            "updated_at": _now(),
            "length": len(value),
        }
        self._write()

    def get(self, name: str, default: str | None = None) -> str | None:
        e = self._data["entries"].get(name)
        if not e:
            return default
        return dpapi_unprotect(base64.b64decode(e["dpapi"])).decode("utf-8")

    def remove(self, name: str) -> bool:
        if name in self._data["entries"]:
            del self._data["entries"][name]
            self._write()
            return True
        return False

    def names(self) -> list:
        return sorted(self._data["entries"])

    def meta(self, name: str) -> dict:
        e = dict(self._data["entries"].get(name, {}))
        e.pop("dpapi", None)
        return e

    def load_into_env(self, names: list | None = None, overwrite: bool = False) -> list:
        """Inject secrets into os.environ (default: all string-kind entries,
        only where the variable is not already set). Returns names injected."""
        out = []
        for n in (names or self.names()):
            if self._data["entries"].get(n, {}).get("kind") == "file":
                continue
            if overwrite or not os.environ.get(n):
                v = self.get(n)
                if v is not None:
                    os.environ[n] = v
                    out.append(n)
        return out

    def materialize_file(self, name: str, target: str | None = None) -> str:
        """Write a file-kind entry to disk (default: a private temp file) and
        return the path — for libraries that insist on a path (OAuth JSON)."""
        content = self.get(name)
        if content is None:
            raise KeyError(name)
        if target is None:
            fd, target = tempfile.mkstemp(prefix=f"pmv_{name}_", suffix=".json")
            os.close(fd)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return target


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_index(v: "Vault") -> None:
    """SECRETS_INDEX.md — what is where. Names, purpose, consumers. Never values."""
    lines = [
        "# PyMasters secrets — what is where",
        "",
        f"_Auto-generated by ops/vault/pmvault.py on {_now()}; edit notes with `pmvault set NAME --note ...`._",
        "",
        "## Local vault (this laptop, DPAPI, user muthu.MSG)",
        "",
        f"Store: `{STORE_PATH}` — values encrypted per-user; read with `python ops/vault/pmvault.py get NAME`.",
        "",
        "| Name | Kind | Used by | Note | Updated |",
        "|---|---|---|---|---|",
    ]
    for n in v.names():
        m = v.meta(n)
        lines.append(f"| `{n}` | {m.get('kind','secret')} | {m.get('used_by','')} | {m.get('note','')} | {m.get('updated_at','')[:10]} |")
    lines += [
        "",
        "## Elsewhere",
        "",
        "| Where | What | Access |",
        "|---|---|---|",
        "| GCP Secret Manager, project `pymasters-app` | jwt-secret, ollama-api-key, qubrid-api-key, smtp-*/brevo, export-token, github-token, GITHUB/LINKEDIN OAuth client id+secret, linkedin-access-token, linkedin-refresh-token | `gcloud secrets versions access latest --secret=NAME --project pymasters-app` as muthu@pymasters.net (Owner). The gmail account is Editor only and cannot read them. |",
        "| GitHub repo secrets (MuthuGsubramanian/PyMasters) | GCP_PROJECT_ID, WIF provider/SA for deploy, SOCIAL_WORKER_TOKEN | GitHub → Settings → Secrets; deploy.yml consumes them. |",
        "| GitHub CLI keyring (this laptop) | gh token for account MSG-88 (scopes gist, read:org, repo) | `gh auth token` |",
        "| gcloud credentials (this laptop) | muthu.g.subramanian@gmail.com (active, Editor), muthu@pymasters.net (Owner; needs `gcloud auth login`) | `gcloud auth list` |",
        "| `~/.pymasters/youtube_client_secret.json` | Google OAuth web client for YouTube upload (also stored in vault as YOUTUBE_CLIENT_SECRET_JSON) | pipeline/video/upload_youtube.py via YOUTUBE_CLIENT_SECRETS_FILE |",
        "| `pipeline/.youtube_token.json` (gitignored) | YouTube refresh token — created by ops/youtube_authorize.py | pipeline/video/upload_youtube.py |",
        "| `pipeline/.linkedin_tokens.json` (gitignored) | LinkedIn token cache (auto-refresh) | pipeline/actors/linkedin_auth.py |",
        "| `backend/.env` (gitignored) | local dev copy of several keys — superseded by the vault; keep in sync or delete | backend dev only |",
        "",
        "## Rules",
        "",
        "- Never paste secret values into chat, commit messages, docs or the repo. Put them in the vault; reference by name.",
        "- Laptop automations (Task Scheduler) get secrets via `pipeline/utils/secrets.py` → vault, not via User env vars.",
        "- Rotate at the issuer, then `pmvault set NAME`; the index updates itself.",
    ]
    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_env_file(path: str) -> dict:
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            out[k] = v
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="pmvault", description="PyMasters local secret vault (Windows DPAPI)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("set"); s.add_argument("name"); s.add_argument("--value"); s.add_argument("--note", default=""); s.add_argument("--used-by", default="")
    sf = sub.add_parser("set-file"); sf.add_argument("name"); sf.add_argument("path"); sf.add_argument("--note", default=""); sf.add_argument("--used-by", default="")
    g = sub.add_parser("get"); g.add_argument("name")
    sub.add_parser("list")
    r = sub.add_parser("rm"); r.add_argument("name")
    i = sub.add_parser("import-env"); i.add_argument("path"); i.add_argument("--used-by", default=""); i.add_argument("--prefix", default="")
    run = sub.add_parser("run"); run.add_argument("command", nargs=argparse.REMAINDER)
    sub.add_parser("write-index")
    a = ap.parse_args(argv)
    v = Vault()

    if a.cmd == "set":
        value = a.value
        if value is None:
            value = sys.stdin.read().strip() if not sys.stdin.isatty() else getpass.getpass(f"Value for {a.name}: ")
        v.set(a.name, value, note=a.note, used_by=a.used_by)
        print(f"stored {a.name} ({len(value)} chars)")
    elif a.cmd == "set-file":
        with open(a.path, encoding="utf-8") as f:
            v.set(a.name, f.read(), note=a.note or f"file: {os.path.basename(a.path)}", used_by=a.used_by, kind="file")
        print(f"stored file {a.name}")
    elif a.cmd == "get":
        val = v.get(a.name)
        if val is None:
            print(f"no such secret: {a.name}", file=sys.stderr); return 1
        sys.stdout.write(val)
    elif a.cmd == "list":
        for n in v.names():
            m = v.meta(n)
            print(f"{n:34} {m.get('kind','secret'):6} len={m.get('length','?'):<5} {m.get('used_by','')}  {m.get('note','')}")
    elif a.cmd == "rm":
        print("removed" if v.remove(a.name) else "not found")
    elif a.cmd == "import-env":
        n = 0
        for k, val in _parse_env_file(a.path).items():
            v.set(a.prefix + k, val, used_by=a.used_by, note=f"imported from {os.path.basename(a.path)}")
            n += 1
        print(f"imported {n} entries")
    elif a.cmd == "run":
        cmd = [c for c in a.command if c != "--"]
        if not cmd:
            print("usage: pmvault run -- <command ...>", file=sys.stderr); return 2
        env = dict(os.environ)
        for n in v.names():
            if v.meta(n).get("kind") != "file" and not env.get(n):
                env[n] = v.get(n)
        return subprocess.call(cmd, env=env)
    elif a.cmd == "write-index":
        write_index(v); print(INDEX_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
