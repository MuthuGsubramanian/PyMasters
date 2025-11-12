"""Database helpers for the PyMasters application."""
from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
import streamlit as st

load_dotenv()


@st.cache_resource(show_spinner=False)
def get_mongo_client() -> MongoClient:
    """Return a cached MongoDB client instance."""
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError(
            "Missing Mongo connection string. Set the MONGODB_URI in your environment or .env file."
        )

    client = MongoClient(uri)
    return client


def get_database(db_name: str | None = None) -> Any:
    """Return the configured MongoDB database."""
    client = get_mongo_client()
    database_name = db_name or os.getenv("MONGODB_DB", "pymasters")
    return client[database_name]
