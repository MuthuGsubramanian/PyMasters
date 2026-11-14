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
    try:
        from socialbot.publish import drive
        if drive.is_authorised():
            drive.sync_item(store.get_item(item_id))
    except Exception as e:
        log.warning("drive sync skipped for #%s: %s", item_id, e)
    return item_id


def produce_influencer(lesson_key=None, bilingual_hook=False, presenter_mp4=None):
    """Run the 4-stage human-influencer explainer pipeline:
    1) Script synthesis (Vaathiyaar conversational script)
    2) Presenter video via pluggable avatar API (or provided presenter_mp4)
    3) Headless Playwright 1080p60 'Watch It Run' code B-roll capture
    4) FFmpeg presenter+PiP + dynamic ASS captions + -14 LUFS loudness composite + Drive sync.
    """
    from socialbot import avatar, broll_capture
    from socialbot.render import influencer

    if lesson_key:
        les = next((l for l in sources.candidates() if l["key"] == lesson_key), None)
        if not les:
            raise ValueError(f"unknown lesson {lesson_key}")
    else:
        picks = sources.pick("long", 1)
        if not picks:
            raise RuntimeError("no fresh lesson material left for influencer")
        les = picks[0]

    plan = influencer.synthesize_influencer_script(les, bilingual_hook=bilingual_hook)
    item_id = store.add_item("influencer", les["key"], plan["title"], "drafted", draft=plan)
    out_dir = config.RENDERS_DIR / f"{datetime.now():%Y%m%d}-influencer-{item_id}"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        broll_path = out_dir / "broll_1080p60.mp4"
        broll_capture.capture_watch_it_run_broll(
            title=plan["title"],
            code_lines=plan["code_lines"],
            steps=plan["trace_steps"],
            out_mp4=broll_path,
            duration_s=12.0,
            stdout_text=plan["stdout_text"],
            caption=plan["segments"][2]["narration"][:140],
        )

        pres_path = Path(presenter_mp4) if presenter_mp4 else (out_dir / "presenter.mp4")
        avatar_meta = {}
        if not pres_path.exists():
            res = avatar.render_talking_head(
                plan["script_text"],
                pres_path,
                title=plan["title"],
            )
            avatar_meta = {"provider": res.provider, "job_id": res.job_id}

        ass_path = influencer.generate_ass_subtitles(plan["segments"], out_dir / "captions.ass")
        final_mp4 = influencer.composite_influencer_video(
            presenter_mp4=pres_path,
            broll_mp4=broll_path,
            segments=plan["segments"],
            out_mp4=out_dir / "influencer.mp4",
            subtitle_ass=ass_path,
        )
        thumb = video.thumbnail(
            plan["title"],
            les["title"][:34],
            "\n".join(plan["code_lines"]),
            out_dir / "thumb.jpg",
        )
        media = {
            "video": str(final_mp4),
            "broll": str(broll_path),
            "subtitles": str(ass_path),
            "thumbnail": str(thumb),
            "lesson_url": les["url"],
            "avatar": avatar_meta,
        }
        store.update_item(item_id, status="rendered", media=media)
    except Exception as exc:
        log.exception("influencer render failed")
        store.update_item(item_id, status="failed", error=f"influencer: {exc}"[:500])
        return item_id

    try:
        from socialbot.publish import drive
        if drive.is_authorised():
            drive.sync_item(store.get_item(item_id))
    except Exception as e:
        log.warning("drive sync skipped for influencer #%s: %s", item_id, e)
    return item_id
