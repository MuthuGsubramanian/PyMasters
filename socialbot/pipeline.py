"""Produce one piece of content end to end: pick lesson -> write -> gate (rewrite up to MAX_ATTEMPTS) -> render."""
import logging
from datetime import datetime
from pathlib import Path

from socialbot import briefs, config, llm, quality, sources, store
from socialbot.render import video

log = logging.getLogger("socialbot")

WRITERS = {
    "short": (briefs.short_prompt, briefs.SHORT_SCHEMA),
    "long": (briefs.long_prompt, briefs.LONG_SCHEMA),
    "linkedin": (briefs.linkedin_prompt, briefs.LINKEDIN_SCHEMA),
}


def write_until_good(kind, les):
    prompt_fn, schema = WRITERS[kind]
    feedback, cost, last, best = None, 0.0, None, None
    for attempt in range(1, config.MAX_ATTEMPTS + 1):
        draft = llm.ask_json(prompt_fn(les, feedback, last[0] if last else None), schema, system=briefs.BRAND)
        cost += draft.pop("_cost_usd", 0) or 0
        ok, score, crit, problems = quality.verdict(kind, draft, les)
        cost += crit.pop("_cost_usd", 0) or 0
        log.info("%s %s attempt %d: score %.1f, %d problems", kind, les["key"], attempt, score, len(problems))
        last = (draft, score, crit, problems)
        if ok:
            return True, draft, score, crit, [], cost
        hard = sum(1 for p in problems if not p.startswith("polish:"))
        if best is None or (hard, -score) < (best[4], -best[1]):
            best = (draft, score, crit, problems, hard)
        feedback = problems[:12]
    draft, score, crit, problems, _ = best
    return False, draft, score, crit, problems, cost


def _segments_short(d):
    segs = [{"narration": d["hook"], "visual": {"type": "title", "heading": d["title"]}}]
    segs += [{"narration": s["narration"], "visual": s["visual"]} for s in d["scenes"]]
    segs.append({"narration": d["cta"], "visual": {"type": "reveal", "big": "pymasters.net",
                                                   "sub": "Full interactive lesson, free"}})
    return segs


def _segments_long(d):
    segs = [{"narration": d["hook"], "visual": {"type": "title", "heading": d["title"], "sub": "PyMasters tutorial"},
             "chapter": "Intro"}]
    for ch in d["chapters"]:
        for i, s in enumerate(ch["scenes"]):
            segs.append({"narration": s["narration"], "visual": s["visual"], "chapter": ch["title"] if i == 0 else None})
    segs.append({"narration": d["cta"], "visual": {"type": "reveal", "big": "pymasters.net",
                                                   "sub": "Practice this lesson interactively, free"},
                 "chapter": "Next steps"})
    return segs


def _first_code(d):
    scenes = d.get("scenes") or [s for ch in d.get("chapters") or [] for s in ch["scenes"]]
    return next((s["visual"].get("code") for s in scenes if s["visual"].get("type") == "code" and s["visual"].get("code")), "")


def _fmt_ts(s):
    s = int(s)
    return f"{s // 60}:{s % 60:02d}"


def render(kind, draft, les, out_dir: Path):
    if kind == "linkedin":
        return video.render_loop(draft["animation"], out_dir)
    if kind == "short":
        media = video.render_narrated(_segments_short(draft), out_dir, 1080, 1920, captions=True)
    else:
        media = video.render_narrated(_segments_long(draft), out_dir, 1920, 1080, captions=True)
        media["chapters_text"] = "\n".join(f"{_fmt_ts(t)} {title}" for t, title in media["chapters"])
    media["thumbnail"] = video.thumbnail(draft.get("thumbnail_text") or draft["title"], les["title"][:34],
                                         _first_code(draft), out_dir / "thumb.jpg")
    return media


def produce(kind, lesson_key=None):
    """Make one item. Returns the item id (status 'rendered' on success, 'rejected' if the gate never passed)."""
    if lesson_key:
        les = next((l for l in sources.candidates() if l["key"] == lesson_key), None)
        if not les:
            raise ValueError(f"unknown lesson {lesson_key}")
    else:
        picks = sources.pick(kind, 1)
        if not picks:
            raise RuntimeError("no fresh lesson material left for " + kind)
        les = picks[0]
    try:
        ok, draft, score, crit, problems, cost = write_until_good(kind, les)
    except llm.LLMError as e:
        return store.add_item(kind, les["key"], les["title"], "failed", error=str(e)[:500])
    if not ok:
        log.warning("%s %s rejected after %d attempts: %s", kind, les["key"], config.MAX_ATTEMPTS, problems[:3])
        return store.add_item(kind, les["key"], les["title"], "rejected", score=score, draft=draft, critique=crit,
                              error="; ".join(problems)[:1000], cost_usd=cost)
    item_id = store.add_item(kind, les["key"], les["title"], "drafted", score=score, draft=draft, critique=crit,
                             cost_usd=cost)
    out_dir = config.RENDERS_DIR / f"{datetime.now():%Y%m%d}-{kind}-{item_id}"
    try:
        media = render(kind, draft, les, out_dir)
    except Exception as e:  # rendering bugs must not publish anything
        log.exception("render failed")
        store.update_item(item_id, status="failed", error=f"render: {e}"[:500])
        return item_id
    media["lesson_url"] = les["url"]
    store.update_item(item_id, status="rendered", media=media)
    return item_id
