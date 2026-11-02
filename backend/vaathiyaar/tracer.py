"""Time-travel visualizer: run learner code under sys.settrace inside the normal sandbox and return a
step-by-step trace (line, function, call depth, variables, output so far).

The harness below is the script the sandbox executes; the learner's code is seeded next to it as
user_code.py. Everything runs as the unprivileged sandbox uid with the usual limits and no network.
"""
import json

from vaathiyaar.execution import run_code_subprocess

MARK = "@@PM_TRACE@@"
MAX_STEPS = 300
MAX_CODE_CHARS = 5000

HARNESS = r'''
import io, json, sys, types
MARK = "@@PM_TRACE@@"
MAX_STEPS = %d
SRC = open("user_code.py", encoding="utf-8").read()
steps = []
out = io.StringIO()
real_out = sys.stdout


class _Stop(Exception):
    pass


def short(v):
    try:
        r = repr(v)
    except Exception:
        r = "<unprintable>"
    return r if len(r) <= 80 else r[:77] + "..."


def depth_of(frame):
    d = 0
    while frame is not None and frame.f_code.co_filename == "<user>":
        d += 1
        frame = frame.f_back
    return d


def snapshot(frame):
    vs = {}
    for k, v in list(frame.f_locals.items()):
        if k.startswith("__") or isinstance(v, types.ModuleType):
            continue
        if isinstance(v, types.FunctionType):
            vs[k] = "<function " + v.__name__ + ">"
        elif isinstance(v, type):
            vs[k] = "<class " + v.__name__ + ">"
        else:
            vs[k] = short(v)
        if len(vs) >= 15:
            break
    return vs


def tracer(frame, event, arg):
    if frame.f_code.co_filename != "<user>":
        return None
    if event in ("line", "return", "exception"):
        if len(steps) >= MAX_STEPS:
            raise _Stop()
        step = {"line": frame.f_lineno, "event": event, "func": frame.f_code.co_name,
                "depth": depth_of(frame), "vars": snapshot(frame), "out": len(out.getvalue())}
        if event == "return":
            step["ret"] = short(arg)
        if event == "exception":
            step["exc"] = arg[0].__name__ + ": " + short(arg[1])[:80]
        steps.append(step)
    return tracer


error = None
try:
    code = compile(SRC, "<user>", "exec")
except SyntaxError as e:
    error = {"type": "SyntaxError", "message": str(e.msg), "line": e.lineno}
    code = None
if code is not None:
    sys.stdout = out
    sys.settrace(tracer)
    try:
        exec(code, {"__name__": "__main__"})
    except _Stop:
        error = {"type": "StepLimit", "message": "Stopped after %%d steps - showing the first part." %% MAX_STEPS, "line": None}
    except BaseException as e:
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<user>":
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {"type": type(e).__name__, "message": str(e)[:300], "line": line}
    finally:
        sys.settrace(None)
        sys.stdout = real_out
real_out.write(MARK + json.dumps({"steps": steps, "stdout": out.getvalue()[:20000], "error": error}))
''' % MAX_STEPS


def trace_code(code: str, timeout: int = 10) -> dict:
    if len(code) > MAX_CODE_CHARS:
        return {"steps": [], "stdout": "", "error": {"type": "TooLong", "message":
                f"The visualizer handles up to {MAX_CODE_CHARS} characters of code.", "line": None}}
    res = run_code_subprocess(HARNESS, timeout=timeout, seed_files={"user_code.py": code},
                              max_output=600_000)
    raw = res.get("output") or ""
    if MARK not in raw:
        msg = (res.get("error") or "").strip().splitlines()
        return {"steps": [], "stdout": "", "error": {"type": "RunError", "message":
                (msg[-1] if msg else "The visualizer could not run this code."), "line": None}}
    try:
        return json.loads(raw.split(MARK, 1)[1])
    except ValueError:
        return {"steps": [], "stdout": "", "error": {"type": "RunError", "message":
                "The trace was too large to display.", "line": None}}
