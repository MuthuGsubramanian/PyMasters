"""Expression templates for Loop Runner gates (and any quick "what is the value?" moment).

Each template returns {"level", "topic", "expr", "context": {name: literal}, "why", "misconception",
"mutations": [alternative exprs whose values make good distractors]}. The bank builder evaluates
`expr` under `context` with the real interpreter and keeps only distractors whose values differ.
Topics are the lesson topics that gate the pool: variables, conditionals, lists, ds_dicts, comprehensions.
"""
import random

WORDS = ["python", "kernel", "tensor", "socket", "buffer", "parser", "vector", "matrix", "cursor", "lambda"]


def _ctx(**kw):
    return {k: repr(v) for k, v in kw.items()}


# ───────────────────────────── variables (arithmetic, comparison) ─────────────────────────────

def t_mod(rng):
    x, m = rng.randint(7, 41), rng.choice([2, 3, 4, 5, 6])
    return {"level": 1, "topic": "variables", "expr": f"x % {m}", "context": _ctx(x=x),
            "mutations": [f"x // {m}", f"x % {m + 1}", f"{m} % x"], "misconception": "mod_vs_floordiv",
            "why": f"% gives the remainder after dividing {x} by {m}; // would give how many whole times {m} fits."}


def t_floordiv(rng):
    x, m = rng.randint(7, 41), rng.choice([2, 3, 4, 5])
    return {"level": 1, "topic": "variables", "expr": f"x // {m}", "context": _ctx(x=x),
            "mutations": [f"x % {m}", f"round(x / {m})", f"x // {m + 1}"], "misconception": "mod_vs_floordiv",
            "why": f"// is floor division: {x} divided by {m} rounded down to a whole number."}


def t_true_div(rng):
    x, m = rng.choice([8, 9, 10, 12, 15, 18, 20]), rng.choice([2, 4, 5])
    return {"level": 1, "topic": "variables", "expr": f"x / {m}", "context": _ctx(x=x),
            "mutations": [f"x // {m}", f"x % {m}", f"x / {m + 1}"], "misconception": "int_division",
            "why": "/ always returns a float in Python 3, even when the division is exact."}


def t_power(rng):
    b, e = rng.randint(2, 5), rng.randint(2, 3)
    return {"level": 2, "topic": "variables", "expr": f"{b} ** {e}", "context": {},
            "mutations": [f"{b} * {e}", f"{e} ** {b}", f"{b} ^ {e}"], "misconception": "power_vs_multiply",
            "why": f"** is exponentiation: {b} multiplied by itself {e} times. * would just multiply."}


def t_compare_chain(rng):
    x = rng.randint(1, 20)
    lo, hi = rng.randint(1, 10), rng.randint(11, 20)
    return {"level": 2, "topic": "variables", "expr": f"{lo} < x <= {hi}", "context": _ctx(x=x),
            "mutations": [f"{lo} < x < {hi}", f"x < {lo}", f"x > {hi}"], "misconception": "chained_comparison",
            "why": f"A chained comparison checks both parts: is {lo} below x, and is x at most {hi}?"}


def t_int_str(rng):
    a, b = rng.randint(1, 9), rng.randint(1, 9)
    return {"level": 2, "topic": "variables", "expr": f'int("{a}") + int("{b}")', "context": {},
            "mutations": [f'"{a}" + "{b}"', f"{a} * {b}", f'int("{a}{b}") - {a}'], "misconception": "str_vs_int_add",
            "why": "int() converts each string to a number first, so + adds instead of joining text."}


def t_str_repeat_len(rng):
    w, n = rng.choice(WORDS)[:3], rng.randint(2, 4)
    return {"level": 2, "topic": "variables", "expr": f'len("{w}" * {n})', "context": {},
            "mutations": [f"len('{w}') + {n}", f"{n}", f"len('{w}') * {n + 1}"], "misconception": "str_repeat",
            "why": f'"{w}" * {n} repeats the text {n} times, so the length is {len(w)} × {n}.'}


