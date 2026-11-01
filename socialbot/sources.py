"""Source material: real PyMasters lessons (explanations, tables, runnable code, practice tasks).

The old pipeline fed the writer one trending item a day whose 'description' was often just a tag
list, so scripts had nothing concrete to explain. Every piece of content here is built from a full
lesson, and links back to it."""
import glob
import json
import random
import re
from datetime import date

from socialbot import config, store

# What the channel's own numbers say works: specific, practical, intermediate Python + AI engineering
# (RAG 266 views, GIL 155, list comprehensions 60, agents 37) — vs. 1-5 views for kiddy metaphors.
TRACK_WEIGHT = {
    "python_internals": 3.0, "ai_engineering": 3.0, "async_concurrency": 2.5, "performance_optimization": 2.5,
    "python_intermediate": 2.5, "python_modern": 2.5, "ai_agents": 2.5, "transformers_scratch": 2.5,
    "functional_python": 2.0, "debugging_mastery": 2.0, "error_handling": 1.5, "regex_mastery": 1.5,
    "testing_devops": 1.5, "working_with_data": 2.0, "machine_learning": 2.0, "deep_learning_complete": 2.0,
    "deep_learning": 1.5, "dsa": 2.0, "trending_ai": 2.0, "vibe_coding": 1.5, "fun_automation": 1.5,
    "web_development": 1.5, "python_fundamentals": 1.0, "ai_fundamentals": 1.0, "ai_ml_foundations": 1.0,
}
CODE_RE = re.compile(r"```python\n(.*?)```", re.S)


def _lesson_files():
    return sorted(glob.glob(str(config.LESSONS_DIR / "*" / "*.json")))


def load_lesson(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    story = (d.get("story_variants") or {}).get("en") or ""
    title = d.get("title")
    title = title.get("en") if isinstance(title, dict) else title
    desc = d.get("description")
    desc = desc.get("en") if isinstance(desc, dict) else desc
    challenges = []
    for ch in d.get("practice_challenges") or []:
        ins = ch.get("instruction")
        challenges.append({"instruction": ins.get("en") if isinstance(ins, dict) else ins,
                           "expected_output": ch.get("expected_output")})
    track = d.get("track") or path.split("/")[-2]
    return {
        "key": f"lesson:{track}/{d.get('id')}",
        "id": d.get("id"), "track": track, "title": title or d.get("id"), "description": desc or "",
        "topic": d.get("topic") or "", "story": story, "code_blocks": CODE_RE.findall(story),
        "challenges": challenges[:3],
        "difficulty": (d.get("tags") or {}).get("difficulty", ""),
        "concepts": (d.get("tags") or {}).get("concepts_taught", []),
        "url": f"{config.SITE}/dashboard/classroom/{d.get('id')}",
    }


def candidates() -> list:
    out = []
    for p in _lesson_files():
        try:
            les = load_lesson(p)
        except Exception:
            continue
        # Only lessons with real substance: a proper explanation and at least one runnable code block.
        if len(les["story"]) < 700 or not les["code_blocks"]:
            continue
        out.append(les)
    return out


def _tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 2}


def pick(kind: str, n: int = 1, seed=None) -> list:
    """Weighted pick of lessons not used for this kind recently and not too close to recent topics."""
    used = store.recently_used_sources()
    recent = [_tokens(t) for t in store.recent_topics()]
    rng = random.Random(seed if seed is not None else f"{date.today().isoformat()}:{kind}")
    pool = []
    for les in candidates():
        if (les["key"], kind) in used:
            continue
        tk = _tokens(les["title"] + " " + les["topic"])
        if any(len(tk & r) / max(1, len(tk | r)) > 0.5 for r in recent):
            continue
        w = TRACK_WEIGHT.get(les["track"], 1.0)
        if kind == "long":
            w *= 1.0 + min(len(les["story"]), 6000) / 6000  # long-form wants the deepest lessons
        pool.append((w, les))
    chosen = []
    while pool and len(chosen) < n:
        total = sum(w for w, _ in pool)
        r, acc = rng.random() * total, 0.0
        for i, (w, les) in enumerate(pool):
            acc += w
            if acc >= r:
                chosen.append(les)
                pool.pop(i)
                break
    return chosen
