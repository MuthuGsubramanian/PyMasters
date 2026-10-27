"""Shape Sorter cards: a requirement → the right container (or the right operation).

Hand-authored; `build_banks.py shape_sorter` turns CARDS into the bank with stable ids.
"""
import hashlib

B12 = ["list", "tuple", "set", "dict"]
B34 = B12 + ["frozenset", "deque"]
B56 = ["list.append", "list.insert(0)", "set.add", "dict.get", "deque.appendleft", "in list", "in set"]
BINS = {1: B12, 2: B12, 3: B34, 4: B34, 5: B56, 6: B56}
TOPIC = {"list": "lists", "tuple": "ds_tuples", "set": "ds_sets", "dict": "ds_dicts", "frozenset": "ds_sets", "deque": "queues",
         "list.append": "lists", "list.insert(0)": "lists", "in list": "lists", "set.add": "hash_tables", "in set": "hash_tables",
         "dict.get": "ds_dicts", "deque.appendleft": "queues"}
LESSON = {"lists": "lists", "ds_tuples": "ds_tuples", "ds_sets": "ds_sets", "ds_dicts": "ds_dicts", "queues": "queues", "hash_tables": "hash_tables"}

# (level, card text, answer, misconception, why)
CARDS = [
    (1, "An ordered collection of scores you will keep appending to", "list", "list_vs_tuple", "Lists are ordered and mutable, so appending and reordering later is exactly what they are for."),
    (1, "Pairs of country → capital, looked up by country", "dict", "dict_vs_list", "A dict maps keys to values with O(1) lookup by key; a list would force a linear search."),
    (1, "Unique tags on a post, where duplicates must be impossible", "set", "set_vs_list", "A set stores each value once and rejects duplicates automatically."),
    (1, "A fixed (x, y) coordinate that must never change", "tuple", "mutability", "Tuples are immutable: once built, the pair cannot be edited by accident."),
    (1, "Shopping-cart items in the order they were added, duplicates fine", "list", "set_vs_list", "Order and duplicates both matter, which rules out a set; a list keeps both."),
    (1, "Word → how many times it appears in a text", "dict", "dict_vs_list", "Counting by key is a mapping job: dict[word] = count."),
    (1, "The seven days of the week, in order, never modified", "tuple", "list_vs_tuple", "A fixed ordered sequence that never changes is the classic tuple."),
    (1, "Every distinct visitor ID seen today", "set", "dedupe", "Distinct means no duplicates; sets enforce that and test membership fast."),
    (1, "Lines of a file, in order, which you will edit in place", "list", "mutability", "Editing by position needs a mutable ordered sequence: a list."),
    (1, "An RGB colour as three numbers that belong together", "tuple", "list_vs_tuple", "A small fixed-size record whose positions have meaning is a tuple, not a list."),
    (1, "Student name → grade", "dict", "dict_vs_list", "Look up by name, store the grade: a mapping, so a dict."),
    (1, "The letters used in a word, each counted once", "set", "dedupe", "set(word) collapses repeats and keeps each character once."),
    (1, "A to-do list the user reorders by dragging", "list", "mutability", "Reordering means mutating positions, which only a list allows."),
    (1, "Return two values from a function at once", "tuple", "list_vs_tuple", "return a, b builds a tuple; callers unpack it as x, y = f()."),
    (2, "Needs fast membership checks (is x in here?) over millions of IDs", "set", "membership_cost", "Set membership is O(1) on average via hashing; a list scans every element."),
    (2, "Must be usable as a dictionary key", "tuple", "hashability", "Dict keys must be hashable; tuples of hashable items qualify, lists never do."),
    (2, "A mapping where each key points at a list of values", "dict", "dict_vs_list", "Values can be anything, including lists: dict[key] = [...]."),
    (2, "You must sort it in place later", "list", "mutability", "Only lists have .sort(); tuples are immutable and sets have no order."),
    (2, "Preserve insertion order AND allow duplicates", "list", "ordering", "Sets drop duplicates and dicts need keys; a list keeps every item in order."),
    (2, "Preserve the insertion order of key/value pairs", "dict", "ordering", "Since Python 3.7 dicts remember insertion order, so iteration is predictable."),
    (2, "Remove duplicates from a sequence quickly when order does not matter", "set", "dedupe", "set(seq) deduplicates in one pass; use dict.fromkeys(seq) if order must survive."),
    (2, "Index by position AND guarantee immutability", "tuple", "mutability", "Tuples support t[i] and slicing but cannot be changed afterwards."),
    (2, "A memory-light record of a date: (year, month, day)", "tuple", "list_vs_tuple", "Tuples are smaller than lists and signal a fixed structure to readers."),
    (2, "Configuration settings looked up by name", "dict", "dict_vs_list", "Named lookup is a mapping; settings[name] reads clearly."),
    (2, "Union and intersection of two groups of users", "set", "set_vs_list", "Set algebra (|, &, -) is built in and fast; lists have no such operators."),
    (2, "Items accessed by integer position while the length changes often", "list", "list_vs_tuple", "Growing and shrinking by position is list territory."),
    (2, "Keys are strings, values can be anything", "dict", "dict_vs_list", "Heterogeneous values under string keys is exactly a dict."),
    (2, "A group of values you need to hash to cache a function result", "tuple", "hashability", "functools.lru_cache needs hashable arguments; convert a list to a tuple first."),
    (3, "Append AND pop from both ends in O(1)", "deque", "deque_vs_list", "collections.deque is a double-ended queue; list.pop(0) is O(n)."),
    (3, "An immutable set you can place inside another set", "frozenset", "frozenset_vs_set", "Set elements must be hashable; a frozenset is a hashable, immutable set."),
    (3, "A sliding window over the last 5 sensor readings", "deque", "deque_vs_list", "deque(maxlen=5) drops the oldest reading automatically when a new one arrives."),
    (3, "A bundle of permissions that must work as a dict key", "frozenset", "hashability", "A frozenset of permission names is hashable, so it can key a dict or sit in a set."),
    (3, "The frontier of a breadth-first search", "deque", "deque_vs_list", "BFS pops from the front and appends to the back; deque does both in O(1)."),
    (3, "Tags on a post that are added and removed freely", "set", "frozenset_vs_set", "A regular set is mutable: add() and discard() as tags change."),
    (3, "Constant-time membership for a collection that must never change after creation", "frozenset", "frozenset_vs_set", "frozenset gives hashed membership plus immutability."),
    (3, "Browser history where any page can be inspected by index", "list", "deque_vs_list", "Random access by index is O(1) on a list but O(n) in the middle of a deque."),
    (3, "A task queue: producers append, consumers take from the front", "deque", "deque_vs_list", "popleft() on a deque is O(1); list.pop(0) shifts every remaining element."),
    (3, "A lookup table from (row, col) pairs to values", "dict", "hashability", "The key is a tuple (row, col) and the structure is a dict keyed by it."),
    (3, "A record returned from a database row, read-only", "tuple", "list_vs_tuple", "Rows are fixed-width, immutable records: tuples (or namedtuples)."),
    (3, "Deduplicated IDs built once and shared read-only across threads", "frozenset", "frozenset_vs_set", "Immutability makes sharing safe: nobody can mutate it underneath another reader."),
    (4, "A ring buffer with a fixed capacity that drops the oldest item", "deque", "deque_vs_list", "deque(maxlen=n) is a ring buffer out of the box."),
    (4, "Variable-length ordered data you slice often", "list", "list_vs_tuple", "Slicing and in-place edits of a growing sequence point to a list."),
    (4, "Counts per key with a default of 0", "dict", "dict_get_default", "dict.get(key, 0) or a defaultdict(int) handles missing keys cleanly."),
    (4, "A collection of friend groups, where each group is itself a set", "frozenset", "frozenset_vs_set", "Inner sets must be hashable to live inside an outer set, so they become frozensets."),
    (4, "Repeatedly pop from the front of a million-item collection", "deque", "deque_vs_list", "Front pops are O(1) on a deque and O(n) on a list: a million-fold difference at scale."),
    (4, "Version numbers compared position by position: (3, 11, 2)", "tuple", "list_vs_tuple", "Tuples compare lexicographically and are immutable, perfect for versions."),
    (4, "Unique elements where you also remove items by value fast", "set", "set_vs_list", "set.discard(x) is O(1); list.remove(x) scans the list."),
    (4, "An ordered mapping iterated with .items() in insertion order", "dict", "ordering", "dicts iterate in insertion order and expose .items() for key/value pairs."),
    (4, "A fixed-size history of the last N shell commands", "deque", "deque_vs_list", "deque(maxlen=N) keeps exactly the last N commands with no manual trimming."),
    (4, "An immutable, hashable collection with duplicates removed", "frozenset", "frozenset_vs_set", "Deduplicated plus immutable plus hashable is the definition of a frozenset."),
    (4, "An append-heavy log you occasionally index", "list", "deque_vs_list", "Appends are amortised O(1) on a list and indexing is O(1); a deque indexes slowly in the middle."),
    (4, "Unique visitors per day where you also need the union across days", "set", "set_vs_list", "Sets dedupe and support | for the union of several days."),
    (5, "Add an element to the END of a growing list in O(1) amortised", "list.append", "append_vs_insert", "append writes at the end without shifting anything."),
    (5, "Add an element to the FRONT of a deque in O(1)", "deque.appendleft", "deque_vs_list", "appendleft is the deque's O(1) front insert; a list has no cheap equivalent."),
    (5, "Add a unique element, ignoring it if already present", "set.add", "set_vs_list", "set.add is idempotent: adding an existing value changes nothing."),
    (5, "Read a key but fall back to a default when it is missing", "dict.get", "dict_get_default", "dict.get(key, default) avoids KeyError and the if-in dance."),
    (5, "A membership test on a tiny collection of 3 unhashable items", "in list", "membership_cost", "With three items a linear scan is trivial, and unhashable items cannot go in a set anyway."),
    (5, "A membership test against 10 million user IDs", "in set", "membership_cost", "Hashing makes membership O(1) on average; a list would scan up to 10 million items."),
    (5, "Insert at the front of a list (every element shifts right)", "list.insert(0)", "append_vs_insert", "insert(0, x) is O(n) because all existing elements move one slot."),
    (5, "Push a task to the back of a queue kept in a plain list", "list.append", "append_vs_insert", "The back of a list is where append is cheap."),
    (5, "Keep most-recent-first order by inserting at the front of a deque", "deque.appendleft", "deque_vs_list", "appendleft puts the newest item first in O(1)."),
    (5, "Check whether a list (unhashable) is one of a few stored lists", "in list", "hashability", "Lists cannot be set members, so a short linear scan is the right tool."),
    (5, "Increment counts[word] safely when the key may not exist yet", "dict.get", "dict_get_default", "counts[word] = counts.get(word, 0) + 1 handles first sightings."),
    (5, "Dedupe a stream one item at a time", "set.add", "dedupe", "Add each item to a set as it arrives; repeats are absorbed."),
    (5, "Check whether a username is already taken, O(1) average", "in set", "membership_cost", "Usernames are hashable strings; a set answers membership in constant time."),
    (6, "Append a reading to the end of a plain list", "list.append", "append_vs_insert", "Appending to the end is the cheap list operation."),
    (6, "Front insertion when the collection is already a deque", "deque.appendleft", "deque_vs_list", "deque exists for exactly this: cheap inserts at both ends."),
    (6, "Prepend to a list of 10 items, readability over speed", "list.insert(0)", "append_vs_insert", "For tiny lists the O(n) shift is negligible and insert(0, x) reads clearly."),
    (6, "Read the theme setting with a fallback of light", "dict.get", "dict_get_default", "settings.get(key, default) returns the fallback instead of raising."),
    (6, "Membership in an ordered sequence where order matters and items repeat", "in list", "set_vs_list", "A list preserves order and duplicates; membership is a scan, which is fine when the list is small."),
    (6, "Add a value to a hash set", "set.add", "set_vs_list", "set.add is the hash-set insert."),
    (6, "Which operation is O(n) because every element shifts right?", "list.insert(0)", "append_vs_insert", "insert at index 0 moves all n elements; append does not."),
    (6, "Which operation makes a sliding window's front insertion O(1)?", "deque.appendleft", "deque_vs_list", "deque.appendleft is constant time; list.insert(0) is linear."),
    (6, "Test membership where the items are unhashable dicts", "in list", "hashability", "dicts cannot be hashed, so a set is impossible; scan the list."),
    (6, "Test membership in O(1) average over a large collection of strings", "in set", "membership_cost", "Strings hash well; a set gives constant-time membership."),
    (6, "Push onto a stack implemented with a list", "list.append", "append_vs_insert", "A list stack pushes with append and pops with pop(), both at the end."),
    (6, "Fetch an optional config value or None without a KeyError", "dict.get", "dict_get_default", "dict.get(key) returns None when the key is missing."),
    (6, "Which membership test is the wrong choice for a million hashable IDs?", "in list", "membership_cost", "A list scans linearly; for a million hashable IDs a set is the right tool, which is why this card is the trap."),
]


def build_items() -> list:
    items = []
    for level, text, answer, mc, why in CARDS:
        assert answer in BINS[level], (text, answer)
        topic = TOPIC[answer]
        items.append({"id": "ss_%d_%s" % (level, hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]), "level": level,
                      "topic": topic, "kind": "bin", "prompt": {"text": text}, "choices": BINS[level], "answer": answer,
                      "misconception": mc, "why": why, "lesson_id": LESSON[topic]})
    return items
