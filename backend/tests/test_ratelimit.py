"""Tests for the in-memory sliding-window rate limiter."""
from ratelimit import SlidingWindowRateLimiter


def test_allows_up_to_limit_within_window():
    clock = [1000.0]
    rl = SlidingWindowRateLimiter(max_calls=3, window_seconds=60, clock=lambda: clock[0])
    assert rl.allow("u1") is True
    assert rl.allow("u1") is True
    assert rl.allow("u1") is True


def test_blocks_over_limit_within_window():
    clock = [1000.0]
    rl = SlidingWindowRateLimiter(max_calls=3, window_seconds=60, clock=lambda: clock[0])
    rl.allow("u1"); rl.allow("u1"); rl.allow("u1")
    assert rl.allow("u1") is False


def test_allows_again_after_window_slides():
    clock = [1000.0]
    rl = SlidingWindowRateLimiter(max_calls=2, window_seconds=60, clock=lambda: clock[0])
    assert rl.allow("u1") is True
    assert rl.allow("u1") is True
    assert rl.allow("u1") is False
    clock[0] += 61  # window has passed
    assert rl.allow("u1") is True


def test_limits_are_per_key():
    clock = [1000.0]
    rl = SlidingWindowRateLimiter(max_calls=1, window_seconds=60, clock=lambda: clock[0])
    assert rl.allow("u1") is True
    assert rl.allow("u1") is False
    assert rl.allow("u2") is True  # different user unaffected


def test_retry_after_reports_remaining_seconds():
    clock = [1000.0]
    rl = SlidingWindowRateLimiter(max_calls=1, window_seconds=60, clock=lambda: clock[0])
    rl.allow("u1")
    clock[0] += 20
    assert rl.retry_after("u1") == 40  # 60 - 20 since the oldest call
