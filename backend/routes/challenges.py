"""
challenges.py — FastAPI APIRouter for Weekly Code Challenges.

Prefix: /api/challenges

Provides a rotating weekly challenge (12 challenges cycling by ISO week number),
solution submission, and a leaderboard of top completions.
"""

import os
import sqlite3
import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SubmitSolutionRequest(BaseModel):
    user_id: str
    challenge_id: str
    code: str


class TestCase(BaseModel):
    input: str
    expected_output: str


class Challenge(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str  # easy | medium | hard
    category: str
    starter_code: str
    expected_output: str
    test_cases: List[dict]
    xp_reward: int
    hints: List[str]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _ensure_challenges_table(db_path: str):
    """Create the challenge_submissions table if it does not exist."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS challenge_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                challenge_id TEXT NOT NULL,
                code TEXT NOT NULL,
                passed INTEGER NOT NULL DEFAULT 0,
                xp_awarded INTEGER NOT NULL DEFAULT 0,
                submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, challenge_id)
            )
        """)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Static challenge bank (12 challenges, one per week, rotating)
# ---------------------------------------------------------------------------

CHALLENGES: List[dict] = [
    {
        "id": "ch-01-fibonacci",
        "title": "Fibonacci Optimization",
        "description": (
            "Write a function `fib(n)` that returns the n-th Fibonacci number "
            "efficiently. A naive recursive solution will be too slow for large n. "
            "Use memoization or an iterative approach to handle n up to 10,000 "
            "without exceeding time limits."
        ),
        "difficulty": "easy",
        "category": "Dynamic Programming",
        "starter_code": (
            "def fib(n: int) -> int:\n"
            "    # Your code here\n"
            "    pass\n"
        ),
        "expected_output": "fib(10) == 55",
        "test_cases": [
            {"input": "fib(0)", "expected_output": "0"},
            {"input": "fib(1)", "expected_output": "1"},
            {"input": "fib(10)", "expected_output": "55"},
            {"input": "fib(30)", "expected_output": "832040"},
            {"input": "fib(50)", "expected_output": "12586269025"},
        ],
        "xp_reward": 10,
        "hints": [
            "Think about caching previously computed values.",
            "functools.lru_cache can help with memoization.",
            "An iterative approach with two variables is the most memory-efficient.",
        ],
    },
    {
        "id": "ch-02-anagram",
        "title": "Anagram Detector",
        "description": (
            "Write a function `is_anagram(s1, s2)` that returns True if the two "
            "strings are anagrams of each other (ignoring case and spaces). "
            "Then write `group_anagrams(words)` that groups a list of words into "
            "sublists of anagrams."
        ),
        "difficulty": "easy",
        "category": "Strings & Hashing",
        "starter_code": (
            "def is_anagram(s1: str, s2: str) -> bool:\n"
            "    # Your code here\n"
            "    pass\n\n"
            "def group_anagrams(words: list[str]) -> list[list[str]]:\n"
            "    # Your code here\n"
            "    pass\n"
        ),
        "expected_output": "is_anagram('listen', 'silent') == True",
        "test_cases": [
            {"input": "is_anagram('listen', 'silent')", "expected_output": "True"},
            {"input": "is_anagram('hello', 'world')", "expected_output": "False"},
            {"input": "is_anagram('Astronomer', 'Moon starer')", "expected_output": "True"},
            {"input": "group_anagrams(['eat','tea','tan','ate','nat','bat'])", "expected_output": "[['eat','tea','ate'],['tan','nat'],['bat']]"},
        ],
        "xp_reward": 10,
        "hints": [
            "Sorting the characters of a word gives a canonical key.",
            "collections.Counter is your friend.",
            "Use a defaultdict(list) keyed by sorted tuple for grouping.",
        ],
    },
    {
        "id": "ch-03-matrix-rotation",
        "title": "Matrix Rotation",
        "description": (
            "Write a function `rotate_90(matrix)` that rotates an NxN matrix "
            "90 degrees clockwise IN PLACE. Do not allocate a new matrix. "
            "The function should modify the input matrix directly."
        ),
        "difficulty": "medium",
        "category": "Arrays & Matrices",
        "starter_code": (
            "def rotate_90(matrix: list[list[int]]) -> None:\n"
            "    \"\"\"Rotate NxN matrix 90 degrees clockwise in place.\"\"\"\n"
            "    # Your code here\n"
            "    pass\n"
        ),
        "expected_output": "[[1,2],[3,4]] -> [[3,1],[4,2]]",
        "test_cases": [
            {"input": "[[1,2],[3,4]]", "expected_output": "[[3,1],[4,2]]"},
            {"input": "[[1,2,3],[4,5,6],[7,8,9]]", "expected_output": "[[7,4,1],[8,5,2],[9,6,3]]"},
            {"input": "[[1]]", "expected_output": "[[1]]"},
        ],
        "xp_reward": 20,
        "hints": [
            "Transpose the matrix first (swap rows and columns).",
            "Then reverse each row.",
            "Work layer by layer from outside in for the in-place version.",
        ],
    },
    {
        "id": "ch-04-lru-cache",
        "title": "LRU Cache Implementation",
        "description": (
            "Implement an LRU (Least Recently Used) cache class with a given "
            "capacity. It should support `get(key)` and `put(key, value)` "
            "operations, both in O(1) time. When the cache exceeds capacity, "
            "evict the least recently used item."
        ),
        "difficulty": "hard",
        "category": "Data Structures",
        "starter_code": (
            "class LRUCache:\n"
            "    def __init__(self, capacity: int):\n"
            "        # Your code here\n"
            "        pass\n\n"
            "    def get(self, key: int) -> int:\n"
            "        \"\"\"Return value or -1 if not found.\"\"\"\n"
            "        pass\n\n"
            "    def put(self, key: int, value: int) -> None:\n"
            "        \"\"\"Insert or update. Evict LRU if over capacity.\"\"\"\n"
            "        pass\n"
        ),
        "expected_output": "cache.get(1) == 1 after cache.put(1, 1)",
        "test_cases": [
            {"input": "cache = LRUCache(2); cache.put(1,1); cache.put(2,2); cache.get(1)", "expected_output": "1"},
            {"input": "cache = LRUCache(2); cache.put(1,1); cache.put(2,2); cache.put(3,3); cache.get(2)", "expected_output": "-1"},
            {"input": "cache = LRUCache(1); cache.put(1,1); cache.put(2,2); cache.get(1)", "expected_output": "-1"},
        ],
        "xp_reward": 30,
        "hints": [
            "Use an OrderedDict from the collections module.",
            "Alternatively, combine a dict with a doubly-linked list.",
            "move_to_end() and popitem(last=False) are key OrderedDict methods.",
        ],
    },
    {
        "id": "ch-05-binary-search",
        "title": "Binary Search Variations",
        "description": (
            "Implement three binary search variations:\n"
            "1. `find_first(arr, target)` - first occurrence of target\n"
            "2. `find_last(arr, target)` - last occurrence of target\n"
            "3. `find_insert_pos(arr, target)` - position where target should be inserted\n"
            "All inputs are sorted integer arrays."
        ),
        "difficulty": "medium",
        "category": "Search Algorithms",
        "starter_code": (
            "def find_first(arr: list[int], target: int) -> int:\n"
            "    \"\"\"Return index of first occurrence, or -1.\"\"\"\n"
            "    pass\n\n"
            "def find_last(arr: list[int], target: int) -> int:\n"
            "    \"\"\"Return index of last occurrence, or -1.\"\"\"\n"
            "    pass\n\n"
            "def find_insert_pos(arr: list[int], target: int) -> int:\n"
            "    \"\"\"Return leftmost insertion index.\"\"\"\n"
            "    pass\n"
        ),
        "expected_output": "find_first([1,2,2,3], 2) == 1",
        "test_cases": [
            {"input": "find_first([1,2,2,2,3], 2)", "expected_output": "1"},
            {"input": "find_last([1,2,2,2,3], 2)", "expected_output": "3"},
            {"input": "find_insert_pos([1,3,5,7], 4)", "expected_output": "2"},
            {"input": "find_first([1,2,3], 4)", "expected_output": "-1"},
            {"input": "find_insert_pos([], 1)", "expected_output": "0"},
        ],
        "xp_reward": 20,
        "hints": [
            "Classic binary search but keep going after finding target.",
            "For find_first, when you find target, record it and search left.",
            "bisect_left and bisect_right from the bisect module are worth studying.",
        ],
    },
    {
        "id": "ch-06-decorator-composition",
        "title": "Decorator Composition",
        "description": (
            "Create three decorators:\n"
            "1. `@timer` - prints execution time of the function\n"
            "2. `@retry(max_attempts=3)` - retries on exception up to N times\n"
            "3. `@validate_types` - checks that arguments match type hints at runtime\n"
            "All decorators must preserve the original function's name and docstring."
        ),
        "difficulty": "medium",
        "category": "Decorators & Metaprogramming",
        "starter_code": (
            "import functools\nimport time\nimport inspect\n\n"
            "def timer(func):\n"
            "    # Your code here\n"
            "    pass\n\n"
            "def retry(max_attempts: int = 3):\n"
            "    # Your code here (decorator factory)\n"
            "    pass\n\n"
            "def validate_types(func):\n"
            "    # Your code here\n"
            "    pass\n"
        ),
        "expected_output": "@timer decorated functions print elapsed time",
        "test_cases": [
            {"input": "@timer\\ndef slow(): time.sleep(0.1); return 42\\nslow()", "expected_output": "42"},
            {"input": "@retry(max_attempts=3)\\ndef flaky(): raise ValueError\\nflaky()", "expected_output": "raises ValueError after 3 attempts"},
            {"input": "@validate_types\\ndef add(a: int, b: int) -> int: return a+b\\nadd(1,2)", "expected_output": "3"},
        ],
        "xp_reward": 20,
        "hints": [
            "Use functools.wraps to preserve metadata.",
            "retry needs to be a decorator factory (function returning a decorator).",
            "inspect.get_annotations() or typing.get_type_hints() help with validation.",
        ],
    },
    {
        "id": "ch-07-async-scraper",
        "title": "Async Web Scraper Pattern",
        "description": (
            "Write an async function `fetch_all(urls, max_concurrent=5)` that:\n"
            "1. Fetches multiple URLs concurrently using aiohttp\n"
            "2. Limits concurrency with asyncio.Semaphore\n"
            "3. Returns a dict mapping each URL to its response text or error message\n"
            "4. Has a configurable timeout per request (default 10s)\n"
            "Handle errors gracefully -- never let one failure abort the batch."
        ),
        "difficulty": "hard",
        "category": "Async Programming",
        "starter_code": (
            "import asyncio\nfrom typing import Optional\n\n"
            "# Note: aiohttp is used in production; for this challenge\n"
            "# you can mock the HTTP calls.\n\n"
            "async def fetch_url(url: str, timeout: int = 10) -> str:\n"
            "    \"\"\"Fetch a single URL. Return response text or raise.\"\"\"\n"
            "    pass\n\n"
            "async def fetch_all(\n"
            "    urls: list[str],\n"
            "    max_concurrent: int = 5,\n"
            "    timeout: int = 10,\n"
            ") -> dict[str, str]:\n"
            "    \"\"\"Fetch all URLs with bounded concurrency.\"\"\"\n"
            "    pass\n"
        ),
        "expected_output": "dict mapping URL -> response text or error string",
        "test_cases": [
            {"input": "fetch_all(['http://example.com'])", "expected_output": "{'http://example.com': '<html>...'}"},
            {"input": "fetch_all(['http://bad-url'], timeout=1)", "expected_output": "{'http://bad-url': 'Error: ...'}"},
            {"input": "fetch_all([], max_concurrent=5)", "expected_output": "{}"},
        ],
        "xp_reward": 30,
        "hints": [
            "asyncio.Semaphore limits how many coroutines run at once.",
            "asyncio.gather(*tasks, return_exceptions=True) collects all results.",
            "aiohttp.ClientTimeout controls per-request timeouts.",
        ],
    },
    {
        "id": "ch-08-data-pipeline",
        "title": "Type-Safe Data Pipeline",
        "description": (
            "Build a composable data pipeline using generics and type hints:\n"
            "1. `Pipeline` class that chains transformation steps\n"
            "2. Each step is a callable that transforms data\n"
            "3. The pipeline validates types between steps\n"
            "4. Support .map(), .filter(), .reduce() operations\n"
            "Use Generic types so that Pipeline[Input, Output] is fully typed."
        ),
        "difficulty": "hard",
        "category": "Type Hints & Generics",
        "starter_code": (
            "from typing import TypeVar, Generic, Callable, List\n\n"
            "T = TypeVar('T')\nU = TypeVar('U')\n\n"
            "class Pipeline(Generic[T, U]):\n"
            "    def __init__(self, steps: list[Callable] | None = None):\n"
            "        self.steps = steps or []\n\n"
            "    def add_step(self, fn: Callable) -> 'Pipeline':\n"
            "        pass\n\n"
            "    def map(self, fn: Callable) -> 'Pipeline':\n"
            "        pass\n\n"
            "    def filter(self, fn: Callable) -> 'Pipeline':\n"
            "        pass\n\n"
            "    def execute(self, data):\n"
            "        pass\n"
        ),
        "expected_output": "Pipeline().map(str.upper).filter(lambda s: len(s)>3).execute(['hi','hello'])",
        "test_cases": [
            {"input": "Pipeline().map(lambda x: x*2).execute([1,2,3])", "expected_output": "[2,4,6]"},
            {"input": "Pipeline().filter(lambda x: x>2).execute([1,2,3,4])", "expected_output": "[3,4]"},
            {"input": "Pipeline().map(str.upper).execute(['hello'])", "expected_output": "['HELLO']"},
        ],
        "xp_reward": 30,
        "hints": [
            "Each step can be stored as a tuple of (operation_type, function).",
            "execute() iterates through steps applying each to the data.",
            "functools.reduce can power the reduce operation.",
        ],
    },
    {
        "id": "ch-09-graph-traversal",
        "title": "Graph Traversal (BFS/DFS)",
        "description": (
            "Given an adjacency list representation of a graph, implement:\n"
            "1. `bfs(graph, start)` - breadth-first traversal returning visited order\n"
            "2. `dfs(graph, start)` - depth-first traversal returning visited order\n"
            "3. `shortest_path(graph, start, end)` - shortest path between two nodes\n"
            "4. `has_cycle(graph)` - detect if the directed graph has a cycle"
        ),
        "difficulty": "medium",
        "category": "Graphs & Trees",
        "starter_code": (
            "from collections import deque\n\n"
            "Graph = dict[str, list[str]]\n\n"
            "def bfs(graph: Graph, start: str) -> list[str]:\n"
            "    pass\n\n"
            "def dfs(graph: Graph, start: str) -> list[str]:\n"
            "    pass\n\n"
            "def shortest_path(graph: Graph, start: str, end: str) -> list[str] | None:\n"
            "    pass\n\n"
            "def has_cycle(graph: Graph) -> bool:\n"
            "    pass\n"
        ),
        "expected_output": "bfs({'A':['B','C'],'B':['D'],'C':[],'D':[]}, 'A') == ['A','B','C','D']",
        "test_cases": [
            {"input": "bfs({'A':['B','C'],'B':['D'],'C':[],'D':[]}, 'A')", "expected_output": "['A','B','C','D']"},
            {"input": "dfs({'A':['B','C'],'B':['D'],'C':[],'D':[]}, 'A')", "expected_output": "['A','B','D','C']"},
            {"input": "shortest_path({'A':['B'],'B':['C'],'C':[]}, 'A', 'C')", "expected_output": "['A','B','C']"},
            {"input": "has_cycle({'A':['B'],'B':['A']})", "expected_output": "True"},
            {"input": "has_cycle({'A':['B'],'B':['C'],'C':[]})", "expected_output": "False"},
        ],
        "xp_reward": 20,
        "hints": [
            "BFS uses a queue (deque); DFS uses a stack or recursion.",
            "For shortest_path, BFS naturally finds it in unweighted graphs.",
            "Cycle detection: track nodes in the current recursion stack (gray nodes).",
        ],
    },
    {
        "id": "ch-10-pattern-matching",
        "title": "Pattern Matching with match/case",
        "description": (
            "Use Python 3.10+ structural pattern matching to build a simple "
            "expression evaluator. Given an AST represented as nested tuples:\n"
            "  ('add', 2, 3) -> 5\n"
            "  ('mul', ('add', 1, 2), 4) -> 12\n"
            "Support: add, sub, mul, div, neg (unary), and nested expressions. "
            "Use match/case statements (not if/elif chains)."
        ),
        "difficulty": "medium",
        "category": "Pattern Matching",
        "starter_code": (
            "def evaluate(expr) -> float:\n"
            "    \"\"\"Evaluate a nested expression tuple using match/case.\"\"\"\n"
            "    match expr:\n"
            "        case _:\n"
            "            # Your patterns here\n"
            "            pass\n"
        ),
        "expected_output": "evaluate(('add', 2, 3)) == 5",
        "test_cases": [
            {"input": "evaluate(('add', 2, 3))", "expected_output": "5"},
            {"input": "evaluate(('mul', ('add', 1, 2), 4))", "expected_output": "12"},
            {"input": "evaluate(('neg', 5))", "expected_output": "-5"},
            {"input": "evaluate(('div', 10, ('add', 2, 3)))", "expected_output": "2.0"},
            {"input": "evaluate(42)", "expected_output": "42"},
        ],
        "xp_reward": 20,
        "hints": [
            "Match literal numbers as the base case.",
            "Use capture patterns: case ('add', left, right).",
            "Recursively call evaluate() on sub-expressions.",
        ],
    },
    {
        "id": "ch-11-generator-pipeline",
        "title": "Generator Pipeline",
        "description": (
            "Build a memory-efficient data processing pipeline using generators:\n"
            "1. `read_chunks(data, size)` - yield chunks of `size` from an iterable\n"
            "2. `transform(chunks, fn)` - apply fn to each chunk lazily\n"
            "3. `batch_filter(chunks, predicate)` - filter chunks lazily\n"
            "4. `pipeline(*stages)` - compose generators into a single pipeline\n"
            "Process a large dataset without loading it all into memory."
        ),
        "difficulty": "medium",
        "category": "Generators & Iterators",
        "starter_code": (
            "from typing import Generator, Callable, Iterable, TypeVar\n\n"
            "T = TypeVar('T')\n\n"
            "def read_chunks(data: Iterable[T], size: int) -> Generator:\n"
            "    pass\n\n"
            "def transform(chunks: Iterable, fn: Callable) -> Generator:\n"
            "    pass\n\n"
            "def batch_filter(chunks: Iterable, predicate: Callable) -> Generator:\n"
            "    pass\n\n"
            "def pipeline(data: Iterable, *stages: Callable) -> Generator:\n"
            "    pass\n"
        ),
        "expected_output": "list(read_chunks(range(10), 3)) == [[0,1,2],[3,4,5],[6,7,8],[9]]",
        "test_cases": [
            {"input": "list(read_chunks(range(10), 3))", "expected_output": "[[0,1,2],[3,4,5],[6,7,8],[9]]"},
            {"input": "list(transform([[1,2],[3,4]], sum))", "expected_output": "[3, 7]"},
            {"input": "list(batch_filter([1,2,3,4,5], lambda x: x > 3))", "expected_output": "[4, 5]"},
        ],
        "xp_reward": 20,
        "hints": [
            "Use itertools.islice for chunking without loading all data.",
            "yield from can forward items from inner generators.",
            "functools.reduce can compose the pipeline stages.",
        ],
    },
    {
        "id": "ch-12-context-manager",
        "title": "Custom Context Manager",
        "description": (
            "Implement context managers for common patterns:\n"
            "1. `Timer()` - measures and prints elapsed time of a block\n"
            "2. `TempDirectory()` - creates a temp dir, yields path, cleans up\n"
            "3. `DatabaseTransaction(conn)` - auto-commit on success, rollback on error\n"
            "4. `Suppress(*exceptions)` - silently suppresses listed exception types\n"
            "Implement using both class-based (__enter__/__exit__) and "
            "@contextmanager decorator approaches."
        ),
        "difficulty": "medium",
        "category": "Context Managers",
        "starter_code": (
            "import time\nimport os\nimport tempfile\nimport shutil\n"
            "from contextlib import contextmanager\n\n"
            "class Timer:\n"
            "    def __enter__(self):\n"
            "        pass\n"
            "    def __exit__(self, *args):\n"
            "        pass\n\n"
            "@contextmanager\n"
            "def temp_directory():\n"
            "    pass\n\n"
            "class DatabaseTransaction:\n"
            "    def __init__(self, conn):\n"
            "        pass\n"
            "    def __enter__(self):\n"
            "        pass\n"
            "    def __exit__(self, exc_type, exc_val, exc_tb):\n"
            "        pass\n\n"
            "@contextmanager\n"
            "def suppress(*exceptions):\n"
            "    pass\n"
        ),
        "expected_output": "with Timer() as t: ... prints elapsed time",
        "test_cases": [
            {"input": "with Timer(): time.sleep(0.1)", "expected_output": "prints elapsed ~ 0.1s"},
            {"input": "with temp_directory() as d: os.path.isdir(d)", "expected_output": "True (dir exists inside, cleaned up after)"},
            {"input": "with suppress(ValueError): raise ValueError", "expected_output": "no exception raised"},
        ],
        "xp_reward": 20,
        "hints": [
            "__enter__ returns self (or the resource); __exit__ handles cleanup.",
            "In __exit__, return True to suppress exceptions.",
            "@contextmanager: code before yield is __enter__, after is __exit__.",
        ],
    },
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/weekly")
def get_weekly_challenge():
    """Return the current week's challenge, rotated by ISO week number."""
    today = datetime.date.today()
    week_number = today.isocalendar()[1]  # ISO week 1-53
    index = (week_number - 1) % len(CHALLENGES)
    challenge = CHALLENGES[index]
    return {
        "week_number": week_number,
        "year": today.year,
        "challenge": challenge,
        "total_challenges": len(CHALLENGES),
    }


@router.post("/submit")
def submit_solution(req: SubmitSolutionRequest):
    """Submit a solution for a challenge. Records the attempt in the database."""
    # Validate challenge exists
    challenge = next((c for c in CHALLENGES if c["id"] == req.challenge_id), None)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    db_path = _get_db_path()
    _ensure_challenges_table(db_path)

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()

        # Check if user already completed this challenge
        cursor.execute(
            "SELECT id, passed FROM challenge_submissions WHERE user_id = ? AND challenge_id = ?",
            [req.user_id, req.challenge_id],
        )
        existing = cursor.fetchone()

        if existing and existing[1] == 1:
            return {
                "status": "already_completed",
                "message": "You have already completed this challenge.",
                "xp_awarded": 0,
            }

        # For now, mark as passed (actual code execution/validation
        # would be handled by a sandboxed runner in production).
        passed = 1
        xp = challenge["xp_reward"] if passed else 0

        if existing:
            cursor.execute(
                "UPDATE challenge_submissions SET code = ?, passed = ?, xp_awarded = ?, submitted_at = datetime('now') "
                "WHERE user_id = ? AND challenge_id = ?",
                [req.code, passed, xp, req.user_id, req.challenge_id],
            )
        else:
            cursor.execute(
                "INSERT INTO challenge_submissions (user_id, challenge_id, code, passed, xp_awarded) "
                "VALUES (?, ?, ?, ?, ?)",
                [req.user_id, req.challenge_id, req.code, passed, xp],
            )

        # Award XP to the user
        if passed and xp > 0:
            cursor.execute(
                "UPDATE users SET points = COALESCE(points, 0) + ? WHERE id = ?",
                [xp, req.user_id],
            )

        conn.commit()

        return {
            "status": "passed" if passed else "failed",
            "message": "Challenge completed! XP awarded." if passed else "Some test cases failed.",
            "xp_awarded": xp,
            "challenge_id": req.challenge_id,
        }
    finally:
        conn.close()


@router.get("/leaderboard")
def get_leaderboard(limit: int = 20):
    """Return top users ranked by number of completed challenges and total XP earned."""
    db_path = _get_db_path()
    _ensure_challenges_table(db_path)

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                cs.user_id,
                COALESCE(u.name, u.username, cs.user_id) AS name,
                COUNT(*) AS challenges_completed,
                SUM(cs.xp_awarded) AS total_xp
            FROM challenge_submissions cs
            LEFT JOIN users u ON u.id = cs.user_id
            WHERE cs.passed = 1
            GROUP BY cs.user_id
            ORDER BY challenges_completed DESC, total_xp DESC
            LIMIT ?
        """, [limit])

        rows = cursor.fetchall()
        leaderboard = [
            {
                "rank": i + 1,
                "user_id": row[0],
                "name": row[1],
                "challenges_completed": row[2],
                "total_xp": row[3],
            }
            for i, row in enumerate(rows)
        ]

        return {"leaderboard": leaderboard, "total_participants": len(rows)}
    finally:
        conn.close()
