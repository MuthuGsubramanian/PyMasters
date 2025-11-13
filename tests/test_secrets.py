import os
import importlib

import pytest


def test_get_client_credentials_prefers_env(monkeypatch):
    # Ensure env has precedence over Streamlit secrets
    monkeypatch.setenv("CLIENT_ID", "env_id")
    monkeypatch.setenv("CLIENT_SECRET", "env_secret")

    # Simulate Streamlit secrets also being set
    import streamlit as st

    monkeypatch.setattr(st, "secrets", {"CLIENT_ID": "secret_id", "CLIENT_SECRET": "secret_secret"}, raising=False)

    from pymasters_app.utils.secrets import get_client_credentials

    cid, csec = get_client_credentials()
    assert cid == "env_id"
    assert csec == "env_secret"


def test_get_client_credentials_from_streamlit_secrets(monkeypatch):
    # Clear env
    monkeypatch.delenv("CLIENT_ID", raising=False)
    monkeypatch.delenv("CLIENT_SECRET", raising=False)
    monkeypatch.delenv("OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("OAUTH_CLIENT_SECRET", raising=False)

    # Provide via Streamlit secrets mapping
    import streamlit as st

    monkeypatch.setattr(st, "secrets", {"CLIENT_ID": "secret_id", "CLIENT_SECRET": "secret_secret"}, raising=False)

    from pymasters_app.utils.secrets import get_client_credentials

    cid, csec = get_client_credentials()
    assert cid == "secret_id"
    assert csec == "secret_secret"

