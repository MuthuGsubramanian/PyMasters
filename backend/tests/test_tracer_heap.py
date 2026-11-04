"""Under the hood: tracer heap mode (frames, object graph with stable refs, diff events) — 2026-11-04."""
import json
import os
import re

from vaathiyaar.tracer import trace_code

REF = re.compile(r"^o\d+$")
SNAPSHOT = os.path.join(os.path.dirname(__file__), "fixtures", "tracer_steps_snapshot.json")


def heap(code):
    r = trace_code(code, mode="heap")
    assert r["steps"], r
    for s in r["steps"]:
        assert {"frames", "objects", "events"} <= set(s), s
        assert s["frames"], s  # an empty list means the heap snapshot failed internally
    return r


def events(r, kind):
    return [(i, e) for i, s in enumerate(r["steps"]) for e in s["events"] if e["kind"] == kind]


def names_at(step):
    return step["frames"][-1]["names"]


def test_steps_mode_unchanged_byte_for_byte():
    with open(SNAPSHOT, encoding="utf-8") as f:
        snap = json.load(f)
    r = trace_code(snap["code"])
    assert json.dumps(r) == snap["raw"]
    r2 = trace_code(snap["code"], mode="steps")
    assert json.dumps(r2) == snap["raw"]
    assert all("frames" not in s and "objects" not in s and "events" not in s for s in r["steps"])


def test_alias_two_names_one_ref():
    r = heap("a = [1, 2, 3]\nb = a\nprint(b)\n")
    al = events(r, "alias")
    assert al, r["steps"]
    i, e = al[0]
    assert e["name"] == "b" and e["other"] == "a" and REF.match(e["ref"])
    names = names_at(r["steps"][i])
    assert names["a"] == names["b"] == e["ref"]
    obj = r["steps"][i]["objects"][e["ref"]]
    assert obj["type"] == "list" and obj["mutable"] is True and obj["items"] == ["1", "2", "3"]


def test_mutate_same_ref():
    r = heap("a = [1, 2, 3]\na.append(4)\nprint(a)\n")
    mu = events(r, "mutate")
    assert mu, r["steps"]
    i, e = mu[0]
    ref = names_at(r["steps"][i])["a"]
    assert e["ref"] == ref and e.get("name") == "a"
    assert r["steps"][i]["objects"][ref]["items"] == ["1", "2", "3", "4"]
    assert names_at(r["steps"][i - 1])["a"] == ref  # same object before and after


def test_rebind_different_refs_and_new_object():
    r = heap("x = 1\nx = x + 1\nprint(x)\n")
    rb = events(r, "rebind")
    assert rb, r["steps"]
    i, e = rb[0]
    assert e["name"] == "x" and REF.match(e["from"]) and REF.match(e["to"]) and e["from"] != e["to"]
    assert any(n["kind"] == "new_object" and n["ref"] == e["to"] for n in r["steps"][i]["events"])
    assert r["steps"][i]["objects"][e["to"]]["repr"] == "2"
    assert r["steps"][i]["objects"][e["to"]]["mutable"] is False
    binds = events(r, "bind")
    assert any(b["name"] == "x" and b["ref"] == e["from"] for _, b in binds)


def test_call_and_return_frames():
    r = heap("def sq(n):\n    m = n * n\n    return m\n\ny = sq(4)\nprint(y)\n")
    assert not any(e["kind"] == "call" for e in r["steps"][0]["events"])  # module start is not a call
    calls = [(i, e) for i, e in events(r, "call") if e["func"] == "sq"]
    rets = [(i, e) for i, e in events(r, "return") if e["func"] == "sq"]
    assert calls and rets
    ci, c = calls[0]
    ri, ret = rets[0]
    assert c["func"] == "sq" and ret["func"] == "sq" and ci < ri
    assert [f["func"] for f in r["steps"][ci]["frames"]] == ["<module>", "sq"]
    assert r["steps"][ci]["frames"][1]["depth"] == 2
    assert r["steps"][ri]["objects"][ret["ref"]]["repr"] == "16"
    assert [f["func"] for f in r["steps"][ri + 1]["frames"]] == ["<module>"]
    assert r["steps"][ci - 1]["frames"][-1]["func"] == "<module>" and len(r["steps"][ci - 1]["frames"]) == 1
    # the parameter is bound in the new frame
    assert any(e["kind"] in ("bind", "alias") and e["name"] == "n" for e in r["steps"][ci]["events"])
    # the caller's y ends up on the returned object
    assert names_at(r["steps"][-1])["y"] == ret["ref"]


def test_exception_event():
    r = heap("a = 1\nb = a / 0\n")
    ex = events(r, "exception")
    assert ex and ex[0][1]["name"] == "ZeroDivisionError"
    assert r["error"]["type"] == "ZeroDivisionError"


