"""Time-travel visualizer harness (2026-11-02)."""
from vaathiyaar.tracer import trace_code


def test_traces_lines_vars_and_output():
    r = trace_code("total = 0\nfor i in range(3):\n    total += i\nprint(total)\n")
    assert r["error"] is None
    lines = [s["line"] for s in r["steps"] if s["event"] == "line"]
    assert lines[:3] == [1, 2, 3] and lines[-1] == 4
    last = [s for s in r["steps"] if s["event"] == "line"][-1]
    assert last["vars"]["total"] == "3"
    assert r["stdout"].strip() == "3"


def test_function_depth_and_return():
    r = trace_code("def sq(x):\n    return x * x\n\ny = sq(4)\n")
    inner = [s for s in r["steps"] if s["func"] == "sq"]
    assert inner and all(s["depth"] == 2 for s in inner)
    assert any(s["event"] == "return" and s.get("ret") == "16" for s in inner)


def test_error_line_reported():
    r = trace_code("a = 1\nb = a / 0\n")
    assert r["error"]["type"] == "ZeroDivisionError" and r["error"]["line"] == 2


def test_syntax_error():
    r = trace_code("for i in range(3)\n    print(i)\n")
    assert r["error"]["type"] == "SyntaxError" and r["steps"] == []


def test_step_limit():
    r = trace_code("i = 0\nwhile True:\n    i += 1\n")
    assert r["error"]["type"] == "StepLimit" and len(r["steps"]) == 300
