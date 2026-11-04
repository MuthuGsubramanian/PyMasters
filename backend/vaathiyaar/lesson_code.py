"""Pick the example program of a lesson (used by the "Under the hood" view).

Order: first ExecutionVisualizer `code`, else first CodeStepper `code` (or its `steps` lines joined),
else the first other primitive that carries a string `code`. Non-Python CodeStepper code is skipped.
"""
from __future__ import annotations

import ast
import builtins

_PYTHON_LANGS = {"", "python", "py", "python3"}


def _self_contained(code: str) -> bool:
    """False when the code reads a name that nothing in it defines (a fragment such as the body of a function
    shown line by line in a CodeStepper), which would only trace into a NameError."""
    try:
        tree = ast.parse(code)
        compile(tree, "<lesson>", "exec")        # parse alone accepts e.g. a top-level await
    except (SyntaxError, ValueError):
        return False
    defined = set(dir(builtins)) | {"__name__", "__file__"}
    loads = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name):
            (loads if isinstance(n.ctx, ast.Load) else defined).add(n.id)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(n.name)
        elif isinstance(n, ast.arg):
            defined.add(n.arg)
        elif isinstance(n, ast.alias):
            defined.add(n.asname or n.name.split(".")[0])
            if n.name == "*":
                return True
        elif isinstance(n, ast.ExceptHandler) and n.name:
            defined.add(n.name)
        elif isinstance(n, (ast.Global, ast.Nonlocal)):
            defined.update(n.names)
        elif isinstance(n, (ast.MatchAs, ast.MatchStar)) and n.name:
            defined.add(n.name)
        elif isinstance(n, ast.MatchMapping) and n.rest:
            defined.add(n.rest)
    return loads <= defined


def _props(prim: dict) -> dict:
    inner = prim.get("props")
    return inner if isinstance(inner, dict) else prim


def _is_python(props: dict) -> bool:
    lang = props.get("language")
    return not isinstance(lang, str) or lang.strip().lower() in _PYTHON_LANGS


def _code_of(props: dict) -> str | None:
    code = props.get("code")
    if isinstance(code, list):
        code = "\n".join(str(c) for c in code)
    if isinstance(code, str) and code.strip() and _self_contained(code):
        return code
    return None


def _stepper_code(props: dict) -> str | None:
    if not _is_python(props):
        return None
    code = _code_of(props)
    if code:
        return code
    steps = props.get("steps")
    if not isinstance(steps, list):
        return None
    lines = []
    for s in steps:
        if isinstance(s, str):
            lines.append(s)
        elif isinstance(s, dict):
            text = s.get("code", s.get("line"))
            if isinstance(text, str):
                lines.append(text)
    joined = "\n".join(lines)
    return joined if joined.strip() and _self_contained(joined) else None


def example_code(lesson: dict) -> str | None:
    seq = lesson.get("animation_sequence") if isinstance(lesson, dict) else None
    prims = [p for p in seq if isinstance(p, dict)] if isinstance(seq, list) else []
    for p in prims:
        if p.get("type") == "ExecutionVisualizer":
            code = _code_of(_props(p))
            if code:
                return code
    for p in prims:
        if p.get("type") == "CodeStepper":
            code = _stepper_code(_props(p))
            if code:
                return code
    for p in prims:
        if p.get("type") not in ("ExecutionVisualizer", "CodeStepper"):
            props = _props(p)
            if _is_python(props):
                code = _code_of(props)
                if code:
                    return code
    return None
