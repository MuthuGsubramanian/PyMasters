"""Big-O Sprint templates: a snippet that defines and calls a function on input size `n`.

Operation counts are measured, not asserted: the build traces line events inside the
functions (module-level setup is free) for n = 10, 100, 1000 and ships them, so the
post-answer bar race is factual. Exponential items are measured at n = 10 and 16.
"""
import random

LABELS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"]
NAMES = ["nums", "data", "values", "items"]


def _t(level, topic, code, label, misconception, why, exponential=False):
    return {"level": level, "topic": topic, "code": code, "answer": LABELS.index(label), "misconception": misconception,
            "why": why, "exponential": exponential}


# ───────────────────────────── level 1 ─────────────────────────────

def t_index_lookup(rng):
    v = rng.choice(NAMES)
    return _t(1, "big_o_complexity", f"def third({v}):\n    return {v}[2]\n\nthird(list(range(n)))", "O(1)", "index_is_constant",
              "Indexing a list jumps straight to the slot; the size of the list does not matter.")


def t_sum_loop(rng):
    v = rng.choice(NAMES)
    return _t(1, "big_o_complexity", f"def total({v}):\n    s = 0\n    for x in {v}:\n        s += x\n    return s\n\ntotal(list(range(n)))", "O(n)", "single_loop_linear",
              "One pass over n items does n additions: linear.")


def t_max_loop(rng):
    v = rng.choice(NAMES)
    return _t(1, "big_o_complexity", f"def biggest({v}):\n    best = {v}[0]\n    for x in {v}:\n        if x > best:\n            best = x\n    return best\n\nbiggest(list(range(n)))", "O(n)", "single_loop_linear",
              "Every element is inspected once; the comparison inside is constant work.")


def t_all_pairs(rng):
    v = rng.choice(NAMES)
    return _t(1, "big_o_complexity", f"def pairs({v}):\n    count = 0\n    for a in {v}:\n        for b in {v}:\n            count += 1\n    return count\n\npairs(list(range(n)))", "O(n²)", "nested_loops_quadratic",
              "The inner loop runs n times for each of the n outer iterations: n × n.")


# ───────────────────────────── level 2 ─────────────────────────────

def t_linear_search(rng):
    v = rng.choice(NAMES)
    return _t(2, "searching", f"def find({v}, target):\n    for i, x in enumerate({v}):\n        if x == target:\n            return i\n    return -1\n\nfind(list(range(n)), -1)", "O(n)", "single_loop_linear",
              "In the worst case (target absent) every element is checked once.")


def t_binary_search(rng):
    v = rng.choice(NAMES)
    return _t(2, "searching", f"def bsearch({v}, target):\n    lo, hi = 0, len({v}) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if {v}[mid] == target:\n            return mid\n        if {v}[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\nbsearch(list(range(n)), -1)", "O(log n)", "halving_is_log",
              "Each step halves the remaining range, so about log₂ n steps are needed.")


def t_bubble_sort(rng):
    v = rng.choice(NAMES)
    return _t(2, "sorting_basics", f"def bubble({v}):\n    for i in range(len({v})):\n        for j in range(len({v}) - 1):\n            if {v}[j] > {v}[j + 1]:\n                {v}[j], {v}[j + 1] = {v}[j + 1], {v}[j]\n    return {v}\n\nbubble(list(range(n, 0, -1)))", "O(n²)", "nested_loops_quadratic",
              "Two nested passes over the list: roughly n² comparisons regardless of input order.")


def t_stack_ops(rng):
    v = rng.choice(NAMES)
    return _t(2, "big_o_complexity", f"def push_pop({v}):\n    {v}.append(1)\n    {v}.append(2)\n    return {v}.pop()\n\npush_pop(list(range(n)))", "O(1)", "index_is_constant",
              "append and pop at the end of a list are constant-time no matter how long the list is.")


# ───────────────────────────── level 3 ─────────────────────────────

