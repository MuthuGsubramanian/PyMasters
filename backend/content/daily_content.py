"""
daily_content.py -- Generates daily personalised content for each user.

Provides tips, coding challenges, quiz questions, and greetings that
rotate deterministically by date and adapt to user skill level.
"""

from __future__ import annotations

import hashlib
from typing import Any

# ---------------------------------------------------------------------------
# Tips Knowledge Base  (50+ entries across 3 levels)
# ---------------------------------------------------------------------------

TIPS: list[dict[str, Any]] = [
    # ── Beginner ───────────────────────────────────────────────────────
    {
        "id": "tip_b01",
        "level": "beginner",
        "title": "f-strings are your best friend",
        "content": (
            "Use f-strings for clean, readable string formatting. "
            "Put any expression inside {braces} and Python evaluates it."
        ),
        "code": "name = 'Ravi'\nprint(f'Hello, {name}! You have {3 + 4} messages.')",
        "tags": ["strings", "formatting"],
    },
    {
        "id": "tip_b02",
        "level": "beginner",
        "title": "Unpack with *starred expressions",
        "content": (
            "Use * to capture remaining items when unpacking sequences. "
            "Great for splitting head/tail or first/rest patterns."
        ),
        "code": "first, *rest = [1, 2, 3, 4, 5]\nprint(first)  # 1\nprint(rest)   # [2, 3, 4, 5]",
        "tags": ["unpacking", "sequences"],
    },
    {
        "id": "tip_b03",
        "level": "beginner",
        "title": "enumerate() gives you index + value",
        "content": (
            "Never use range(len(items)) to get an index. "
            "Use enumerate() for cleaner, more Pythonic loops."
        ),
        "code": "fruits = ['mango', 'banana', 'guava']\nfor i, fruit in enumerate(fruits, start=1):\n    print(f'{i}. {fruit}')",
        "tags": ["loops", "enumerate"],
    },
    {
        "id": "tip_b04",
        "level": "beginner",
        "title": "The walrus operator :=",
        "content": (
            "The walrus operator := lets you assign and use a value "
            "in the same expression. Handy in while loops and comprehensions."
        ),
        "code": "# Read lines until empty\nwhile (line := input('> ')) != 'quit':\n    print(f'You said: {line}')",
        "tags": ["operators", "assignment"],
    },
    {
        "id": "tip_b05",
        "level": "beginner",
        "title": "Use .get() for safe dictionary access",
        "content": (
            "dict.get(key, default) never raises KeyError. "
            "Perfect when you are not sure a key exists."
        ),
        "code": "config = {'theme': 'dark'}\nfont = config.get('font_size', 14)\nprint(font)  # 14 (default)",
        "tags": ["dictionaries", "safety"],
    },
    {
        "id": "tip_b06",
        "level": "beginner",
        "title": "List comprehensions in one line",
        "content": (
            "List comprehensions are faster and more readable than "
            "building lists with for-loops and append()."
        ),
        "code": "squares = [x**2 for x in range(10)]\nevens = [x for x in range(20) if x % 2 == 0]",
        "tags": ["comprehensions", "lists"],
    },
    {
        "id": "tip_b07",
        "level": "beginner",
        "title": "zip() pairs up iterables",
        "content": (
            "Use zip() to iterate over two or more sequences in parallel. "
            "It stops at the shortest one."
        ),
        "code": "names = ['Alice', 'Bob', 'Charlie']\nscores = [85, 92, 78]\nfor name, score in zip(names, scores):\n    print(f'{name}: {score}')",
        "tags": ["itertools", "zip"],
    },
    {
        "id": "tip_b08",
        "level": "beginner",
        "title": "Ternary expressions for simple if/else",
        "content": (
            "Python's ternary expression keeps simple conditionals "
            "on one line: value_if_true if condition else value_if_false."
        ),
        "code": "age = 20\nstatus = 'adult' if age >= 18 else 'minor'\nprint(status)  # 'adult'",
        "tags": ["conditionals", "ternary"],
    },
    {
        "id": "tip_b09",
        "level": "beginner",
        "title": "Use pathlib for file paths",
        "content": (
            "pathlib.Path is the modern way to handle file paths. "
            "It works cross-platform and has intuitive methods."
        ),
        "code": "from pathlib import Path\n\np = Path('data') / 'output' / 'results.csv'\np.parent.mkdir(parents=True, exist_ok=True)\np.write_text('name,score\\nRavi,95')",
        "tags": ["files", "pathlib"],
    },
    {
        "id": "tip_b10",
        "level": "beginner",
        "title": "any() and all() for quick checks",
        "content": (
            "any() returns True if at least one element is truthy. "
            "all() returns True if every element is truthy. Use with generators."
        ),
        "code": "nums = [2, 4, 6, 8]\nall_even = all(n % 2 == 0 for n in nums)  # True\nhas_big = any(n > 5 for n in nums)         # True",
        "tags": ["builtins", "iteration"],
    },
    {
        "id": "tip_b11",
        "level": "beginner",
        "title": "String methods you should know",
        "content": (
            "Python strings have powerful built-in methods: strip(), "
            "split(), join(), startswith(), replace(), and more."
        ),
        "code": "text = '  Hello, World!  '\nprint(text.strip())           # 'Hello, World!'\nprint(text.strip().split(',')) # ['Hello', ' World!']",
        "tags": ["strings", "methods"],
    },
    {
        "id": "tip_b12",
        "level": "beginner",
        "title": "Sets for fast membership testing",
        "content": (
            "Use sets instead of lists when you need to check 'is x in collection'. "
            "Set lookup is O(1) vs O(n) for lists."
        ),
        "code": "valid_codes = {'A1', 'B2', 'C3', 'D4'}\nuser_input = 'B2'\nif user_input in valid_codes:\n    print('Valid!')",
        "tags": ["sets", "performance"],
    },
    {
        "id": "tip_b13",
        "level": "beginner",
        "title": "collections.Counter for counting",
        "content": (
            "Counter counts hashable objects. It is perfect for "
            "frequency analysis, histograms, and finding most common elements."
        ),
        "code": "from collections import Counter\n\nwords = 'the cat sat on the mat the cat'.split()\ncounts = Counter(words)\nprint(counts.most_common(2))  # [('the', 3), ('cat', 2)]",
        "tags": ["collections", "counting"],
    },
    {
        "id": "tip_b14",
        "level": "beginner",
        "title": "Use type() and isinstance() wisely",
        "content": (
            "Prefer isinstance() over type() for type checking. "
            "isinstance() respects inheritance and accepts tuples of types."
        ),
        "code": "x = 42\nprint(isinstance(x, (int, float)))  # True\nprint(isinstance('hi', str))         # True",
        "tags": ["types", "checking"],
    },
    {
        "id": "tip_b15",
        "level": "beginner",
        "title": "Default arguments: use None, not mutable",
        "content": (
            "Never use a mutable default argument like [] or {}. "
            "Use None and create inside the function instead."
        ),
        "code": "# BAD:  def add(item, items=[]):  # shared list!\n# GOOD:\ndef add(item, items=None):\n    if items is None:\n        items = []\n    items.append(item)\n    return items",
        "tags": ["functions", "gotchas"],
    },
    {
        "id": "tip_b16",
        "level": "beginner",
        "title": "dict comprehensions",
        "content": (
            "Just like list comprehensions but for dictionaries. "
            "Create dicts on the fly with {key: value for ...} syntax."
        ),
        "code": "names = ['alice', 'bob', 'charlie']\nname_lengths = {name: len(name) for name in names}\nprint(name_lengths)  # {'alice': 5, 'bob': 3, 'charlie': 7}",
        "tags": ["comprehensions", "dictionaries"],
    },
    {
        "id": "tip_b17",
        "level": "beginner",
        "title": "String multiplication for quick patterns",
        "content": (
            "Multiply strings to repeat them. Useful for creating "
            "separators, padding, and simple patterns."
        ),
        "code": "print('-' * 40)\nprint('Na ' * 8 + 'Batman!')\nprint('=' * 40)",
        "tags": ["strings", "patterns"],
    },

    # ── Intermediate ───────────────────────────────────────────────────
    {
        "id": "tip_i01",
        "level": "intermediate",
        "title": "Generators save memory",
        "content": (
            "Use generator expressions and yield to process large "
            "datasets without loading everything into memory at once."
        ),
        "code": "# Generator expression -- lazy evaluation\nsum_sq = sum(x**2 for x in range(1_000_000))\n\n# Generator function\ndef fibonacci():\n    a, b = 0, 1\n    while True:\n        yield a\n        a, b = b, a + b",
        "tags": ["generators", "memory"],
    },
    {
        "id": "tip_i02",
        "level": "intermediate",
        "title": "functools.lru_cache for memoisation",
        "content": (
            "Cache expensive function results automatically. "
            "Perfect for recursive functions and repeated computations."
        ),
        "code": "from functools import lru_cache\n\n@lru_cache(maxsize=128)\ndef fib(n):\n    if n < 2:\n        return n\n    return fib(n-1) + fib(n-2)\n\nprint(fib(100))  # instant!",
        "tags": ["caching", "performance"],
    },
    {
        "id": "tip_i03",
        "level": "intermediate",
        "title": "Context managers with contextlib",
        "content": (
            "Use @contextmanager to write context managers as simple "
            "generator functions instead of full classes."
        ),
        "code": "from contextlib import contextmanager\n\n@contextmanager\ndef managed_resource(name):\n    print(f'Opening {name}')\n    try:\n        yield name\n    finally:\n        print(f'Closing {name}')\n\nwith managed_resource('db') as r:\n    print(f'Using {r}')",
        "tags": ["context managers", "resources"],
    },
    {
        "id": "tip_i04",
        "level": "intermediate",
        "title": "collections.defaultdict avoids KeyError",
        "content": (
            "defaultdict automatically creates missing keys with a "
            "factory function. No more checking if key exists."
        ),
        "code": "from collections import defaultdict\n\nword_groups = defaultdict(list)\nfor word in ['apple', 'ant', 'banana', 'avocado']:\n    word_groups[word[0]].append(word)\nprint(dict(word_groups))\n# {'a': ['apple', 'ant', 'avocado'], 'b': ['banana']}",
        "tags": ["collections", "dictionaries"],
    },
    {
        "id": "tip_i05",
        "level": "intermediate",
        "title": "itertools recipes for elegant iteration",
        "content": (
            "itertools provides building blocks for efficient looping: "
            "chain, product, combinations, groupby, and more."
        ),
        "code": "from itertools import chain, combinations\n\n# Flatten nested lists\nnested = [[1,2], [3,4], [5]]\nflat = list(chain.from_iterable(nested))  # [1,2,3,4,5]\n\n# All pairs\nfor a, b in combinations('ABCD', 2):\n    print(a, b)",
        "tags": ["itertools", "iteration"],
    },
    {
        "id": "tip_i06",
        "level": "intermediate",
        "title": "dataclasses reduce boilerplate",
        "content": (
            "Use @dataclass to auto-generate __init__, __repr__, __eq__ "
            "and more. Add frozen=True for immutability."
        ),
        "code": "from dataclasses import dataclass\n\n@dataclass(frozen=True)\nclass Point:\n    x: float\n    y: float\n    def distance(self) -> float:\n        return (self.x**2 + self.y**2) ** 0.5\n\np = Point(3, 4)\nprint(p, p.distance())  # Point(x=3, y=4) 5.0",
        "tags": ["dataclasses", "OOP"],
    },
    {
        "id": "tip_i07",
        "level": "intermediate",
        "title": "__slots__ for memory-efficient classes",
        "content": (
            "Define __slots__ to prevent __dict__ creation on instances. "
            "Saves 40-50% memory per instance for data-heavy classes."
        ),
        "code": "class Point:\n    __slots__ = ('x', 'y')\n    def __init__(self, x, y):\n        self.x = x\n        self.y = y\n\n# Or with dataclass:\nfrom dataclasses import dataclass\n@dataclass(slots=True)\nclass Point:\n    x: float\n    y: float",
        "tags": ["memory", "OOP"],
    },
    {
        "id": "tip_i08",
        "level": "intermediate",
        "title": "Logging beats print() for debugging",
        "content": (
            "Use the logging module instead of print(). You get levels, "
            "formatting, and can toggle verbosity without code changes."
        ),
        "code": "import logging\n\nlogging.basicConfig(level=logging.DEBUG)\nlogger = logging.getLogger(__name__)\n\nlogger.debug('Processing item %s', item_id)\nlogger.info('Processed %d items', count)\nlogger.warning('Slow response: %.2fs', elapsed)",
        "tags": ["logging", "debugging"],
    },
    {
        "id": "tip_i09",
        "level": "intermediate",
        "title": "Use Protocols for structural typing",
        "content": (
            "Protocols define interfaces without inheritance. If an object "
            "has the right methods, it satisfies the Protocol."
        ),
        "code": "from typing import Protocol\n\nclass Drawable(Protocol):\n    def draw(self) -> str: ...\n\ndef render(obj: Drawable) -> None:\n    print(obj.draw())\n\nclass Circle:\n    def draw(self) -> str:\n        return 'O'\n\nrender(Circle())  # Works -- no inheritance needed",
        "tags": ["typing", "protocols"],
    },
    {
        "id": "tip_i10",
        "level": "intermediate",
        "title": "Exception groups in Python 3.11+",
        "content": (
            "ExceptionGroup lets you raise and handle multiple exceptions "
            "at once. Essential for concurrent code with multiple failures."
        ),
        "code": "try:\n    raise ExceptionGroup('errors', [\n        ValueError('bad value'),\n        TypeError('wrong type'),\n    ])\nexcept* ValueError as eg:\n    print(f'Value errors: {eg.exceptions}')\nexcept* TypeError as eg:\n    print(f'Type errors: {eg.exceptions}')",
        "tags": ["exceptions", "error handling"],
    },
    {
        "id": "tip_i11",
        "level": "intermediate",
        "title": "Use operator.attrgetter for sorting",
        "content": (
            "operator.attrgetter and operator.itemgetter create fast "
            "key functions for sorting without lambdas."
        ),
        "code": "from operator import attrgetter, itemgetter\n\n# Sort dicts by key\nstudents = [{'name': 'A', 'gpa': 3.5}, {'name': 'B', 'gpa': 3.9}]\nstudents.sort(key=itemgetter('gpa'), reverse=True)\n\n# Sort objects by attribute\nfrom dataclasses import dataclass\n@dataclass\nclass Student:\n    name: str\n    gpa: float\n\nsorted_students = sorted(objs, key=attrgetter('gpa'))",
        "tags": ["sorting", "operator"],
    },
    {
        "id": "tip_i12",
        "level": "intermediate",
        "title": "String Template for user input",
        "content": (
            "When formatting strings with user-provided data, "
            "string.Template is safer than f-strings or .format()."
        ),
        "code": "from string import Template\n\nt = Template('Hello, $name! You scored $score.')\nresult = t.safe_substitute(name='Ravi', score=95)\nprint(result)",
        "tags": ["strings", "security"],
    },
    {
        "id": "tip_i13",
        "level": "intermediate",
        "title": "Partial functions with functools.partial",
        "content": (
            "functools.partial creates new functions with some arguments "
            "pre-filled. Great for callbacks and configuration."
        ),
        "code": "from functools import partial\n\ndef power(base, exponent):\n    return base ** exponent\n\nsquare = partial(power, exponent=2)\ncube = partial(power, exponent=3)\n\nprint(square(5))  # 25\nprint(cube(3))    # 27",
        "tags": ["functools", "functions"],
    },
    {
        "id": "tip_i14",
        "level": "intermediate",
        "title": "Use bisect for sorted insertions",
        "content": (
            "The bisect module maintains sorted lists efficiently. "
            "insort adds items in the right position in O(log n) time."
        ),
        "code": "import bisect\n\nscores = [60, 70, 80, 90]\nbisect.insort(scores, 75)\nprint(scores)  # [60, 70, 75, 80, 90]\n\n# Find insertion point\nidx = bisect.bisect_left(scores, 80)\nprint(idx)  # 3",
        "tags": ["sorting", "algorithms"],
    },
    {
        "id": "tip_i15",
        "level": "intermediate",
        "title": "Use __all__ to control public API",
        "content": (
            "Define __all__ in your modules to explicitly declare "
            "what gets exported with 'from module import *'."
        ),
        "code": "# mymodule.py\n__all__ = ['public_func', 'PublicClass']\n\ndef public_func(): ...\ndef _private_helper(): ...\nclass PublicClass: ...\nclass _InternalClass: ...",
        "tags": ["modules", "API design"],
    },
    {
        "id": "tip_i16",
        "level": "intermediate",
        "title": "Named tuples for lightweight records",
        "content": (
            "NamedTuples give you tuple performance with named field access. "
            "Use typing.NamedTuple for type-annotated versions."
        ),
        "code": "from typing import NamedTuple\n\nclass Coordinate(NamedTuple):\n    lat: float\n    lon: float\n    label: str = ''\n\nchennai = Coordinate(13.0827, 80.2707, 'Chennai')\nprint(f'{chennai.label}: {chennai.lat}, {chennai.lon}')",
        "tags": ["namedtuple", "data structures"],
    },

    # ── Advanced ───────────────────────────────────────────────────────
    {
        "id": "tip_a01",
        "level": "advanced",
        "title": "Descriptors for reusable attribute logic",
        "content": (
            "Descriptors let you attach reusable validation or computation "
            "logic to class attributes via __get__/__set__/__delete__."
        ),
        "code": "class Positive:\n    def __set_name__(self, owner, name):\n        self.name = name\n    def __set__(self, obj, value):\n        if value <= 0:\n            raise ValueError(f'{self.name} must be positive')\n        obj.__dict__[self.name] = value\n    def __get__(self, obj, objtype=None):\n        return obj.__dict__.get(self.name, 0)\n\nclass Product:\n    price = Positive()\n    quantity = Positive()",
        "tags": ["descriptors", "metaprogramming"],
    },
    {
        "id": "tip_a02",
        "level": "advanced",
        "title": "Async generators for streaming",
        "content": (
            "Async generators combine yield with await for streaming "
            "data from async sources -- APIs, databases, websockets."
        ),
        "code": "async def stream_pages(url, max_pages=10):\n    async with httpx.AsyncClient() as client:\n        page = 1\n        while page <= max_pages:\n            resp = await client.get(f'{url}?page={page}')\n            data = resp.json()\n            if not data['results']:\n                break\n            yield data['results']\n            page += 1\n\nasync for batch in stream_pages('https://api.example.com/items'):\n    process(batch)",
        "tags": ["async", "generators"],
    },
    {
        "id": "tip_a03",
        "level": "advanced",
        "title": "__init_subclass__ for class registration",
        "content": (
            "__init_subclass__ lets a parent class react when it is "
            "subclassed. Perfect for plugin registries and frameworks."
        ),
        "code": "class Plugin:\n    _registry = {}\n    def __init_subclass__(cls, name=None, **kwargs):\n        super().__init_subclass__(**kwargs)\n        key = name or cls.__name__.lower()\n        Plugin._registry[key] = cls\n\nclass JSONPlugin(Plugin, name='json'):\n    ...\n\nclass XMLPlugin(Plugin, name='xml'):\n    ...\n\nprint(Plugin._registry)  # {'json': JSONPlugin, 'xml': XMLPlugin}",
        "tags": ["metaclasses", "OOP"],
    },
    {
        "id": "tip_a04",
        "level": "advanced",
        "title": "WeakRef for breaking reference cycles",
        "content": (
            "weakref creates references that do not prevent garbage "
            "collection. Essential for caches and observer patterns."
        ),
        "code": "import weakref\n\nclass Cache:\n    def __init__(self):\n        self._cache = weakref.WeakValueDictionary()\n    def get_or_create(self, key, factory):\n        obj = self._cache.get(key)\n        if obj is None:\n            obj = factory(key)\n            self._cache[key] = obj\n        return obj",
        "tags": ["memory", "gc"],
    },
    {
        "id": "tip_a05",
        "level": "advanced",
        "title": "struct for binary data packing",
        "content": (
            "The struct module packs/unpacks binary data. Essential "
            "for network protocols, file formats, and hardware communication."
        ),
        "code": "import struct\n\n# Pack: unsigned short + float + 10-byte string\ndata = struct.pack('>Hf10s', 42, 3.14, b'hello')\nprint(data)  # bytes\n\n# Unpack\nnum, flt, text = struct.unpack('>Hf10s', data)\nprint(num, flt, text.strip(b'\\x00'))  # 42 3.14 b'hello'",
        "tags": ["binary", "networking"],
    },
    {
        "id": "tip_a06",
        "level": "advanced",
        "title": "sys.settrace for debugging magic",
        "content": (
            "sys.settrace installs a trace function that is called on every "
            "line, call, return, and exception. Powers debuggers and profilers."
        ),
        "code": "import sys\n\ndef tracer(frame, event, arg):\n    if event == 'line':\n        fn = frame.f_code.co_filename\n        line = frame.f_lineno\n        print(f'{fn}:{line}')\n    return tracer\n\nsys.settrace(tracer)\n# ... your code here ...\nsys.settrace(None)",
        "tags": ["debugging", "internals"],
    },
    {
        "id": "tip_a07",
        "level": "advanced",
        "title": "Abstract Base Classes for interfaces",
        "content": (
            "Use abc.ABC and @abstractmethod to define interfaces that "
            "subclasses must implement. Catches missing methods at class creation."
        ),
        "code": "from abc import ABC, abstractmethod\n\nclass Serializer(ABC):\n    @abstractmethod\n    def serialize(self, data: dict) -> str: ...\n    @abstractmethod\n    def deserialize(self, text: str) -> dict: ...\n\nclass JSONSerializer(Serializer):\n    def serialize(self, data):\n        import json\n        return json.dumps(data)\n    def deserialize(self, text):\n        import json\n        return json.loads(text)",
        "tags": ["ABC", "OOP"],
    },
    {
        "id": "tip_a08",
        "level": "advanced",
        "title": "Custom exception hierarchies",
        "content": (
            "Build exception hierarchies for your application. A base "
            "exception lets callers catch all your errors in one clause."
        ),
        "code": "class PyMastersError(Exception):\n    '''Base for all PyMasters errors.'''\n\nclass LessonNotFoundError(PyMastersError):\n    def __init__(self, lesson_id: str):\n        self.lesson_id = lesson_id\n        super().__init__(f'Lesson {lesson_id!r} not found')\n\nclass QuotaExceededError(PyMastersError):\n    pass\n\ntry:\n    raise LessonNotFoundError('py101')\nexcept PyMastersError as e:\n    print(f'Caught: {e}')",
        "tags": ["exceptions", "design"],
    },
    {
        "id": "tip_a09",
        "level": "advanced",
        "title": "Type narrowing with TypeGuard",
        "content": (
            "TypeGuard tells type checkers that a function narrows a type. "
            "Useful for custom isinstance-like predicates."
        ),
        "code": "from typing import TypeGuard\n\ndef is_string_list(val: list) -> TypeGuard[list[str]]:\n    return all(isinstance(item, str) for item in val)\n\ndef process(items: list) -> None:\n    if is_string_list(items):\n        # Type checker knows items is list[str] here\n        print(', '.join(items))",
        "tags": ["typing", "type narrowing"],
    },
    {
        "id": "tip_a10",
        "level": "advanced",
        "title": "importlib for dynamic imports",
        "content": (
            "Use importlib to import modules dynamically at runtime. "
            "Useful for plugins, lazy loading, and conditional imports."
        ),
        "code": "import importlib\n\ndef load_plugin(name: str):\n    module = importlib.import_module(f'plugins.{name}')\n    return module.Plugin()\n\n# Reload a module during development\nimportlib.reload(my_module)",
        "tags": ["imports", "plugins"],
    },
    {
        "id": "tip_a11",
        "level": "advanced",
        "title": "asyncio.TaskGroup for structured concurrency",
        "content": (
            "Python 3.11's TaskGroup ensures all tasks complete or "
            "all fail together. No more orphaned async tasks."
        ),
        "code": "import asyncio\n\nasync def main():\n    async with asyncio.TaskGroup() as tg:\n        task1 = tg.create_task(fetch('url1'))\n        task2 = tg.create_task(fetch('url2'))\n        task3 = tg.create_task(fetch('url3'))\n    # All tasks guaranteed done here\n    print(task1.result(), task2.result(), task3.result())",
        "tags": ["async", "concurrency"],
    },
]

