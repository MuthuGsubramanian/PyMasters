"""Time-travel visualizer: run learner code under sys.settrace inside the normal sandbox and return a
step-by-step trace (line, function, call depth, variables, output so far).

The harness below is the script the sandbox executes; the learner's code is seeded next to it as
user_code.py. Everything runs as the unprivileged sandbox uid with the usual limits and no network.

mode="heap" (2026-11-04, "Under the hood") additionally gives every step:
  frames  [{func, depth, names: {name: ref}}]  user frames, outermost first, innermost last; with more than
          MAX_FRAMES frames the middle is replaced by one marker {func: "...", depth, names: {}, hidden: n}
  objects {ref: {type, repr, mutable, items?, len?}}  objects reachable from those names, containers expanded
          one level (dict / instance items are [key, value] pairs); refs are "o1", "o2", ... in order of first
          sight, never memory addresses; at most MAX_OBJECTS per step (step["more_objects"] = how many left out)
  events  [{kind, name?, ref?, from?, to?, other?, func?, type?, depth?}]  derived by diffing with the
          previous step: new_object, bind, rebind, alias, mutate, call, return, unbind, exception
The heap model is computed inside the sandboxed program, where the objects live.
"""
import json

from vaathiyaar.execution import run_code_subprocess

MARK = "@@PM_TRACE@@"
MAX_STEPS = 300
MAX_CODE_CHARS = 5000
HEAP_MAX_OUTPUT = 1_500_000

