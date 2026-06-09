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
