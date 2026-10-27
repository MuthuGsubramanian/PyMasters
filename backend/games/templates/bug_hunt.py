"""Bug Hunt templates: one bug per snippet, a failing test, three candidate fixes.

Each template returns {level, topic, code, test, bug_line, fixes: [3 full lines], fix_index,
misconception, why}. The build script proves: buggy code fails `test`, fixes[fix_index]
passes, the other two still fail.
"""
import random

NAMES = ["alice", "bala", "chen", "devi", "eli", "farah"]
LISTS = ["nums", "scores", "marks", "values", "items"]


def _ints(rng, n, lo=1, hi=9):
    return rng.sample(range(lo, hi + 1), n)


# ───────────────────────────── level 1 ─────────────────────────────

def t_assign_vs_compare(rng):
    n = rng.randint(0, 3)
    return {"level": 1, "topic": "conditionals",
            "code": f'def label(n):\n    if n = {n}:\n        return "match"\n    return "other"',
            "test": f'assert label({n}) == "match"\nassert label({n + 1}) == "other"',
            "bug_line": 1, "fixes": [f"    if n == {n}:", f'    if n == "{n}":', f"    if not n == {n}:"], "fix_index": 0,
            "misconception": "assign_vs_compare",
            "why": "A single = assigns; comparison needs ==. Python refuses = inside an if, which is the SyntaxError you saw."}


def t_range_off_by_one(rng):
    n = rng.randint(3, 7)
    return {"level": 1, "topic": "for_loops",
            "code": "def total_to(n):\n    total = 0\n    for i in range(1, n):\n        total += i\n    return total",
            "test": f"assert total_to({n}) == {sum(range(1, n + 1))}",
            "bug_line": 2, "fixes": ["    for i in range(1, n + 1):", "    for i in range(0, n):", "    for i in range(n):"], "fix_index": 0,
            "misconception": "off_by_one",
            "why": "range stops before its end value, so range(1, n) never reaches n. Add 1 to include it."}


def t_str_plus_int(rng):
    age = rng.randint(10, 60)
    return {"level": 1, "topic": "variables",
            "code": f'age = "{age}"\ndef next_year():\n    return age + 1',
            "test": f"assert next_year() == {age + 1}",
            "bug_line": 2, "fixes": ["    return int(age) + 1", '    return age + "1"', "    return str(age) + 1"], "fix_index": 0,
            "misconception": "str_vs_int",
            "why": "age holds text, not a number. Convert with int() before doing arithmetic; adding a string and an int raises TypeError."}


def t_missing_return(rng):
    a, b = _ints(rng, 2)
    return {"level": 1, "topic": "functions_basics",
            "code": "def multiply(a, b):\n    result = a * b\n    print(result)",
            "test": f"assert multiply({a}, {b}) == {a * b}",
            "bug_line": 2, "fixes": ["    return result", "    result", "    print(return result)"], "fix_index": 0,
            "misconception": "missing_return",
            "why": "print shows a value on screen; return hands it back to the caller. Without return the function gives None."}


# ───────────────────────────── level 2 ─────────────────────────────

def t_mutable_default(rng):
    a, b = _ints(rng, 2)
    return {"level": 2, "topic": "functions_args",
            "code": "def add(item, bucket=[]):\n    bucket = bucket\n    bucket.append(item)\n    return bucket",
            "test": f"assert add({a}) == [{a}]\nassert add({b}) == [{b}]",
            "bug_line": 1, "fixes": ["    bucket = list(bucket)", "    bucket = tuple(bucket)", "    bucket = bucket + [item]"], "fix_index": 0,
            "misconception": "mutable_default",
            "why": "The default list is created once and shared by every call. Copying it (or using None as the default) gives each call a fresh list."}


def t_remove_while_iterating(rng):
    vals = sorted(_ints(rng, 5, 1, 12))
    evens = [v for v in vals if v % 2 == 0]
    if len(evens) < 2:
        vals = [2, 4, 5, 6, 9]
    return {"level": 2, "topic": "lists",
            "code": "def drop_evens(nums):\n    for x in nums:\n        if x % 2 == 0:\n            nums.remove(x)\n    return nums",
            "test": f"assert drop_evens({vals}) == {[v for v in vals if v % 2]}",
            "bug_line": 1, "fixes": ["    for x in nums[:]:", "    for x in nums.copy:", "    for x in range(len(nums)):"], "fix_index": 0,
            "misconception": "mutate_while_iterating",
            "why": "Removing from a list while looping over it shifts the remaining items and skips some. Iterate over a copy (nums[:]) or build a new list."}