# ---------------------------------------------------------------------------
# Challenges Knowledge Base  (30+ entries)
# ---------------------------------------------------------------------------

CHALLENGES: list[dict[str, Any]] = [
    # ── Beginner ───────────────────────────────────────────────────────
    {
        "id": "ch_b01",
        "level": "beginner",
        "title": "Reverse a String",
        "description": "Write a function that reverses a string without using slicing [::-1].",
        "starter_code": "def reverse_string(s: str) -> str:\n    # Your code here\n    pass",
        "test_cases": [
            {"input": "'hello'", "expected": "'olleh'"},
            {"input": "'PyMasters'", "expected": "'sretsaMyP'"},
            {"input": "''", "expected": "''"},
        ],
        "hint": "Try using a loop or the reversed() built-in.",
        "tags": ["strings", "loops"],
    },
    {
        "id": "ch_b02",
        "level": "beginner",
        "title": "FizzBuzz",
        "description": "Print numbers 1-100. For multiples of 3 print 'Fizz', multiples of 5 print 'Buzz', both print 'FizzBuzz'.",
        "starter_code": "def fizzbuzz(n: int) -> list[str]:\n    # Return a list of strings for 1 to n\n    pass",
        "test_cases": [
            {"input": "15", "expected": "['1','2','Fizz','4','Buzz','Fizz','7','8','Fizz','Buzz','11','Fizz','13','14','FizzBuzz']"},
        ],
        "hint": "Check divisibility by 15 first, then 3, then 5.",
        "tags": ["loops", "conditionals"],
    },
    {
        "id": "ch_b03",
        "level": "beginner",
        "title": "Count Vowels",
        "description": "Count the number of vowels (a, e, i, o, u) in a string (case-insensitive).",
        "starter_code": "def count_vowels(s: str) -> int:\n    pass",
        "test_cases": [
            {"input": "'Hello World'", "expected": "3"},
            {"input": "'Python'", "expected": "1"},
            {"input": "'aeiou'", "expected": "5"},
        ],
        "hint": "Use a set of vowels and sum() with a generator.",
        "tags": ["strings", "counting"],
    },
    {
        "id": "ch_b04",
        "level": "beginner",
        "title": "Find the Maximum",
        "description": "Find the maximum value in a list without using the built-in max() function.",
        "starter_code": "def find_max(numbers: list[int]) -> int:\n    pass",
        "test_cases": [
            {"input": "[3, 1, 4, 1, 5, 9]", "expected": "9"},
            {"input": "[-5, -2, -8]", "expected": "-2"},
        ],
        "hint": "Track the current maximum as you iterate.",
        "tags": ["lists", "algorithms"],
    },
    {
        "id": "ch_b05",
        "level": "beginner",
        "title": "Palindrome Checker",
        "description": "Check if a string is a palindrome (ignoring case and spaces).",
        "starter_code": "def is_palindrome(s: str) -> bool:\n    pass",
        "test_cases": [
            {"input": "'racecar'", "expected": "True"},
            {"input": "'A man a plan a canal Panama'", "expected": "True"},
            {"input": "'hello'", "expected": "False"},
        ],
        "hint": "Clean the string first (lowercase, remove spaces), then compare with its reverse.",
        "tags": ["strings", "algorithms"],
    },
    {
        "id": "ch_b06",
        "level": "beginner",
        "title": "Sum of Digits",
        "description": "Calculate the sum of all digits in a positive integer.",
        "starter_code": "def digit_sum(n: int) -> int:\n    pass",
        "test_cases": [
            {"input": "123", "expected": "6"},
            {"input": "9999", "expected": "36"},
            {"input": "0", "expected": "0"},
        ],
        "hint": "Convert to string and sum each character as int, or use modulo arithmetic.",
        "tags": ["numbers", "loops"],
    },
    {
        "id": "ch_b07",
        "level": "beginner",
        "title": "Remove Duplicates",
        "description": "Remove duplicate elements from a list while preserving order.",
        "starter_code": "def remove_duplicates(items: list) -> list:\n    pass",
        "test_cases": [
            {"input": "[1, 2, 2, 3, 1, 4]", "expected": "[1, 2, 3, 4]"},
            {"input": "['a', 'b', 'a']", "expected": "['a', 'b']"},
        ],
        "hint": "Use a set to track seen items as you iterate.",
        "tags": ["lists", "sets"],
    },
    {
        "id": "ch_b08",
        "level": "beginner",
        "title": "Title Case Converter",
        "description": "Capitalise the first letter of each word in a string (without using .title()).",
        "starter_code": "def title_case(s: str) -> str:\n    pass",
        "test_cases": [
            {"input": "'hello world'", "expected": "'Hello World'"},
            {"input": "'python is great'", "expected": "'Python Is Great'"},
        ],
        "hint": "Split, capitalise each word, then join.",
        "tags": ["strings", "methods"],
    },
    {
        "id": "ch_b09",
        "level": "beginner",
        "title": "Temperature Converter",
        "description": "Convert between Celsius and Fahrenheit. Return a formatted string.",
        "starter_code": "def convert_temp(value: float, from_unit: str) -> str:\n    # from_unit is 'C' or 'F'\n    pass",
        "test_cases": [
            {"input": "100, 'C'", "expected": "'212.0F'"},
            {"input": "32, 'F'", "expected": "'0.0C'"},
        ],
        "hint": "F = C * 9/5 + 32 and C = (F - 32) * 5/9.",
        "tags": ["math", "strings"],
    },
    {
        "id": "ch_b10",
        "level": "beginner",
        "title": "List Intersection",
        "description": "Find common elements between two lists (preserve order from first list).",
        "starter_code": "def intersection(a: list, b: list) -> list:\n    pass",
        "test_cases": [
            {"input": "[1,2,3,4], [3,4,5,6]", "expected": "[3, 4]"},
            {"input": "['a','b'], ['c','d']", "expected": "[]"},
        ],
        "hint": "Convert the second list to a set for O(1) lookups.",
        "tags": ["lists", "sets"],
    },

    # ── Intermediate ───────────────────────────────────────────────────
    {
        "id": "ch_i01",
        "level": "intermediate",
        "title": "Flatten Nested Lists",
        "description": "Write a function that flattens arbitrarily nested lists into a single flat list.",
        "starter_code": "def flatten(nested: list) -> list:\n    pass",
        "test_cases": [
            {"input": "[1, [2, [3, 4], 5], 6]", "expected": "[1, 2, 3, 4, 5, 6]"},
            {"input": "[[1, 2], [3, [4, [5]]]]", "expected": "[1, 2, 3, 4, 5]"},
        ],
        "hint": "Use recursion: if an item is a list, flatten it; otherwise, append it.",
        "tags": ["recursion", "lists"],
    },
    {
        "id": "ch_i02",
        "level": "intermediate",
        "title": "Group Anagrams",
        "description": "Group a list of words into anagram groups (words with the same letters).",
        "starter_code": "def group_anagrams(words: list[str]) -> list[list[str]]:\n    pass",
        "test_cases": [
            {"input": "['eat','tea','tan','ate','nat','bat']", "expected": "[['eat','tea','ate'],['tan','nat'],['bat']]"},
        ],
        "hint": "Sort each word's characters as a key and group using a defaultdict.",
        "tags": ["strings", "dictionaries"],
    },
    {
        "id": "ch_i03",
        "level": "intermediate",
        "title": "Implement a Stack with Min",
        "description": "Implement a stack that supports push, pop, and get_min, all in O(1) time.",
        "starter_code": "class MinStack:\n    def __init__(self):\n        pass\n    def push(self, val: int) -> None:\n        pass\n    def pop(self) -> int:\n        pass\n    def get_min(self) -> int:\n        pass",
        "test_cases": [
            {"input": "push(3), push(1), push(2), get_min()", "expected": "1"},
            {"input": "push(3), push(1), pop(), get_min()", "expected": "3"},
        ],
        "hint": "Maintain a parallel stack that tracks the minimum at each level.",
        "tags": ["data structures", "stacks"],
    },
    {
        "id": "ch_i04",
        "level": "intermediate",
        "title": "Memoised Fibonacci",
        "description": "Compute the nth Fibonacci number using memoisation. Handle n up to 1000.",
        "starter_code": "def fib(n: int) -> int:\n    pass",
        "test_cases": [
            {"input": "0", "expected": "0"},
            {"input": "10", "expected": "55"},
            {"input": "50", "expected": "12586269025"},
        ],
        "hint": "Use a dictionary or functools.lru_cache to cache results.",
        "tags": ["recursion", "dynamic programming"],
    },
    {
        "id": "ch_i05",
        "level": "intermediate",
        "title": "Caesar Cipher",
        "description": "Implement a Caesar cipher that shifts letters by a given amount, preserving case.",
        "starter_code": "def caesar_encrypt(text: str, shift: int) -> str:\n    pass\n\ndef caesar_decrypt(text: str, shift: int) -> str:\n    pass",
        "test_cases": [
            {"input": "'Hello, World!', 3", "expected": "'Khoor, Zruog!'"},
            {"input": "'abc', 26", "expected": "'abc'"},
        ],
        "hint": "Use ord() and chr() with modulo 26 arithmetic. Only shift letters.",
        "tags": ["strings", "encryption"],
    },
    {
        "id": "ch_i06",
        "level": "intermediate",
        "title": "Matrix Transpose",
        "description": "Transpose a 2D matrix (rows become columns). Use only basic Python.",
        "starter_code": "def transpose(matrix: list[list]) -> list[list]:\n    pass",
        "test_cases": [
            {"input": "[[1,2,3],[4,5,6]]", "expected": "[[1,4],[2,5],[3,6]]"},
        ],
        "hint": "Use zip(*matrix) or nested list comprehension.",
        "tags": ["matrices", "comprehensions"],
    },
    {
        "id": "ch_i07",
        "level": "intermediate",
        "title": "Binary Search",
        "description": "Implement binary search on a sorted list. Return the index or -1 if not found.",
        "starter_code": "def binary_search(arr: list[int], target: int) -> int:\n    pass",
        "test_cases": [
            {"input": "[1,3,5,7,9], 5", "expected": "2"},
            {"input": "[1,3,5,7,9], 4", "expected": "-1"},
        ],
        "hint": "Maintain low and high pointers and halve the range each step.",
        "tags": ["algorithms", "searching"],
    },
    {
        "id": "ch_i08",
        "level": "intermediate",
        "title": "Word Frequency Counter",
        "description": "Count word frequencies in a text, ignoring punctuation and case. Return top N words.",
        "starter_code": "def top_words(text: str, n: int = 5) -> list[tuple[str, int]]:\n    pass",
        "test_cases": [
            {"input": "'the cat sat on the mat the cat', 2", "expected": "[('the', 3), ('cat', 2)]"},
        ],
        "hint": "Use re.findall for words and collections.Counter for counting.",
        "tags": ["strings", "collections"],
    },
    {
        "id": "ch_i09",
        "level": "intermediate",
        "title": "Decorator with Arguments",
        "description": "Write a decorator that retries a function up to N times on exception.",
        "starter_code": "def retry(max_attempts: int = 3):\n    def decorator(func):\n        # Your code here\n        pass\n    return decorator",
        "test_cases": [
            {"input": "@retry(3) on a function that fails twice then succeeds", "expected": "Returns success"},
        ],
        "hint": "Use a nested function (three levels deep) and a try/except in a loop.",
        "tags": ["decorators", "error handling"],
    },
    {
        "id": "ch_i10",
        "level": "intermediate",
        "title": "Merge Sorted Lists",
        "description": "Merge two sorted lists into one sorted list in O(n) time.",
        "starter_code": "def merge_sorted(a: list[int], b: list[int]) -> list[int]:\n    pass",
        "test_cases": [
            {"input": "[1,3,5], [2,4,6]", "expected": "[1,2,3,4,5,6]"},
            {"input": "[1,2], [3,4,5,6]", "expected": "[1,2,3,4,5,6]"},
        ],
        "hint": "Use two pointers, one for each list, and advance the smaller one.",
        "tags": ["algorithms", "sorting"],
    },

    # ── Advanced ───────────────────────────────────────────────────────
    {
        "id": "ch_a01",
        "level": "advanced",
        "title": "LRU Cache from Scratch",
        "description": "Implement an LRU cache with O(1) get and put using a dict + doubly linked list.",
        "starter_code": "class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n    def get(self, key: int) -> int:\n        pass\n    def put(self, key: int, value: int) -> None:\n        pass",
        "test_cases": [
            {"input": "capacity=2, put(1,1), put(2,2), get(1), put(3,3), get(2)", "expected": "1, -1"},
        ],
        "hint": "Use collections.OrderedDict or implement a doubly linked list with a hash map.",
        "tags": ["data structures", "design"],
    },
    {
        "id": "ch_a02",
        "level": "advanced",
        "title": "Async Web Scraper",
        "description": "Write an async function that fetches multiple URLs concurrently and returns a dict of URL -> status_code.",
        "starter_code": "import asyncio\nimport httpx\n\nasync def fetch_all(urls: list[str]) -> dict[str, int]:\n    pass",
        "test_cases": [
            {"input": "['https://httpbin.org/status/200', 'https://httpbin.org/status/404']", "expected": "{'url1': 200, 'url2': 404}"},
        ],
        "hint": "Use httpx.AsyncClient with asyncio.gather().",
        "tags": ["async", "networking"],
    },
    {
        "id": "ch_a03",
        "level": "advanced",
        "title": "Trie (Prefix Tree)",
        "description": "Implement a Trie that supports insert, search, and starts_with operations.",
        "starter_code": "class Trie:\n    def __init__(self):\n        pass\n    def insert(self, word: str) -> None:\n        pass\n    def search(self, word: str) -> bool:\n        pass\n    def starts_with(self, prefix: str) -> bool:\n        pass",
        "test_cases": [
            {"input": "insert('python'), search('python')", "expected": "True"},
            {"input": "insert('python'), starts_with('py')", "expected": "True"},
            {"input": "search('java')", "expected": "False"},
        ],
        "hint": "Each node is a dict of children with an end-of-word flag.",
        "tags": ["data structures", "trees"],
    },
    {
        "id": "ch_a04",
        "level": "advanced",
        "title": "Rate Limiter",
        "description": "Implement a token bucket rate limiter that allows N requests per second.",
        "starter_code": "import time\n\nclass RateLimiter:\n    def __init__(self, rate: float, capacity: int):\n        pass\n    def allow(self) -> bool:\n        pass",
        "test_cases": [
            {"input": "rate=2, capacity=5, 3 rapid calls", "expected": "True, True, True"},
        ],
        "hint": "Refill tokens based on elapsed time since last check.",
        "tags": ["design", "concurrency"],
    },
    {
        "id": "ch_a05",
        "level": "advanced",
        "title": "JSON Parser",
        "description": "Write a simple recursive descent JSON parser that handles strings, numbers, booleans, null, arrays, and objects.",
        "starter_code": "def parse_json(text: str):\n    # Return the parsed Python object\n    pass",
        "test_cases": [
            {"input": "'{\"name\": \"Ravi\", \"age\": 25}'", "expected": "{'name': 'Ravi', 'age': 25}"},
            {"input": "'[1, true, null]'", "expected": "[1, True, None]"},
        ],
        "hint": "Implement a tokenizer first, then a recursive parser for each JSON type.",
        "tags": ["parsing", "recursion"],
    },
    {
        "id": "ch_a06",
        "level": "advanced",
        "title": "Event Emitter",
        "description": "Implement a type-safe event emitter with on(), off(), emit(), and once() methods.",
        "starter_code": "class EventEmitter:\n    def on(self, event: str, callback) -> None: ...\n    def off(self, event: str, callback) -> None: ...\n    def emit(self, event: str, *args, **kwargs) -> None: ...\n    def once(self, event: str, callback) -> None: ...",
        "test_cases": [
            {"input": "on('data', handler), emit('data', 42)", "expected": "handler called with 42"},
        ],
        "hint": "Use a defaultdict(list) for listeners. once() wraps the callback to auto-remove.",
        "tags": ["design patterns", "events"],
    },
    {
        "id": "ch_a07",
        "level": "advanced",
        "title": "Topological Sort",
        "description": "Implement topological sort for a DAG represented as an adjacency list.",
        "starter_code": "def topological_sort(graph: dict[str, list[str]]) -> list[str]:\n    pass",
        "test_cases": [
            {"input": "{'a': ['b','c'], 'b': ['d'], 'c': ['d'], 'd': []}", "expected": "['a', 'b'|'c', 'c'|'b', 'd'] (valid ordering)"},
        ],
        "hint": "Use DFS with a visited set and a stack, or Kahn's algorithm with in-degree tracking.",
        "tags": ["algorithms", "graphs"],
    },
    {
        "id": "ch_a08",
        "level": "advanced",
        "title": "Concurrent File Processor",
        "description": "Use concurrent.futures to process multiple files in parallel. Count total lines across all files.",
        "starter_code": "from concurrent.futures import ThreadPoolExecutor\nfrom pathlib import Path\n\ndef count_lines_parallel(paths: list[Path], workers: int = 4) -> int:\n    pass",
        "test_cases": [
            {"input": "3 files with 10, 20, 30 lines", "expected": "60"},
        ],
        "hint": "Submit tasks with executor.map() and sum the results.",
        "tags": ["concurrency", "files"],
    },
    {
        "id": "ch_a09",
        "level": "advanced",
        "title": "Context Manager Protocol",
        "description": "Implement a database connection context manager that auto-commits or rolls back.",
        "starter_code": "class Transaction:\n    def __init__(self, connection):\n        pass\n    def __enter__(self):\n        pass\n    def __exit__(self, exc_type, exc_val, exc_tb):\n        pass",
        "test_cases": [
            {"input": "Successful block", "expected": "commit() called"},
            {"input": "Exception in block", "expected": "rollback() called"},
        ],
        "hint": "In __exit__, check if exc_type is None to decide commit vs rollback.",
        "tags": ["context managers", "database"],
    },
    {
        "id": "ch_a10",
        "level": "advanced",
        "title": "Implement map/filter/reduce",
        "description": "Re-implement map(), filter(), and reduce() as generators (no built-ins).",
        "starter_code": "def my_map(func, iterable):\n    pass\n\ndef my_filter(predicate, iterable):\n    pass\n\ndef my_reduce(func, iterable, initial=None):\n    pass",
        "test_cases": [
            {"input": "my_map(str.upper, ['a','b'])", "expected": "['A', 'B']"},
            {"input": "my_filter(lambda x: x>2, [1,2,3,4])", "expected": "[3, 4]"},
            {"input": "my_reduce(lambda a,b: a+b, [1,2,3,4])", "expected": "10"},
        ],
        "hint": "Use yield for map and filter. For reduce, iterate manually accumulating.",
        "tags": ["functional", "generators"],
    },
]