def t_round(rng):
    v = rng.choice([2.5, 3.5, 4.5, 2.4, 2.6, 7.5])
    return {"level": 3, "topic": "variables", "expr": f"round({v})", "context": {},
            "mutations": [f"int({v})", f"int({v}) + 1", f"{v}"], "misconception": "bankers_rounding",
            "why": "round() uses banker's rounding: exact halves go to the nearest even number."}


def t_abs_neg(rng):
    a, b = rng.randint(1, 9), rng.randint(10, 20)
    return {"level": 1, "topic": "variables", "expr": f"abs({a} - {b})", "context": {},
            "mutations": [f"{a} - {b}", f"{b} - {a} + 1", f"-({b} - {a})"], "misconception": "abs_value",
            "why": f"{a} - {b} is negative; abs() drops the sign."}


def t_max_min(rng):
    vals = rng.sample(range(1, 30), 3)
    return {"level": 1, "topic": "variables", "expr": f"max({vals[0]}, {vals[1]}, {vals[2]}) - min({vals[0]}, {vals[1]}, {vals[2]})", "context": {},
            "mutations": [f"max({vals[0]}, {vals[1]}, {vals[2]})", f"min({vals[0]}, {vals[1]}, {vals[2]})", f"sum([{vals[0]}, {vals[1]}, {vals[2]}])"],
            "misconception": "max_min", "why": "max picks the largest value, min the smallest; the difference is the range."}


# ───────────────────────────── conditionals (booleans, truthiness) ─────────────────────────────

def t_truthiness(rng):
    val, truth = rng.choice([("''", False), ("0", False), ("[]", False), ("None", False), ("'0'", True), ("[0]", True), ("' '", True), ("0.0", False), ("-1", True)])
    return {"level": 1, "topic": "conditionals", "expr": f"bool({val})", "context": {},
            "mutations": [f"not bool({val})", "None", f"bool({val}) == 0"], "misconception": "truthiness",
            "why": "Empty containers, empty strings, 0 and None are falsy; anything non-empty or non-zero is truthy."}


def t_and_or(rng):
    a, b = rng.randint(0, 2), rng.randint(0, 2)
    op = rng.choice(["and", "or"])
    return {"level": 2, "topic": "conditionals", "expr": f"a {op} b", "context": _ctx(a=a, b=b),
            "mutations": [f"a {'or' if op == 'and' else 'and'} b", "bool(a) and bool(b)", "a + b"], "misconception": "and_or_values",
            "why": f"`{op}` returns one of its operands, not just True/False: `and` gives the first falsy value (or the last), `or` gives the first truthy value (or the last)."}


def t_not_compare(rng):
    x, y = rng.randint(1, 9), rng.randint(1, 9)
    return {"level": 1, "topic": "conditionals", "expr": f"not x == {y}", "context": _ctx(x=x),
            "mutations": [f"x == {y}", f"not x", "x != 0"], "misconception": "not_precedence",
            "why": f"Comparison runs first (x == {y}), then `not` flips the result."}


def t_in_string(rng):
    w = rng.choice(WORDS)
    sub = rng.choice([w[1:3], w[:2], "zz", w[-2:], "q"])
    return {"level": 1, "topic": "conditionals", "expr": f'"{sub}" in "{w}"', "context": {},
            "mutations": [f'"{sub}" not in "{w}"', f'"{w}" in "{sub}"', f'"{sub}" == "{w}"'], "misconception": "in_operator",
            "why": "`in` on strings checks for a substring anywhere inside the text."}


def t_ternary(rng):
    x = rng.randint(1, 20)
    return {"level": 3, "topic": "conditionals", "expr": '"even" if x % 2 == 0 else "odd"', "context": _ctx(x=x),
            "mutations": ['"odd" if x % 2 == 0 else "even"', '"even"', 'x % 2'], "misconception": "ternary_order",
            "why": "A conditional expression reads left to right: value-if-true, the condition, value-if-false."}


