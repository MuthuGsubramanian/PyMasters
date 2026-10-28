"""Stack Explainer — structured content for the animated LinkedIn explainer post.

Turns any topic into a numbered "tiered funnel" explainer: a title, 5-7 ordered
tiers (each with an emoji icon, a short colored chip label, and a 1-2 line
concrete description), and a closing takeaway. This is the content model the
animated renderer (stack_render.py) draws.

Visual direction (founder-supplied references, 2026-10-28 — real LinkedIn
infographic posts): clean WHITE background, one bold color per tier, a round
icon, a short colored chip/label, and a tight 1-2 line description per tier —
NOT a dark tech-brand card and NOT a wall of loose tag badges. See
stack_render.py for the layout this content feeds.

Deliberately topic-general (not the fixed 12-topic set explored in Claude
Design) so it can run on whatever topic the daily social job picks (a Fresh
lesson, an arcade spotlight, a learner insight, or a pipeline discovery).

Quality bar (founder directive, 2026-10-28): every tier's description must be
concrete and specific — real tool/library names, real numbers, real
comparisons — never generic filler. validate_stack() enforces this
structurally; BANNED_PHRASES rejects hype language. A stack that fails
validation is NOT patched up with a generic template (unlike the video/lesson
generators) — it is dropped, and the caller falls back to the plain banner
post. A generic animated explainer is worse than no animation.
"""

import json
import re

from pipeline.utils.claude import ask_claude_json
from pipeline.video.generate_videos import _fix_text
from pipeline.utils.logger import get_logger

log = get_logger("actor.stack_explainer")

MIN_LAYERS = 5
MAX_LAYERS = 7

# One accent color per tier, cycled in order (hex, on-brand-adjacent but varied
# like the reference posts — each tier gets its own color, unlike the single
# violet/cyan PyMasters video brand).
TIER_COLORS = [
    "#2563eb",  # blue
    "#f97316",  # orange
    "#7c3aed",  # violet
    "#dc2626",  # red
    "#16a34a",  # green
    "#0891b2",  # cyan
    "#db2777",  # pink
]

BANNED_PHRASES = [
    "game changer", "game-changer", "unlock your potential", "10x your",
    "in today's fast-paced world", "let that sink in", "buckle up",
    "revolutionize", "paradigm shift", "cutting-edge", "next-level",
]

STACK_PROMPT = """You are the content designer for PyMasters (pymasters.net), writing the
content for a short animated LinkedIn explainer post — a numbered tiered-funnel diagram
in the style of the best "X vs Y vs Z, explained" LinkedIn infographics: clean white
background, one bold color per tier, a round icon, a short chip label, and a tight
1-2 line description per tier. Dense and concrete, never a wall of buzzwords.

Topic: {topic}
Context: {context}

Write the explainer as {n_layers} ordered tiers that build up this topic step by step
for a Python/AI developer audience. Requirements for EVERY tier:
- "chip": 1-4 words for the tier's colored label chip (e.g. "LLM", "+ RAG", "+ Tool Calling").
- "icon": ONE emoji that visually represents the tier (e.g. a brain, a database, a wrench).
- "description": 1-2 short sentences (<=130 characters total) with a concrete fact, number,
  or comparison a developer would actually learn — never filler like "this is important".

Also write:
- "title": a specific, concrete headline (not generic, not clickbait) — max 60 characters.
- "subtitle": one sentence grounding the topic in a real scenario or comparison — max 140 chars.
- "takeaway": one practical, specific closing sentence a developer can act on — max 120 chars.
- "hashtags": exactly 3 relevant hashtags (with #), e.g. "#Python #RAG #MachineLearning".

Never use any of these banned phrases or their close variants: {banned}.
Be precise and specific throughout — this must read like an engineer's own notes, not
marketing copy.

Return ONLY a JSON object:
{{
  "title": "...",
  "subtitle": "...",
  "layers": [
    {{"chip": "...", "icon": "...", "description": "..."}}
  ],
  "takeaway": "...",
  "hashtags": "#... #... #..."
}}"""