def t_merge_sort(rng):
    v = rng.choice(NAMES)
    return _t(3, "sorting_basics", f"def msort({v}):\n    if len({v}) <= 1:\n        return {v}\n    mid = len({v}) // 2\n    left = msort({v}[:mid])\n    right = msort({v}[mid:])\n    out = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            out.append(left[i]); i += 1\n        else:\n            out.append(right[j]); j += 1\n    return out + left[i:] + right[j:]\n\nmsort(list(range(n, 0, -1)))", "O(n log n)", "divide_and_conquer",
              "log₂ n levels of splitting, and each level merges all n items: n log n.")


def t_two_pointer(rng):
    v = rng.choice(NAMES)
    return _t(3, "big_o_complexity", f"def has_pair({v}, target):\n    lo, hi = 0, len({v}) - 1\n    while lo < hi:\n        s = {v}[lo] + {v}[hi]\n        if s == target:\n            return True\n        if s < target:\n            lo += 1\n        else:\n            hi -= 1\n    return False\n\nhas_pair(list(range(n)), -5)", "O(n)", "two_pointers_linear",
              "The two pointers move toward each other and meet after at most n steps.")


def t_halving_loop(rng):
    return _t(3, "big_o_complexity", "def halvings(n):\n    steps = 0\n    while n > 1:\n        n //= 2\n        steps += 1\n    return steps\n\nhalvings(n)", "O(log n)", "halving_is_log",
              "Dividing by two each time reaches 1 after about log₂ n iterations.")


def t_distinct_pairs(rng):
    v = rng.choice(NAMES)
    return _t(3, "big_o_complexity", f"def dup_pairs({v}):\n    c = 0\n    for i in range(len({v})):\n        for j in range(i + 1, len({v})):\n            if {v}[i] == {v}[j]:\n                c += 1\n    return c\n\ndup_pairs(list(range(n)))", "O(n²)", "triangle_still_quadratic",
              "Starting j at i + 1 halves the work (n²/2) but halving a square is still quadratic.")


# ───────────────────────────── level 4 ─────────────────────────────

def t_constant_inner(rng):
    v = rng.choice(NAMES); k = rng.choice([3, 5])
    return _t(4, "big_o_complexity", f"def scan({v}):\n    c = 0\n    for x in {v}:\n        for k in range({k}):\n            c += x * k\n    return c\n\nscan(list(range(n)))", "O(n)", "constant_inner_loop",
              f"The inner loop always runs {k} times: that is a constant factor, not another n.")


def t_prefix_naive(rng):
    v = rng.choice(NAMES)
    return _t(4, "big_o_complexity", f"def prefix({v}):\n    out = []\n    for i in range(len({v})):\n        s = 0\n        for j in range(i + 1):\n            s += {v}[j]\n        out.append(s)\n    return out\n\nprefix(list(range(n)))", "O(n²)", "triangle_still_quadratic",
              "Recomputing each prefix from scratch sums 1 + 2 + … + n ≈ n²/2 elements.")


def t_sequential_loops(rng):
    v = rng.choice(NAMES)
    return _t(4, "big_o_complexity", f"def two_passes({v}):\n    s = 0\n    for x in {v}:\n        s += x\n    m = 0\n    for x in {v}:\n        m = max(m, x)\n    return s, m\n\ntwo_passes(list(range(n)))", "O(n)", "sequential_loops_add",
              "Loops one after another add their costs (2n), they do not multiply; still linear.")


def t_fib_naive(rng):
    return _t(4, "recursion_fundamentals", "def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\nfib(n)", "O(2ⁿ)", "recursion_branching_exponential",
              "Each call spawns two more calls, so the call tree roughly doubles with every extra n.", exponential=True)


# ───────────────────────────── level 5 ─────────────────────────────

def t_set_dedupe(rng):
    v = rng.choice(NAMES)
    return _t(5, "hash_tables", f"def first_dup({v}):\n    seen = set()\n    for x in {v}:\n        if x in seen:\n            return x\n        seen.add(x)\n    return None\n\nfirst_dup(list(range(n)))", "O(n)", "hash_lookup_constant",
              "Set membership and insertion are O(1) on average, so the single loop stays linear.")


def t_list_dedupe(rng):
    v = rng.choice(NAMES)
    return _t(5, "hash_tables", f"def first_dup({v}):\n    seen = []\n    for x in {v}:\n        for y in seen:\n            if x == y:\n                return x\n        seen.append(x)\n    return None\n\nfirst_dup(list(range(n)))", "O(n²)", "list_membership_linear",
              "Checking membership in a list scans it, and the list grows to n: n × n/2 comparisons.")


