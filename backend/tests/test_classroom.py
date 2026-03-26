"""
Tests for the /api/classroom router (routes/classroom.py).
Uses a minimal FastAPI app with only the classroom router mounted.
"""

import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure backend root is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.classroom import router

# ---------------------------------------------------------------------------
# Minimal test app
# ---------------------------------------------------------------------------

app = FastAPI()
app.include_router(router)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_list_lessons_endpoint():
    """GET /api/classroom/lessons returns a dict with a 'lessons' key containing a list."""
    response = client.get("/api/classroom/lessons")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, dict), f"Expected a dict, got: {type(data)}"
    assert "lessons" in data, f"Expected 'lessons' key in response, got: {list(data.keys())}"
    assert isinstance(data["lessons"], list), f"Expected data['lessons'] to be a list, got: {type(data['lessons'])}"
