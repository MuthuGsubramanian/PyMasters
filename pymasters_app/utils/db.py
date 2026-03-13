"""Database helpers for the PyMasters application."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
import certifi

from pymasters_app.utils.local_db import LocalJSONDatabase

load_dotenv()


def _read_secret(key: str, default: str | None = None) -> str | None:
    """Read configuration values from env vars."""
    return os.getenv(key, default)


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_mongo_client() -> MongoClient:
    """Return a cached MongoDB client instance with a quick connectivity check."""
    uri = _read_secret("MONGODB_URI")
    if not uri:
        raise RuntimeError(
            "Missing Mongo connection string. Set MONGODB_URI in .env."
        )

    ca_file = _read_secret("MONGODB_TLS_CA_FILE") or certifi.where()
    allow_invalid = _is_truthy(_read_secret("MONGODB_TLS_ALLOW_INVALID_CERTS"))

    client_kwargs: dict[str, Any] = {
        "serverSelectionTimeoutMS": 10000,
        "tlsCAFile": None if allow_invalid else ca_file,
    }
    if allow_invalid:
        client_kwargs["tlsAllowInvalidCertificates"] = True

    client = MongoClient(uri, **client_kwargs)
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
    except Exception:
        return _get_or_create_local_db(database_name)
