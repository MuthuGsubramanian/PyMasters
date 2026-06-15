"""
Tests for parse_vaathiyaar_response — the tutor's response parser.

The model is asked to return JSON {message, phase, ...}. When a long reply hits
the token cap the JSON is truncated mid-value, json.loads fails, and the student
must never see raw '{"message": "...' braces. The parser must salvage the human
message in that case.
"""
from vaathiyaar.engine import parse_vaathiyaar_response


def test_parses_clean_json():
    r = parse_vaathiyaar_response('{"message": "Hello!", "phase": "teaching"}')
    assert r["message"] == "Hello!"
    assert r["phase"] == "teaching"


def test_parses_markdown_fenced_json():
    raw = '```json\n{"message": "Fenced reply", "phase": "feedback"}\n```'
    assert parse_vaathiyaar_response(raw)["message"] == "Fenced reply"


def test_plain_text_becomes_message():
    r = parse_vaathiyaar_response("Just a plain sentence.")
    assert r["message"] == "Just a plain sentence."


def test_unescapes_newlines_and_quotes_in_message():
    raw = '{"message": "Line1\\nLine2 said \\"hi\\""}'
    assert parse_vaathiyaar_response(raw)["message"] == 'Line1\nLine2 said "hi"'


def test_salvages_message_from_truncated_json():
    """Truncated at the token cap mid-message — extract the partial message,
    never expose the JSON braces/keys to the student."""
    raw = '{"message": "Good morning! A variable is a named box that'
    msg = parse_vaathiyaar_response(raw)["message"]
    assert msg.startswith("Good morning! A variable is a named box that")
    assert "{" not in msg
    assert '"message"' not in msg


def test_salvages_message_with_escapes_from_truncated_json():
    raw = '{"message": "He said \\"hello\\" and then the connection'
    msg = parse_vaathiyaar_response(raw)["message"]
    assert msg.startswith('He said "hello" and then the connection')
    assert "{" not in msg


def test_truncated_without_message_field_has_no_json_braces():
    """Even garbage JSON must not surface raw braces to the student."""
    raw = '{"phase": "feedback", "animation": {"type": "Cod'
    msg = parse_vaathiyaar_response(raw)["message"]
    assert '{"phase"' not in msg


def test_always_returns_required_keys():
    r = parse_vaathiyaar_response("hi")
    for key in ("message", "phase", "animation", "practice_challenge", "profile_update"):
        assert key in r
