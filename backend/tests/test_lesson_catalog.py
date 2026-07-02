"""
Catalog integrity guard (added 2026-07-02 after the oop_* duplicate cleanup).

The lesson loader (`_load_lesson_from_dir`) searches track directories in
sorted order and returns the FIRST file matching `<lesson_id>.json`. If two
tracks ship the same lesson id, one silently shadows the other: the catalog
shows two cards, but both serve the alphabetically-first track's content (and
its xp_reward). This actually happened — python_intermediate carried shadowed
copies of oop_composition / oop_inheritance / oop_magic_methods for months.

These tests run in CI's pre-deploy gate, so a regression can never reach prod.
"""
import json
import os
from pathlib import Path

LESSONS_DIR = Path(__file__).resolve().parent.parent / "lessons"


def _iter_lessons():
    for track_dir in sorted(LESSONS_DIR.iterdir()):
        if not track_dir.is_dir() or track_dir.name == "__pycache__":
            continue
        for f in sorted(track_dir.glob("*.json")):
            if f.name == "schema.json":
                continue
            yield f


def test_all_lessons_parse():
    broken = []
    for f in _iter_lessons():
        try:
            json.load(open(f, encoding="utf-8"))
        except Exception as exc:
            broken.append(f"{f.parent.name}/{f.name}: {exc}")
    assert not broken, f"Unparseable lesson files: {broken}"


def test_lesson_ids_unique_across_tracks():
    seen = {}
    dupes = []
    for f in _iter_lessons():
        data = json.load(open(f, encoding="utf-8"))
        lid = data.get("id", f.stem)
        key = f"{f.parent.name}/{f.name}"
        if lid in seen:
            dupes.append(f"id '{lid}' in both {seen[lid]} and {key}")
        else:
            seen[lid] = key
    assert not dupes, (
        "Duplicate lesson ids shadow each other in the loader: " + "; ".join(dupes)
    )


def test_core_fields_present():
    problems = []
    for f in _iter_lessons():
        data = json.load(open(f, encoding="utf-8"))
        for field in ("id", "track", "title", "story_variants"):
            if not data.get(field):
                problems.append(f"{f.parent.name}/{f.name}: missing {field}")
        if isinstance(data.get("title"), dict) and not data["title"].get("en"):
            problems.append(f"{f.parent.name}/{f.name}: title.en empty")
    assert not problems, f"Lessons missing core fields: {problems}"


def test_next_unlock_targets_exist():
    ids = set()
    refs = []
    for f in _iter_lessons():
        data = json.load(open(f, encoding="utf-8"))
        ids.add(data.get("id", f.stem))
        nu = data.get("next_unlock")
        if nu:
            refs.append((f"{f.parent.name}/{f.name}", nu))
    # Generated-at-runtime lessons live in the DB, not on disk; on-disk chains
    # must resolve on disk.
    dangling = [f"{src} -> {tgt}" for src, tgt in refs if tgt not in ids]
    assert not dangling, f"next_unlock points at missing lessons: {dangling}"