def t_fast_pow(rng):
    return _t(5, "recursion_fundamentals", "def power(b, e):\n    result = 1\n    while e > 0:\n        if e % 2 == 1:\n            result *= b\n        b *= b\n        e //= 2\n    return result\n\npower(3, n)", "O(log n)", "halving_is_log",
              "The exponent halves on every iteration, so the loop runs about log₂ n times.")


def t_sort_then_scan(rng):
    v = rng.choice(NAMES)
    return _t(5, "sorting_basics", f"def msort({v}):\n    if len({v}) <= 1:\n        return {v}\n    mid = len({v}) // 2\n    a, b = msort({v}[:mid]), msort({v}[mid:])\n    out, i, j = [], 0, 0\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            out.append(a[i]); i += 1\n        else:\n            out.append(b[j]); j += 1\n    return out + a[i:] + b[j:]\n\ndef closest_gap({v}):\n    s = msort({v})\n    best = None\n    for i in range(1, len(s)):\n        gap = s[i] - s[i - 1]\n        if best is None or gap < best:\n            best = gap\n    return best\n\nclosest_gap(list(range(n, 0, -1)))", "O(n log n)", "divide_and_conquer",
              "The sort costs n log n and the scan afterwards only n; the larger term wins.")


# ───────────────────────────── level 6 ─────────────────────────────

def t_subsets(rng):
    return _t(6, "recursion_fundamentals", "def subsets(items):\n    if not items:\n        return [[]]\n    rest = subsets(items[1:])\n    return rest + [[items[0]] + r for r in rest]\n\nsubsets(list(range(n)))", "O(2ⁿ)", "recursion_branching_exponential",
              "A set of n items has 2ⁿ subsets, and the function builds every one of them.", exponential=True)


def t_sliding_window(rng):
    v = rng.choice(NAMES); k = rng.choice([3, 4])
    return _t(6, "big_o_complexity", f"def best_window({v}):\n    k = {k}\n    cur = sum({v}[:k])\n    best = cur\n    for i in range(k, len({v})):\n        cur += {v}[i] - {v}[i - k]\n        best = max(best, cur)\n    return best\n\nbest_window(list(range(n)))", "O(n)", "sliding_window_linear",
              "Each step adds one element and drops one, so the window slides across n items in linear time.")


def t_nested_fixed(rng):
    v = rng.choice(NAMES)
    return _t(6, "big_o_complexity", f"def grid({v}):\n    c = 0\n    for row in range(8):\n        for col in range(8):\n            c += {v}[(row * 8 + col) % len({v})]\n    return c\n\ngrid(list(range(n)))", "O(1)", "constant_inner_loop",
              "Both loops have fixed bounds (8 × 8 = 64 iterations) whatever n is: constant time.")


def t_count_inversions(rng):
    v = rng.choice(NAMES)
    return _t(6, "sorting_basics", f"def inversions({v}):\n    if len({v}) <= 1:\n        return {v}, 0\n    mid = len({v}) // 2\n    a, ca = inversions({v}[:mid])\n    b, cb = inversions({v}[mid:])\n    out, i, j, c = [], 0, 0, ca + cb\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            out.append(a[i]); i += 1\n        else:\n            out.append(b[j]); j += 1; c += len(a) - i\n    return out + a[i:] + b[j:], c\n\ninversions(list(range(n, 0, -1)))", "O(n log n)", "divide_and_conquer",
              "Counting inversions during a merge sort keeps the n log n cost of the sort.")


TEMPLATES = [
    t_index_lookup, t_sum_loop, t_max_loop, t_all_pairs,
    t_linear_search, t_binary_search, t_bubble_sort, t_stack_ops,
    t_merge_sort, t_two_pointer, t_halving_loop, t_distinct_pairs,
    t_constant_inner, t_prefix_naive, t_sequential_loops, t_fib_naive,
    t_set_dedupe, t_list_dedupe, t_fast_pow, t_sort_then_scan,
    t_subsets, t_sliding_window, t_nested_fixed, t_count_inversions,
]
