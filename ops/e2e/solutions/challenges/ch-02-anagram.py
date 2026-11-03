from collections import defaultdict


def _key(s: str) -> str:
    return "".join(sorted(c for c in s.lower() if c.isalnum()))


def is_anagram(s1: str, s2: str) -> bool:
    return _key(s1) == _key(s2)


def group_anagrams(words: list[str]) -> list[list[str]]:
    groups = defaultdict(list)
    for w in words:
        groups[_key(w)].append(w)
    return list(groups.values())
