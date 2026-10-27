"""Question pools for the arcade: choice-style items from every verified bank, filtered to the
topics a learner has completed. Free-text Output Oracle items are replaced by their choice twins."""
import random
from functools import lru_cache

from arcade.unlocks import CHOICE_KINDS, _bank_items


@lru_cache(maxsize=None)
def _choice_items() -> tuple:
    items = _bank_items()
    twinned = {i["source_id"] for i in items if i.get("source_id")}
    out = []
    for it in items:
        if it.get("kind") not in CHOICE_KINDS:
            continue
        if it["id"] in twinned:
            continue
        out.append(it)
    return tuple(out)


def candidate_items(topics, exclude_ids=frozenset(), expressions_only: bool = False, kinds=None) -> list:
    topics = set(topics)
    out = []
    for it in _choice_items():
        if it.get("topic") not in topics or it["id"] in exclude_ids:
            continue
        if expressions_only and not it["id"].startswith("ex_"):
            continue
        if kinds and it.get("kind") not in kinds:
            continue
        out.append(it)
    return out


def pool_count(topics, expressions_only: bool = False, kinds=None) -> int:
    return len(candidate_items(topics, expressions_only=expressions_only, kinds=kinds))


def pick(topics, seed: int, n: int, exclude_ids=frozenset(), expressions_only: bool = False, kinds=None, prefer_topics=None) -> list:
    """Seeded sample across levels (easier items first in the deal order so games ramp up).
    `prefer_topics` items are dealt first; the rest of the learner's pool fills the gap."""
    cands = candidate_items(topics, exclude_ids, expressions_only, kinds)
    rng = random.Random(seed)
    rng.shuffle(cands)
    if prefer_topics:
        pref = set(prefer_topics)
        cands.sort(key=lambda i: 0 if i.get("topic") in pref else 1)
    chosen = cands[:n]
    chosen.sort(key=lambda i: (int(i.get("level") or 1), rng.random()))
    return chosen
