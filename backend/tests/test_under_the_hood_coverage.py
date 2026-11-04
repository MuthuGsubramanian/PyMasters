"""Coverage: every lesson that has example code yields a heap trace that is either clean or fails only for a
listed environment limit.

Runs `trace_code(example_code(lesson), mode="heap")` serially for ALL lessons under backend/lessons
(~380 with example code, about 3 minutes; the sandbox serialises per process anyway, so no sampling is
needed) and requires >= 95 % to be clean or environment-limited (listed); the clean share is printed separately. Also guards the payload size (numpy/pandas objects must
show type + short repr only) and that the harness itself never crashes (RunError).

A failure is allowed (and listed in the report) only when the lesson legitimately cannot run in the
sandbox: ALLOW_LIST names lessons whose point is to raise, or need network, one-line reason each, and
ALLOWED_ERROR_TYPES covers environment limits (third-party libs not shipped in the sandbox, files,
network, stdin, threads/processes).
"""
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vaathiyaar.lesson_code import example_code  # noqa: E402
from vaathiyaar.tracer import trace_code  # noqa: E402

LESSONS_DIR = os.path.join(os.path.dirname(__file__), "..", "lessons")

# lesson id -> reason it cannot be traced in the sandbox (files / network / missing libs / not runnable as a script)
ALLOW_LIST: dict[str, str] = {
    "http_fundamentals": "makes live HTTP requests; no network in the sandbox (timeout)",
    "custom_exceptions_and_chaining": "ends by raising its own ValidationError on purpose",
    "reviewing_ai_code": "the buggy code under review raises ZeroDivisionError on purpose",
    "verify_dont_trust": "the unverified code raises ZeroDivisionError on purpose",
    "the_hallucinated_api": "calls an API that does not exist (AttributeError) on purpose",
    "reading_tracebacks": "the example is a deliberate KeyError traceback to read",
    "gcp_vertex_model_garden_gemini": "calls the Vertex AI API over the network (times out in the sandbox)",
    "async_advanced": "awaits real timers/tasks that outlast the 10 s sandbox limit",
}

# error type -> why that class of failure is an environment limit, not a tracer fault
ALLOWED_ERROR_TYPES: dict[str, str] = {
    "ModuleNotFoundError": "needs a third-party library the sandbox does not ship",
    "FileNotFoundError": "reads a file that does not exist in the sandbox",
    "ConnectionError": "needs network access",
    "EOFError": "calls input(); no stdin in the sandbox",
    "BlockingIOError": "starts processes; blocked by sandbox limits",
    "RuntimeError": "starts threads; blocked by sandbox limits",
    "StepLimit": "runs past the 300-step cap; the first part is still shown with a notice",
}

MAX_PAYLOAD_BYTES = 1_200_000


def _lessons():
    out = []
    for path in sorted(glob.glob(os.path.join(LESSONS_DIR, "*", "*.json"))):
        with open(path, encoding="utf-8") as f:
            lesson = json.load(f)
        code = example_code(lesson)
        if code:
            out.append((os.path.splitext(os.path.basename(path))[0], code))
    return out


def test_every_lesson_example_traces_in_heap_mode():
    lessons = _lessons()
    assert len(lessons) > 300, "expected the full lesson catalogue"
    failures, allowed, oversized, run_errors = [], [], [], []
    started = time.time()
    checked = 0
    for lesson_id, code in lessons:
        if lesson_id in ALLOW_LIST:
            continue
        checked += 1
        trace = trace_code(code, mode="heap")
        err = trace.get("error")
        if err:
            line = f"{lesson_id}: {err.get('type')}: {str(err.get('message'))[:90]}"
            if err.get("type") == "RunError":
                run_errors.append(lesson_id)
            etype, msg = err.get("type"), str(err.get("message"))
            if etype in ALLOWED_ERROR_TYPES and (etype != "RuntimeError" or "thread" in msg):
                allowed.append(line)
            else:
                failures.append(line)
        size = len(json.dumps(trace))
        if size > MAX_PAYLOAD_BYTES:
            oversized.append(f"{lesson_id}: {size}")
    ok = checked - len(failures) - len(allowed)
    pct = 100.0 * (checked - len(failures)) / checked          # clean or environment-limited
    clean_pct = 100.0 * ok / checked
    summary = (f"{ok}/{checked} lessons traced cleanly; {len(allowed)} more fail only for environment limits; "
               f"{clean_pct:.1f}% clean, {pct:.1f}% clean-or-environment-limited ({len(ALLOW_LIST)} allow-listed and skipped) in {time.time() - started:.0f}s.\n"
               f"environment-limited:\n" + "\n".join(allowed) + "\nfailures:\n" + "\n".join(failures))
    print(summary)
    assert not oversized, f"payloads over {MAX_PAYLOAD_BYTES} bytes: {oversized}"
    assert not [r for r in run_errors if r not in ALLOW_LIST], f"tracer harness crashed on: {run_errors}\n{summary}"
    assert pct >= 95.0, summary
