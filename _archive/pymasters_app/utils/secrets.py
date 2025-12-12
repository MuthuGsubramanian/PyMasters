"""Helpers to load secrets from environment or Streamlit secrets.

This supports local development via `.env` as well as deployment on
Streamlit Cloud where secrets are provided via TOML.
"""
from __future__ import annotations

import os
from typing import Optional, Tuple


def get_secret(name: str, default: Optional[str] = None) -> Optional[str]:
    """Return a secret from env or Streamlit secrets.

    - Checks `os.environ[name]` first.
    - Falls back to `st.secrets[name]` if available.
    - Returns `default` if not found.
    """
    value = os.getenv(name)
    if value:
        return value

    try:
        import streamlit as st  # import lazily to avoid import-time side effects

        secrets_obj = getattr(st, "secrets", None)
        if secrets_obj is None:
            return default

        # Support both Mapping-like and object with .get
        try:
            if hasattr(secrets_obj, "get"):
                return secrets_obj.get(name, default)
            return secrets_obj[name]  # type: ignore[index]
        except Exception:
            return default
    except Exception:
        return default


def get_client_credentials() -> Tuple[Optional[str], Optional[str]]:
    """Return `(client_id, client_secret)` from env or Streamlit secrets.

    Supports common aliases: CLIENT_ID/OAUTH_CLIENT_ID/{PROVIDER}_CLIENT_ID.
    Environment variables take precedence over Streamlit secrets.
    """

    id_keys = [
        "CLIENT_ID",
        "OAUTH_CLIENT_ID",
        "GOOGLE_CLIENT_ID",
        "GITHUB_CLIENT_ID",
        "AZURE_CLIENT_ID",
    ]
    secret_keys = [
        "CLIENT_SECRET",
        "OAUTH_CLIENT_SECRET",
        "GOOGLE_CLIENT_SECRET",
        "GITHUB_CLIENT_SECRET",
        "AZURE_CLIENT_SECRET",
    ]

    def first_of(keys: list[str]) -> Optional[str]:
        for k in keys:
            v = get_secret(k)
            if v:
                return v
        return None

    return first_of(id_keys), first_of(secret_keys)

