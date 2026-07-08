"""
Grading regression (2026-07-08 live E2E): a lesson whose sample expected_output
uses <placeholder> fill-in tokens (e.g. Lesson 1 "Variables": "Name: <your_name>,
Age: <your_age>, Favourite Number: <your_number>") could NEVER be completed —
exact stdout matching compared a real answer ("Name: Alex, Age: 25, ...") against
the literal placeholder text and always failed. Every new user hit this on their
first lesson. The grader now treats <token> as a non-empty wildcard.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar.engine import _output_matches


def test_exact_match_still_passes():
    assert _output_matches("42", "42")
    assert _output_matches("  hello \n", "hello")


def test_plain_mismatch_still_fails():
    assert not _output_matches("43", "42")
    assert not _output_matches("Goodbye", "Hello")


def test_placeholder_accepts_real_values():
    expected = "Name: <your_name>, Age: <your_age>, Favourite Number: <your_number>"
    assert _output_matches("Name: Alex, Age: 25, Favourite Number: 3.5", expected)
    assert _output_matches("Name: Priya, Age: 30, Favourite Number: 7.0", expected)


def test_placeholder_multiline():
    expected = "Status: 200\nContent-Type: application/json\nOrigin: <your_ip>"
    assert _output_matches("Status: 200\nContent-Type: application/json\nOrigin: 10.0.0.4", expected)


def test_placeholder_still_requires_literal_parts_to_match():
    expected = "Name: <your_name>, Age: <your_age>"
    # Wrong literal prefix must not pass just because a wildcard exists.
    assert not _output_matches("Nom: Alex, Age: 25", expected)
    # A placeholder demands at least one character (not an empty fill-in).
    assert not _output_matches("Name: , Age: 25", expected)
