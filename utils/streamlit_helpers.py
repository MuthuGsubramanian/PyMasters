"""Helpers for working with the Streamlit API."""
from __future__ import annotations

from typing import Callable

import streamlit as st


def rerun() -> None:
    """Trigger a rerun using the available Streamlit API."""

    rerun_callable: Callable[[], None] | None = getattr(st, "rerun", None)
    if rerun_callable is None:
        rerun_callable = getattr(st, "experimental_rerun", None)

    if rerun_callable is None:
        raise AttributeError("Streamlit rerun function is not available.")

    rerun_callable()
