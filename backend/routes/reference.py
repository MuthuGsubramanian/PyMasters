"""
reference.py — FastAPI APIRouter for Quick Reference cards.

Prefix: /api/reference

Provides structured cheat-sheets / reference cards for Python and
modern development topics.
"""

import os
import sqlite3
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/reference", tags=["reference"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ReferenceSection(BaseModel):
    heading: str
    content: str  # Markdown with code blocks


class ReferenceCard(BaseModel):
    id: str
    title: str
    category: str
    sections: List[ReferenceSection]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


# ---------------------------------------------------------------------------
# Static reference cards
# ---------------------------------------------------------------------------

REFERENCE_CARDS: List[dict] = [
    # ------------------------------------------------------------------
    # 1. Python Basics
    # ------------------------------------------------------------------
    {
        "id": "python_basics",
        "title": "Python Basics",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "Variables & Assignment",
                "content": (
                    "```python\n"
                    "name = \"Alice\"        # str\n"
                    "age = 30               # int\n"
                    "height = 5.7           # float\n"
                    "is_active = True       # bool\n"
                    "x = y = z = 0          # multiple assignment\n"
                    "a, b, c = 1, 2, 3     # unpacking\n"
                    "```"
                ),
            },
            {
                "heading": "Built-in Types",
                "content": (
                    "| Type | Example | Mutable |\n"
                    "|------|---------|--------|\n"
                    "| `int` | `42` | No |\n"
                    "| `float` | `3.14` | No |\n"
                    "| `str` | `\"hello\"` | No |\n"
                    "| `bool` | `True` | No |\n"
                    "| `list` | `[1, 2, 3]` | Yes |\n"
                    "| `tuple` | `(1, 2, 3)` | No |\n"
                    "| `dict` | `{\"a\": 1}` | Yes |\n"
                    "| `set` | `{1, 2, 3}` | Yes |\n"
                    "| `NoneType` | `None` | No |"
                ),
            },
            {
                "heading": "Operators",
                "content": (
                    "```python\n"
                    "# Arithmetic\n"
                    "+  -  *  /  //  %  **\n\n"
                    "# Comparison\n"
                    "==  !=  <  >  <=  >=\n\n"
                    "# Logical\n"
                    "and  or  not\n\n"
                    "# Identity & Membership\n"
                    "is  is not  in  not in\n\n"
                    "# Walrus operator (3.8+)\n"
                    "if (n := len(items)) > 10:\n"
                    "    print(f\"{n} items\")\n"
                    "```"
                ),
            },
            {
                "heading": "Control Flow",
                "content": (
                    "```python\n"
                    "# if / elif / else\n"
                    "if x > 0:\n"
                    "    print(\"positive\")\n"
                    "elif x == 0:\n"
                    "    print(\"zero\")\n"
                    "else:\n"
                    "    print(\"negative\")\n\n"
                    "# Ternary\n"
                    "result = \"yes\" if condition else \"no\"\n\n"
                    "# for loop\n"
                    "for item in iterable:\n"
                    "    ...\n\n"
                    "# while loop\n"
                    "while condition:\n"
                    "    ...\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 2. Data Structures
    # ------------------------------------------------------------------
    {
        "id": "data_structures",
        "title": "Data Structures",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "Lists",
                "content": (
                    "```python\n"
                    "nums = [1, 2, 3, 4, 5]\n"
                    "nums.append(6)           # add to end\n"
                    "nums.insert(0, 0)        # insert at index\n"
                    "nums.pop()               # remove last\n"
                    "nums.remove(3)           # remove first occurrence\n"
                    "nums.sort()              # in-place sort\n"
                    "nums.reverse()           # in-place reverse\n"
                    "sliced = nums[1:4]       # slice [1, 2, 3]\n"
                    "length = len(nums)\n"
                    "```"
                ),
            },
            {
                "heading": "Dictionaries",
                "content": (
                    "```python\n"
                    "user = {\"name\": \"Alice\", \"age\": 30}\n"
                    "user[\"email\"] = \"a@b.com\"   # add / update\n"
                    "user.get(\"phone\", \"N/A\")     # safe access\n"
                    "user.pop(\"age\")               # remove key\n"
                    "user.keys()                    # dict_keys\n"
                    "user.values()                  # dict_values\n"
                    "user.items()                   # key-value pairs\n"
                    "merged = {**d1, **d2}          # merge (3.5+)\n"
                    "merged = d1 | d2               # merge (3.9+)\n"
                    "```"
                ),
            },
            {
                "heading": "Sets",
                "content": (
                    "```python\n"
                    "s = {1, 2, 3}\n"
                    "s.add(4)                 # add element\n"
                    "s.discard(2)             # remove (no error)\n"
                    "s.remove(3)              # remove (KeyError if missing)\n"
                    "a & b                    # intersection\n"
                    "a | b                    # union\n"
                    "a - b                    # difference\n"
                    "a ^ b                    # symmetric difference\n"
                    "```"
                ),
            },
            {
                "heading": "Tuples & Named Tuples",
                "content": (
                    "```python\n"
                    "point = (3, 4)\n"
                    "x, y = point              # unpacking\n\n"
                    "from collections import namedtuple\n"
                    "Point = namedtuple('Point', ['x', 'y'])\n"
                    "p = Point(3, 4)\n"
                    "print(p.x, p.y)\n\n"
                    "# Or use typing.NamedTuple\n"
                    "from typing import NamedTuple\n"
                    "class Point(NamedTuple):\n"
                    "    x: float\n"
                    "    y: float\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 3. String Methods
    # ------------------------------------------------------------------
    {
        "id": "string_methods",
        "title": "String Methods",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "Common Operations",
                "content": (
                    "```python\n"
                    "s = \"Hello, World!\"\n"
                    "s.upper()              # 'HELLO, WORLD!'\n"
                    "s.lower()              # 'hello, world!'\n"
                    "s.title()              # 'Hello, World!'\n"
                    "s.strip()              # remove whitespace\n"
                    "s.split(\", \")          # ['Hello', 'World!']\n"
                    "\", \".join([\"a\",\"b\"])   # 'a, b'\n"
                    "s.replace(\"World\", \"Python\")\n"
                    "s.startswith(\"Hello\")  # True\n"
                    "s.endswith(\"!\")        # True\n"
                    "s.find(\"World\")        # 7 (index or -1)\n"
                    "s.count(\"l\")           # 3\n"
                    "```"
                ),
            },
            {
                "heading": "f-Strings & Formatting",
                "content": (
                    "```python\n"
                    "name, age = \"Alice\", 30\n"
                    "f\"{name} is {age} years old\"\n"
                    "f\"{3.14159:.2f}\"       # '3.14'\n"
                    "f\"{1000000:,}\"          # '1,000,000'\n"
                    "f\"{42:08b}\"             # '00101010' (binary)\n"
                    "f\"{value!r}\"            # repr()\n"
                    "f\"{dt:%Y-%m-%d}\"        # date formatting\n"
                    "```"
                ),
            },
            {
                "heading": "Checking & Searching",
                "content": (
                    "```python\n"
                    "s.isdigit()            # all digits?\n"
                    "s.isalpha()            # all letters?\n"
                    "s.isalnum()            # letters or digits?\n"
                    "s.isspace()            # all whitespace?\n"
                    "\"hello\" in s           # substring check\n"
                    "s.index(\"World\")       # 7 (raises ValueError)\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 4. List Comprehensions
    # ------------------------------------------------------------------
    {
        "id": "list_comprehensions",
        "title": "List Comprehensions",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "Basic Syntax",
                "content": (
                    "```python\n"
                    "# [expression for item in iterable if condition]\n"
                    "squares = [x**2 for x in range(10)]\n"
                    "evens = [x for x in range(20) if x % 2 == 0]\n"
                    "```"
                ),
            },
            {
                "heading": "Nested Comprehensions",
                "content": (
                    "```python\n"
                    "# Flatten 2D list\n"
                    "matrix = [[1,2],[3,4],[5,6]]\n"
                    "flat = [x for row in matrix for x in row]\n"
                    "# [1, 2, 3, 4, 5, 6]\n\n"
                    "# 2D grid\n"
                    "grid = [[(r, c) for c in range(3)] for r in range(3)]\n"
                    "```"
                ),
            },
            {
                "heading": "Dict & Set Comprehensions",
                "content": (
                    "```python\n"
                    "# Dict comprehension\n"
                    "word_len = {w: len(w) for w in [\"hello\", \"world\"]}\n\n"
                    "# Set comprehension\n"
                    "unique_lengths = {len(w) for w in words}\n\n"
                    "# Generator expression (lazy)\n"
                    "total = sum(x**2 for x in range(1000000))\n"
                    "```"
                ),
            },
            {
                "heading": "Walrus Operator in Comprehensions",
                "content": (
                    "```python\n"
                    "# Compute once, use in filter and output\n"
                    "results = [\n"
                    "    y\n"
                    "    for x in data\n"
                    "    if (y := expensive(x)) > threshold\n"
                    "]\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 5. Decorators
    # ------------------------------------------------------------------
    {
        "id": "decorators",
        "title": "Decorators",
        "category": "Intermediate",
        "sections": [
            {
                "heading": "Basic Decorator",
                "content": (
                    "```python\n"
                    "import functools\n\n"
                    "def my_decorator(func):\n"
                    "    @functools.wraps(func)\n"
                    "    def wrapper(*args, **kwargs):\n"
                    "        print(\"Before\")\n"
                    "        result = func(*args, **kwargs)\n"
                    "        print(\"After\")\n"
                    "        return result\n"
                    "    return wrapper\n\n"
                    "@my_decorator\n"
                    "def greet(name):\n"
                    "    print(f\"Hello {name}\")\n"
                    "```"
                ),
            },
            {
                "heading": "Decorator with Arguments",
                "content": (
                    "```python\n"
                    "def repeat(n):\n"
                    "    def decorator(func):\n"
                    "        @functools.wraps(func)\n"
                    "        def wrapper(*args, **kwargs):\n"
                    "            for _ in range(n):\n"
                    "                result = func(*args, **kwargs)\n"
                    "            return result\n"
                    "        return wrapper\n"
                    "    return decorator\n\n"
                    "@repeat(3)\n"
                    "def say_hello():\n"
                    "    print(\"Hello!\")\n"
                    "```"
                ),
            },
            {
                "heading": "Class-Based Decorators",
                "content": (
                    "```python\n"
                    "class CountCalls:\n"
                    "    def __init__(self, func):\n"
                    "        functools.update_wrapper(self, func)\n"
                    "        self.func = func\n"
                    "        self.count = 0\n\n"
                    "    def __call__(self, *args, **kwargs):\n"
                    "        self.count += 1\n"
                    "        return self.func(*args, **kwargs)\n\n"
                    "@CountCalls\n"
                    "def say_hi():\n"
                    "    print(\"Hi!\")\n"
                    "```"
                ),
            },
            {
                "heading": "Common Built-in Decorators",
                "content": (
                    "```python\n"
                    "@staticmethod        # no self/cls\n"
                    "@classmethod         # receives cls\n"
                    "@property            # getter\n"
                    "@name.setter         # setter\n"
                    "@functools.cache     # unlimited memoize\n"
                    "@functools.lru_cache # bounded memoize\n"
                    "@dataclasses.dataclass\n"
                    "@abc.abstractmethod\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 6. Async / Await
    # ------------------------------------------------------------------
    {
        "id": "async_await",
        "title": "Async / Await",
        "category": "Intermediate",
        "sections": [
            {
                "heading": "Basics",
                "content": (
                    "```python\n"
                    "import asyncio\n\n"
                    "async def fetch_data():\n"
                    "    await asyncio.sleep(1)\n"
                    "    return {\"data\": 42}\n\n"
                    "# Run from synchronous code\n"
                    "result = asyncio.run(fetch_data())\n"
                    "```"
                ),
            },
            {
                "heading": "Concurrency with gather",
                "content": (
                    "```python\n"
                    "async def main():\n"
                    "    results = await asyncio.gather(\n"
                    "        fetch_data(),\n"
                    "        fetch_data(),\n"
                    "        fetch_data(),\n"
                    "    )\n"
                    "    # results is a list of 3 dicts\n"
                    "```"
                ),
            },
            {
                "heading": "TaskGroup (3.11+)",
                "content": (
                    "```python\n"
                    "async def main():\n"
                    "    async with asyncio.TaskGroup() as tg:\n"
                    "        t1 = tg.create_task(fetch_data())\n"
                    "        t2 = tg.create_task(fetch_data())\n"
                    "    print(t1.result(), t2.result())\n"
                    "```"
                ),
            },
            {
                "heading": "Semaphore & Timeout",
                "content": (
                    "```python\n"
                    "sem = asyncio.Semaphore(5)\n\n"
                    "async def limited_fetch(url):\n"
                    "    async with sem:\n"
                    "        return await fetch(url)\n\n"
                    "# Timeout\n"
                    "async with asyncio.timeout(10):\n"
                    "    result = await slow_operation()\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 7. Regex
    # ------------------------------------------------------------------
    {
        "id": "regex",
        "title": "Regular Expressions",
        "category": "Intermediate",
        "sections": [
            {
                "heading": "Core Functions",
                "content": (
                    "```python\n"
                    "import re\n\n"
                    "re.match(r'\\d+', s)       # match at start\n"
                    "re.search(r'\\d+', s)      # first match anywhere\n"
                    "re.findall(r'\\d+', s)     # all matches\n"
                    "re.finditer(r'\\d+', s)    # iterator of Match\n"
                    "re.sub(r'\\d+', 'X', s)    # replace\n"
                    "re.split(r'[,;]', s)      # split by pattern\n"
                    "re.compile(r'\\d+')        # precompile\n"
                    "```"
                ),
            },
            {
                "heading": "Common Patterns",
                "content": (
                    "```python\n"
                    ".       # any char (except newline)\n"
                    "\\d \\D   # digit / non-digit\n"
                    "\\w \\W   # word char / non-word\n"
                    "\\s \\S   # whitespace / non-whitespace\n"
                    "^  $    # start / end of string\n"
                    "*  +  ? # 0+, 1+, 0 or 1\n"
                    "{n,m}   # between n and m\n"
                    "[]      # character class\n"
                    "()      # capture group\n"
                    "(?:...) # non-capturing group\n"
                    "(?P<name>...) # named group\n"
                    "```"
                ),
            },
            {
                "heading": "Practical Examples",
                "content": (
                    "```python\n"
                    "# Email\n"
                    "r'[\\w.-]+@[\\w.-]+\\.\\w+'\n\n"
                    "# Phone (US)\n"
                    "r'\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}'\n\n"
                    "# URL\n"
                    "r'https?://[\\w.-]+(?:/[\\w./-]*)?' \n\n"
                    "# Named groups\n"
                    "m = re.match(r'(?P<year>\\d{4})-(?P<month>\\d{2})', s)\n"
                    "m.group('year')\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 8. File I/O
    # ------------------------------------------------------------------
    {
        "id": "file_io",
        "title": "File I/O",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "Reading & Writing Text",
                "content": (
                    "```python\n"
                    "from pathlib import Path\n\n"
                    "# Read entire file\n"
                    "text = Path('file.txt').read_text(encoding='utf-8')\n\n"
                    "# Write file\n"
                    "Path('out.txt').write_text('hello', encoding='utf-8')\n\n"
                    "# Context manager\n"
                    "with open('file.txt', 'r', encoding='utf-8') as f:\n"
                    "    for line in f:\n"
                    "        process(line)\n"
                    "```"
                ),
            },
            {
                "heading": "JSON",
                "content": (
                    "```python\n"
                    "import json\n\n"
                    "# Read\n"
                    "with open('data.json') as f:\n"
                    "    data = json.load(f)\n\n"
                    "# Write\n"
                    "with open('data.json', 'w') as f:\n"
                    "    json.dump(data, f, indent=2)\n\n"
                    "# String conversion\n"
                    "s = json.dumps(obj)\n"
                    "obj = json.loads(s)\n"
                    "```"
                ),
            },
            {
                "heading": "CSV",
                "content": (
                    "```python\n"
                    "import csv\n\n"
                    "# Read\n"
                    "with open('data.csv') as f:\n"
                    "    reader = csv.DictReader(f)\n"
                    "    for row in reader:\n"
                    "        print(row['name'])\n\n"
                    "# Write\n"
                    "with open('out.csv', 'w', newline='') as f:\n"
                    "    writer = csv.writer(f)\n"
                    "    writer.writerow(['name', 'age'])\n"
                    "    writer.writerow(['Alice', 30])\n"
                    "```"
                ),
            },
            {
                "heading": "Path Operations",
                "content": (
                    "```python\n"
                    "from pathlib import Path\n\n"
                    "p = Path('src/main.py')\n"
                    "p.exists()               # True / False\n"
                    "p.is_file()              # True / False\n"
                    "p.parent                 # Path('src')\n"
                    "p.stem                   # 'main'\n"
                    "p.suffix                 # '.py'\n"
                    "p.name                   # 'main.py'\n"
                    "list(Path('.').glob('**/*.py'))  # recursive\n"
                    "p.mkdir(parents=True, exist_ok=True)\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 9. Error Handling
    # ------------------------------------------------------------------
    {
        "id": "error_handling",
        "title": "Error Handling",
        "category": "Fundamentals",
        "sections": [
            {
                "heading": "try / except / else / finally",
                "content": (
                    "```python\n"
                    "try:\n"
                    "    result = 10 / x\n"
                    "except ZeroDivisionError:\n"
                    "    print(\"Cannot divide by zero\")\n"
                    "except (TypeError, ValueError) as e:\n"
                    "    print(f\"Bad input: {e}\")\n"
                    "else:\n"
                    "    print(f\"Result: {result}\")  # no error\n"
                    "finally:\n"
                    "    print(\"Always runs\")\n"
                    "```"
                ),
            },
            {
                "heading": "Custom Exceptions",
                "content": (
                    "```python\n"
                    "class AppError(Exception):\n"
                    "    \"\"\"Base exception for the app.\"\"\"\n\n"
                    "class NotFoundError(AppError):\n"
                    "    def __init__(self, resource: str, id: str):\n"
                    "        self.resource = resource\n"
                    "        self.id = id\n"
                    "        super().__init__(\n"
                    "            f\"{resource} '{id}' not found\"\n"
                    "        )\n"
                    "```"
                ),
            },
            {
                "heading": "Exception Groups (3.11+)",
                "content": (
                    "```python\n"
                    "# Raise multiple exceptions\n"
                    "raise ExceptionGroup(\"errors\", [\n"
                    "    ValueError(\"bad value\"),\n"
                    "    TypeError(\"wrong type\"),\n"
                    "])\n\n"
                    "# Catch selectively\n"
                    "try:\n"
                    "    ...\n"
                    "except* ValueError as eg:\n"
                    "    for e in eg.exceptions:\n"
                    "        print(e)\n"
                    "except* TypeError as eg:\n"
                    "    ...\n"
                    "```"
                ),
            },
            {
                "heading": "Best Practices",
                "content": (
                    "- Catch specific exceptions, not bare `except:`\n"
                    "- Use `raise ... from e` to chain exceptions\n"
                    "- Log or handle -- avoid silent `except: pass`\n"
                    "- Use context managers for resource cleanup\n"
                    "- `assert` is for debugging, not production validation"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 10. Type Hints
    # ------------------------------------------------------------------
    {
        "id": "type_hints",
        "title": "Type Hints",
        "category": "Intermediate",
        "sections": [
            {
                "heading": "Basic Annotations",
                "content": (
                    "```python\n"
                    "name: str = \"Alice\"\n"
                    "age: int = 30\n"
                    "scores: list[int] = [90, 85, 92]\n"
                    "config: dict[str, int] = {\"timeout\": 30}\n\n"
                    "def greet(name: str, loud: bool = False) -> str:\n"
                    "    ...\n"
                    "```"
                ),
            },
            {
                "heading": "Union, Optional, Literal",
                "content": (
                    "```python\n"
                    "from typing import Optional, Literal\n\n"
                    "# Python 3.10+\n"
                    "def parse(value: str | int) -> str:\n"
                    "    ...\n\n"
                    "# Optional = X | None\n"
                    "def find(name: str) -> str | None:\n"
                    "    ...\n\n"
                    "# Literal restricts values\n"
                    "Mode = Literal[\"read\", \"write\", \"append\"]\n"
                    "```"
                ),
            },
            {
                "heading": "TypeVar & Generics",
                "content": (
                    "```python\n"
                    "from typing import TypeVar, Generic\n\n"
                    "T = TypeVar('T')\n\n"
                    "def first(items: list[T]) -> T:\n"
                    "    return items[0]\n\n"
                    "class Stack(Generic[T]):\n"
                    "    def __init__(self) -> None:\n"
                    "        self._items: list[T] = []\n\n"
                    "    def push(self, item: T) -> None:\n"
                    "        self._items.append(item)\n"
                    "```"
                ),
            },
            {
                "heading": "TypedDict, Protocol, NewType",
                "content": (
                    "```python\n"
                    "from typing import TypedDict, Protocol, NewType\n\n"
                    "class User(TypedDict):\n"
                    "    name: str\n"
                    "    age: int\n\n"
                    "class Drawable(Protocol):\n"
                    "    def draw(self) -> None: ...\n\n"
                    "UserId = NewType('UserId', int)\n"
                    "uid: UserId = UserId(42)\n"
                    "```"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 11. AI Agents
    # ------------------------------------------------------------------
    {
        "id": "ai_agents",
        "title": "AI Agents",
        "category": "Advanced",
        "sections": [
            {
                "heading": "Agent Patterns",
                "content": (
                    "```python\n"
                    "# ReAct pattern: Reasoning + Acting\n"
                    "# The agent loop:\n"
                    "# 1. Observe (receive input / tool results)\n"
                    "# 2. Think  (LLM reasons about next step)\n"
                    "# 3. Act    (call a tool or respond)\n"
                    "# 4. Repeat until task is complete\n\n"
                    "while not done:\n"
                    "    thought = llm.think(observation)\n"
                    "    action = thought.next_action\n"
                    "    observation = execute(action)\n"
                    "```"
                ),
            },
            {
                "heading": "MCP (Model Context Protocol)",
                "content": (
                    "MCP provides a standard interface for LLMs to use tools.\n\n"
                    "```python\n"
                    "# MCP server exposes tools\n"
                    "# MCP client (the agent) calls them\n"
                    "# Transport: stdio or HTTP+SSE\n\n"
                    "# Server definition (simplified)\n"
                    "from mcp.server import Server\n\n"
                    "server = Server(\"my-tools\")\n\n"
                    "@server.tool()\n"
                    "async def search(query: str) -> str:\n"
                    "    \"\"\"Search the web.\"\"\"\n"
                    "    return await do_search(query)\n"
                    "```"
                ),
            },
            {
                "heading": "RAG (Retrieval-Augmented Generation)",
                "content": (
                    "```python\n"
                    "# RAG pipeline:\n"
                    "# 1. Index: chunk docs -> embed -> vector store\n"
                    "# 2. Retrieve: embed query -> similarity search\n"
                    "# 3. Generate: LLM(query + retrieved context)\n\n"
                    "# Chunking strategies\n"
                    "# - Fixed-size with overlap\n"
                    "# - Recursive text splitting\n"
                    "# - Semantic chunking\n\n"
                    "# Vector stores: Chroma, Pinecone, Qdrant\n"
                    "# Embedding models: text-embedding-3-small\n"
                    "```"
                ),
            },
            {
                "heading": "Multi-Agent Systems",
                "content": (
                    "Key patterns for coordinating multiple agents:\n\n"
                    "- **Orchestrator**: central agent delegates sub-tasks\n"
                    "- **Pipeline**: agents process sequentially\n"
                    "- **Debate**: agents critique each other's output\n"
                    "- **Swarm**: agents hand off tasks dynamically\n\n"
                    "Frameworks: Claude Agent SDK, LangGraph, CrewAI, AutoGen"
                ),
            },
        ],
    },
    # ------------------------------------------------------------------
    # 12. Polars
    # ------------------------------------------------------------------
    {
        "id": "polars",
        "title": "Polars",
        "category": "Advanced",
        "sections": [
            {
                "heading": "Creating DataFrames",
                "content": (
                    "```python\n"
                    "import polars as pl\n\n"
                    "df = pl.DataFrame({\n"
                    "    \"name\": [\"Alice\", \"Bob\", \"Charlie\"],\n"
                    "    \"age\": [30, 25, 35],\n"
                    "    \"score\": [90.5, 85.0, 92.3],\n"
                    "})\n\n"
                    "# From CSV / Parquet\n"
                    "df = pl.read_csv(\"data.csv\")\n"
                    "df = pl.read_parquet(\"data.parquet\")\n\n"
                    "# Lazy mode (query optimization)\n"
                    "lf = pl.scan_csv(\"big.csv\")\n"
                    "result = lf.filter(...).collect()\n"
                    "```"
                ),
            },
            {
                "heading": "Selecting & Filtering",
                "content": (
                    "```python\n"
                    "# Select columns\n"
                    "df.select(\"name\", \"age\")\n"
                    "df.select(pl.col(\"name\"), pl.col(\"age\") + 1)\n\n"
                    "# Filter rows\n"
                    "df.filter(pl.col(\"age\") > 25)\n"
                    "df.filter(\n"
                    "    (pl.col(\"age\") > 25) & (pl.col(\"score\") > 90)\n"
                    ")\n\n"
                    "# Add / rename columns\n"
                    "df.with_columns(\n"
                    "    (pl.col(\"score\") * 2).alias(\"double_score\")\n"
                    ")\n"
                    "df.rename({\"name\": \"full_name\"})\n"
                    "```"
                ),
            },
            {
                "heading": "Aggregations & GroupBy",
                "content": (
                    "```python\n"
                    "df.group_by(\"category\").agg(\n"
                    "    pl.col(\"score\").mean().alias(\"avg_score\"),\n"
                    "    pl.col(\"name\").count().alias(\"count\"),\n"
                    "    pl.col(\"age\").max().alias(\"max_age\"),\n"
                    ")\n\n"
                    "# Sorting\n"
                    "df.sort(\"score\", descending=True)\n\n"
                    "# Unique / deduplicate\n"
                    "df.unique(subset=[\"name\"])\n"
                    "```"
                ),
            },
            {
                "heading": "Joins & Concat",
                "content": (
                    "```python\n"
                    "# Join\n"
                    "df1.join(df2, on=\"id\", how=\"left\")\n"
                    "df1.join(df2, left_on=\"uid\", right_on=\"id\")\n\n"
                    "# Concat\n"
                    "pl.concat([df1, df2])          # vertical\n"
                    "pl.concat([df1, df2], how=\"horizontal\")\n\n"
                    "# Write results\n"
                    "df.write_csv(\"output.csv\")\n"
                    "df.write_parquet(\"output.parquet\")\n"
                    "```"
                ),
            },
        ],
    },
]

# Build a lookup for fast access by topic ID
_CARD_LOOKUP: dict[str, dict] = {card["id"]: card for card in REFERENCE_CARDS}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/topics")
def list_topics():
    """Return all available quick reference topics."""
    topics = [
        {
            "id": card["id"],
            "title": card["title"],
            "category": card["category"],
            "section_count": len(card["sections"]),
        }
        for card in REFERENCE_CARDS
    ]
    return {"topics": topics, "total": len(topics)}


@router.get("/{topic}")
def get_reference_card(topic: str):
    """Return a specific reference card by topic ID."""
    card = _CARD_LOOKUP.get(topic)
    if not card:
        available = [c["id"] for c in REFERENCE_CARDS]
        raise HTTPException(
            status_code=404,
            detail=f"Reference topic '{topic}' not found. Available: {available}",
        )
    return card