def t_index_past_end(rng):
    vals = _ints(rng, 4)
    return {"level": 2, "topic": "for_loops",
            "code": "def total(nums):\n    s = 0\n    for i in range(len(nums) + 1):\n        s += nums[i]\n    return s",
            "test": f"assert total({vals}) == {sum(vals)}",
            "bug_line": 2, "fixes": ["    for i in range(len(nums)):", "    for i in range(1, len(nums)):", "    for i in range(len(nums) - 1):"], "fix_index": 0,
            "misconception": "off_by_one",
            "why": "Valid indices run from 0 to len(nums) - 1, which is exactly what range(len(nums)) produces. The + 1 steps past the end."}


def t_while_counter_not_updated(rng):
    n = rng.randint(3, 6)
    return {"level": 2, "topic": "while_loops",
            "code": "def countdown(n):\n    out = []\n    while n > 0:\n        out.append(n)\n        n = n\n    return out",
            "test": f"assert countdown({n}) == {list(range(n, 0, -1))}",
            "bug_line": 4, "fixes": ["        n -= 1", "        n += 1", "        n = 0"], "fix_index": 0,
            "misconception": "loop_variable_not_updated",
            "why": "A while loop only ends when its condition becomes false, so something inside must move n toward 0 each time."}


# ───────────────────────────── level 3 ─────────────────────────────

def t_falsy_zero(rng):
    return {"level": 3, "topic": "conditionals",
            "code": 'def show(value):\n    if not value:\n        return "missing"\n    return str(value)',
            "test": 'assert show(0) == "0"\nassert show(None) == "missing"',
            "bug_line": 1, "fixes": ["    if value is None:", "    if value == False:", "    if value is not None:"], "fix_index": 0,
            "misconception": "truthiness",
            "why": "0 is falsy, so `not value` treats a real zero as missing. Test for the sentinel explicitly with `is None`."}


def t_open_wrong_mode(rng):
    word = rng.choice(["alpha", "beta", "gamma", "delta"])
    return {"level": 3, "topic": "fileio_reading",
            "code": 'def first_line(path):\n    with open(path, "w") as fh:\n        return fh.readline().strip()',
            "test": f'with open("note.txt", "w") as f:\n    f.write("{word}\\nsecond")\nassert first_line("note.txt") == "{word}"',
            "bug_line": 1, "fixes": ['    with open(path, "r") as fh:', '    with open(path, "a") as fh:', '    with open(path, "wb") as fh:'], "fix_index": 0,
            "misconception": "file_mode",
            "why": "Mode \"w\" opens for writing and truncates the file; reading needs \"r\" (the default)."}


def t_missing_fstring(rng):
    name = rng.choice(NAMES); age = rng.randint(18, 60)
    return {"level": 3, "topic": "variables",
            "code": 'def describe(name, age):\n    return "{name} is {age}"',
            "test": f'assert describe("{name}", {age}) == "{name} is {age}"',
            "bug_line": 1, "fixes": ['    return f"{name} is {age}"', '    return "{name} is {age}".format()', '    return "{name} is {age}" % (name, age)'], "fix_index": 0,
            "misconception": "fstring_prefix",
            "why": "Without the f prefix the braces are just characters. f\"...\" evaluates the expressions inside the braces."}


def t_count_with_wrong_init(rng):
    vals = _ints(rng, 5, 1, 20)
    return {"level": 3, "topic": "for_loops",
            "code": "def biggest(nums):\n    best = 0\n    for n in nums:\n        if n < best:\n            best = n\n    return best",
            "test": f"assert biggest({vals}) == {max(vals)}",
            "bug_line": 3, "fixes": ["        if n > best:", "        if n >= 0:", "        if n == best:"], "fix_index": 0,
            "misconception": "comparison_direction",
            "why": "To track the largest value, replace best only when the new number is greater. The comparison was pointing the wrong way."}


# ───────────────────────────── level 4 ─────────────────────────────

def t_average_floor(rng):
    vals = _ints(rng, 3, 1, 9)
    while sum(vals) % 3 == 0:
        vals = _ints(rng, 3, 1, 9)
    return {"level": 4, "topic": "variables",
            "code": "def average(nums):\n    return sum(nums) // len(nums)",
            "test": f"assert abs(average({vals}) - {sum(vals) / 3}) < 1e-9",
            "bug_line": 1, "fixes": ["    return sum(nums) / len(nums)", "    return sum(nums) % len(nums)", "    return sum(nums) ** len(nums)"], "fix_index": 0,
            "misconception": "int_division",
            "why": "// floors the result, throwing away the fraction; an average needs true division with /."}


