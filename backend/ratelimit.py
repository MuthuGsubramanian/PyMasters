"""
In-memory sliding-window rate limiter.

Sufficient because the service runs as a single Cloud Run instance (min=max=1),
so there is no cross-instance state to coordinate. If the deployment ever scales
horizontally, swap this for a shared store (Redis/Memorystore).
"""
import time
from collections import defaultdict, deque
from typing import Callable, Deque, Dict


class SlidingWindowRateLimiter:
    """Allow at most `max_calls` per `window_seconds` per key."""

    def __init__(
        self,
        max_calls: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.max_calls = max_calls
        self.window = window_seconds
        self._clock = clock
        self._calls: Dict[str, Deque[float]] = defaultdict(deque)

    def _evict(self, key: str, now: float) -> None:
        q = self._calls[key]
        cutoff = now - self.window
        while q and q[0] <= cutoff:
            q.popleft()

    def allow(self, key: str) -> bool:
        """Record and allow a call, or return False if the key is over its limit."""
        now = self._clock()
        self._evict(key, now)
        q = self._calls[key]
        if len(q) >= self.max_calls:
            return False
        q.append(now)
        return True

    def retry_after(self, key: str) -> int:
        """Whole seconds until the oldest in-window call expires (0 if room now)."""
        now = self._clock()
        self._evict(key, now)
        q = self._calls[key]
        if len(q) < self.max_calls or not q:
            return 0
        return max(0, int(round(self.window - (now - q[0]))))

    def reset(self, key: str) -> None:
        """Forget all recorded calls for a key (e.g. clear a username's failed-login
        counter after a successful authentication)."""
        self._calls.pop(key, None)


def enforce(limiter: "SlidingWindowRateLimiter", key: str, what: str = "requests") -> None:
    """Raise HTTP 429 (with Retry-After) when `key` is over the limiter's budget."""
    if not limiter.allow(str(key)):
        from fastapi import HTTPException
        wait = limiter.retry_after(str(key)) or 1
        raise HTTPException(status_code=429, detail=f"Too many {what}. Please try again in {wait} seconds.",
                            headers={"Retry-After": str(wait)})


# Per-user budgets for endpoints that spend LLM credits or sandbox CPU (security fix 2026-11-02:
# none of these were limited, so a script could burn the AI provider credits or tie up the 1 GB VM).
AI_CHAT_MINUTE = SlidingWindowRateLimiter(max_calls=15, window_seconds=60)
AI_CHAT_DAY = SlidingWindowRateLimiter(max_calls=300, window_seconds=86400)
AI_GEN_HOUR = SlidingWindowRateLimiter(max_calls=4, window_seconds=3600)
AI_GEN_DAY = SlidingWindowRateLimiter(max_calls=15, window_seconds=86400)
GRADING_MINUTE = SlidingWindowRateLimiter(max_calls=20, window_seconds=60)


def limit_ai_chat(user_id: str) -> None:
    enforce(AI_CHAT_MINUTE, user_id, "messages")
    enforce(AI_CHAT_DAY, user_id, "AI messages today")


def limit_ai_generation(user_id: str) -> None:
    enforce(AI_GEN_HOUR, user_id, "generation requests")
    enforce(AI_GEN_DAY, user_id, "generation requests today")


def limit_grading(user_id: str) -> None:
    enforce(GRADING_MINUTE, user_id, "code checks")
