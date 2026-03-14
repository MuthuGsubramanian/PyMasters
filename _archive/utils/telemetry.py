"""Telemetry helpers for instrumentation."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from time import perf_counter
from typing import Iterator

logger = logging.getLogger("pymasters.telemetry")


@contextmanager
def track_duration(event: str) -> Iterator[None]:
    start = perf_counter()
    yield
    duration = perf_counter() - start
    logger.info("%s completed in %.3fs", event, duration)
