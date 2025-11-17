"""Utility package exports with lazy loading."""
from __future__ import annotations

from importlib import import_module
from types import ModuleType

__all__ = ["auth", "bootstrap", "db", "helpers", "secrets"]


def _load(name: str) -> ModuleType:
    module = import_module(f"{__name__}.{name}")
    globals()[name] = module
    return module


def __getattr__(name: str) -> ModuleType:
    if name in __all__:
        return _load(name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return sorted(list(globals().keys()) + __all__)

