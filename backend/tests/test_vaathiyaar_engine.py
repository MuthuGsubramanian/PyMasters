"""
Tests for the Vaathiyaar Engine: modelfile prompt builder and response parser.

These tests do NOT make live API calls. They only exercise:
  - build_system_prompt (modelfile.py)
  - parse_vaathiyaar_response (engine.py)
"""

import json
import sys
import os

import pytest

# Ensure the backend package root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar.modelfile import build_system_prompt, ANIMATION_INSTRUCTIONS
from vaathiyaar.engine import parse_vaathiyaar_response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_PROFILE = {
    "name": "Anbu",
    "skill_level": "beginner",
    "preferred_language": "ta",
    "motivation": "career change",
    "known_languages": "none",
    "learning_style": "visual",
    "goal": "become a Python developer",
    "diagnostic_score": 35.0,
    "mastery_topics": [
        {"topic": "variables", "mastery_level": 0.6},
        {"topic": "loops", "mastery_level": 0.3},
    ],
}

SAMPLE_CONTEXT = {
    "module_id": "module_1",
    "module_title": "Python Basics: Variables & Types",
    "topic": "variables",
    "phase": "story",
    "session_id": "sess-abc123",
    "attempt_count": 2,
}


# ---------------------------------------------------------------------------
# build_system_prompt — with full profile
# ---------------------------------------------------------------------------