def t_eq_vs_is_types(rng):
    a = rng.randint(1, 9)
    return {"level": 2, "topic": "conditionals", "expr": f"{a} == {float(a)}", "context": {},
            "mutations": [f"{a} is {float(a)}", f'{a} == "{a}"', f"{a} != {float(a)}"], "misconception": "equality_across_types",
            "why": "== compares values: an int and a float with the same value are equal; a string never equals a number."}


def t_short_circuit(rng):
    x = rng.randint(0, 3)
    return {"level": 4, "topic": "conditionals", "expr": "x != 0 and 12 // x", "context": _ctx(x=x),
            "mutations": ["x == 0 or 12 // x", "12 // x if x else 12", "bool(x)"], "misconception": "short_circuit",
            "why": "`and` stops at the first falsy operand, so the division never runs when x is 0."}


def t_any_all(rng):
    vals = [rng.randint(0, 2) for _ in range(4)]
    fn = rng.choice(["any", "all"])
    return {"level": 3, "topic": "conditionals", "expr": f"{fn}(vals)", "context": _ctx(vals=vals),
            "mutations": [f"{'all' if fn == 'any' else 'any'}(vals)", "bool(sum(vals))", "len(vals) > 0"], "misconception": "any_all",
            "why": "any() is True if at least one element is truthy; all() needs every element truthy (and is True for an empty list)."}


# ───────────────────────────── lists ─────────────────────────────

def t_index_neg(rng):
    vals = rng.sample(range(1, 40), 5)
    i = rng.choice([-1, -2, 0, 2, -5])
    return {"level": 1, "topic": "lists", "expr": f"nums[{i}]", "context": _ctx(nums=vals),
            "mutations": [f"nums[{i + 1}]", f"nums[{-i if i else 1}]", f"nums[{i - 1 if i > -5 else 0}]"], "misconception": "negative_index",
            "why": "Index 0 is the first element and -1 the last; negative indexes count from the end."}


def t_slice(rng):
    vals = rng.sample(range(1, 40), 6)
    a, b = rng.randint(0, 2), rng.randint(3, 6)
    return {"level": 2, "topic": "lists", "expr": f"nums[{a}:{b}]", "context": _ctx(nums=vals),
            "mutations": [f"nums[{a}:{b + 1}]", f"nums[{a + 1}:{b}]", f"nums[{a}:{b - 1}]"], "misconception": "slice_end_exclusive",
            "why": f"A slice includes the start index {a} and stops before the end index {b}."}


def t_slice_step(rng):
    vals = rng.sample(range(1, 40), 6)
    return {"level": 3, "topic": "lists", "expr": "nums[::2]", "context": _ctx(nums=vals),
            "mutations": ["nums[1::2]", "nums[::-1]", "nums[:2]"], "misconception": "slice_step",
            "why": "A step of 2 takes every second element starting from index 0."}


def t_reverse_slice(rng):
    vals = rng.sample(range(1, 40), 4)
    return {"level": 3, "topic": "lists", "expr": "nums[::-1]", "context": _ctx(nums=vals),
            "mutations": ["nums[-1]", "nums[1:]", "sorted(nums)"], "misconception": "slice_step",
            "why": "A step of -1 walks the list backwards, producing a reversed copy."}


def t_len_nested(rng):
    inner = rng.sample(range(1, 9), rng.randint(2, 3))
    outer = [rng.randint(1, 9), inner, rng.randint(1, 9)]
    return {"level": 2, "topic": "lists", "expr": "len(data)", "context": _ctx(data=outer),
            "mutations": ["len(data[1])", "len(data) + len(data[1])", "len(data) - 1"], "misconception": "len_counts_top_level",
            "why": "len counts the top-level elements only; a nested list is one element however long it is."}


def t_sum_slice(rng):
    vals = rng.sample(range(1, 20), 5)
    return {"level": 2, "topic": "lists", "expr": "sum(nums[:3])", "context": _ctx(nums=vals),
            "mutations": ["sum(nums)", "sum(nums[3:])", "sum(nums[:2])"], "misconception": "slice_end_exclusive",
            "why": "nums[:3] is the first three elements; sum adds them."}


