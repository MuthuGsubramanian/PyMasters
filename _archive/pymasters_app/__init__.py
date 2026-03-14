"""Top-level PyMasters app package with lazy submodule exports."""
from __future__ import annotations

from importlib import import_module
from types import ModuleType

__all__ = ["components", "utils", "views"]


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
