"""Facts stated in lesson text must match what Python really does (found while writing Under the hood, 2026-11-05).

dsa/heaps showed heapify([5, 3, 8, 1, 2]) as [1, 2, 8, 5, 3] (it is [1, 2, 8, 3, 5]); working_with_data/
working_with_dates said "2026-1-15" < "2026-06-09" is True as strings (it is False).
"""
import heapq
import json
import os

LESSONS = os.path.join(os.path.dirname(__file__), "..", "lessons")


def _raw(track, lesson_id):
    with open(os.path.join(LESSONS, track, f"{lesson_id}.json"), encoding="utf-8") as fh:
        return fh.read()


def test_heaps_lesson_shows_the_real_heapify_result():
    data = [5, 3, 8, 1, 2]
    heapq.heapify(data)
    raw = _raw("dsa", "heaps")
    assert str(data) in raw
    assert "[1, 2, 8, 5, 3]" not in raw


def test_dates_lesson_states_the_real_string_comparison():
    assert ("2026-1-15" < "2026-06-09") is False
    story = json.loads(_raw("working_with_data", "working_with_dates"))["story_variants"]["en"]
    assert '`"2026-1-15" < "2026-06-09"` is `False` as strings' in story
