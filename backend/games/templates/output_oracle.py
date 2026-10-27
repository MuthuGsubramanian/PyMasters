"""Output Oracle templates: predict the exact stdout.

Levels 1–2 are choice items (recognition with the misconception as a distractor);
levels 3–6 are text items (the learner types the output). Every `why` names the
rule, not just the answer.
"""
import random

WORDS = ["python", "lambda", "kernel", "matrix", "tensor", "socket", "cursor", "buffer", "parser", "vector"]
NAMES = ["nums", "data", "items", "vals", "scores", "marks"]
KEYS = ["a", "b", "c", "x", "y", "k"]


def _ints(rng: random.Random, n: int, lo=1, hi=9) -> list:
    return rng.sample(range(lo, hi + 1), n)


# ───────────────────────────── level 1 ─────────────────────────────

def t_int_division(rng):
    a, b = rng.randint(7, 29), rng.randint(2, 6)
    if a % b == 0:
        a += 1
    return {"level": 1, "topic": "variables", "kind": "choice", "code": f"print({a} // {b})",
            "misconception": "int_division",
            "distractor_codes": [f"print({a} / {b})", f"print(round({a} / {b}))", f"print({a} % {b})"],
            "why": f"// is floor division: it keeps the whole number of times {b} fits into {a} and drops the remainder. / would give the decimal."}


