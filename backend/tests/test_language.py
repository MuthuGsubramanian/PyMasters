"""
Tests for the /api/languages router (routes/language.py).
Uses a minimal FastAPI app with only the language router mounted.
"""

import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure backend root is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.language import router

# ---------------------------------------------------------------------------
# Minimal test app
# ---------------------------------------------------------------------------

app = FastAPI()
app.include_router(router)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_list_languages():
    """GET /api/languages returns supported and blocked language lists."""
    response = client.get("/api/languages")
    assert response.status_code == 200

    data = response.json()
    assert "supported" in data
    assert "blocked" in data

    # Supported list should include all 8 languages
    supported_codes = {lang["code"] for lang in data["supported"]}
    expected_codes = {"en", "ta", "te", "ml", "fr", "es", "it", "ko"}
    assert expected_codes == supported_codes

    # Blocked list should include 'hi'
    blocked_codes = {lang["code"] for lang in data["blocked"]}
    assert "hi" in blocked_codes


def test_check_supported_language():
    """GET /api/languages/check/{code} returns 200 for a valid supported language."""
    response = client.get("/api/languages/check/ta")
    assert response.status_code == 200

    data = response.json()
    assert data["code"] == "ta"
    assert data["name"] == "Tamil"
    assert data["supported"] is True


def test_check_hindi_blocked():
    """GET /api/languages/check/hi returns 400 with explicit Hindi block message."""
    response = client.get("/api/languages/check/hi")
    assert response.status_code == 400

    data = response.json()
    assert "Hindi" in data["detail"]
    assert "not supported" in data["detail"]


def test_check_unknown_language():
    """GET /api/languages/check/{code} returns 404 for an unknown language code."""
    response = client.get("/api/languages/check/xx")
    assert response.status_code == 404

    data = response.json()
    assert "detail" in data