HARNESS_TEMPLATE = r'''
import io, json, sys, types
MARK = "@@PM_TRACE@@"
MAX_STEPS = %d
HEAP = %d
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


if HEAP:
    import itertools, re
    MAX_OBJECTS = 30
    MAX_ITEMS = 20
    MAX_FRAMES = 12
    MAX_NAMES = 40
    HEAP_BUDGET = 1000000
    _ADDR = re.compile(r"\s*at 0x[0-9a-fA-F]+")
    _HEX = re.compile(r"0x[0-9a-fA-F]{6,}")
    _PRIM = (int, float, complex, str, bytes, bool, type(None))
    _refs = {}        # id(obj) -> "oN"
    _keep = []        # strong refs to every tracked object so ids are never reused during the trace
    _vals = {}        # ref -> obj
    _serial = {}      # id(frame) -> serial of a live user frame (set on its "call" event)
    _nserial = [0]
    _seen = set()     # refs that have appeared in some step
    _unwinding = set()  # frame serials currently propagating an exception
    _prev = {"stack": set(), "frames": {}, "sig": {}}
    _budget = [0]

    def clean(s):
        return _HEX.sub("...", _ADDR.sub("", s))

    def ref_of(v):
        k = id(v)
        r = _refs.get(k)
        if r is None:
            r = "o" + str(len(_refs) + 1)
            _refs[k] = r
            _keep.append(v)
            _vals[r] = v
        return r

    def is_user_instance(v):
        t = type(v)
        return (getattr(t, "__module__", None) == "__main__" and hasattr(v, "__dict__")
                and not isinstance(v, (type, types.FunctionType, types.MethodType)))

    def is_mutable(v):
        return isinstance(v, (list, dict, set, bytearray)) or is_user_instance(v)

    def item_of(x, kids):
        if isinstance(x, _PRIM):
            return clean(short(x))
        kids.append(x)
        return ref_of(x)

    def describe(v, kids):
        if isinstance(v, types.FunctionType):
            return {"type": "function", "repr": "<function " + v.__name__ + ">", "mutable": False}
        if isinstance(v, type):
            return {"type": "type", "repr": "<class " + v.__name__ + ">", "mutable": False}
        o = {"type": type(v).__name__, "repr": clean(short(v)), "mutable": is_mutable(v)}
        if kids is None:
            return o
        try:
            if isinstance(v, (list, tuple)):
                o["items"] = [item_of(x, kids) for x in itertools.islice(v, MAX_ITEMS)]
                o["len"] = len(v)
            elif isinstance(v, (set, frozenset)):
                o["items"] = sorted((item_of(x, kids) for x in itertools.islice(v, MAX_ITEMS)), key=str)
                o["len"] = len(v)
            elif isinstance(v, dict):
                o["items"] = [[item_of(k, kids), item_of(x, kids)]
                              for k, x in itertools.islice(dict.items(v), MAX_ITEMS)]
                o["len"] = len(v)
            elif is_user_instance(v):
                d = vars(v)
                o["items"] = [[str(k), item_of(x, kids)] for k, x in itertools.islice(d.items(), MAX_ITEMS)]
                o["len"] = len(d)
        except Exception:
            o.pop("items", None)
            o.pop("len", None)
        return o

    def sig_of(o):
        if "items" in o:
            return json.dumps([o["items"], o.get("len")])
        return o["repr"]

    def frame_names(f):
        ns = {}
        for k, v in list(f.f_locals.items()):
            if k.startswith("__") or isinstance(v, types.ModuleType):
                continue
            ns[k] = v
            if len(ns) >= MAX_NAMES:
                break
        return ns

    def heap_state(frame, event, arg, step):
        stack = []
        f = frame
        while f is not None and f.f_code.co_filename == "<user>":
            stack.append(f)
            f = f.f_back
        stack.reverse()
        serials = []
        for f in stack:
            s = _serial.get(id(f))
            if s is None:
                _nserial[0] += 1
                s = _serial[id(f)] = _nserial[0]
            serials.append(s)
        idx = list(range(len(stack)))
        if len(stack) > MAX_FRAMES:
            idx = [0] + idx[len(stack) - (MAX_FRAMES - 1):]
        cur = serials[-1]
        if event == "line":
            _unwinding.discard(cur)
        frames, fvals, visible = [], [], {}
        for n, i in enumerate(idx):
            if n == 1 and i != 1:
                frames.append({"func": "...", "depth": 2, "names": {}, "hidden": len(stack) - MAX_FRAMES})
            ns = frame_names(stack[i])
            names = {k: ref_of(v) for k, v in ns.items()}
            frames.append({"func": stack[i].f_code.co_name, "depth": i + 1, "names": names})
            fvals.append((serials[i], stack[i].f_code.co_name, names, ns))
            visible[serials[i]] = names
        # objects: named ones first (innermost frame first), then the return value, then one level of children
        roots, done = [], set()
        for s, fn, names, ns in reversed(fvals):
            for k, v in ns.items():
                r = names[k]
                if r not in done:
                    done.add(r)
                    roots.append((r, v))
        ret_ref = None
        is_call_return = event == "return" and len(stack) > 1  # the module finishing is not a return
        if is_call_return and cur not in _unwinding:
            ret_ref = ref_of(arg)
            if ret_ref not in done:
                done.add(ret_ref)
                roots.append((ret_ref, arg))
        objects, kids, more = {}, [], 0
        for r, v in roots:
            if len(objects) >= MAX_OBJECTS:
                more += 1
                continue
            objects[r] = describe(v, kids)
        for v in kids:
            r = ref_of(v)
            if r in done:
                continue
            done.add(r)
            if len(objects) >= MAX_OBJECTS:
                more += 1
                continue
            objects[r] = describe(v, None)
        # events: diff against the previous step
        ev = []
        for i, s in enumerate(serials):
            if s not in _prev["stack"] and i > 0:  # the module frame starting is not a call
                ev.append({"kind": "call", "func": stack[i].f_code.co_name, "depth": i + 1})
        for r, o in objects.items():
            if r not in _seen:
                _seen.add(r)
                ev.append({"kind": "new_object", "ref": r, "type": o["type"]})
        holders = {}
        changed = []
        for s, fn, names, ns in fvals:
            if s in _prev["stack"] and s not in _prev["frames"]:
                continue  # was hidden behind the frame marker: nothing to compare with
            old = _prev["frames"].get(s, {})
            for k, r in names.items():
                if old.get(k) == r:
                    holders.setdefault(r, []).append(k)
                else:
                    changed.append((fn, k, r, old.get(k)))
            for k, r in old.items():
                if k not in names:
                    ev.append({"kind": "unbind", "name": k, "ref": r, "func": fn})
        for fn, k, r, was in changed:
            others = [n for n in holders.get(r, []) if n != k]
            if others and not isinstance(_vals.get(r), _PRIM):
                e = {"kind": "alias", "name": k, "ref": r, "other": others[0], "func": fn}
                if was is not None:
                    e["from"] = was
            elif was is None:
                e = {"kind": "bind", "name": k, "ref": r, "func": fn}
            else:
                e = {"kind": "rebind", "name": k, "from": was, "to": r, "func": fn}
            ev.append(e)
            holders.setdefault(r, []).append(k)
        sig = {}
        for r, o in objects.items():
            sig[r] = sig_of(o)
            if o["mutable"] and r in _prev["sig"] and _prev["sig"][r] != sig[r]:
                e = {"kind": "mutate", "ref": r}
                if holders.get(r):
                    e["name"] = holders[r][0]
                ev.append(e)
        if is_call_return:
            e = {"kind": "return", "func": frame.f_code.co_name}
            if ret_ref is not None:
                e["ref"] = ret_ref
            ev.append(e)
        if event == "exception":
            _unwinding.add(cur)
            ev.append({"kind": "exception", "func": frame.f_code.co_name, "name": arg[0].__name__})
        _prev["stack"] = set(serials)
        _prev["frames"] = visible
        _prev["sig"] = sig
        step["frames"] = frames
        step["objects"] = objects
        step["events"] = ev
        if more:
            step["more_objects"] = more

    def add_heap(frame, event, arg, step):
        try:
            heap_state(frame, event, arg, step)
        except Exception:
            step["frames"], step["objects"], step["events"] = [], {}, []
        step["vars"] = {k: clean(v) for k, v in step["vars"].items()}
        for key in ("ret", "exc"):
            if key in step:
                step[key] = clean(step[key])
        if event == "return":
            _serial.pop(id(frame), None)
        _budget[0] += len(json.dumps([step.get("frames"), step.get("objects"), step.get("events")]))
        if _budget[0] > HEAP_BUDGET:
            raise _Stop()


def tracer(frame, event, arg):
    if frame.f_code.co_filename != "<user>":
        return None
    if HEAP and event == "call":
        _nserial[0] += 1
        _serial[id(frame)] = _nserial[0]
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
        if HEAP:
            add_heap(frame, event, arg, step)
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
        error = {"type": "StepLimit", "message": "Stopped after %%d steps - showing the first part." %% (len(steps) if HEAP else MAX_STEPS), "line": None}
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
if HEAP:
    _raw = out.getvalue()
    for s in steps:  # keep each step's output offset pointing into the cleaned text
        s["out"] = len(clean(_raw[:s["out"]]))
    out = io.StringIO(clean(_raw))
    if error is not None:
        error["message"] = clean(error["message"])
real_out.write(MARK + json.dumps({"steps": steps, "stdout": out.getvalue()[:20000], "error": error}))
'''

HARNESS = HARNESS_TEMPLATE % (MAX_STEPS, 0)
HEAP_HARNESS = HARNESS_TEMPLATE % (MAX_STEPS, 1)


def trace_code(code: str, timeout: int = 10, mode: str = "steps") -> dict:
    if len(code) > MAX_CODE_CHARS:
        return {"steps": [], "stdout": "", "error": {"type": "TooLong", "message":
                f"The visualizer handles up to {MAX_CODE_CHARS} characters of code.", "line": None}}
    heap = mode == "heap"
    res = run_code_subprocess(HEAP_HARNESS if heap else HARNESS, timeout=timeout,
                              seed_files={"user_code.py": code},
                              max_output=HEAP_MAX_OUTPUT if heap else 600_000)
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