def t_true_division(rng):
    a, b = rng.randint(4, 20), rng.choice([2, 4, 5])
    if a % b != 0:
        a = b * (a // b)
    return {"level": 1, "topic": "variables", "kind": "choice", "code": f"print({a} / {b})",
            "misconception": "int_division",
            "distractor_codes": [f"print({a} // {b})", f"print({a} % {b})"], "extra_distractors": [f"{a // b}.5"],
            "why": "/ always produces a float in Python 3, even when the division is exact, so the output carries a .0."}


def t_str_concat(rng):
    a, b = rng.randint(1, 9), rng.randint(1, 9)
    return {"level": 1, "topic": "variables", "kind": "choice", "code": f'a = "{a}"\nb = "{b}"\nprint(a + b)',
            "misconception": "str_concat",
            "distractor_codes": [f"print({a} + {b})"], "extra_distractors": [f"{a} {b}", f"{a}+{b}"],
            "why": "Both values are strings (they are in quotes), so + joins the characters instead of adding numbers."}


def t_rebind_int(rng):
    n, m = rng.randint(1, 9), rng.randint(1, 9)
    return {"level": 1, "topic": "variables", "kind": "choice", "code": f"x = {n}\ny = x\nx = x + {m}\nprint(y)",
            "misconception": "rebind_vs_alias",
            "extra_distractors": [str(n + m), str(m), str(n + m + 1)],
            "why": f"y was bound to the value {n} when it was assigned. Rebinding x to a new number later does not change y."}


def t_negative_index(rng):
    name = rng.choice(NAMES)
    vals = _ints(rng, 4, 10, 99)
    return {"level": 1, "topic": "lists", "kind": "choice", "code": f"{name} = {vals}\nprint({name}[-1])",
            "misconception": "negative_index",
            "distractor_codes": [f"print({vals}[0])", f"print({vals}[1])", f"print({vals}[-2])"],
            "why": "Negative indices count from the end: -1 is the last element, -2 the one before it."}


def t_slice_end_exclusive(rng):
    name = rng.choice(NAMES)
    vals = _ints(rng, 5, 10, 99)
    i = rng.randint(0, 1); j = i + rng.randint(2, 3)
    return {"level": 1, "topic": "lists", "kind": "choice", "code": f"{name} = {vals}\nprint({name}[{i}:{j}])",
            "misconception": "slice_end_exclusive",
            "distractor_codes": [f"print({vals}[{i}:{j + 1}])", f"print({vals}[{i + 1}:{j + 1}])", f"print({vals}[{i}:{j - 1}])"],
            "why": f"A slice stops before its end index: [{i}:{j}] gives positions {i} to {j - 1}, that is {j - i} items."}


def t_range_bounds(rng):
    a = rng.randint(0, 3); b = a + rng.randint(2, 4)
    return {"level": 1, "topic": "for_loops", "kind": "choice",
            "code": f"for i in range({a}, {b}):\n    print(i)",
            "misconception": "off_by_one",
            "distractor_codes": [f"for i in range({a}, {b + 1}):\n    print(i)", f"for i in range({a + 1}, {b + 1}):\n    print(i)",
                                 f"for i in range({a}, {b - 1}):\n    print(i)"],
            "why": f"range({a}, {b}) starts at {a} and stops before {b}, so {b} itself is never printed."}


def t_truthiness(rng):
    val = rng.choice(['0', '""', '[]', '"0"', '[0]', 'None', '0.0', '" "', '{}', '"False"'])
    return {"level": 1, "topic": "conditionals", "kind": "choice",
            "code": f'if {val}:\n    print("truthy")\nelse:\n    print("falsy")',
            "misconception": "truthiness", "extra_distractors": ["truthy", "falsy", "True", "False"],
            "why": "Empty containers, 0, 0.0 and None are falsy; anything non-empty (including the strings \"0\" and \"False\" and the list [0]) is truthy."}


# ───────────────────────────── level 2 ─────────────────────────────

def t_aliasing_append(rng):
    vals = _ints(rng, 3); x = rng.randint(10, 20)
    return {"level": 2, "topic": "lists", "kind": "choice",
            "code": f"a = {vals}\nb = a\nb.append({x})\nprint(len(a))",
            "misconception": "aliasing",
            "distractor_codes": [f"a = {vals}\nb = a[:]\nb.append({x})\nprint(len(a))"], "extra_distractors": [str(len(vals) + 2), "0"],
            "why": "b = a does not copy the list; both names point at the same object, so appending through b changes what a sees. Use a[:] or list(a) to copy."}


def t_dict_get_default(rng):
    k1, k2 = rng.sample(KEYS, 2); v = rng.randint(1, 9); d = rng.randint(0, 9)
    return {"level": 2, "topic": "ds_dicts", "kind": "choice",
            "code": f'd = {{"{k1}": {v}}}\nprint(d.get("{k2}", {d}))',
            "misconception": "dict_get_default", "extra_distractors": [str(v), "None", "KeyError"],
            "why": f".get returns the default ({d}) when the key is missing instead of raising KeyError; the stored value {v} belongs to a different key."}


def t_dict_overwrite(rng):
    k1, k2 = rng.sample(KEYS, 2); v1, v2, v3 = _ints(rng, 3)
    return {"level": 2, "topic": "ds_dicts", "kind": "choice",
            "code": f'd = {{}}\nd["{k1}"] = {v1}\nd["{k2}"] = {v2}\nd["{k1}"] = {v3}\nprint(len(d), d["{k1}"])',
            "misconception": "dict_key_overwrite", "extra_distractors": [f"3 {v3}", f"2 {v1}", f"3 {v1}"],
            "why": "Dictionary keys are unique: assigning to an existing key replaces its value, so there are still two keys and the latest value wins."}


def t_single_tuple(rng):
    n = rng.randint(1, 99); with_comma = rng.random() < 0.5
    code = f"t = ({n}{',' if with_comma else ''})\nprint(type(t).__name__)"
    return {"level": 2, "topic": "ds_tuples", "kind": "choice", "code": code,
            "misconception": "single_element_tuple", "extra_distractors": ["tuple", "int", "list", "str"],
            "why": "Parentheses alone just group an expression; the trailing comma is what makes a one-element tuple."}


def t_enumerate_start(rng):
    words = rng.sample(WORDS, 2); s = rng.choice([0, 1, 10])
    return {"level": 2, "topic": "for_loops", "kind": "choice",
            "code": f"for i, w in enumerate({words}, start={s}):\n    print(i, w)",
            "misconception": "enumerate_start",
            "distractor_codes": [f"for i, w in enumerate({words}, start={s + 1}):\n    print(i, w)",
                                 f"for i, w in enumerate({words}, start={max(0, s - 1)}):\n    print(i, w)",
                                 f"for i, w in enumerate({words}):\n    print(w, i)"],
            "why": f"enumerate numbers items from the start value ({s}) and pairs each index with its item in order."}


def t_string_reverse_step(rng):
    w = rng.choice(WORDS); mode = rng.choice(["rev", "step2", "neg_slice"])
    code = {"rev": f's = "{w}"\nprint(s[::-1])', "step2": f's = "{w}"\nprint(s[::2])', "neg_slice": f's = "{w}"\nprint(s[-3:])'}[mode]
    alt = {"rev": [f'print("{w}"[::2])', f'print("{w}"[1:])'], "step2": [f'print("{w}"[::-1])', f'print("{w}"[1::2])'],
           "neg_slice": [f'print("{w}"[:-3])', f'print("{w}"[:3])']}[mode]
    return {"level": 2, "topic": "lists", "kind": "choice", "code": code, "misconception": "slice_step",
            "distractor_codes": alt, "extra_distractors": [w],
            "why": "A slice is [start:stop:step]. A step of -1 walks backwards, a step of 2 takes every second character, and negative starts count from the end."}


def t_elif_order(rng):
    n = rng.choice([1, 3, 6, 9, 10])
    return {"level": 2, "topic": "conditionals", "kind": "choice",
            "code": f'x = {n}\nif x > 5:\n    print("big")\nelif x > 2:\n    print("mid")\nelse:\n    print("small")',
            "misconception": "elif_first_match", "extra_distractors": ["big", "mid", "small", "big\nmid"],
            "why": "An if/elif chain runs only the first branch whose condition is true and skips the rest, even when later conditions would also hold."}


# ───────────────────────────── level 3 (typed) ─────────────────────────────

def t_scope_shadow(rng):
    n, m = _ints(rng, 2, 1, 50)
    return {"level": 3, "topic": "functions_scope", "kind": "text",
            "code": f"x = {n}\n\ndef f():\n    x = {m}\n    return x\n\nf()\nprint(x)",
            "misconception": "scope_local_shadow",
            "why": f"Assigning x inside f creates a new local variable; the global x stays {n}. Only the global keyword would change the outer one."}


def t_mutable_default(rng):
    a, b = _ints(rng, 2)
    return {"level": 3, "topic": "functions_scope", "kind": "text",
            "code": f"def add(item, bucket=[]):\n    bucket.append(item)\n    return len(bucket)\n\nadd({a})\nprint(add({b}))",
            "misconception": "mutable_default",
            "why": "A default value is created once, when the function is defined, so the same list is reused by every call that omits the argument."}


def t_loop_var_after(rng):
    n = rng.randint(3, 9)
    return {"level": 3, "topic": "for_loops", "kind": "text",
            "code": f"for i in range({n}):\n    pass\nprint(i)",
            "misconception": "off_by_one",
            "why": f"The loop variable keeps its last value after the loop ends; range({n}) ends at {n - 1}, not {n}."}


def t_sort_returns_none(rng):
    vals = _ints(rng, 4)
    return {"level": 3, "topic": "lists", "kind": "text",
            "code": f"nums = {vals}\nresult = nums.sort()\nprint(result)\nprint(nums[0])",
            "misconception": "sort_returns_none",
            "why": "list.sort() sorts in place and returns None; sorted(nums) is the version that returns a new list."}


def t_comprehension_filter(rng):
    n = rng.randint(5, 9); k = rng.choice([2, 3])
    return {"level": 3, "topic": "comprehensions", "kind": "text",
            "code": f"print([x * 2 for x in range({n}) if x % {k} == 0])",
            "misconception": "comprehension_filter_order",
            "why": f"The if clause filters first (keeping multiples of {k} including 0), then the expression doubles each kept value."}


def t_string_methods_chain(rng):
    w = rng.choice(WORDS)
    return {"level": 3, "topic": "variables", "kind": "text",
            "code": f's = "  {w}  "\nprint(len(s.strip()), s.upper().strip())',
            "misconception": "string_immutable_methods",
            "why": "String methods return new strings and never change s itself; strip removes the surrounding spaces before len counts."}


# ───────────────────────────── level 4 ─────────────────────────────

def t_try_finally(rng):
    a = rng.randint(1, 9); b = rng.choice([0, rng.randint(1, 3)])
    return {"level": 4, "topic": "errors_handling", "kind": "text",
            "code": f'try:\n    print({a} // {b})\nexcept ZeroDivisionError:\n    print("div")\nfinally:\n    print("done")',
            "misconception": "finally_always_runs",
            "why": "finally runs whether or not an exception happened; except only runs for a ZeroDivisionError."}


def t_global_counter(rng):
    k = rng.randint(1, 5)
    return {"level": 4, "topic": "functions_scope", "kind": "text",
            "code": f"count = 0\n\ndef inc():\n    global count\n    count += {k}\n\ninc()\ninc()\nprint(count)",
            "misconception": "global_keyword",
            "why": "global tells inc to rebind the module-level count instead of creating a local one, so both calls accumulate."}


def t_short_circuit(rng):
    a = rng.choice(['0', '""', '[]', 'None']); b = rng.choice(['5', '"x"', '[1]']); op = rng.choice(["or", "and"])
    return {"level": 4, "topic": "conditionals", "kind": "text",
            "code": f"print({a} {op} {b})\nprint({b} {op} {a})",
            "misconception": "short_circuit_value",
            "why": "or returns the first truthy operand (or the last one); and returns the first falsy operand (or the last one). They return the operand itself, not True/False."}


def t_is_vs_eq(rng):
    vals = _ints(rng, 2)
    return {"level": 4, "topic": "lists", "kind": "text",
            "code": f"a = {vals}\nb = {vals}\nc = a\nprint(a == b, a is b, a is c)",
            "misconception": "is_vs_eq",
            "why": "== compares values; is compares identity. Two separately built lists are equal but not the same object; c is just another name for a."}


def t_dict_comprehension(rng):
    words = rng.sample(WORDS, 3)
    return {"level": 4, "topic": "comprehensions", "kind": "text",
            "code": f"print({{w[0]: len(w) for w in {words}}})",
            "misconception": "dict_comprehension",
            "why": "Each word contributes key = first letter and value = its length; the braces with a colon build a dict, not a set."}


# ───────────────────────────── level 5 ─────────────────────────────

def t_generator_exhausted(rng):
    n = rng.randint(3, 6)
    return {"level": 5, "topic": "adv_generators", "kind": "text",
            "code": f"g = (x * x for x in range({n}))\nprint(sum(g))\nprint(sum(g))",
            "misconception": "generator_exhausted",
            "why": "A generator yields each value once. The first sum consumes it; the second sum sees nothing and returns 0."}


def t_generator_next_list(rng):
    a, b, c = _ints(rng, 3)
    return {"level": 5, "topic": "adv_generators", "kind": "text",
            "code": f"def gen():\n    yield {a}\n    yield {b}\n    yield {c}\n\ng = gen()\nprint(next(g))\nprint(list(g))",
            "misconception": "generator_exhausted",
            "why": "next() takes the first value; list() then drains only what remains."}


def t_return_in_finally(rng):
    return {"level": 5, "topic": "errors_handling", "kind": "text",
            "code": 'def f():\n    try:\n        return "try"\n    finally:\n        print("finally")\n\nprint(f())',
            "misconception": "finally_always_runs",
            "why": "finally runs before the function actually hands back its return value, so its print appears first."}


def t_late_binding_lambda(rng):
    n = rng.randint(3, 4)
    return {"level": 5, "topic": "functions_scope", "kind": "text",
            "code": f"fs = [lambda: i for i in range({n})]\nprint([f() for f in fs])",
            "misconception": "closure_late_binding",
            "why": f"Each lambda looks up i when it is called, after the loop finished with i = {n - 1}; use lambda i=i: i to capture each value."}


def t_nonlocal_counter(rng):
    a = rng.randint(0, 5)
    return {"level": 5, "topic": "functions_scope", "kind": "text",
            "code": f"def outer():\n    n = {a}\n    def inner():\n        nonlocal n\n        n += 1\n    inner()\n    inner()\n    return n\n\nprint(outer())",
            "misconception": "nonlocal_keyword",
            "why": "nonlocal lets inner rebind outer's n; without it n += 1 would fail as an unbound local."}


def t_exception_order(rng):
    return {"level": 5, "topic": "errors_handling", "kind": "text",
            "code": 'class A(Exception):\n    pass\n\nclass B(A):\n    pass\n\ntry:\n    raise B()\nexcept A:\n    print("caught A")\nexcept B:\n    print("caught B")',
            "misconception": "except_order_subclass",
            "why": "except clauses are tried in order and a B is also an A, so the first clause catches it; put subclasses first."}


# ───────────────────────────── level 6 ─────────────────────────────

def t_decorator_order(rng):
    first_twice = rng.random() < 0.5
    decs = "@twice\n@exclaim" if first_twice else "@exclaim\n@twice"
    word = rng.choice(["hi", "ok", "go", "yo", "py"]); mark = rng.choice(["!", "?", "."])
    return {"level": 6, "topic": "adv_decorators", "kind": "text",
            "code": f'def twice(f):\n    def w():\n        return f() + f()\n    return w\n\ndef exclaim(f):\n    def w():\n        return f() + "{mark}"\n    return w\n\n{decs}\ndef say():\n    return "{word}"\n\nprint(say())',
            "misconception": "decorator_order",
            "why": "Decorators apply bottom-up: the one nearest the def wraps first, the top one wraps the result."}


def t_decorator_name(rng):
    use_wraps = rng.random() < 0.5
    imp = "import functools\n\n" if use_wraps else ""
    wraps = "    @functools.wraps(f)\n" if use_wraps else ""
    fname = rng.choice(["greet", "shout", "render", "parse", "score"])
    return {"level": 6, "topic": "adv_decorators", "kind": "text",
            "code": f"{imp}def log(f):\n{wraps}    def wrapper(*a):\n        return f(*a)\n    return wrapper\n\n@log\ndef {fname}(name):\n    return name\n\nprint({fname}.__name__)",
            "misconception": "decorator_loses_name",
            "why": "A decorator replaces the function with its wrapper, so __name__ becomes 'wrapper' unless functools.wraps copies the metadata across."}


def t_yield_from(rng):
    n = rng.randint(2, 4); m = rng.randint(5, 7)
    return {"level": 6, "topic": "adv_generators", "kind": "text",
            "code": f"def g():\n    yield from range({n})\n    yield {m}\n\nprint(list(g()))",
            "misconception": "yield_from",
            "why": f"yield from hands over every value of the inner iterable (0 to {n - 1}) before the generator continues to its own yield."}


def t_decorator_with_args(rng):
    k = rng.randint(2, 4); x = rng.randint(2, 9); m = rng.choice([2, 3, 10])
    return {"level": 6, "topic": "adv_decorators", "kind": "text",
            "code": f"def repeat(n):\n    def deco(f):\n        def w(x):\n            return [f(x)] * n\n        return w\n    return deco\n\n@repeat({k})\ndef scale(x):\n    return x * {m}\n\nprint(scale({x}))",
            "misconception": "decorator_factory",
            "why": f"repeat({k}) is called first and returns the real decorator; the wrapper then repeats the result {k} times."}


def t_generator_send_state(rng):
    n = rng.randint(2, 4); start = rng.choice([0, 1, 2]); step = rng.choice([1, 2])
    return {"level": 6, "topic": "adv_generators", "kind": "text",
            "code": f"def counter():\n    total = {start}\n    for i in range(1, {n + 2}):\n        total += i * {step}\n        yield total\n\nprint(list(counter()))",
            "misconception": "generator_state",
            "why": "A generator keeps its local state between yields, so each yielded value is the running total so far."}


def t_class_attr_shared(rng):
    n = rng.randint(1, 3)
    adds = "".join(f"a.add('p{i}')\n" for i in range(n))
    return {"level": 6, "topic": "oop_classes", "kind": "text",
            "code": f"class Team:\n    members = []\n\n    def add(self, name):\n        self.members.append(name)\n\na = Team()\nb = Team()\n{adds}print(len(b.members))",
            "misconception": "class_attr_shared",
            "why": "members is defined on the class, so every instance shares the same list; assign self.members = [] in __init__ for per-instance state."}


def t_str_vs_repr(rng):
    name = rng.choice(["Point", "Node", "Cell", "Item"]); v = rng.randint(1, 9)
    return {"level": 6, "topic": "oop_magic_methods", "kind": "text",
            "code": f'class {name}:\n    def __init__(self, v):\n        self.v = v\n\n    def __repr__(self):\n        return f"{name}({{self.v}})"\n\n    def __str__(self):\n        return f"<{{self.v}}>"\n\np = {name}({v})\nprint(p)\nprint([p])',
            "misconception": "str_vs_repr",
            "why": "print(obj) uses __str__, but containers show their elements with __repr__."}


def t_args_kwargs_unpack(rng):
    a, b, c = _ints(rng, 3)
    return {"level": 6, "topic": "functions_args", "kind": "text",
            "code": f"def f(*args, **kwargs):\n    print(len(args), sorted(kwargs))\n\nf({a}, {b}, x={c})\nf(*[{a}], **{{'y': {b}, 'z': {c}}})",
            "misconception": "args_kwargs_unpacking",
            "why": "*args collects the positional arguments into a tuple and **kwargs the keyword ones into a dict; * and ** at a call site unpack them."}


def t_property_access(rng):
    w, h = _ints(rng, 2, 2, 9)
    return {"level": 6, "topic": "oop_classes", "kind": "text",
            "code": f"class Rect:\n    def __init__(self, w, h):\n        self.w, self.h = w, h\n\n    @property\n    def area(self):\n        return self.w * self.h\n\nr = Rect({w}, {h})\nr.w = {w + 1}\nprint(r.area)",
            "misconception": "property_is_computed",
            "why": "A property is recomputed on every access, so changing w changes the next area read; it is not a stored value."}


TEMPLATES = [
    t_int_division, t_true_division, t_str_concat, t_rebind_int, t_negative_index, t_slice_end_exclusive, t_range_bounds, t_truthiness,
    t_aliasing_append, t_dict_get_default, t_dict_overwrite, t_single_tuple, t_enumerate_start, t_string_reverse_step, t_elif_order,
    t_scope_shadow, t_mutable_default, t_loop_var_after, t_sort_returns_none, t_comprehension_filter, t_string_methods_chain,
    t_try_finally, t_global_counter, t_short_circuit, t_is_vs_eq, t_dict_comprehension,
    t_generator_exhausted, t_generator_next_list, t_return_in_finally, t_late_binding_lambda, t_nonlocal_counter, t_exception_order,
    t_decorator_order, t_decorator_name, t_yield_from, t_decorator_with_args, t_generator_send_state,
    t_class_attr_shared, t_str_vs_repr, t_args_kwargs_unpack, t_property_access,
]
