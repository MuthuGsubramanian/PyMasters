"""
challenges.py — FastAPI APIRouter for Weekly Code Challenges.

Prefix: /api/challenges

Provides a rotating weekly challenge (12 challenges cycling by ISO week number),
solution submission, and a leaderboard of top completions.
"""

import os
import ast
import json
import sqlite3
import datetime
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from ratelimit import SlidingWindowRateLimiter

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

# Grading runs code in a subprocess — cap submissions per user.
_submit_limiter = SlidingWindowRateLimiter(max_calls=20, window_seconds=60)


def _validate_submission(challenge: dict, code: str) -> Tuple[bool, str]:
    """Lightweight STATIC validation (no code execution): the submission must be
    valid Python, differ from the starter template, define every top-level
    function/class the starter declares, and not leave those bodies as a bare
    `pass`. This rejects empty/placeholder junk that the old stub accepted.

    NOTE: this is a safe interim gate, not full correctness grading. Real
    grading means running the code against `test_cases` in the sandbox, which
    requires first authenticating + rate-limiting this endpoint (it currently
    trusts a body user_id) and normalising the prose test_cases on a few
    challenges (e.g. ch-12) into executable assertions. Tracked as a follow-up.
    """
    norm = (code or "").strip()
    if not norm:
        return (False, "Write a solution before submitting.")
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return (False, f"Syntax error: {e.msg} (line {e.lineno}).")

    starter = challenge.get("starter_code") or ""
    if norm == starter.strip():
        return (False, "This is the starter template — write your solution first.")

    try:
        required = {
            n.name for n in ast.parse(starter).body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }
    except SyntaxError:
        required = set()
    defined = {
        n.name for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    missing = required - defined
    if missing:
        return (False, f"Your solution must define: {', '.join(sorted(missing))}.")

    # Reject required functions left as just `pass` / a docstring (unimplemented).
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in required:
            body = [s for s in node.body
                    if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant))]
            if not body or all(isinstance(s, ast.Pass) for s in body):
                return (False, f"`{node.name}` is still unimplemented.")

    return (True, "Submission accepted.")


_GRADE_SENTINEL = "__PMGRADE__"

# Harness comparison + driver, embedded into the sandboxed program. Compares an
# expression result to the expected literal (tolerant), or runs an assertion
# snippet (Form B). Prints one sentinel line of JSON: a list of per-test dicts.
_HARNESS_TMPL = '''
import json as __json, math as __math

def __cmp(got, raw, unordered=False):
    try:
        exp = eval(raw)
    except Exception:
        return (str(got) == str(raw)) or (repr(got) == raw)
    if unordered:
        try:
            return sorted(got) == sorted(exp)
        except Exception:
            try:
                return set(got) == set(exp)
            except Exception:
                pass
    if isinstance(got, float) or isinstance(exp, float):
        try:
            return __math.isclose(got, exp, rel_tol=1e-9, abs_tol=1e-12)
        except Exception:
            pass
    return (got == exp) or (str(got) == str(exp)) or (repr(got) == raw)

__tests = __json.loads(%(tests)s)
__results = []
for __t in __tests:
    __name = __t.get("name") or __t.get("input") or "test"
    try:
        if "harness" in __t and __t["harness"] is not None:
            exec(__t["harness"], globals())
            __results.append({"name": __name, "passed": True})
        else:
            __got = eval(__t["input"])
            __raw = __t.get("expected_output", __t.get("expected"))
            __ok = __cmp(__got, __raw, bool(__t.get("unordered")))
            __r = {"name": __name, "passed": bool(__ok)}
            if not __ok:
                __r["got"] = repr(__got)[:120]
                __r["expected"] = str(__raw)[:120]
            __results.append(__r)
    except Exception as __e:
        __results.append({"name": __name, "passed": False, "error": str(__e)[:160]})
print("%(sentinel)s" + __json.dumps(__results))
'''