def t_in_list(rng):
    vals = rng.sample(range(1, 20), 4)
    probe = rng.choice(vals + [rng.randint(21, 30)])
    return {"level": 1, "topic": "lists", "expr": f"{probe} in nums", "context": _ctx(nums=vals),
            "mutations": [f"{probe} not in nums", f"nums.index({vals[0]}) == 0", "len(nums) == 4"], "misconception": "in_operator",
            "why": "`in` checks whether the value appears anywhere in the list."}


def t_list_repeat(rng):
    v, n = rng.randint(0, 3), rng.randint(2, 4)
    return {"level": 2, "topic": "lists", "expr": f"[{v}] * {n}", "context": {},
            "mutations": [f"[{v} * {n}]", f"[{v}] + [{n}]", f"[{v}, {n}]"], "misconception": "list_repeat",
            "why": f"Multiplying a list repeats its elements: [{v}] * {n} is a list of {n} copies."}


def t_concat(rng):
    a, b = rng.sample(range(1, 9), 2), rng.sample(range(10, 19), 2)
    return {"level": 1, "topic": "lists", "expr": "a + b", "context": _ctx(a=a, b=b),
            "mutations": ["b + a", "[sum(a), sum(b)]", "a"], "misconception": "list_concat",
            "why": "+ on lists concatenates them in order into a new list."}


def t_sorted_desc(rng):
    vals = rng.sample(range(1, 30), 4)
    return {"level": 3, "topic": "lists", "expr": "sorted(nums, reverse=True)[0]", "context": _ctx(nums=vals),
            "mutations": ["sorted(nums)[0]", "nums[0]", "nums[-1]"], "misconception": "sorted_returns_new",
            "why": "sorted(..., reverse=True) orders from largest to smallest, so index 0 is the maximum."}


def t_count(rng):
    vals = [rng.choice([1, 2, 3]) for _ in range(6)]
    probe = rng.choice([1, 2, 3])
    return {"level": 2, "topic": "lists", "expr": f"nums.count({probe})", "context": _ctx(nums=vals),
            "mutations": [f"nums.index({probe}) if {probe} in nums else -1", "len(nums)", f"nums.count({probe}) + 1"], "misconception": "count_vs_index",
            "why": "count() returns how many times the value appears; index() would give its first position."}


# ───────────────────────────── dicts ─────────────────────────────

def t_dict_get_default(rng):
    d = {"a": rng.randint(1, 9), "b": rng.randint(1, 9)}
    key = rng.choice(["a", "b", "z"])
    return {"level": 1, "topic": "ds_dicts", "expr": f'd.get("{key}", 0)', "context": _ctx(d=d),
            "mutations": [f'd.get("{key}", -1)', 'd["a"]', 'len(d)'], "misconception": "dict_get_default",
            "why": "get() returns the key's value, or the default when the key is missing, instead of raising KeyError."}


def t_dict_in_keys(rng):
    d = {"x": 1, "y": 2}
    probe = rng.choice(['"x"', '"y"', '"z"', '1', '2'])
    return {"level": 1, "topic": "ds_dicts", "expr": f"{probe} in d", "context": _ctx(d=d),
            "mutations": [f"{probe} in d.values()", f"{probe} not in d", "len(d) == 2"], "misconception": "in_checks_keys",
            "why": "`in` on a dict checks the keys, never the values."}


def t_dict_len_after_set(rng):
    d = {"a": 1, "b": 2}
    return {"level": 2, "topic": "ds_dicts", "expr": 'len({**d, "a": 9, "c": 3})', "context": _ctx(d=d),
            "mutations": ['len(d)', 'len(d) + 2', 'len({**d, "a": 9})'], "misconception": "dict_keys_unique",
            "why": "Keys are unique: reassigning \"a\" replaces its value, only \"c\" adds a new entry."}


