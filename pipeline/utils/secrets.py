"""Secrets for the laptop automations — one call, no User env vars.

    from pipeline.utils.secrets import load_secrets
    load_secrets()            # injects every vault entry into os.environ (never overwrites a set var)

Backed by ops/vault/pmvault.py (Windows DPAPI, this user only). On machines
without a vault (CI, Cloud Run, Linux) it is a silent no-op, so the same code
runs everywhere: env vars win when present, the vault fills the gaps here.
"""

from __future__ import annotations

import os
import sys

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_VAULT_DIR = os.path.join(_REPO, "ops", "vault")
_loaded: list | None = None


def load_secrets(names: list | None = None) -> list:
    """Returns the names injected (empty when no vault / not Windows)."""
    global _loaded
    if _loaded is not None and names is None:
        return _loaded
    if os.name != "nt":
        _loaded = []
        return _loaded
    try:
        if _VAULT_DIR not in sys.path:
            sys.path.insert(0, _VAULT_DIR)
        from pmvault import Vault  # type: ignore
        v = Vault()
        injected = v.load_into_env(names)
        # File-kind entries: expose a path for libraries that need one.
        if "YOUTUBE_CLIENT_SECRET_JSON" in v.names() and not os.environ.get("YOUTUBE_CLIENT_SECRETS_FILE"):
            os.environ["YOUTUBE_CLIENT_SECRETS_FILE"] = v.materialize_file(
                "YOUTUBE_CLIENT_SECRET_JSON",
                os.path.join(os.path.expanduser("~"), ".pymasters", "youtube_client_secret.json"))
            injected.append("YOUTUBE_CLIENT_SECRETS_FILE")
    except Exception as exc:  # noqa: BLE001 — never break a pipeline run over secrets plumbing
        print(f"[secrets] vault unavailable: {exc}", file=sys.stderr)
        injected = []
    if names is None:
        _loaded = injected
    return injected