def _has_banned_phrase(text: str) -> str | None:
    low = text.lower()
    for phrase in BANNED_PHRASES:
        if phrase in low:
            return phrase
    return None


def validate_stack(stack: dict) -> tuple[bool, str | None]:
    """Structural + quality gate. Returns (ok, reason) — reason is None iff ok."""
    if not isinstance(stack, dict):
        return False, "not a dict"

    title = str(stack.get("title", "")).strip()
    subtitle = str(stack.get("subtitle", "")).strip()
    takeaway = str(stack.get("takeaway", "")).strip()
    hashtags = str(stack.get("hashtags", "")).strip()
    layers = stack.get("layers")

    if not title or len(title) > 80:
        return False, "title missing or too long"
    if not subtitle or len(subtitle) > 180:
        return False, "subtitle missing or too long"
    if not takeaway:
        return False, "takeaway missing"
    if hashtags.count("#") != 3:
        return False, "hashtags must be exactly 3"
    if not isinstance(layers, list) or not (MIN_LAYERS <= len(layers) <= MAX_LAYERS):
        return False, f"layers must be a list of {MIN_LAYERS}-{MAX_LAYERS}"

    all_text = [title, subtitle, takeaway]
    for i, layer in enumerate(layers):
        if not isinstance(layer, dict):
            return False, f"layer {i} is not a dict"
        chip = str(layer.get("chip", "")).strip()
        icon = str(layer.get("icon", "")).strip()
        description = str(layer.get("description", "")).strip()
        if not chip or len(chip) > 28:
            return False, f"layer {i} chip missing/too long"
        if not icon or len(icon) > 8:  # a few code points for a single emoji + variation selector
            return False, f"layer {i} icon missing/too long"
        if not description or len(description) > 150:
            return False, f"layer {i} description missing/too long"
        all_text.extend([chip, description])

    # mojibake check (same signal as content_job.qa_check)
    joined = " ".join(all_text)
    if re.search(r"â€|Ã©|Ã¨|Ã¢", joined):
        return False, "mojibake detected"

    banned_hit = _has_banned_phrase(joined)
    if banned_hit:
        return False, f"banned phrase: {banned_hit!r}"

    return True, None


def _clean_stack(raw: dict) -> dict:
    """Apply mojibake repair to every text field (mirrors generate_videos._fix_text)."""
    def fix(v):
        if isinstance(v, str):
            return _fix_text(v).strip()
        if isinstance(v, list):
            return [fix(x) for x in v]
        if isinstance(v, dict):
            return {k: fix(x) for k, x in v.items()}
        return v
    return fix(raw)


def generate_stack(topic: str, context: str = "", n_layers: int = 6) -> dict | None:
    """Generate a validated stack-explainer spec for `topic`, or None on failure.

    Unlike the video/lesson generators, there is NO generic template fallback
    here: a structurally-valid-but-generic stack is worse than no animation
    for this format, so any failure (LLM error, validation failure) returns
    None and the caller uses the existing static banner post instead.
    """
    n_layers = max(MIN_LAYERS, min(MAX_LAYERS, n_layers))
    try:
        raw = ask_claude_json(STACK_PROMPT.format(
            topic=topic, context=context or "(no extra context)",
            n_layers=n_layers, banned=", ".join(BANNED_PHRASES),
        ))
    except Exception as e:
        log.error(f"Stack generation LLM call failed: {e}")
        return None

    stack = _clean_stack(raw)
    ok, reason = validate_stack(stack)
    if not ok:
        log.error(f"Stack generation rejected by QA gate: {reason} — topic={topic!r}")
        return None
    for i, layer in enumerate(stack["layers"]):
        layer["number"] = i + 1
        layer["color"] = TIER_COLORS[i % len(TIER_COLORS)]
    log.info(f"Stack explainer generated: {stack['title']!r} ({len(stack['layers'])} layers)")
    return stack


if __name__ == "__main__":
    demo = generate_stack(
        "Sentence embeddings with all-MiniLM-L6-v2",
        context="Fast local semantic search with a 22M-param model, used as the default encoder in many RAG pipelines.",
    )
    print(json.dumps(demo, indent=2) if demo else "FAILED")