# ---------------------------------------------------------------------------
# Quiz Questions Knowledge Base  (20+ entries)
# ---------------------------------------------------------------------------

QUIZ_QUESTIONS: list[dict[str, Any]] = [
    # ── Beginner ───────────────────────────────────────────────────────
    {
        "id": "quiz_b01",
        "level": "beginner",
        "question": "What does `len([1, 2, 3])` return?",
        "options": ["2", "3", "4", "Error"],
        "correct": 1,
        "explanation": "len() returns the number of items in a container. The list has 3 elements.",
        "tags": ["builtins", "lists"],
    },
    {
        "id": "quiz_b02",
        "level": "beginner",
        "question": "Which keyword is used to define a function in Python?",
        "options": ["func", "function", "def", "define"],
        "correct": 2,
        "explanation": "Python uses 'def' to define functions: def my_function():",
        "tags": ["functions", "syntax"],
    },
    {
        "id": "quiz_b03",
        "level": "beginner",
        "question": "What is the output of `'hello' * 3`?",
        "options": ["'hello 3'", "'hellohellohello'", "Error", "15"],
        "correct": 1,
        "explanation": "Multiplying a string by an integer repeats it that many times.",
        "tags": ["strings", "operators"],
    },
    {
        "id": "quiz_b04",
        "level": "beginner",
        "question": "Which of these is a mutable data type?",
        "options": ["tuple", "str", "int", "list"],
        "correct": 3,
        "explanation": "Lists are mutable -- you can add, remove, and change elements. Tuples, strings, and ints are immutable.",
        "tags": ["data types", "mutability"],
    },
    {
        "id": "quiz_b05",
        "level": "beginner",
        "question": "What does `range(5)` produce?",
        "options": ["[1, 2, 3, 4, 5]", "[0, 1, 2, 3, 4]", "[0, 1, 2, 3, 4, 5]", "5"],
        "correct": 1,
        "explanation": "range(5) produces numbers 0, 1, 2, 3, 4 -- starting from 0 and ending before 5.",
        "tags": ["range", "loops"],
    },
    {
        "id": "quiz_b06",
        "level": "beginner",
        "question": "What is the result of `10 // 3`?",
        "options": ["3.33", "3", "4", "3.0"],
        "correct": 1,
        "explanation": "// is integer (floor) division. 10 // 3 = 3 (rounded down).",
        "tags": ["operators", "math"],
    },
    {
        "id": "quiz_b07",
        "level": "beginner",
        "question": "How do you add an element to the end of a list?",
        "options": ["list.add(x)", "list.append(x)", "list.push(x)", "list.insert(x)"],
        "correct": 1,
        "explanation": "list.append(x) adds x to the end. add() is for sets, push() does not exist in Python.",
        "tags": ["lists", "methods"],
    },

    # ── Intermediate ───────────────────────────────────────────────────
    {
        "id": "quiz_i01",
        "level": "intermediate",
        "question": "What is the output of `[x for x in range(10) if x % 3 == 0]`?",
        "options": ["[0, 3, 6, 9]", "[3, 6, 9]", "[0, 3, 6]", "[1, 3, 6, 9]"],
        "correct": 0,
        "explanation": "The comprehension filters range(10) for multiples of 3: 0, 3, 6, 9.",
        "tags": ["comprehensions", "filtering"],
    },
    {
        "id": "quiz_i02",
        "level": "intermediate",
        "question": "What does `*args` in a function signature do?",
        "options": [
            "Unpacks a dictionary",
            "Collects extra positional arguments as a tuple",
            "Makes arguments required",
            "Collects keyword arguments",
        ],
        "correct": 1,
        "explanation": "*args collects extra positional arguments into a tuple. **kwargs collects keyword arguments into a dict.",
        "tags": ["functions", "arguments"],
    },
    {
        "id": "quiz_i03",
        "level": "intermediate",
        "question": "What is a decorator in Python?",
        "options": [
            "A type of comment",
            "A function that modifies another function",
            "A class method",
            "A way to format strings",
        ],
        "correct": 1,
        "explanation": "A decorator is a function that takes another function and extends its behaviour without modifying it directly.",
        "tags": ["decorators", "functions"],
    },
    {
        "id": "quiz_i04",
        "level": "intermediate",
        "question": "What does `yield` do in a function?",
        "options": [
            "Returns a value and exits",
            "Pauses the function and produces a value",
            "Raises an exception",
            "Creates a class",
        ],
        "correct": 1,
        "explanation": "yield pauses the function, producing a value. The function becomes a generator that can be resumed.",
        "tags": ["generators", "yield"],
    },
    {
        "id": "quiz_i05",
        "level": "intermediate",
        "question": "What is the GIL in Python?",
        "options": [
            "Global Import Lock",
            "General Interface Layer",
            "Global Interpreter Lock",
            "Graphical Interface Library",
        ],
        "correct": 2,
        "explanation": "The Global Interpreter Lock prevents multiple threads from executing Python bytecode simultaneously.",
        "tags": ["concurrency", "internals"],
    },
    {
        "id": "quiz_i06",
        "level": "intermediate",
        "question": "What is the difference between `is` and `==`?",
        "options": [
            "They are the same",
            "`is` checks identity, `==` checks equality",
            "`is` is faster than `==`",
            "`==` checks identity, `is` checks equality",
        ],
        "correct": 1,
        "explanation": "`is` checks if two references point to the same object in memory. `==` checks if values are equal.",
        "tags": ["operators", "identity"],
    },
    {
        "id": "quiz_i07",
        "level": "intermediate",
        "question": "What does `@property` do?",
        "options": [
            "Makes an attribute private",
            "Turns a method into a read-only attribute",
            "Decorates static methods",
            "Creates a class variable",
        ],
        "correct": 1,
        "explanation": "@property lets you access a method like an attribute: obj.name instead of obj.name().",
        "tags": ["OOP", "properties"],
    },

    # ── Advanced ───────────────────────────────────────────────────────
    {
        "id": "quiz_a01",
        "level": "advanced",
        "question": "What is a metaclass in Python?",
        "options": [
            "A class that inherits from multiple parents",
            "A class whose instances are classes",
            "A class with no methods",
            "An abstract class",
        ],
        "correct": 1,
        "explanation": "A metaclass is a class whose instances are classes. type is the default metaclass in Python.",
        "tags": ["metaclasses", "OOP"],
    },
    {
        "id": "quiz_a02",
        "level": "advanced",
        "question": "What is the MRO in Python?",
        "options": [
            "Module Resolution Order",
            "Method Resolution Order",
            "Memory Reference Object",
            "Main Runtime Operation",
        ],
        "correct": 1,
        "explanation": "MRO (Method Resolution Order) determines the order in which base classes are searched when looking up a method. Python uses C3 linearisation.",
        "tags": ["OOP", "inheritance"],
    },
    {
        "id": "quiz_a03",
        "level": "advanced",
        "question": "What does `__slots__` do?",
        "options": [
            "Limits which methods can be called",
            "Prevents creation of __dict__ and saves memory",
            "Defines time slots for scheduling",
            "Creates named tuple fields",
        ],
        "correct": 1,
        "explanation": "__slots__ tells Python to use a fixed set of attributes instead of a __dict__, saving significant memory per instance.",
        "tags": ["memory", "OOP"],
    },
    {
        "id": "quiz_a04",
        "level": "advanced",
        "question": "What is the difference between `deepcopy` and `copy`?",
        "options": [
            "copy is faster",
            "deepcopy recursively copies all nested objects",
            "There is no difference",
            "copy works only on lists",
        ],
        "correct": 1,
        "explanation": "copy.copy() creates a shallow copy (nested objects are shared). copy.deepcopy() recursively copies all nested objects.",
        "tags": ["copying", "references"],
    },
    {
        "id": "quiz_a05",
        "level": "advanced",
        "question": "What is a descriptor in Python?",
        "options": [
            "A docstring format",
            "An object that defines __get__, __set__, or __delete__",
            "A file descriptor",
            "A type hint",
        ],
        "correct": 1,
        "explanation": "Descriptors are objects that define __get__, __set__, or __delete__. They control attribute access and power property(), classmethod(), etc.",
        "tags": ["descriptors", "OOP"],
    },
    {
        "id": "quiz_a06",
        "level": "advanced",
        "question": "What happens when you `await` a coroutine?",
        "options": [
            "It runs in a new thread",
            "It suspends the current coroutine until the awaited one completes",
            "It raises an error in sync code",
            "Both B and C",
        ],
        "correct": 3,
        "explanation": "await suspends the current coroutine, letting other tasks run. Using await outside an async function raises a SyntaxError.",
        "tags": ["async", "coroutines"],
    },
]