def t_dict_values_sum(rng):
    d = {k: rng.randint(1, 9) for k in ["p", "q", "r"]}
    return {"level": 2, "topic": "ds_dicts", "expr": "sum(d.values())", "context": _ctx(d=d),
            "mutations": ["len(d)", "max(d.values())", "sum(d.values()) - min(d.values())"], "misconception": "dict_values",
            "why": "d.values() gives the numbers stored under each key; sum adds them."}


def t_dict_keys_sorted(rng):
    d = {k: 1 for k in rng.sample(["pear", "apple", "fig", "kiwi"], 3)}
    return {"level": 3, "topic": "ds_dicts", "expr": "sorted(d)[0]", "context": _ctx(d=d),
            "mutations": ["list(d)[0]", "sorted(d)[-1]", "max(d)"], "misconception": "iterating_dict_gives_keys",
            "why": "Iterating a dict yields its keys; sorted() orders them alphabetically."}


def t_dict_get_nested(rng):
    d = {"user": {"name": rng.choice(["Ana", "Raj", "Mei"]), "age": rng.randint(20, 40)}}
    return {"level": 3, "topic": "ds_dicts", "expr": 'd["user"]["age"] + 1', "context": _ctx(d=d),
            "mutations": ['d["user"]["age"]', 'len(d["user"])', 'd["user"]["age"] - 1'], "misconception": "nested_dict_access",
            "why": "Each [] step goes one level deeper into the nested dict."}


# ───────────────────────────── comprehensions ─────────────────────────────

def t_comp_filter_len(rng):
    vals = [rng.randint(1, 20) for _ in range(6)]
    return {"level": 2, "topic": "comprehensions", "expr": "len([x for x in nums if x % 2 == 0])", "context": _ctx(nums=vals),
            "mutations": ["len([x for x in nums if x % 2 == 1])", "len(nums)", "sum(x for x in nums if x % 2 == 0)"], "misconception": "comp_filter",
            "why": "The `if` part keeps only even values; len counts how many survived."}


def t_comp_map_sum(rng):
    vals = [rng.randint(1, 6) for _ in range(4)]
    return {"level": 2, "topic": "comprehensions", "expr": "sum([x * 2 for x in nums])", "context": _ctx(nums=vals),
            "mutations": ["sum(nums)", "len([x * 2 for x in nums])", "sum(nums) * 4"], "misconception": "comp_map",
            "why": "The comprehension doubles every element first; sum then adds the doubled values."}


def t_comp_strings(rng):
    words = rng.sample(WORDS, 4)
    n = rng.choice([5, 6])
    return {"level": 3, "topic": "comprehensions", "expr": f"[w for w in words if len(w) > {n}]", "context": _ctx(words=words),
            "mutations": [f"[w for w in words if len(w) >= {n}]", f"[len(w) for w in words if len(w) > {n}]", "words[:1]"], "misconception": "comp_filter",
            "why": f"Only words longer than {n} characters pass the filter, kept in their original order."}


def t_comp_set(rng):
    vals = [rng.choice([1, 2, 3, 4]) for _ in range(6)]
    return {"level": 3, "topic": "comprehensions", "expr": "len({x % 3 for x in nums})", "context": _ctx(nums=vals),
            "mutations": ["len([x % 3 for x in nums])", "len(set(nums))", "3"], "misconception": "set_comp_dedupes",
            "why": "A set comprehension keeps each remainder once, so the length is the number of distinct remainders."}


def t_comp_dict(rng):
    words = rng.sample(WORDS, 3)
    return {"level": 4, "topic": "comprehensions", "expr": "{w: len(w) for w in words}[words[0]]", "context": _ctx(words=words),
            "mutations": ["len(words)", "{w: len(w) for w in words}[words[-1]]", "words[0]"], "misconception": "dict_comp",
            "why": "The dict comprehension maps each word to its length; indexing by the first word returns that length."}


