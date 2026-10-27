# Memory Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Memory Lane, a six-chapter "city" game that teaches Python's memory model (names, objects, aliasing, mutability, copies, frames, garbage collection) from snapshots recorded off the real interpreter.

**Architecture:** A tracer (`backend/games/memory_trace.py`) runs each authored puzzle under `sys.settrace` and records per-line snapshots (frames → names → labels, objects, demolished, cyclic). The bank builder derives every answer from those snapshots. Memory Lane is a `bank` game on the existing engine with four new item kinds; the reveal carries the post-state so the frontend city (`frontend/src/games/memory-lane/`) animates `before → after` via a pure `diff.js`.

**Tech Stack:** Python 3.11 / FastAPI / SQLite (pytest); React 19 + framer-motion + inline SVG (vitest + the repo's `render.js`); existing Play engine.

**Spec:** `docs/superpowers/specs/2026-10-27-memory-lane-design.md` (parent: `2026-10-27-learn-while-you-play-design.md`).

## Global Constraints

- Founder decisions (approved 2026-10-27 22:57 IST): chapters open (no locking); optional tick sounds off by default; include the small-int caching item (`shared_ok: true`).
- Answer keys, `why`, `explain`, `after` never reach the client before the item is answered (`PRIVATE_FIELDS`).
- A round deals at most one item per program (`group`).
- Bank: ≥ 9 programs per chapter, ≥ 54 programs, ≥ 80 items; chapters 2 and 5 ≥ 16 items each; every `explain` ≥ 120 chars; every program < 10 ms; only `copy`, `gc`, builtins.
- Build fails on unplanned sharing of immutable buildings unless the puzzle sets `shared_ok: true`; `None` is always shared and allowed.
- Demolition = reference-counting fixpoint over the recorded graph; cyclic survivors listed in `cyclic` until a `gc.collect()` line.
- Immutables are buildings only when a name points at them directly or the puzzle sets `expand: true`; inside slots they are `lit:<repr>`.
- UI: all strings via `usePlayT` keys (`lane.*`), English + Tamil written in the i18n JSON; touch targets ≥ 44 px; every building/sign focusable with a full-sentence `aria-label`; state never by colour alone; `reducedMotion` prop swaps motion for instant swaps; shortcuts suppressed when the inspector is open (`shortcutsBlocked`).
- Game chunk < 70 kB gzipped; ≤ 12 buildings and ≤ 12 signs per snapshot (bank test).
- Commits carry `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; work in a worktree branch `feat/memory-lane`; CI → VM timer deploys `main`.

## Review Focus

1. A program whose mystery line raises (tuple item assignment): the item must still grade, show the locked-door shake, and `after` must equal `before` plus `error` (Task 1 `test_expect_error_line_keeps_state`, Task 3 bank item `vault_assign_fails`).
2. A `return` mystery line: the post-state must pop the district and bind the caller's name in one step; the frontend diff must report both the vanished signs and the new sign (Task 1 `test_return_pops_frame_and_binds_caller`, Task 6 `diff reports frame pop`).
3. Multi-select answers submitted with duplicates or unknown labels (`["A","A","Z"]`) must score 0, not 500 (Task 2 `test_set_kinds_reject_garbage`).
4. A `point` answer of `new` when the line rebinds to an *existing* building (and vice versa) must be wrong, and the reveal must name the building (Task 2 `test_point_new_vs_existing`).
5. Learner resumes a daily round: `before` snapshots re-sent for unanswered items only; answered items come back as `answered` ids (existing engine; Task 5 `test_memory_lane_daily_resume_hides_after`).

---

### Task 1: Tracer — snapshots from the real interpreter

**Files:**
- Create: `backend/games/memory_trace.py`
- Test: `backend/tests/test_memory_trace.py`

**Interfaces:**
- Produces: `trace_program(source: str, *, expand: set[str] = frozenset()) -> list[dict]` — one snapshot per executed line boundary. Snapshot keys: `line` (1-based line that just finished; `None` for the initial state), `event` (`"start" | "line" | "return" | "exception"`), `frames` (list bottom→top of `{"name": "main"|<func>, "names": {name: label}}`), `objects` (`{label: {"type", "mutable": bool, "repr", "slots": list|dict|None, "id": int}}` for every reachable *and* cyclic object), `demolished` (labels freed by this line), `cyclic` (labels alive only through a cycle), `error` (`None | {"type", "message"}`).
- Produces: `class PuzzleError(Exception)` raised when the program raises on a line not in `expect_error` (parameter `expect_error: set[int]`).
- Labels: `A, B, …, Z, AA…` in first-appearance order; immutables (int, float, str, bool, None) get a label only when bound to a name or when their repr is in `expand`; in slots they appear as `"lit:<repr>"`. Function objects and class instances are buildings (`type` = `"function"` / class name). Builtins, modules and the `gc` module are never objects.
- Demolition rule: `unreachable = labels present in previous snapshot's objects ∪ newly created, not reachable from frames`; iteratively drop any unreachable object with zero references from alive objects; the dropped set is `demolished`, the rest is `cyclic`. A line that is `gc.collect()` demolishes all `cyclic`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_memory_trace.py
import gc, weakref, pytest
from games.memory_trace import trace_program, PuzzleError

def after(snaps, line):
    return next(s for s in snaps if s["line"] == line)

def test_alias_shares_one_building():
    s = trace_program("a = [1, 2]\nb = a\nb.append(3)\n")
    st = after(s, 3)
    names = st["frames"][0]["names"]
    assert names["a"] == names["b"]
    assert st["objects"][names["a"]]["repr"] == "[1, 2, 3]"
    assert st["objects"][names["a"]]["slots"] == ["lit:1", "lit:2", "lit:3"]

def test_rebind_int_builds_new_lamppost_and_demolishes_old():
    s = trace_program("x = 300\nx = x + 1\n")
    a, b = after(s, 1), after(s, 2)
    assert a["frames"][0]["names"]["x"] != b["frames"][0]["names"]["x"]
    assert b["demolished"] == [a["frames"][0]["names"]["x"]]

def test_slice_copy_is_new_building_with_same_contents():
    s = trace_program("a = [1, 2]\nc = a[:]\n")
    st = after(s, 2); n = st["frames"][0]["names"]
    assert n["a"] != n["c"] and st["objects"][n["c"]]["repr"] == "[1, 2]"

def test_return_pops_frame_and_binds_caller():
    src = "def f(x):\n    x = x + [9]\n    return x\na = [1]\nr = f(a)\n"
    s = trace_program(src)
    inside = [t for t in s if len(t["frames"]) == 2]
    assert inside and inside[0]["frames"][1]["names"]["x"] == inside[0]["frames"][0]["names"]["a"]
    st = after(s, 5)
    assert len(st["frames"]) == 1 and st["frames"][0]["names"]["r"] != st["frames"][0]["names"]["a"]
    assert st["objects"][st["frames"][0]["names"]["r"]]["repr"] == "[1, 9]"

def test_default_argument_is_one_building_across_calls():
    src = "def f(y=[]):\n    y.append(len(y))\n    return y\nr1 = f()\nr2 = f()\n"
    st = after(trace_program(src), 5); n = st["frames"][0]["names"]
    assert n["r1"] == n["r2"] and st["objects"][n["r1"]]["repr"] == "[0, 1]"

def test_cycle_survives_del_until_collect():
    src = "a = [1]\nb = [2]\na.append(b)\nb.append(a)\ndel a\ndel b\ngc.collect()\n"
    s = trace_program(src)
    d = after(s, 6)
    assert d["demolished"] == [] and sorted(d["cyclic"]) == ["A", "B"]
    c = after(s, 7)
    assert sorted(c["demolished"]) == ["A", "B"] and c["cyclic"] == []

def test_del_last_sign_demolishes_immediately():
    s = trace_program("a = [1]\nb = a\ndel a\ndel b\n")
    assert after(s, 3)["demolished"] == [] and after(s, 4)["demolished"] == ["A"]

def test_expect_error_line_keeps_state():
    s = trace_program("t = (1, [2])\nt[0] = 5\n", expect_error={2})
    st = after(s, 2)
    assert st["error"]["type"] == "TypeError" and st["frames"][0]["names"]["t"] == "A"
    with pytest.raises(PuzzleError):
        trace_program("t = (1,)\nt[0] = 5\n")

def test_expand_gives_inner_immutable_a_building():
    s = trace_program("a = [300]\n", expand={"300"})
    st = after(s, 1)
    assert st["objects"]["A"]["slots"] == ["B"] and st["objects"]["B"]["repr"] == "300"

def test_none_and_functions_are_buildings_small_ints_share():
    s = trace_program("x = None\ny = None\np = 5\nq = 5\ndef f():\n    pass\n")
    st = s[-1]; n = st["frames"][0]["names"]
    assert n["x"] == n["y"] and n["p"] == n["q"] and st["objects"][n["f"]]["type"] == "function"

def test_refcount_rule_matches_real_freeing_for_instances():
    src = "class C:\n    pass\nc = C()\nd = c\ndel c\ndel d\n"
    s = trace_program(src)
    assert after(s, 5)["demolished"] == [] and after(s, 6)["demolished"]

def test_snapshot_budget_fields_present():
    for st in trace_program("a = 1\n"):
        assert set(st) == {"line", "event", "frames", "objects", "demolished", "cyclic", "error"}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ../.venv/Scripts/python -m pytest tests/test_memory_trace.py -q`
Expected: FAIL with `ModuleNotFoundError: games.memory_trace`

- [ ] **Step 3: Implement `backend/games/memory_trace.py`**

Approach: `compile(source, "<puzzle>", "exec")`, `exec` in a fresh globals dict containing `gc` and `copy`; the tracer only handles frames whose `f_code.co_filename == "<puzzle>"`. A `line` event in frame F means the previous line in F finished: emit a snapshot tagged with the *previous* line (track `last_line` per frame). `return` emits the snapshot after popping the frame (so the caller's binding is visible: capture on the caller's next `line` event instead, and tag it with the call line). `exception` events: record `error`, keep tracing; after `exec`, if the exception propagated and the raising line ∉ `expect_error`, raise `PuzzleError`; if ∈ `expect_error`, swallow and finish the trace. Object graph via `gc.get_referents` restricted to list/tuple/dict/set/frozenset/function defaults/instance `__dict__`. Keep a `labels: dict[int, str]` plus a `keepalive` list so ids stay unique for the trace's lifetime. Demolition fixpoint as specified in Interfaces.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && ../.venv/Scripts/python -m pytest tests/test_memory_trace.py -q`
Expected: `12 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/games/memory_trace.py backend/tests/test_memory_trace.py
git commit -m "feat(play): memory tracer records per-line snapshots off the real interpreter"
```

---

### Task 2: Engine — new item kinds and one-item-per-group sampling

**Files:**
- Modify: `backend/games/engine.py` (`PRIVATE_FIELDS`, `score_item`, `pick_items`)
- Test: `backend/tests/test_games_engine.py` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `score_item` handles `kind` ∈ `{"point", "changed", "demolished", "identity"}`: `point` → response `str` equal to `item["answer"]` (a label or `"new"`), 1 pt; `changed`/`demolished` → response `list[str]` with set equality to `item["answer"]` (list), 1 pt, duplicates/unknown entries → 0; `identity` → response `[bool, bool]`, 1 pt per matching position, max 2. `kind == "contents"` scores like `choice` (int index). `PRIVATE_FIELDS += ("after", "explain")`. `pick_items` skips an item whose `group` is already in the selection (items without `group` unaffected).

- [ ] **Step 1: Write the failing tests**

```python
def test_point_new_vs_existing():
    assert score_item({"kind": "point", "answer": "A"}, "A") == (1, 1)
    assert score_item({"kind": "point", "answer": "A"}, "new") == (0, 1)
    assert score_item({"kind": "point", "answer": "new"}, "A") == (0, 1)

def test_set_kinds_reject_garbage():
    it = {"kind": "changed", "answer": ["A", "B"]}
    assert score_item(it, ["B", "A"]) == (1, 1)
    assert score_item(it, ["A", "A", "Z"]) == (0, 1)
    assert score_item(it, "A") == (0, 1)
    assert score_item({"kind": "demolished", "answer": []}, []) == (1, 1)

def test_identity_scores_each_toggle():
    it = {"kind": "identity", "answer": [False, True]}
    assert score_item(it, [False, True]) == (2, 2)
    assert score_item(it, [True, True]) == (1, 2)
    assert score_item(it, "yes") == (0, 2)

def test_contents_scores_like_choice():
    assert score_item({"kind": "contents", "answer": 2}, 2) == (1, 1)

def test_private_fields_hide_after_and_explain():
    pub = public_item({"id": "x", "after": [1], "explain": "e", "why": "w", "answer": 1, "prompt": {}})
    assert "after" not in pub and "explain" not in pub and "prompt" in pub

def test_pick_items_one_per_group(monkeypatch):
    bank = [{"id": f"i{n}", "level": 1, "group": f"g{n // 2}"} for n in range(12)]
    monkeypatch.setattr(engine, "load_bank", lambda gid: bank)
    picked = engine.pick_items("memory_lane", 1, 7, set(), 6)
    assert len(picked) == 6 and len({i["group"] for i in picked}) == 6
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ../.venv/Scripts/python -m pytest tests/test_games_engine.py -q -k "point or set_kinds or identity or contents or private_fields or one_per_group"`
Expected: FAIL (`point` scores 0, `after` still public, groups repeat)

- [ ] **Step 3: Implement in `engine.py`**

`pick_items`: after sorting candidates, walk them taking an item only if its `group` (if any) is unseen, stop at `n`; if that yields fewer than `n`, fall back to the ungrouped behaviour for the remainder (never starve a round).

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && ../.venv/Scripts/python -m pytest tests/test_games_engine.py -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/games/engine.py backend/tests/test_games_engine.py
git commit -m "feat(play): point/changed/demolished/identity item kinds; one item per program group per round"
```

---

### Task 3: Puzzle templates chapters 1–3 and the bank builder

**Files:**
- Create: `backend/games/templates/memory_lane.py`
- Modify: `backend/games/build_banks.py` (`build()` branch `memory_lane`)
- Create: `backend/games/banks/memory_lane.json` (generated)
- Test: `backend/tests/test_bank_memory_lane.py`

**Interfaces:**
- Consumes: `trace_program`, `PuzzleError` (Task 1).
- Produces: `PUZZLES: list[dict]` entries `{"id": str, "chapter": int, "source": str, "expand": list[str], "shared_ok": bool, "expect_error": list[int], "mysteries": [ {"line": int, "kind": "point"|"changed"|"identity"|"demolished"|"contents", "subject": str|list[str], "question": str, "component": str, "misconception": str, "why": str, "explain": str, "topic": str, "lesson_id": str, "choices"?: list[str] (contents: Python reprs; the true one must be among them) } ]}`.
- Produces: `build_items() -> list[dict]`; each item: `{"id": f"ml_{chapter}_{sha1(source+line)[:8]}", "level": chapter, "group": puzzle_id, "topic", "kind", "prompt": {"code", "mystery_line", "question", "subject", "choices"?}, "before": snapshots up to and including line-1 state (list), "answer", "after": [snapshot(s) for the mystery line], "why", "explain", "component", "misconception", "lesson_id"}`. Answers are derived: `point` → `after.frames[-1].names[subject]` if that label existed in `before[-1].objects`, else `"new"`; `changed` → labels whose `repr` differs between `before[-1]` and `after[-1]` (existing in both); `demolished` → `after[-1].demolished`; `identity` → `[names[a] == names[b], eq]` where `eq` is computed by appending a hidden helper line `__eq = (a == b)` to the traced source and reading it from the final snapshot (then stripped from `prompt.code`); `contents` → index of the true `repr` in `choices`.
- Produces: `class BankError(Exception)` raised for: unplanned shared immutable (two names → one immutable label, no `shared_ok`), `explain` < 120 chars, duplicate `source`, > 12 buildings or > 12 signs in any snapshot, `contents` choices not containing the truth or containing duplicates, missing lesson file.
- Component names used in `component` (closed list, asserted by the bank test per chapter): ch1 `name_binding, rebinding, aliasing, immutability, unreferenced_demolition, small_int_cache`; ch2 `mutation_through_alias, in_place_vs_new, shallow_copy, list_identity`; ch3 `tuple_sealed, tuple_slot_mutable, tuple_vs_list_equality, none_singleton`.

- [ ] **Step 1: Write the failing bank test**

```python
# backend/tests/test_bank_memory_lane.py
import json, pathlib, pytest
from collections import Counter
from games.templates.memory_lane import build_items, PUZZLES, COMPONENTS_BY_CHAPTER

BANK = pathlib.Path(__file__).parent.parent / "games" / "banks" / "memory_lane.json"
LESSONS = pathlib.Path(__file__).parent.parent / "lessons"

@pytest.fixture(scope="module")
def bank():
    return json.loads(BANK.read_text(encoding="utf-8"))

def test_counts_and_groups(bank):
    per = Counter(i["level"] for i in bank)
    groups = Counter(i["level"] for i in {i["group"]: i for i in bank}.values())
    for ch in (1, 2, 3):                       # Task 4 extends to 1..6
        assert groups[ch] >= 9, groups
    assert per[2] >= 16
    assert len({i["id"] for i in bank}) == len(bank)

def test_every_component_appears(bank):
    for ch, comps in COMPONENTS_BY_CHAPTER.items():
        if any(i["level"] == ch for i in bank):
            assert set(comps) <= {i["component"] for i in bank if i["level"] == ch}, ch

def test_answers_rederive_from_fresh_trace(bank):
    fresh = {i["id"]: i for i in build_items()}
    for it in bank:
        assert fresh[it["id"]]["answer"] == it["answer"] and fresh[it["id"]]["after"] == it["after"], it["id"]

def test_item_shape(bank):
    for it in bank:
        assert it["kind"] in {"point", "changed", "identity", "demolished", "contents"}
        assert len(it["explain"]) >= 120 and it["why"] and it["misconception"] and it["component"]
        assert it["before"] and it["after"] and it["prompt"]["mystery_line"] >= 1
        assert any(LESSONS.glob(f"*/{it['lesson_id']}.json")), it["lesson_id"]
        for snap in it["before"] + it["after"]:
            assert len(snap["objects"]) <= 12 and sum(len(f["names"]) for f in snap["frames"]) <= 12
        if it["kind"] == "contents":
            assert len(it["prompt"]["choices"]) == len(set(it["prompt"]["choices"])) >= 3

def test_before_never_contains_mystery_state(bank):
    for it in bank:
        assert all(s["line"] is None or s["line"] < it["prompt"]["mystery_line"] for s in it["before"]), it["id"]

def test_unplanned_shared_immutable_fails_build():
    from games.templates.memory_lane import items_for_puzzle, BankError
    bad = {"id": "t", "chapter": 1, "source": "a = 7\nb = 7\n", "expand": [], "shared_ok": False, "expect_error": [],
           "mysteries": [{"line": 2, "kind": "point", "subject": "b", "question": "q", "component": "aliasing",
                          "misconception": "m", "why": "w", "explain": "x" * 120, "topic": "variables", "lesson_id": "variables_intro"}]}
    with pytest.raises(BankError):
        items_for_puzzle(bad)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ../.venv/Scripts/python -m pytest tests/test_bank_memory_lane.py -q`
Expected: FAIL with `ModuleNotFoundError: games.templates.memory_lane`

- [ ] **Step 3: Author chapters 1–3 in `templates/memory_lane.py` and implement `build_items`/`items_for_puzzle`**

Chapter 1 (≥ 9 programs, ≥ 10 items): `a = 300; b = a` point; `x = x + 1` changed (nothing) + demolished; string `s = "hi there"; t = s; t = t + "!"` point; `a = b = [..]` identity; `a = 5; b = 5` identity (`shared_ok`); rebinding away from an unreferenced list → demolished; `None` sharing. Chapter 2 (≥ 9 programs, ≥ 16 items): append through alias (changed), `+=` vs `+` (point + changed), `a[:]`/`list(a)` (identity), `sort()` vs `sorted()` (changed, point), `a == b` vs `a is b` for two equal lists, `b = a; b = []` (changed nothing), `extend`, slice assignment, `clear()`. Chapter 3 (≥ 9 programs, ≥ 9 items): `t[0] = ..` expect_error (changed nothing, error shown), `t[1].append` (changed inner), `t == (1, 2)` vs `is`, tuple with one element, `None` singleton identity, `tuple(lst)` is new building, `a, b = b, a` swap (point), nested tuple in list.

`build_banks.build("memory_lane")` → `from games.templates.memory_lane import build_items; return build_items()`.

- [ ] **Step 4: Build the bank and run tests**

Run: `cd backend && ../.venv/Scripts/python games/build_banks.py memory_lane && ../.venv/Scripts/python -m pytest tests/test_bank_memory_lane.py -q`
Expected: `wrote .../memory_lane.json`, `6 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/games/templates/memory_lane.py backend/games/build_banks.py backend/games/banks/memory_lane.json backend/tests/test_bank_memory_lane.py
git commit -m "feat(play): Memory Lane chapters 1-3 puzzles, verified bank, builder"
```

---

### Task 4: Puzzle templates chapters 4–6

**Files:**
- Modify: `backend/games/templates/memory_lane.py` (append puzzles + `COMPONENTS_BY_CHAPTER` 4–6)
- Modify: `backend/games/banks/memory_lane.json` (rebuild)
- Modify: `backend/tests/test_bank_memory_lane.py` (`for ch in range(1, 7)`, `per[5] >= 16`, total ≥ 80, groups ≥ 54)

**Interfaces:**
- Consumes: Task 3 shapes.
- Produces: components ch4 `nested_slots, shallow_copy_shares_inner, deepcopy_rebuilds, dict_values_are_slots`; ch5 `frame_opens, param_is_alias, param_rebind_local, mutate_through_param, return_binds_caller, frame_demolished, global_reaches_main, default_arg_shared`; ch6 `del_removes_sign, refcount_zero_frees, slot_reference_counts, cycle_survives, collect_sweeps`.

- [ ] **Step 1: Tighten the counts test** (edit the three asserts) and run: `pytest tests/test_bank_memory_lane.py -q` → Expected: FAIL on counts.
- [ ] **Step 2: Author chapters 4–6** (≥ 9 programs each; ch5 ≥ 16 items). Chapter 4 programs use `import copy` inside the source; chapter 6 uses `gc.collect()` lines and `expand` where a `del` removes the last reference to an int (`x = 300; del x`).
- [ ] **Step 3: Rebuild and test**: `python games/build_banks.py memory_lane && pytest tests/test_bank_memory_lane.py tests/test_memory_trace.py -q` → Expected: all pass, total items ≥ 80 printed by the builder.
- [ ] **Step 4: Commit** `feat(play): Memory Lane chapters 4-6 (nested, districts, demolition crew)`.

---

### Task 5: Catalog entry, reveal payload, chapter progress

**Files:**
- Modify: `backend/games/catalog.py` (add `memory_lane`)
- Modify: `backend/routes/play.py` (`_reveal_entry`, `play_catalog`, new `/admin/retention`)
- Test: `backend/tests/test_play_routes.py` (append)

**Interfaces:**
- Produces: catalog entry `{"id": "memory_lane", "title": "Memory Lane", "blurb": "Watch real Python run through a city of buildings and signs, and predict what each line does to memory.", "kind": "bank", "levels": 6, "bank": "memory_lane", "items_per_round": 6, "topics": ["variables", "lists", "ds_tuples", "ds_nested", "functions_scope", "functions_args"], "chapters": ["Signs and Buildings", "Lockers", "Sealed Vaults", "Nested Streets", "Districts", "Demolition Crew"]}`.
- Produces: `_reveal_entry` adds `after`, `explain`, `component` when present on the item.
- Produces: `/api/play/catalog` games gain `chapters_done: list[bool]` (length `levels`) when the game has `chapters`: true where `MAX(score*1.0/max_score) >= 0.8` for that user, game and level.
- Produces: `GET /api/play/admin/retention` (super admin via `routes.admin.require_super_admin`) → `{"games": {game_id: {"players": n, "returned_7d": m}}}` where `players` = users whose first finished round of that game is 7–21 days old, `returned_7d` = those with another finished round ≥ 7 days after their first.

- [ ] **Step 1: Write the failing tests** (full-app TestClient pattern already used in this file)

```python
def test_memory_lane_round_hides_after_and_reveals_it(client, auth_headers):
    r = client.post("/api/play/round/start", json={"game_id": "memory_lane", "level": 1}, headers=auth_headers).json()
    item = r["items"][0]
    assert "after" not in item and "explain" not in item and item["before"]
    ans = client.post("/api/play/round/answer", json={"round_id": r["round_id"], "item_id": item["id"], "response": "new", "ms": 2000}, headers=auth_headers).json()
    assert "after" in ans and len(ans["explain"]) >= 120 and ans["component"]

def test_catalog_chapters_done(client, auth_headers, finish_round):
    finish_round("memory_lane", level=2, accuracy=1.0)
    g = next(x for x in client.get("/api/play/catalog", headers=auth_headers).json()["games"] if x["id"] == "memory_lane")
    assert g["chapters"][1] == "Lockers" and g["chapters_done"] == [False, True, False, False, False, False]

def test_round_has_one_item_per_program(client, auth_headers):
    r = client.post("/api/play/round/start", json={"game_id": "memory_lane", "level": 2}, headers=auth_headers).json()
    codes = [i["prompt"]["code"] for i in r["items"]]
    assert len(codes) == len(set(codes)) == 6

def test_memory_lane_daily_resume_hides_after(client, auth_headers):
    r = client.post("/api/play/round/start", json={"game_id": "memory_lane", "mode": "daily"}, headers=auth_headers).json()
    client.post("/api/play/round/answer", json={"round_id": r["round_id"], "item_id": r["items"][0]["id"], "response": "new", "ms": 1600}, headers=auth_headers)
    again = client.post("/api/play/round/start", json={"game_id": "memory_lane", "mode": "daily"}, headers=auth_headers).json()
    assert again["round_id"] == r["round_id"] and again["answered"] == [r["items"][0]["id"]]
    assert all("after" not in i for i in again["items"])

def test_retention_requires_super_admin(client, auth_headers, super_admin_headers):
    assert client.get("/api/play/admin/retention", headers=auth_headers).status_code == 403
    body = client.get("/api/play/admin/retention", headers=super_admin_headers).json()
    assert "memory_lane" in body["games"]
```

If `finish_round` / `super_admin_headers` fixtures do not exist in this file, add them next to the existing fixtures (finish by inserting a finished `game_rounds` row directly; super admin by setting `users.is_super_admin = 1` for a second test user).

- [ ] **Step 2: Run to verify failure**: `pytest tests/test_play_routes.py -q -k "memory_lane or chapters_done or one_item_per_program or retention"` → Expected: FAIL (404 unknown game).
- [ ] **Step 3: Implement** catalog entry, `_reveal_entry` fields, `chapters_done` in `play_catalog`, the retention route.
- [ ] **Step 4: Run the backend suite**: `pytest -q` → Expected: all pass.
- [ ] **Step 5: Commit** `feat(play): Memory Lane in the catalog; reveal carries the post-state; chapter progress; admin retention stat`.

---

### Task 6: Frontend pure modules — `diff.js` and `layout.js`

**Files:**
- Create: `frontend/src/games/memory-lane/city/diff.js`, `frontend/src/games/memory-lane/city/layout.js`
- Test: `frontend/src/games/__tests__/memoryLaneDiff.test.js`, `frontend/src/games/__tests__/memoryLaneLayout.test.js`

**Interfaces:**
- Produces: `diffSnapshots(before, after) -> {movedSigns: [{frame, name, from: label|null, to: label|null}], changed: [label], demolished: [label], cyclic: [label], framesOpened: [name], framesClosed: [name], error: null|{type,message}}`.
- Produces: `layoutSnapshot(snap) -> {districts: [{name, index, buildings: [{label, type, mutable, repr, slots, signs: [{name, frame}], refs: number, cyclic: bool}]}]}` where `refs` = count of signs + count of slot references to the label across all objects; buildings placed in the district of their first sign (slot-only buildings go to the district of the referrer; unreferenced cyclic ones to a trailing "unreferenced" district); ordering by label.
- Produces: `buildingKind(type) -> "lamppost"|"billboard"|"lockers"|"vault"|"pigeonholes"|"yard"|"lot"|"depot"|"house"` (int/float/bool→lamppost, str→billboard, list→lockers, tuple→vault, dict→pigeonholes, set/frozenset→yard, NoneType→lot, function→depot, else house).

- [ ] **Step 1: Write failing tests** covering: a sign moving between two labels; a sign to `new` (to label absent in before → `from` existing, `to` new label); changed detection by repr; demolished passthrough; frame pop reports `framesClosed: ["f"]` and the moved caller sign in one diff; `layoutSnapshot` groups buildings by district, counts `refs` (two signs + one slot = 3), and maps kinds.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/games/__tests__/memoryLane*.test.js` → Expected: FAIL (module not found).
- [ ] **Step 3: Implement** both modules (pure, no React).
- [ ] **Step 4: Run** → Expected: all pass.
- [ ] **Step 5: Commit** `feat(play): Memory Lane snapshot diff and city layout (pure modules)`.

---

### Task 7: City renderer and inspector

**Files:**
- Create: `frontend/src/games/memory-lane/city/Building.jsx`, `Sign.jsx`, `District.jsx`, `City.jsx`, `Inspector.jsx`, `tokens.css` (imported once by `City.jsx`; defines `--lane-asphalt`, `--lane-brass`, `--lane-sealed`, `--lane-demolish`, `--lane-district-1..3` for light and `.dark`)
- Test: `frontend/src/games/__tests__/memoryLaneCity.test.jsx`

**Interfaces:**
- Consumes: `layoutSnapshot`, `buildingKind` (Task 6).
- Produces: `<City snapshot diff={null|Diff} selectable={'none'|'buildings'|'signs'|'multi'} selected={Set<string>|string|null} onSelect(labelOrSignKey) onInspect(target) reducedMotion newLot={bool} />`. Each building is `<button data-building={label} aria-pressed aria-label="list B, 3 references, contains 1, 2, 3">`; each sign `<button data-sign="frame:name" aria-label="sign a in main points at B">`; the dashed new lot is `<button data-building="new">`. Demolished labels from `diff` render dashed+struck for the animation then unmount; `error` renders a `role="status"` "TypeError: …" badge with a shake (no shake when `reducedMotion`). Signs use `motion.div layoutId={`${frame}:${name}`}` so moves animate; `reducedMotion` disables layout animation.
- Produces: `<Inspector target={{kind:'building', label}|{kind:'sign', frame, name}|null} snapshot onClose />` non-modal `<aside role="complementary">`; when open, adds `data-lane-inspector` to body so `shortcutsBlocked` returns true (extend `modalOpen()` in `engine/keys.js` to also check `document.body.hasAttribute('data-lane-inspector')`).
- Visually hidden `<p data-city-text>` describes the whole state in words.

- [ ] **Step 1: Write failing tests**: renders one button per building and sign with the aria text; `selectable='multi'` toggles `aria-pressed`; `newLot` renders `data-building="new"`; clicking a building with `onInspect` opens the Inspector showing type, "3 references", repr; Escape closes it; with `diff.demolished=['C']` building C has `data-demolished`; error badge text present; `shortcutsBlocked` is true while the inspector is open.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (SVG silhouettes ≤ 40 lines each; sizes: building min 88×72 px, sign 44 px tall). **Step 4: Run** → PASS; also `npx eslint src/games/memory-lane` → clean. **Step 5: Commit** `feat(play): Memory Lane city renderer and inspector`.

---

### Task 8: Game component — program panel, scrubber, question bar, reveal animation

**Files:**
- Create: `frontend/src/games/memory-lane/Game.jsx`, `frontend/src/games/memory-lane/questions.js` (pure: `initialSelection(kind)`, `isAnswerable(kind, sel)`, `toResponse(kind, sel)`)
- Modify: `frontend/src/games/index.js` (component + icon `Building2`), `frontend/src/pages/PlayRound.jsx` (`TITLES.memory_lane = 'Memory Lane'`)
- Test: `frontend/src/games/__tests__/memoryLaneGame.test.jsx`, `frontend/src/games/__tests__/memoryLaneQuestions.test.js`

**Interfaces:**
- Consumes: `City`, `Inspector` (Task 7), `diffSnapshots` (Task 6), engine props `item, onAnswer, disabled, reducedMotion, reveal`.
- Produces: responses per kind: `point` → label string or `"new"`; `changed`/`demolished` → array of labels (`[]` via the "Nothing changes"/"Nothing is demolished" button); `identity` → `[is, eq]` booleans from two toggles `data-toggle="is"|"eq"`; `contents` → choice index from `<button data-choice={i}>` cards rendering each choice repr as a mini locker row.
- Run-up: on mount, `step` state advances from 0 to `before.length-1` every 450 ms (immediate when `reducedMotion`); `<input type="range" data-scrubber>` lets the player pick any `before` index; the program panel dims lines < current and highlights `mystery_line` with a `?` gutter. Submit button `data-submit` disabled until `isAnswerable`. On `reveal` prop arrival, compute `diffSnapshots(before.at(-1), reveal.after.at(-1))`, show the city at `after` with the diff for the animation, and set the scrubber max to include `after` (the learner can scrub back).

- [ ] **Step 1: Write failing tests** (fake timers): run-up reaches the last `before` snapshot after 450 ms × n; scrubber changes the rendered snapshot; `point`: click building B then submit → `onAnswer('B')`; `point` new lot → `'new'`; `changed`: select A and C → `['A','C']`; "Nothing changes" → `[]`; `identity`: toggle is off, eq on → `[false, true]`; `contents` → index; Enter submits when answerable; with `reveal` the city shows the `after` state and a demolished building carries `data-demolished`; `disabled` blocks submit; `questions.js` unit tests for all five kinds.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** `npx vitest run src/games/__tests__/memoryLane*` and `npx eslint src/games` → PASS, clean. **Step 5: Commit** `feat(play): Memory Lane game component (run-up, scrubber, five question kinds, reveal animation)`.

---

### Task 9: Explain card, sound ticks, i18n

**Files:**
- Modify: `frontend/src/games/engine/Reveal.jsx` (render `revealItem.explain` block with `revealItem.component` chip when present; `formatAnswer` handles arrays of labels, `[is, eq]`, `"new"`)
- Create: `frontend/src/games/engine/sound.js` (`useSoundPref()` → `[on, setOn]` on localStorage `pm_play_sound`, default off; `tick(kind: 'ok'|'miss')` WebAudio two-oscillator blip, no-op when `AudioContext` missing), toggle button in `GameShell` footer area (`data-sound-toggle`, `aria-pressed`)
- Modify: `frontend/src/i18n/en.json`, `ta.json` (+ keys with English fallback in the other six): `lane.question_point`, `lane.question_changed`, `lane.question_identity`, `lane.question_demolished`, `lane.question_contents`, `lane.nothing_changes`, `lane.nothing_demolished`, `lane.new_building`, `lane.submit`, `lane.inspect`, `lane.references`, `lane.points_at`, `lane.district_main`, `lane.district_frame`, `lane.waiting_sweep`, `lane.scrub`, `lane.component`, `lane.chapter`, `lane.chapter_complete`, `play.sound_on`, `play.sound_off`
- Test: `frontend/src/games/__tests__/reveal.test.jsx` (append), `frontend/src/games/__tests__/sound.test.js`

- [ ] **Step 1: Failing tests**: Reveal with `explain`+`component` renders both; `formatAnswer` renders `['A','C']` as "A, C", `[]` as "nothing", `[false,true]` as "is: False, ==: True", `'new'` as "a new building"; `useSoundPref` defaults off and persists; `tick` does not throw without AudioContext; en.json and ta.json both contain every `lane.*` key used in `memory-lane/**` (test greps the source for `t('lane.` keys).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** full frontend suite `npx vitest run` + `npx eslint src` → PASS. **Step 5: Commit** `feat(play): explain card on reveal, optional tick sounds, Memory Lane strings (en, ta)`.

---

### Task 10: Play card chapter strip

**Files:**
- Modify: `frontend/src/pages/Play.jsx` (`GameCard`: when `game.chapters`, render `<ol data-chapters>` of six tiles with `aria-label="Chapter 2 Lockers, complete"`, filled when `chapters_done[i]`; "Play" links to `?level=<first unfinished chapter or suggested_level>`)
- Test: `frontend/src/games/__tests__/playCard.test.jsx`

- [ ] **Step 1: Failing test**: card with `chapters` and `chapters_done=[true,false,…]` renders 6 tiles, tile 1 marked complete, Play href ends `level=2`; a card without `chapters` renders the old level cell. (Export `GameCard` from `Play.jsx` for the test.)
- [ ] **Step 2–4: Run FAIL → implement → PASS**, eslint clean. **Step 5: Commit** `feat(play): chapter progress strip on the Memory Lane card`.

---

### Task 11: Merge, deploy, live verification, records

**Files:**
- Modify: `audit/2026-10-27-live-sweep.md` (new section "Memory Lane live verification"), `ops/e2e/play_mobile.py` (add `memory_lane` to the games list), `docs/superpowers/plans/2026-10-27-learn-while-you-play.md` (roadmap row 4 → "shipped <sha>")

- [ ] **Step 1**: full suites green locally (`pytest -q` in backend; `npx vitest run`, `npx eslint src`, `npx vite build` in frontend); merge `feat/memory-lane` into `main`, push, watch CI, wait for the VM to serve the new sha (`/health`).
- [ ] **Step 2**: live play in PyMastersBrowser: every chapter once (desktop, light), chapter 2 and 5 in dark; inspector on each building kind; keyboard-only round; 400 px via `ops/e2e/play_mobile.py`; DevTools performance trace of a reveal at 4× CPU slowdown, no frame > 32 ms. Fix any P0/P1 found (TDD) before declaring done.
- [ ] **Step 3**: record results in the audit log; update the roadmap row; update memory `project_learn_while_you_play_2026_10_27.md` (Memory Lane live, playtest outstanding founder-side); commit docs.
