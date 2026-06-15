"""
Tests for struggle-aware tutoring: after repeated failures the tutor should
escalate from a gentle hint to concrete step-by-step help, and the evaluator
should expose a `struggling` signal the UI can act on.
"""
from vaathiyaar.engine import is_struggling, build_feedback_prompt


def test_success_is_never_struggling():
    assert is_struggling(success=True, attempt_count=9) is False


def test_not_struggling_below_threshold():
    assert is_struggling(success=False, attempt_count=0) is False
    assert is_struggling(success=False, attempt_count=2) is False


def test_struggling_at_threshold():
    assert is_struggling(success=False, attempt_count=3) is True
    assert is_struggling(success=False, attempt_count=5) is True


def test_success_prompt_is_encouraging():
    p = build_feedback_prompt(
        success=True, struggling=False, student_code="print(1)",
        expected_output="1", actual_output="1", error_msg="",
    )
    assert "correct" in p.lower()
    assert "next" in p.lower()


def test_first_failures_give_a_hint_not_the_solution():
    p = build_feedback_prompt(
        success=False, struggling=False, student_code="x=1",
        expected_output="2", actual_output="1", error_msg="",
    )
    assert "hint" in p.lower()
    assert "not reveal" in p.lower() or "do not reveal" in p.lower()


def test_struggling_escalates_to_concrete_help():
    p = build_feedback_prompt(
        success=False, struggling=True, student_code="x=1",
        expected_output="2", actual_output="1", error_msg="NameError: name 'y'",
    )
    low = p.lower()
    # Escalated help: acknowledges repeated effort and gets concrete/step-by-step
    assert "struggl" in low or "several times" in low or "tried" in low
    assert "step" in low or "walk" in low or "concrete" in low
    # Still references the actual error so the help is specific
    assert "NameError" in p