def t_comp_nested_len(rng):
    n, m = rng.randint(2, 4), rng.randint(2, 3)
    return {"level": 4, "topic": "comprehensions", "expr": f"len([(i, j) for i in range({n}) for j in range({m})])", "context": {},
            "mutations": [f"{n} + {m}", f"len([i for i in range({n})])", f"{n} * {m} + 1"], "misconception": "nested_comp_count",
            "why": f"Two `for` clauses pair every i with every j: {n} × {m} tuples."}


# ───────────────────────────── loops (range arithmetic) ─────────────────────────────

def t_range_len(rng):
    a, b, step = rng.randint(0, 3), rng.randint(8, 15), rng.choice([1, 2, 3])
    return {"level": 1, "topic": "for_loops", "expr": f"len(range({a}, {b}, {step}))", "context": {},
            "mutations": [f"len(range({a}, {b + 1}, {step}))", f"{b} - {a}", f"len(range({a}, {b}, {step + 1}))"], "misconception": "range_end_exclusive",
            "why": f"range({a}, {b}, {step}) starts at {a} and stops before {b}, stepping by {step}; the stop value is never included."}


def t_range_sum(rng):
    n = rng.randint(3, 7)
    return {"level": 2, "topic": "for_loops", "expr": f"sum(range({n}))", "context": {},
            "mutations": [f"sum(range({n + 1}))", f"sum(range(1, {n}))", f"{n} * {n}"], "misconception": "range_end_exclusive",
            "why": f"range({n}) produces 0 up to {n - 1}, so the sum is 0 + 1 + ... + {n - 1}."}


def t_range_last(rng):
    a, b, step = rng.randint(1, 4), rng.randint(10, 20), rng.choice([2, 3, 4])
    return {"level": 2, "topic": "for_loops", "expr": f"list(range({a}, {b}, {step}))[-1]", "context": {},
            "mutations": [f"{b}", f"{b - 1}", f"list(range({a}, {b}, {step}))[0]"], "misconception": "range_step",
            "why": f"Counting from {a} in steps of {step}, the last value is the biggest one still below {b}."}


def t_enumerate_pairs(rng):
    words = rng.sample(WORDS, 3)
    return {"level": 3, "topic": "for_loops", "expr": "[i for i, w in enumerate(words) if w.startswith(words[-1][0])]", "context": _ctx(words=words),
            "mutations": ["[w for i, w in enumerate(words)]", "[i for i, w in enumerate(words)]", "[i + 1 for i, w in enumerate(words) if w.startswith(words[-1][0])]"],
            "misconception": "enumerate_index", "why": "enumerate yields (index, value) pairs starting at 0; the filter keeps the indexes whose word starts with the same letter as the last word."}


def t_loop_accumulate(rng):
    vals = [rng.randint(1, 5) for _ in range(4)]
    return {"level": 2, "topic": "for_loops", "expr": "sum(v for v in nums if v > 2)", "context": _ctx(nums=vals),
            "mutations": ["sum(nums)", "len([v for v in nums if v > 2])", "sum(v for v in nums if v >= 2)"], "misconception": "loop_filter",
            "why": "Only the values above 2 are added, exactly as a for loop with an if inside would do."}


TEMPLATES = [
    t_mod, t_floordiv, t_true_div, t_power, t_compare_chain, t_int_str, t_str_repeat_len, t_round, t_abs_neg, t_max_min,
    t_truthiness, t_and_or, t_not_compare, t_in_string, t_ternary, t_eq_vs_is_types, t_short_circuit, t_any_all,
    t_index_neg, t_slice, t_slice_step, t_reverse_slice, t_len_nested, t_sum_slice, t_in_list, t_list_repeat, t_concat, t_sorted_desc, t_count,
    t_dict_get_default, t_dict_in_keys, t_dict_len_after_set, t_dict_values_sum, t_dict_keys_sorted, t_dict_get_nested,
    t_comp_filter_len, t_comp_map_sum, t_comp_strings, t_comp_set, t_comp_dict, t_comp_nested_len,
    t_range_len, t_range_sum, t_range_last, t_enumerate_pairs, t_loop_accumulate,
]