class TestBuildSystemPromptWithProfile:
    def test_contains_student_name(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "Anbu" in prompt

    def test_contains_skill_level(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "beginner" in prompt

    def test_contains_preferred_language(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        # The builder maps "ta" → "Tamil"
        assert "Tamil" in prompt

    def test_contains_motivation(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "career change" in prompt

    def test_contains_goal(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "become a Python developer" in prompt

    def test_contains_diagnostic_score(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "35.0" in prompt

    def test_contains_mastery_topics(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "variables" in prompt
        assert "loops" in prompt

    def test_contains_module_title(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "Python Basics: Variables & Types" in prompt

    def test_contains_session_id(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "sess-abc123" in prompt

    def test_contains_attempt_count(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "2" in prompt

    def test_prompt_is_string(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert isinstance(prompt, str)

    def test_prompt_not_empty(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert len(prompt) > 500  # should be a substantial prompt


# ---------------------------------------------------------------------------
# build_system_prompt — no profile (new student fallback)
# ---------------------------------------------------------------------------

class TestBuildSystemPromptNoProfile:
    def test_no_profile_returns_string(self):
        prompt = build_system_prompt()
        assert isinstance(prompt, str)

    def test_no_profile_not_empty(self):
        prompt = build_system_prompt()
        assert len(prompt) > 200

    def test_no_profile_uses_fallback_name(self):
        prompt = build_system_prompt()
        # Default name is "the student"
        assert "the student" in prompt

    def test_no_profile_uses_fallback_skill_level(self):
        prompt = build_system_prompt()
        assert "beginner" in prompt

    def test_no_profile_uses_fallback_language(self):
        prompt = build_system_prompt()
        # Default preferred_language "en" → "English"
        assert "English" in prompt

    def test_no_profile_mastery_fallback_message(self):
        prompt = build_system_prompt()
        assert "new student" in prompt or "none recorded" in prompt

    def test_no_context_fallback_message(self):
        prompt = build_system_prompt()
        assert "No specific lesson loaded" in prompt

    def test_partial_profile_only_name(self):
        prompt = build_system_prompt({"name": "Kavi"})
        assert "Kavi" in prompt
        assert "beginner" in prompt  # still uses default skill level


# ---------------------------------------------------------------------------
# build_system_prompt — animation instructions present
# ---------------------------------------------------------------------------

class TestBuildSystemPromptContainsAnimationInstructions:
    ANIMATION_PRIMITIVE_NAMES = [
        "StoryCard",
        "CodeStepper",
        "VariableBox",
        "Terminal",
        "DataStructure",
        "FlowArrow",
        "MemoryStack",
        "ComparisonPanel",
        "ParticleEffect",
        "ConceptMap",
    ]

    def test_all_ten_primitives_present(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        for primitive in self.ANIMATION_PRIMITIVE_NAMES:
            assert primitive in prompt, f"Animation primitive '{primitive}' not found in prompt"

    def test_animation_instructions_constant_contains_all_primitives(self):
        for primitive in self.ANIMATION_PRIMITIVE_NAMES:
            assert primitive in ANIMATION_INSTRUCTIONS, (
                f"'{primitive}' missing from ANIMATION_INSTRUCTIONS constant"
            )

    def test_response_format_in_prompt(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        # The response format section should define required keys
        assert "practice_challenge" in prompt
        assert "profile_update" in prompt
        assert "animation" in prompt

    def test_vaathiyaar_identity_in_prompt(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        assert "Vaathiyaar" in prompt

    def test_story_arc_phases_mentioned(self):
        prompt = build_system_prompt(SAMPLE_PROFILE, SAMPLE_CONTEXT)
        for phase in ["Story", "Visual", "Code", "Practice"]:
            assert phase in prompt, f"Teaching arc phase '{phase}' not found in prompt"


# ---------------------------------------------------------------------------
# parse_vaathiyaar_response — clean JSON
# ---------------------------------------------------------------------------

class TestParseValidJsonResponse:
    def _make_valid_json(self, **overrides):
        base = {
            "message": "Vanakkam! Let's explore variables like clay pots.",
            "phase": "story",
            "animation": {
                "type": "StoryCard",
                "title": "The Clay Pot",
                "body": "A variable is like a clay pot — it holds something.",
                "image_hint": "Tamil potter shaping clay",
                "accent_color": "#F4A261",
            },
            "practice_challenge": None,
            "profile_update": {
                "topic_practiced": "variables",
                "struggle_detected": False,
                "mastery_delta": 0.05,
                "emotion_signal": "excited",
            },
        }
        base.update(overrides)
        return json.dumps(base)

    def test_returns_dict(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        assert isinstance(result, dict)

    def test_message_preserved(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        assert result["message"] == "Vanakkam! Let's explore variables like clay pots."

    def test_phase_preserved(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        assert result["phase"] == "story"

    def test_animation_preserved(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        assert result["animation"]["type"] == "StoryCard"

    def test_profile_update_preserved(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        assert result["profile_update"]["emotion_signal"] == "excited"

    def test_all_required_keys_present(self):
        result = parse_vaathiyaar_response(self._make_valid_json())
        for key in ("message", "phase", "animation", "practice_challenge", "profile_update"):
            assert key in result, f"Key '{key}' missing from parsed response"

    def test_null_animation_preserved(self):
        result = parse_vaathiyaar_response(self._make_valid_json(animation=None))
        assert result["animation"] is None

    def test_missing_optional_keys_get_defaults(self):
        # A JSON response that only includes 'message' — other keys should get defaults
        minimal = json.dumps({"message": "Hello student!"})
        result = parse_vaathiyaar_response(minimal)
        assert result["message"] == "Hello student!"
        assert result["phase"] == "feedback"  # default
        assert result["animation"] is None
        assert result["practice_challenge"] is None
        assert result["profile_update"] is not None


# ---------------------------------------------------------------------------
# parse_vaathiyaar_response — JSON with code fences
# ---------------------------------------------------------------------------

class TestParseJsonWithCodeFences:
    def _wrap_in_fences(self, payload: dict, lang: str = "json") -> str:
        return f"```{lang}\n{json.dumps(payload)}\n```"

    def _sample_payload(self):
        return {
            "message": "Here is a CodeStepper example.",
            "phase": "code",
            "animation": {"type": "CodeStepper", "code": "print('hello')", "steps": [], "language": "python"},
            "practice_challenge": None,
            "profile_update": {
                "topic_practiced": "print",
                "struggle_detected": False,
                "mastery_delta": 0.02,
                "emotion_signal": "neutral",
            },
        }

    def test_strips_json_fence(self):
        raw = self._wrap_in_fences(self._sample_payload(), "json")
        result = parse_vaathiyaar_response(raw)
        assert result["message"] == "Here is a CodeStepper example."

    def test_strips_plain_fence(self):
        raw = self._wrap_in_fences(self._sample_payload(), "")
        result = parse_vaathiyaar_response(raw)
        assert result["phase"] == "code"

    def test_animation_intact_after_fence_strip(self):
        raw = self._wrap_in_fences(self._sample_payload(), "json")
        result = parse_vaathiyaar_response(raw)
        assert result["animation"]["type"] == "CodeStepper"

    def test_all_keys_present_after_fence_strip(self):
        raw = self._wrap_in_fences(self._sample_payload(), "json")
        result = parse_vaathiyaar_response(raw)
        for key in ("message", "phase", "animation", "practice_challenge", "profile_update"):
            assert key in result

    def test_returns_dict_not_string(self):
        raw = self._wrap_in_fences(self._sample_payload(), "json")
        result = parse_vaathiyaar_response(raw)
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# parse_vaathiyaar_response — plain text fallback
# ---------------------------------------------------------------------------

class TestParsePlainTextFallback:
    PLAIN_TEXT = (
        "Saari, I couldn't format that as JSON. But here is what I want to say: "
        "variables in Python are like labelled tiffin boxes — each has a name and holds something."
    )

    def test_returns_dict(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert isinstance(result, dict)

    def test_plain_text_in_message_key(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert result["message"] == self.PLAIN_TEXT

    def test_phase_defaults_to_feedback(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert result["phase"] == "feedback"

    def test_animation_defaults_to_none(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert result["animation"] is None

    def test_practice_challenge_defaults_to_none(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert result["practice_challenge"] is None

    def test_profile_update_has_neutral_emotion(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        assert result["profile_update"]["emotion_signal"] == "neutral"

    def test_all_required_keys_present(self):
        result = parse_vaathiyaar_response(self.PLAIN_TEXT)
        for key in ("message", "phase", "animation", "practice_challenge", "profile_update"):
            assert key in result, f"Key '{key}' missing from plain-text fallback result"

    def test_empty_string_fallback(self):
        result = parse_vaathiyaar_response("")
        assert isinstance(result, dict)
        assert "message" in result

    def test_whitespace_only_fallback(self):
        result = parse_vaathiyaar_response("   \n   ")
        assert isinstance(result, dict)
        assert "message" in result