def test_self_containing_list_terminates():
    r = heap("a = [1, 2]\na.append(a)\nb = {'k': a}\nb['me'] = b\nprint(len(a))\n")
    assert r["error"] is None
    last = r["steps"][-1]
    ra, rb = names_at(last)["a"], names_at(last)["b"]
    assert last["objects"][ra]["items"] == ["1", "2", ra]
    assert [ra, rb] in [list(p) for p in last["objects"][rb]["items"]] or any(
        p == ["'me'", rb] for p in last["objects"][rb]["items"])
    assert len(json.dumps(r)) < 50_000


def test_cycle_between_instances():
    code = ("class Node:\n    def __init__(self, v):\n        self.v = v\n        self.next = None\n\n"
            "a = Node(1)\nb = Node(2)\na.next = b\nb.next = a\nprint(a.v)\n")
    r = heap(code)
    assert r["error"] is None
    last = r["steps"][-1]
    ra, rb = names_at(last)["a"], names_at(last)["b"]
    assert last["objects"][ra]["type"] == "Node"
    assert ["next", rb] in last["objects"][ra]["items"] and ["next", ra] in last["objects"][rb]["items"]


def test_object_and_item_caps():
    code = "\n".join(f"v{i} = [{i}]" for i in range(40)) + "\nbig = list(range(100))\nprint(1)\n"
    r = heap(code)
    last = r["steps"][-1]
    assert len(last["objects"]) <= 30
    assert last.get("more_objects", 0) >= 1
    for o in last["objects"].values():
        assert len(o.get("items", [])) <= 20
    r2 = heap("big = list(range(100))\nprint(1)\n")
    o = r2["steps"][-1]["objects"][names_at(r2["steps"][-1])["big"]]
    assert len(o["items"]) == 20 and o["len"] == 100


def test_no_memory_addresses():
    code = ("class P:\n    pass\n\ndef f():\n    return 1\n\np = P()\nq = [p, f, P]\nimport math\n"
            "g = (i for i in range(3))\nprint(p, f)\n")
    r = heap(code)
    text = json.dumps(r)
    assert "0x" not in text, re.findall(r".{30}0x.{10}", text)[:3]
    assert r["steps"][-1]["out"] == len(r["stdout"])  # offsets map into the cleaned output
    assert r["stdout"].startswith("<__main__.P object> <function f>")


def test_deep_recursion_frames_capped_and_step_limit():
    r = trace_code("def down(n):\n    if n == 0:\n        return 0\n    return down(n - 1)\n\ndown(40)\n",
                   mode="heap")
    assert r["error"] is None
    deepest = max(r["steps"], key=lambda s: s["depth"])
    assert deepest["depth"] == 42
    fr = deepest["frames"]
    assert len(fr) <= 13
    assert fr[0]["func"] == "<module>" and fr[-1]["depth"] == 42
    marker = [f for f in fr if f.get("hidden")]
    assert len(marker) == 1 and marker[0]["hidden"] == 42 - (len(fr) - 1)
    # no spurious call events when hidden frames come back into view while unwinding
    assert len(events(r, "call")) == 41

    r2 = trace_code("i = 0\nwhile True:\n    i += 1\n", mode="heap")
    assert r2["error"]["type"] == "StepLimit" and len(r2["steps"]) == 300


def test_unbind_and_syntax_error():
    r = heap("x = [1]\ndel x\nprint(2)\n")
    ub = events(r, "unbind")
    assert ub and ub[0][1]["name"] == "x"
    s = trace_code("for i in range(3)\n    print(i)\n", mode="heap")
    assert s["error"]["type"] == "SyntaxError" and s["steps"] == []


def test_long_whitespace_output_is_fast():
    import time
    t = time.time()
    r = trace_code("print(' ' * 200000)\nfor i in range(50):\n    print(' ' * 20000)\nx = 1\n", mode="heap")
    assert time.time() - t < 3
    assert r["error"] is None and r["steps"]
    assert all(s["out"] <= len(r["stdout"]) for s in r["steps"])


def test_no_spurious_mutate_when_object_moves_between_named_and_child():
    r = heap("x = [1]\nd = {'k': x}\ndel x\ny = d['k']\nprint(y)\n")
    assert not events(r, "mutate"), events(r, "mutate")
    r2 = heap("x = [1]\nd = {'k': x}\ndel x\nd['k'].append(2)\nprint(d)\n")
    mu = events(r2, "mutate")
    assert mu and all(e["ref"] == "o1" for _, e in mu), mu


def test_typical_payload_small():
    code = ("def total(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n\n"
            "nums = [3, 1, 2]\nalias = nums\nalias.append(4)\nprint(total(nums))\n")
    r = heap(code)
    assert len(json.dumps(r)) < 60_000