# ---------------------------------------------------------------------------
# Greetings
# ---------------------------------------------------------------------------

_GREETINGS: dict[str, list[str]] = {
    "morning": [
        "Good morning, {name}! Ready to code?",
        "Rise and shine, {name}! Let's learn something new today.",
        "Morning, {name}! A fresh day for fresh Python skills.",
        "Good morning, {name}! The Python interpreter is warm and waiting.",
        "Hey {name}, good morning! Time to write some beautiful code.",
    ],
    "afternoon": [
        "Good afternoon, {name}! Keep the momentum going.",
        "Hey {name}! Hope your afternoon is productive.",
        "Afternoon, {name}! Perfect time for a coding challenge.",
        "Good afternoon, {name}! Let's tackle something interesting.",
        "Hey there, {name}! Ready for your afternoon Python session?",
    ],
    "evening": [
        "Good evening, {name}! Winding down with some code?",
        "Evening, {name}! A great time for focused practice.",
        "Hey {name}! Relaxed evening coding is the best kind.",
        "Good evening, {name}! Let's end the day with something cool.",
        "Evening, {name}! The quiet hours are perfect for deep learning.",
    ],
    "night": [
        "Burning the midnight oil, {name}? Respect!",
        "Late night coding, {name}? Let's make it count.",
        "Hey {name}, night owl mode activated!",
        "Still up, {name}? Must be a great problem you're working on.",
        "Night-time, {name}! The best bugs are found after midnight.",
    ],
}