def t_dict_missing_key(rng):
    k = rng.choice(["apple", "mango", "guava"])
    return {"level": 4, "topic": "ds_dicts",
            "code": "def stock_of(counts, item):\n    return counts[item] + 0",
            "test": f'assert stock_of({{"banana": 3}}, "{k}") == 0\nassert stock_of({{"{k}": 2}}, "{k}") == 2',
            "bug_line": 1, "fixes": ["    return counts.get(item, 0)", "    return counts.get(item)", "    return counts[item] or 0"], "fix_index": 0,
            "misconception": "dict_missing_key",
            "why": "Square brackets raise KeyError for a missing key; .get(key, default) returns the default instead."}


def t_string_method_not_assigned(rng):
    word = rng.choice(["hello", "python", "data"])
    return {"level": 4, "topic": "variables",
            "code": "def shout(s):\n    s.upper()\n    return s",
            "test": f'assert shout("{word}") == "{word.upper()}"',
            "bug_line": 1, "fixes": ["    s = s.upper()", "    s.upper(inplace=True)", "    upper(s)"], "fix_index": 0,
            "misconception": "string_immutable_methods",
            "why": "Strings are immutable: upper() returns a new string and leaves s unchanged, so keep the result."}


def t_sort_returns_none(rng):
    vals = _ints(rng, 4, 1, 20)
    return {"level": 4, "topic": "lists",
            "code": "def smallest(nums):\n    nums = nums.sort()\n    return nums[0]",
            "test": f"assert smallest({vals}) == {min(vals)}",
            "bug_line": 1, "fixes": ["    nums = sorted(nums)", "    nums = nums.sorted()", "    nums = sort(nums)"], "fix_index": 0,
            "misconception": "sort_returns_none",
            "why": "list.sort() sorts in place and returns None. Use sorted(nums) when you want the sorted list as a value."}


# ───────────────────────────── level 5 ─────────────────────────────

def t_late_binding(rng):
    n = rng.randint(3, 4)
    return {"level": 5, "topic": "functions_args",
            "code": f"def make_getters():\n    fs = [lambda: i for i in range({n})]\n    return [f() for f in fs]",
            "test": f"assert make_getters() == {list(range(n))}",
            "bug_line": 1, "fixes": [f"    fs = [lambda i=i: i for i in range({n})]", f"    fs = [lambda: i for i in list(range({n}))]", f"    fs = [lambda i: i for i in range({n})]"], "fix_index": 0,
            "misconception": "closure_late_binding",
            "why": "Each lambda reads i when it is called, after the loop ended. A default argument (i=i) captures the value at creation time."}


def t_generator_exhausted(rng):
    vals = _ints(rng, 4)
    return {"level": 5, "topic": "lists",
            "code": "def twice_total(nums):\n    g = (x for x in nums)\n    return sum(g) + sum(g)",
            "test": f"assert twice_total({vals}) == {2 * sum(vals)}",
            "bug_line": 1, "fixes": ["    g = [x for x in nums]", "    g = (x for x in nums) * 2", "    g = iter(nums)"], "fix_index": 0,
            "misconception": "generator_exhausted",
            "why": "A generator can be consumed once; the second sum sees nothing. A list can be summed as often as you like."}


def t_alias_instead_of_copy(rng):
    vals = _ints(rng, 3); x = rng.randint(10, 20)
    return {"level": 5, "topic": "lists",
            "code": "def extended(a, x):\n    b = a\n    b.append(x)\n    return a, b",
            "test": f"a, b = extended({vals}, {x})\nassert a == {vals} and b == {vals + [x]}",
            "bug_line": 1, "fixes": ["    b = a[:]", "    b = a.copy", "    b = [a]"], "fix_index": 0,
            "misconception": "aliasing",
            "why": "b = a makes a second name for the same list. a[:] or list(a) creates an independent copy."}


