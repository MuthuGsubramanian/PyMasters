"""Minimal sandbox client used for local development."""
from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass
from typing import Iterable


SAFE_BUILTINS = {
    "print": print,
    "len": len,
    "range": range,
    "enumerate": enumerate,
    "sum": sum,
    "min": min,
    "max": max,
    "abs": abs,
}


@dataclass
class ExecutionResult:
    status: str
    stdout: str
    feedback: str
    tests: list[dict]


def execute_python(code: str, unit_tests: Iterable[dict]) -> ExecutionResult:
    """Execute code inside a constrained namespace and validate tests."""

    local_ns: dict[str, object] = {}
    stdout_buffer = io.StringIO()
    tests = []

    try:
        with contextlib.redirect_stdout(stdout_buffer):
            exec(code, {"__builtins__": SAFE_BUILTINS}, local_ns)

        for test in unit_tests:
            expression = test.get("input", "")
            expected = test.get("expected")
            try:
                result = eval(expression, {"__builtins__": SAFE_BUILTINS}, local_ns)
            except Exception as exc:  # pragma: no cover - defensive
                tests.append(
                    {
                        "input": expression,
                        "status": "error",
                        "message": str(exc),
                    }
                )
            else:
                status = "pass" if str(result) == str(expected) else "fail"
                message = "" if status == "pass" else f"Expected {expected!r} but received {result!r}"
                tests.append(
                    {
                        "input": expression,
                        "status": status,
                        "message": message,
                    }
                )

        stdout = stdout_buffer.getvalue()
        feedback = "All tests passed!" if all(t["status"] == "pass" for t in tests) else "Review the failing tests."
        return ExecutionResult(status="success", stdout=stdout, feedback=feedback, tests=tests)
    except Exception as exc:  # pragma: no cover - defensive
        return ExecutionResult(
            status="error",
            stdout=stdout_buffer.getvalue(),
            feedback=f"Execution failed: {exc}",
            tests=[],
        )