# ---------------------------------------------------------------------------
# Lookup indices
# ---------------------------------------------------------------------------

_TIPS_BY_LEVEL: dict[str, list[dict]] = {}
for _t in TIPS:
    _TIPS_BY_LEVEL.setdefault(_t["level"], []).append(_t)

_CHALLENGES_BY_LEVEL: dict[str, list[dict]] = {}
for _c in CHALLENGES:
    _CHALLENGES_BY_LEVEL.setdefault(_c["level"], []).append(_c)

_QUIZ_BY_LEVEL: dict[str, list[dict]] = {}
for _q in QUIZ_QUESTIONS:
    _QUIZ_BY_LEVEL.setdefault(_q["level"], []).append(_q)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_hash(date_str: str, salt: str = "") -> int:
    """Deterministic hash for a date string + optional salt."""
    return int(hashlib.sha256(f"{date_str}:{salt}".encode()).hexdigest(), 16)


def _pick_from_pool(pool: list[dict], date_str: str, salt: str = "default") -> dict:
    """Pick one item from *pool* deterministically based on date."""
    if not pool:
        return {}
    idx = _date_hash(date_str, salt) % len(pool)
    return pool[idx]


def _level_for_profile(profile: dict) -> str:
    """Extract normalised skill level from a profile dict."""
    raw = profile.get("skill_level", profile.get("level", "beginner"))
    raw = str(raw).lower().strip()
    if raw in ("beginner", "intermediate", "advanced"):
        return raw
    return "beginner"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_daily_tip(profile: dict, date_str: str) -> dict:
    """Return a single Python/AI tip suited to the user's skill level.

    Parameters
    ----------
    profile : dict
        Must contain at least ``skill_level``.
    date_str : str
        Date string like ``'2026-03-29'`` for deterministic rotation.

    Returns
    -------
    dict  with keys: id, level, title, content, code, tags
    """
    level = _level_for_profile(profile)
    pool = _TIPS_BY_LEVEL.get(level, TIPS)
    return _pick_from_pool(pool, date_str, salt="tip")


