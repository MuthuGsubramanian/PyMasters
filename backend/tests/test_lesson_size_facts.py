"""Factual checks for the bge-small and Chronos lessons.

bge-small-en-v1.5 has about 33M parameters (about 130 MB in fp32), not 33 MB.
The chronos2_* lessons load amazon/chronos-t5-small (original Chronos), so
their text must say so.
"""
import json
import re
from pathlib import Path

LESSONS = Path(__file__).resolve().parent.parent / "lessons" / "ai_engineering"
BGE = [
    "bge_small_compact_embeddings.json",
    "bge_small_en_v15_edge_device_embeddings.json",
]
BAD_SIZE = re.compile(r"\b(33|9) ?MB\b", re.I)


def _load(name):
    return json.loads((LESSONS / name).read_text(encoding="utf-8"))


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _strings(v)


def test_bge_has_no_wrong_mb_size():
    for name in BGE:
        for s in _strings(_load(name)):
            assert not BAD_SIZE.search(s), f"{name}: wrong size claim in: {s[:120]!r}"


def test_bge_small_mentions_33m_parameters():
    for name in BGE:
        text = "\n".join(_strings(_load(name)))
        assert re.search(r"33M\b", text),f"{name} should state 33M parameters"


def test_bge_does_not_claim_smaller_than_minilm():
    for name in BGE:
        text = "\n".join(_strings(_load(name)))
        assert "less than half the size of MiniLM" not in text


def test_chronos_lessons_name_the_model_they_load():
    paths = sorted(LESSONS.glob("chronos2_*.json"))
    assert paths
    for p in paths:
        data = json.loads(p.read_text(encoding="utf-8"))
        strings = list(_strings(data))
        code = "\n".join(s for s in strings if "from_pretrained" in s)
        if "chronos-t5" in code:
            # the story holds code blocks too, so look for the explanatory sentence
            story = data["story_variants"]["en"]
            assert re.search(r"original Chronos[^.]*chronos-t5|chronos-t5[^.]*original Chronos",
                             story, re.S), f"{p.name}: story must say it uses original Chronos (chronos-t5)"
