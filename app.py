"""Thin launcher to the modern PyMasters app in pymasters_app/main.py.

This keeps a single, consistent UI/UX entrypoint.
"""
from __future__ import annotations

# Importing this module performs all Streamlit rendering and configuration.
import pymasters_app.main  # noqa: F401

