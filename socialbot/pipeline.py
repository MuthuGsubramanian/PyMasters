"""Produce one piece of content end to end: pick lesson -> write -> gate (rewrite up to MAX_ATTEMPTS) -> render."""
import logging
import random
from datetime import datetime
from pathlib import Path

from socialbot import briefs, config, llm, quality, sources, store
from socialbot.render import video

log = logging.getLogger("socialbot")

WRITERS = {
    "short": (briefs.short_prompt, briefs.SHORT_SCHEMA),
    "long": (briefs.long_prompt, briefs.LONG_SCHEMA),
    "linkedin": (briefs.linkedin_prompt, briefs.LINKEDIN_SCHEMA),
    "thematic": (briefs.thematic_prompt, briefs.LINKEDIN_SCHEMA),
}


def linkedin_style(rng=random):
    """LinkedIn alternates and rotates randomly between Business-Audience (Simple Terms) formats and Technical-Detail
    formats without ever repeating the previous post's format (owner, 2026-11-10)."""
    styles = list(config.LINKEDIN_STYLES)
    last_variety = None
    try:
        for it in store.items(kind="linkedin", limit=5):
            if it.get("status") not in ("rejected", "failed") and isinstance(it.get("draft"), dict):
                last_variety = it["draft"].get("format_variety") or it["draft"].get("style")
                if last_variety in styles:
                    break
    except Exception:
        pass
    if last_variety in config.LINKEDIN_BUSINESS_STYLES:
        pool = list(config.LINKEDIN_TECH_STYLES)
    elif last_variety in config.LINKEDIN_TECH_STYLES:
        pool = list(config.LINKEDIN_BUSINESS_STYLES)
    else:
        pool = [s for s in styles if s != last_variety] or styles
    return rng.choice(pool)


def write_until_good(kind, les):
    prompt_fn, schema = WRITERS[kind]
    if kind == "thematic":
        style, variety = "thematic", "thematic"
    elif kind == "linkedin":
        variety = linkedin_style()
        if les.get("is_thematic"):
            style = "thematic"
        elif les.get("is_hf_space"):
            style = "hf_space"
        elif les.get("is_daily_trend"):
            style = "trend"
        else:
            style = variety
    else:
        style, variety = None, None
    feedback, cost, last, best = None, 0.0, None, None
    for attempt in range(1, config.MAX_ATTEMPTS + 1):
        previous = last[0] if last else None
        prompt = prompt_fn(les, feedback, previous, style=style, sub_style=variety) if style else prompt_fn(les, feedback, previous)
        draft = llm.ask_json(prompt, schema, system=briefs.BRAND)
        if style:
            draft["style"] = style   # the critic judges each format by its own rules
            draft["format_variety"] = variety
        if les.get("is_hf_space"):
            draft["is_hf_space"] = True
            draft["space_url"] = les.get("space_url", "")
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
    if kind in ("linkedin", "thematic"):
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
    if les.get("space_url"):
        media["space_url"] = les["space_url"]
    store.update_item(item_id, status="rendered", media=media)
    return item_id
