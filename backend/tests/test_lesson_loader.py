import pytest
import json
import os
import sys
from pathlib import Path

# Ensure backend root is on path (same pattern as test_classroom.py)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.classroom import _load_lesson_from_dir, _list_all_lessons


@pytest.fixture
def lessons_dir(tmp_path):
    """Create a temporary track-based lessons directory."""
    track_dir = tmp_path / "python_fundamentals"
    track_dir.mkdir()
    lesson = {
        "id": "test_lesson",
        "topic": "testing",
        "track": "python_fundamentals",
        "module": "basics",
        "order": 1,
        "title": {"en": "Test Lesson"},
        "description": {"en": "A test lesson"},
        "xp_reward": 50,
        "story_variants": {"en": "## Test\n\nHello"},
        "animation_sequence": [],
        "practice_challenges": []
    }
    (track_dir / "test_lesson.json").write_text(json.dumps(lesson))
    return tmp_path


def test_load_lesson_from_track_dir(lessons_dir):
    lesson = _load_lesson_from_dir("test_lesson", str(lessons_dir))
    assert lesson is not None
    assert lesson["id"] == "test_lesson"
    assert lesson["track"] == "python_fundamentals"


def test_list_all_lessons_from_tracks(lessons_dir):
    lessons = _list_all_lessons(str(lessons_dir))
    assert len(lessons) == 1
    assert lessons[0]["id"] == "test_lesson"


def test_load_nonexistent_lesson(lessons_dir):
    lesson = _load_lesson_from_dir("nonexistent", str(lessons_dir))
    assert lesson is None