def generate_daily_challenge(profile: dict, date_str: str) -> dict:
    """Return a coding challenge appropriate to the user's level.

    Returns
    -------
    dict  with keys: id, level, title, description, starter_code,
          test_cases, hint, tags
    """
    level = _level_for_profile(profile)
    pool = _CHALLENGES_BY_LEVEL.get(level, CHALLENGES)
    return _pick_from_pool(pool, date_str, salt="challenge")


def generate_daily_quiz(profile: dict, date_str: str) -> dict:
    """Return a quiz question for the user's level.

    Returns
    -------
    dict  with keys: id, level, question, options, correct,
          explanation, tags
    """
    level = _level_for_profile(profile)
    pool = _QUIZ_BY_LEVEL.get(level, QUIZ_QUESTIONS)
    return _pick_from_pool(pool, date_str, salt="quiz")


def get_greeting(username: str, time_of_day: str | None = None) -> str:
    """Return a personalised greeting.

    Parameters
    ----------
    username : str
        The user's display name.
    time_of_day : str, optional
        One of ``'morning'``, ``'afternoon'``, ``'evening'``, ``'night'``.
        If *None*, defaults to ``'morning'``.
    """
    period = (time_of_day or "morning").lower()
    if period not in _GREETINGS:
        period = "morning"
    templates = _GREETINGS[period]
    # Simple deterministic pick based on username
    idx = sum(ord(c) for c in username) % len(templates)
    return templates[idx].format(name=username)


def get_all_tips(level: str | None = None) -> list[dict]:
    """Return all tips, optionally filtered by level."""
    if level:
        return list(_TIPS_BY_LEVEL.get(level, []))
    return list(TIPS)


def get_all_challenges(level: str | None = None) -> list[dict]:
    """Return all challenges, optionally filtered by level."""
    if level:
        return list(_CHALLENGES_BY_LEVEL.get(level, []))
    return list(CHALLENGES)


def get_all_quiz_questions(level: str | None = None) -> list[dict]:
    """Return all quiz questions, optionally filtered by level."""
    if level:
        return list(_QUIZ_BY_LEVEL.get(level, []))
    return list(QUIZ_QUESTIONS)