def t_nonlocal_missing(rng):
    k = rng.randint(2, 4)
    return {"level": 5, "topic": "functions_args",
            "code": f"def counter():\n    n = 0\n    def inc():\n        pass  # declare n here\n        n += 1\n        return n\n    for _ in range({k}):\n        last = inc()\n    return last",
            "test": f"assert counter() == {k}",
            "bug_line": 3, "fixes": ["        nonlocal n", "        global n", "        n = n"], "fix_index": 0,
            "misconception": "nonlocal_keyword",
            "why": "Assigning to n inside inc makes it a new local, so n += 1 reads an unbound variable. nonlocal binds it to the enclosing n."}


# ───────────────────────────── level 6 ─────────────────────────────

def t_except_order(rng):
    return {"level": 6, "topic": "errors_handling",
            "code": 'def classify(fn):\n    try:\n        fn()\n    except Exception:\n        return "other"\n    except ValueError:\n        return "value"\n    return "ok"',
            "test": 'def bad():\n    raise ValueError()\nassert classify(bad) == "value"\nassert classify(lambda: None) == "ok"',
            "bug_line": 3, "fixes": ["    except KeyError:", "    except BaseException:", "    except:"], "fix_index": 0,
            "misconception": "except_order_subclass",
            "why": "except clauses are tried top to bottom and ValueError is an Exception, so the broad clause swallows it. Put specific exceptions first or narrow the first clause."}


def t_decorator_returns_wrong(rng):
    m = rng.choice([2, 3, 10])
    return {"level": 6, "topic": "functions_args",
            "code": f"def scaled(f):\n    def w(x):\n        return f(x) * {m}\n    return f\n\n@scaled\ndef ident(x):\n    return x",
            "test": f"assert ident(4) == {4 * m}",
            "bug_line": 3, "fixes": ["    return w", "    return w()", "    return f()"], "fix_index": 0,
            "misconception": "decorator_returns_wrapper",
            "why": "A decorator must return the wrapper that replaces the function. Returning f leaves the original untouched."}


def t_init_missing_self(rng):
    name = rng.choice(NAMES)
    return {"level": 6, "topic": "functions_args",
            "code": "class User:\n    def __init__(self, name):\n        name = name\n\n    def greet(self):\n        return \"hi \" + self.name",
            "test": f'assert User("{name}").greet() == "hi {name}"',
            "bug_line": 2, "fixes": ["        self.name = name", "        self = name", "        this.name = name"], "fix_index": 0,
            "misconception": "self_attribute",
            "why": "Inside __init__, `name = name` only rebinds the local parameter. Attributes live on self: self.name = name."}


def t_class_attr_shared(rng):
    a, b = rng.sample(NAMES, 2)
    return {"level": 6, "topic": "functions_args",
            "code": "class Team:\n    members = []\n\n    def __init__(self):\n        self.members = Team.members\n\n    def add(self, who):\n        self.members.append(who)\n        return len(self.members)",
            "test": f't1, t2 = Team(), Team()\nt1.add("{a}")\nassert t2.add("{b}") == 1',
            "bug_line": 4, "fixes": ["        self.members = []", "        self.members = members", "        Team.members = []"], "fix_index": 0,
            "misconception": "class_attr_shared",
            "why": "Team.members is one list shared by every instance. Give each object its own list by assigning a fresh [] in __init__."}


def t_property_called(rng):
    w, h = _ints(rng, 2, 2, 9)
    return {"level": 6, "topic": "functions_args",
            "code": "class Rect:\n    def __init__(self, w, h):\n        self.w, self.h = w, h\n\n    @property\n    def area(self):\n        return self.w * self.h\n\ndef area_of(r):\n    return r.area()",
            "test": f"assert area_of(Rect({w}, {h})) == {w * h}",
            "bug_line": 9, "fixes": ["    return r.area", "    return r.area()()", "    return area"], "fix_index": 0,
            "misconception": "property_is_computed",
            "why": "A property is read like an attribute, without parentheses; r.area already returns the number, so calling it fails."}


TEMPLATES = [
    t_assign_vs_compare, t_range_off_by_one, t_str_plus_int, t_missing_return,
    t_mutable_default, t_remove_while_iterating, t_index_past_end, t_while_counter_not_updated,
    t_falsy_zero, t_open_wrong_mode, t_missing_fstring, t_count_with_wrong_init,
    t_average_floor, t_dict_missing_key, t_string_method_not_assigned, t_sort_returns_none,
    t_late_binding, t_generator_exhausted, t_alias_instead_of_copy, t_nonlocal_missing,
    t_except_order, t_decorator_returns_wrong, t_init_missing_self, t_class_attr_shared, t_property_called,
]
