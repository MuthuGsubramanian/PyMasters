"""Database helpers for the PyMasters application."""
from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
import certifi
import streamlit as st

from pymasters_app.utils.local_db import LocalJSONDatabase

load_dotenv()


@st.cache_resource(show_spinner=False)
def get_mongo_client() -> MongoClient:
    """Return a cached MongoDB client instance with a quick connectivity check.

    Reads from env or Streamlit secrets and pings the server to fail fast with
    a helpful error when the cluster is unreachable.
    """
    uri = os.getenv("MONGODB_URI")
    if not uri:
        # Try Streamlit secrets if available (e.g., Streamlit Cloud)
        try:
            uri = st.secrets.get("MONGODB_URI", None)  # type: ignore[attr-defined]
        except Exception:
            uri = None
    if not uri:
        raise RuntimeError(
            "Missing Mongo connection string. Set MONGODB_URI in .env or Streamlit secrets."
        )

    # Use certifi CA bundle to avoid Windows/macOS trust store mismatches with Atlas
    # Allow override via MONGODB_TLS_CA_FILE if a custom corporate CA is needed
    ca_file = os.getenv("MONGODB_TLS_CA_FILE") or certifi.where()
    client = MongoClient(
        uri,
        serverSelectionTimeoutMS=10000,
        tlsCAFile=ca_file,
    )
    try:
        client.admin.command("ping")
    except Exception as exc:
        raise RuntimeError(
            f"Unable to connect to MongoDB (check URI, credentials, and IP allowlist): {exc}"
        ) from exc
    return client


_LOCAL_DATABASES: dict[str, LocalJSONDatabase] = {}


def _get_or_create_local_db(name: str) -> LocalJSONDatabase:
    if name not in _LOCAL_DATABASES:
        _LOCAL_DATABASES[name] = LocalJSONDatabase(name=name)
    return _LOCAL_DATABASES[name]


def get_database(db_name: str | None = None) -> Any:
    """Return the configured MongoDB database or a resilient local fallback."""

    database_name = db_name or os.getenv("MONGODB_DB", "pymasters")
    try:
        client = get_mongo_client()
        return client[database_name]
    except Exception as exc:
        st.warning(
            f"MongoDB connection unavailable — using the built-in encrypted local store. ({exc})",
            icon="⚠️",
        )
        return _get_or_create_local_db(database_name)
