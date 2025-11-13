"""Expose view modules for convenient imports."""
from importlib import import_module

__all__ = [
    "dashboard",
    "login",
    "profile",
    "signup",
    "studio",
    "tutor",
]

for _module in __all__:
    import_module(f"{__name__}.{_module}")

