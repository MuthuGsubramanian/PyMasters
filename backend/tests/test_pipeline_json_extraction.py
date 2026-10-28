"""Tests for modules.pipeline._extract_json's control-character repair.

Live bug (2026-10-28): stage_2_narrative asks the model for a JSON object
shaped {"en": "...markdown...", "ta": "..."} with multi-line markdown inside
the string values. Models routinely emit raw (unescaped) newlines there,
which makes _extract_json's json.loads attempts fail outright and fall back
to {"raw": raw} — which then made stage_2_narrative silently produce a thin
stub narrative on every real run.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from modules.pipeline import _extract_json


def test_recovers_object_with_raw_newlines_in_string_value():
    broken = '{"en": "## Title\n\nSome narrative text.", "ta": ""}'
    result = _extract_json(broken)
    assert result == {"en": "## Title\n\nSome narrative text.", "ta": ""}


def test_recovers_object_wrapped_in_surrounding_prose():
    broken = 'Sure, here you go:\n{"en": "## Title\n\nBody text.", "ta": ""}\nHope that helps!'
    result = _extract_json(broken)
    assert result["en"] == "## Title\n\nBody text."


def test_still_handles_already_valid_json():
    valid = json.dumps({"en": "line1\nline2", "ta": ""})
    assert _extract_json(valid) == {"en": "line1\nline2", "ta": ""}


def test_strips_markdown_code_fence_before_repair():
    broken = '```json\n{"en": "## Title\n\nBody.", "ta": ""}\n```'
    result = _extract_json(broken)
    assert result["en"] == "## Title\n\nBody."


def test_genuinely_unparseable_text_still_falls_back_to_raw():
    garbage = "not json at all, no braces here"
    assert _extract_json(garbage) == {"raw": garbage}
