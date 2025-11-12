"""Database helpers for the PyMasters application."""
from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError
import streamlit as st

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

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except Exception as exc:
        raise RuntimeError(
            f"Unable to connect to MongoDB (check URI, credentials, and IP allowlist): {exc}"
        ) from exc
    return client


def get_database(db_name: str | None = None) -> Any:
    """Return the configured MongoDB database."""
    client = get_mongo_client()
    database_name = db_name or os.getenv("MONGODB_DB", "pymasters")
    return client[database_name]