def grade_submission(challenge: dict, code: str) -> dict:
    """Run the submission against the challenge's test cases in the sandbox.
    Returns {passed, passed_count, total, results, message, rejected?}."""
    from vaathiyaar.execution import run_code_subprocess, check_challenge_safety

    reason = check_challenge_safety(code)
    if reason:
        return {"passed": False, "passed_count": 0, "total": 0, "results": [],
                "message": f"Code rejected: {reason}.", "rejected": True}

    tests = challenge.get("test_cases") or []
    if not tests:
        res = run_code_subprocess(code)
        ok = res.get("exit_code", 1) == 0 and not (res.get("error") or "").strip()
        return {"passed": ok, "passed_count": 1 if ok else 0, "total": 1, "results": [],
                "message": "Ran successfully." if ok else "Your code raised an error."}

    program = code + "\n" + (_HARNESS_TMPL % {
        "tests": repr(json.dumps(tests)),
        "sentinel": _GRADE_SENTINEL,
    })
    res = run_code_subprocess(program, timeout=10)
    out = res.get("output", "") or ""
    idx = out.rfind(_GRADE_SENTINEL)
    total = len(tests)
    if idx == -1:
        err = (res.get("error") or "").strip()
        tail = err.splitlines()[-1][:160] if err else ""
        msg = ("Your code timed out." if "timed out" in err.lower()
               else ("Your code errored before tests ran. " + tail) if err
               else "No output from your solution.")
        return {"passed": False, "passed_count": 0, "total": total, "results": [], "message": msg.strip()}
    try:
        results = json.loads(out[idx + len(_GRADE_SENTINEL):].splitlines()[0])
    except Exception:
        return {"passed": False, "passed_count": 0, "total": total, "results": [],
                "message": "Could not evaluate your solution."}
    passed_count = sum(1 for r in results if r.get("passed"))
    all_pass = passed_count == total and total > 0
    msg = f"All {total} tests passed!" if all_pass else f"{passed_count} of {total} tests passed."
    return {"passed": all_pass, "passed_count": passed_count, "total": total,
            "results": results, "message": msg}


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
        # Additive migration: per-attempt test counts for richer history/UX.
        cols = {r[1] for r in conn.execute("PRAGMA table_info(challenge_submissions)").fetchall()}
        if "passed_count" not in cols:
            conn.execute("ALTER TABLE challenge_submissions ADD COLUMN passed_count INTEGER DEFAULT 0")
        if "total_count" not in cols:
            conn.execute("ALTER TABLE challenge_submissions ADD COLUMN total_count INTEGER DEFAULT 0")
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
            # rotate_90 mutates in place and returns None, so tests must call it
            # on a variable then assert the variable — a bare literal `input` never
            # invoked the function and so was unpassable by a correct solution.
            {"name": "2x2 rotates clockwise", "harness": "m=[[1,2],[3,4]]\nrotate_90(m)\nassert m==[[3,1],[4,2]], m"},
            {"name": "3x3 rotates clockwise", "harness": "m=[[1,2,3],[4,5,6],[7,8,9]]\nrotate_90(m)\nassert m==[[7,4,1],[8,5,2],[9,6,3]], m"},
            {"name": "1x1 unchanged", "harness": "m=[[1]]\nrotate_90(m)\nassert m==[[1]], m"},
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
            {"name": "get returns stored value", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nassert c.get(1)==1"},
            {"name": "evicts least-recently-used", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nc.put(3,3)\nassert c.get(1)==-1 and c.get(3)==3"},
            {"name": "capacity 1 evicts previous", "harness": "c=LRUCache(1)\nc.put(1,1)\nc.put(2,2)\nassert c.get(1)==-1"},
            {"name": "get refreshes recency", "harness": "c=LRUCache(2)\nc.put(1,1)\nc.put(2,2)\nc.get(1)\nc.put(3,3)\nassert c.get(2)==-1 and c.get(1)==1"},
            {"name": "missing key returns -1", "harness": "c=LRUCache(2)\nassert c.get(99)==-1"},
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
            {"name": "timer preserves return value", "harness": "@timer\ndef slow():\n    return 42\nassert slow()==42"},
            {"name": "retry re-raises after max attempts", "harness": "n={'c':0}\n@retry(max_attempts=3)\ndef flaky():\n    n['c']+=1\n    raise ValueError('x')\ntry:\n    flaky()\n    assert False, 'should have raised'\nexcept ValueError:\n    assert n['c']==3"},
            {"name": "retry succeeds before max", "harness": "n={'c':0}\n@retry(max_attempts=3)\ndef eventually():\n    n['c']+=1\n    if n['c']<2:\n        raise ValueError\n    return 'ok'\nassert eventually()=='ok'"},
            {"name": "validate_types accepts valid args", "harness": "@validate_types\ndef add(a: int, b: int) -> int:\n    return a+b\nassert add(1,2)==3"},
            {"name": "validate_types rejects wrong types", "harness": "@validate_types\ndef add(a: int, b: int) -> int:\n    return a+b\nraised=False\ntry:\n    add('x',2)\nexcept TypeError:\n    raised=True\nassert raised"},
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
            # fetch_all is async, so a bare `fetch_all(...)` input only yielded a
            # coroutine object; and the prose expected_outputs ('<html>...',
            # 'Error: ...') could never equal a real result. Tests now await the
            # coroutine and assert the described contract: a dict keyed by every
            # URL, with failures captured (never raised) so one bad URL can't
            # abort the batch, and empty input -> empty dict.
            {"name": "maps every URL to a result", "harness": "import asyncio\nr=asyncio.run(fetch_all(['http://example.com']))\nassert set(r.keys())=={'http://example.com'} and isinstance(r['http://example.com'], str)"},
            {"name": "captures errors, never raises", "harness": "import asyncio\nr=asyncio.run(fetch_all(['http://bad-url'], timeout=1))\nassert 'http://bad-url' in r and isinstance(r['http://bad-url'], str)"},
            {"name": "empty input -> empty dict", "harness": "import asyncio\nassert asyncio.run(fetch_all([], max_concurrent=5))=={}"},
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
            {"name": "Timer runs a block without error", "harness": "import time\nwith Timer():\n    time.sleep(0.01)"},
            {"name": "temp_directory yields an existing dir", "harness": "import os\nwith temp_directory() as d:\n    assert os.path.isdir(d)"},
            {"name": "temp_directory cleans up after", "harness": "import os\nwith temp_directory() as d:\n    saved=d\nassert not os.path.isdir(saved)"},
            {"name": "suppress swallows listed exception", "harness": "with suppress(ValueError):\n    raise ValueError('x')"},
            {"name": "suppress lets other exceptions through", "harness": "raised=False\ntry:\n    with suppress(ValueError):\n        raise KeyError('k')\nexcept KeyError:\n    raised=True\nassert raised"},
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
    # Additive `previous`: the real challenges from the weeks immediately before
    # this one in the rotation (newest first, up to 3). Purely informational —
    # this endpoint is unauthenticated and therefore does NOT and MUST NOT claim
    # per-user completion status; the frontend renders these neutrally. Before
    # this field existed the UI showed a hardcoded placeholder list with
    # fabricated titles and "completed" flags for every visitor. New optional
    # response key; existing consumers ignore it (backward-compatible).
    n = len(CHALLENGES)
    previous = [
        {
            "id": CHALLENGES[(index - k) % n]["id"],
            "title": CHALLENGES[(index - k) % n]["title"],
            "xp": CHALLENGES[(index - k) % n]["xp_reward"],
            "difficulty": CHALLENGES[(index - k) % n]["difficulty"],
            "week_number": week_number - k,
        }
        for k in range(1, min(4, n))
    ]
    return {
        "week_number": week_number,
        "year": today.year,
        "challenge": challenge,
        "total_challenges": len(CHALLENGES),
        "previous": previous,
    }


@router.post("/submit")
def submit_solution(req: SubmitSolutionRequest, caller: str = Depends(get_current_user_id)):
    """Submit a solution. Authenticated (user from JWT) + rate-limited. Graded
    against the challenge's test cases in the hardened sandbox."""
    if not _submit_limiter.allow(caller):
        wait = _submit_limiter.retry_after(caller)
        return {"status": "error", "message": f"Rate limit reached. Try again in {wait}s.",
                "xp_awarded": 0, "challenge_id": req.challenge_id}

    user_id = caller  # trust the token, not any body user_id

    challenge = next((c for c in CHALLENGES if c["id"] == req.challenge_id), None)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    db_path = _get_db_path()
    _ensure_challenges_table(db_path)

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, passed FROM challenge_submissions WHERE user_id = ? AND challenge_id = ?",
            [user_id, req.challenge_id],
        )
        existing = cursor.fetchone()
        already_passed = bool(existing and existing[1] == 1)

        # Pre-filter junk without spawning a subprocess, then grade for real.
        valid, validate_msg = _validate_submission(challenge, req.code)
        if not valid:
            grade = {"passed": False, "passed_count": 0, "total": len(challenge.get("test_cases") or []),
                     "results": [], "message": validate_msg}
        else:
            grade = grade_submission(challenge, req.code)

        passed = 1 if grade["passed"] else 0
        # Award XP only on the first successful pass.
        xp = challenge["xp_reward"] if (passed and not already_passed) else 0

        if existing:
            # Preserve the user's BEST record: once they've already passed, a
            # later WORSE submission must not overwrite their winning `code` or
            # degrade the stored `passed_count`/`total_count` (both are surfaced
            # via the profile data-export and org analytics). `keep_best` is true
            # ONLY when the user had already passed AND this attempt does not
            # pass; those three columns are then kept via SQL CASE (bound flag),
            # while `passed` (=max, never regresses), accumulated `xp_awarded`,
            # and `submitted_at` (honest last-activity, used by org analytics)
            # still advance. For a not-yet-passed user, or any new passing
            # attempt, keep_best is 0 and the write is byte-identical to before.
            keep_best = 1 if (already_passed and not grade["passed"]) else 0
            cursor.execute(
                "UPDATE challenge_submissions SET "
                "code = CASE WHEN ? THEN code ELSE ? END, "
                "passed=?, xp_awarded=COALESCE(xp_awarded,0)+?, "
                "passed_count = CASE WHEN ? THEN passed_count ELSE ? END, "
                "total_count = CASE WHEN ? THEN total_count ELSE ? END, "
                "submitted_at=datetime('now') "
                "WHERE user_id=? AND challenge_id=?",
                [keep_best, req.code, max(passed, existing[1] or 0), xp,
                 keep_best, grade["passed_count"], keep_best, grade["total"],
                 user_id, req.challenge_id],
            )
        else:
            cursor.execute(
                "INSERT INTO challenge_submissions (user_id, challenge_id, code, passed, xp_awarded, passed_count, total_count) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [user_id, req.challenge_id, req.code, passed, xp, grade["passed_count"], grade["total"]],
            )

        if xp > 0:
            cursor.execute(
                "UPDATE users SET points = COALESCE(points, 0) + ? WHERE id = ?",
                [xp, user_id],
            )

        # Passing a weekly challenge is a daily learning activity, so advance the
        # user's streak — the same accrual the module-completion and Vaathiyaar
        # challenge-pass paths already do. Gated on `passed` (not on `xp>0`) so a
        # legitimate re-pass on a later day still counts as activity; touch_streak
        # is idempotent within a calendar day, so a same-day re-pass never
        # double-counts. It owns no transaction and swallows its own errors, so a
        # streak-write failure can never break grading/XP award. Persisted
        # atomically by the existing conn.commit() below.
        if passed:
            from streaks import touch_streak
            touch_streak(conn, user_id)

        conn.commit()

        status = ("already_completed" if (already_passed and passed)
                  else "rejected" if grade.get("rejected")
                  else "passed" if passed else "failed")
        if status == "already_completed":
            message = "You already completed this challenge."
        elif passed and xp:
            message = f"{grade['message']} +{xp} XP."
        else:
            message = grade["message"]

        return {
            "status": status,
            "message": message,
            "xp_awarded": xp,
            "passed_tests": grade["passed_count"],
            "total_tests": grade["total"],
            "results": grade["results"],
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
