"""Writing briefs and JSON schemas: one clear brief per format, plus the critic's rubric."""
import json

BRAND = """You write for PyMasters (https://pymasters.net), an interactive engineering & AI learning platform whose signature superpower is DEMYSTIFYING GENUINELY COMPLEX TOPICS into crystal-clear intuition.
Voice: a strictly professional, authoritative, warm principal-engineer mentor speaking in crystal-clear everyday English. Think 3Blue1Brown / ByteByteGo clarity: the SUBJECT MATTER is genuinely advanced and complex, while the EXPLANATION is effortless to grasp.
Hard rules:
- COMPLEX SUBJECT, CRYSTAL-CLEAR EXPLANATION (NEVER BASIC TASKS IN A BASIC WAY):
  1. NEVER dumb down the topic itself into elementary programming tasks, basic syntax, or Grade-3 toy arithmetic (strictly ban "add up an invoice", "1 box = 10, 2 boxes = 13", basic list sums, or intro definitions).
  2. ALWAYS spotlight the real, non-trivial engineering / AI / systems mechanism at the heart of the material (e.g., Speculative Decoding draft-and-verify, Transformer Q·K Self-Attention, KV-Cache memory scaling, Reciprocal Rank Fusion, Python Event-Loop scheduling, LoRA low-rank matrices, Idempotency keys, Ebbinghaus agent memory pruning).
  3. Name the real technical concept clearly AND translate what it does immediately in 5-8 plain everyday words using ONE sharp, grown-up operational mental model (e.g., a junior drafter sketching 4 words while a senior editor verifies all 4 in one pass; an airport fast-track lane; a bank idempotency ledger).
- NEVER USE HINDI WORDS: Write in plain, clear English (Tamil greeting words like "Vanakkam", "nanba", "nanbis", "Vaathiyaar" are permitted where specified, but Hindi words and Hinglish are strictly banned—never use "chai", "samosa", "tapri", "roti", "jugaad", "namaste", "paisa", "lakh", "crore", "bhaiya", "yaar", "desi", "bazaar", "mandi", "kirana", "dabba", "tiffin", or any Devanagari script).
- Strictly professional tone: never use casual, whimsical, or consumer-trivia scenarios (no restaurant bills, tea/coffee rotas, sports fixtures, superhero/movie/kid metaphors, or playful banter).
- Ground every claim in real Python 3.11 behavior and exact numbers from the material. Never invent APIs or numbers.
- No hype or filler: never use "game-changer", "unlock", "supercharge", "dive in", "delve", "in today's world",
  "revolutionize", "level up", "mind-blowing", "secret", "hack" (as in trick), or rhetorical "Ever wondered...?".
- Every post and description MUST include a link to https://pymasters.net (and every LinkedIn post must mention @PyMasters so the company page is tagged).
- Never present code as "from the lesson" unless it is verbatim; every snippet must run on its own as shown.
- Every visual must show exactly what it claims (plots plot real functions, traces show values only after the line runs).
The editor scores BOTH `topic_depth` (is the underlying concept genuinely complex & non-trivial?) AND `simplicity` (is that complex mechanism made crystal-clear?); 8/10 is the bar, and basic/toy tasks get rejected immediately."""


def material_block(les: dict) -> str:
    d = {
        "lesson_title": les["title"], "track": les["track"], "difficulty": les["difficulty"],
        "summary": les["description"], "concepts": les["concepts"],
        "lesson_text": les["story"][:9000], "practice": les["challenges"], "lesson_url": les["url"],
    }
    if les.get("space_url"):
        d["space_url"] = les["space_url"]
        d["live_app_url"] = les.get("live_url", "")
    if les.get("is_daily_trend"):
        d["pillar"] = les.get("pillar_label", "")
        d["live_trend_signal"] = les.get("live_headline", "")
    return json.dumps(d, ensure_ascii=False, indent=1)


METRIC_ITEM = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "description": "<= 28 chars KPI or metric name"},
        "value": {"type": "string", "description": "<= 16 chars bold number/stat, e.g. '35 ms', '+170 bps', '2.4x'"},
        "sub": {"type": "string", "description": "<= 42 chars plain-English context"},
    },
    "required": ["label", "value"],
}

VISUAL = {
    "type": "object",
    "properties": {
        "type": {
            "type": "string",
            "enum": ["title", "code", "trace", "flow", "timeline", "compare", "plot", "metric", "bullets", "output", "reveal"],
            "description": (
                "Choose varied, self-explanatory visual types across scenes: "
                "flow = architecture/pipeline diagram with boxes & arrows lighting up; "
                "compare = Before vs After or Naive vs Production side-by-side; "
                "metric = 2-3 bold KPI/stat cards; "
                "trace = live code + step-by-step variables panel; "
                "code = syntax-highlighted Python + terminal output; "
                "timeline = parallel latency/stage lanes; "
                "plot = mathematical/risk curve with threshold & markers; "
                "reveal = big punchline statement."
            ),
        },
        "step_badge": {"type": "string", "description": "<= 24 chars story-arc pill shown at top, e.g. '1 · THE PROBLEM', '2 · HOW IT WORKS', '3 · LIVE CODE', '4 · IMPACT'"},
        "heading": {"type": "string", "description": "<= 36 chars, on-screen heading"},
        "note": {"type": "string", "description": "<= 56 chars self-explanatory plain-English takeaway strip shown on screen so muted viewers grasp the scene"},
        "code": {"type": "string", "description": "for code/trace/output: Short <= 7 lines and <= 30 chars per line; Long <= 12 lines and <= 44 chars per line"},
        "output": {"type": "string", "description": "for code/output: exact stdout shown in terminal box"},
        "highlight_lines": {"type": "array", "items": {"type": "integer"}},
        "steps": {"type": "array", "description": "trace: per step {line (1-based), vars {name: value-as-text}}",
                  "items": {"type": "object", "properties": {"line": {"type": "integer"},
                                                             "vars": {"type": "object", "additionalProperties": {"type": "string"}}},
                            "required": ["line", "vars"]}},
        "nodes": {"type": "array", "items": {"type": "string"}, "description": "flow: 3-5 node labels <= 16 chars"},
        "edges": {"type": "array", "description": "flow: [from_index, to_index, label] in animation order",
                  "items": {"type": "array", "items": {"type": ["integer", "string"]}}},
        "lanes": {"type": "array", "description": "timeline: lanes, each {label, bars: [[start, end, text]]} on a 0-10 axis",
                  "items": {"type": "object", "properties": {
                      "label": {"type": "string"},
                      "bars": {"type": "array", "items": {"type": "array", "items": {"type": ["number", "string"]}}}},
                      "required": ["label", "bars"]}},
        "metrics": {"type": "array", "items": METRIC_ITEM, "description": "metric: 2-3 KPI cards"},
        "bullets": {"type": "array", "items": {"type": "string"}, "description": "<= 4 bullets, <= 30 chars each"},
        "left_title": {"type": "string"}, "right_title": {"type": "string"},
        "style": {"type": "string", "enum": ["versus", "mapping"]},
        "left": {"type": "string", "description": "compare: left label + code/text"},
        "right": {"type": "string", "description": "compare: right label + code/text"},
        "big": {"type": "string", "description": "reveal: <= 38 chars"}, "sub": {"type": "string"},
        "fn": {"type": "string", "description": "plot: Python expression in x using math"},
        "fn2": {"type": "string"},
        "x_range": {"type": "array", "items": {"type": "number"}},
        "y_range": {"type": "array", "items": {"type": "number"}},
        "x_label": {"type": "string"}, "y_label": {"type": "string"},
        "labels": {"type": "array", "items": {"type": "string"}},
        "points": {"type": "array", "items": {"type": "array", "items": {"type": ["number", "string"]}}},
        "threshold": {"type": "number"},
    },
    "required": ["type", "heading"],
}
SCENE = {"type": "object", "properties": {"narration": {"type": "string"}, "visual": VISUAL},
         "required": ["narration", "visual"]}

SHORT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "YouTube title <= 60 chars in plain everyday English anyone understands (no intimidating jargon/acronyms, no clickbait, no #shorts)"},
        "hook": {"type": "string", "description": "first spoken line, <= 12 words, simple everyday question or surprising fact a non-technical person gets instantly"},
        "scenes": {"type": "array", "items": SCENE, "minItems": 4, "maxItems": 7},
        "cta": {"type": "string", "description": "last spoken line <= 14 words, plain English, mentions pymasters.net"},
        "description": {"type": "string", "description": "2-4 plain-English sentences + the lesson URL"},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
        "thumbnail_text": {"type": "string", "description": "<= 4 simple words"},
    },
    "required": ["title", "hook", "scenes", "cta", "description", "tags", "thumbnail_text"],
}

LONG_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "YouTube title <= 70 chars, plain everyday English so anyone understands without technical background"},
        "hook": {"type": "string", "description": "opening 1-2 simple sentences: what the viewer will clearly understand by the end"},
        "chapters": {"type": "array", "minItems": 5, "maxItems": 9, "items": {
            "type": "object",
            "properties": {"title": {"type": "string", "description": "chapter title <= 40 chars in plain English"},
                           "scenes": {"type": "array", "items": SCENE, "minItems": 2, "maxItems": 6}},
            "required": ["title", "scenes"]}},
        "cta": {"type": "string"},
        "description": {"type": "string", "description": "3-6 simple plain-English sentences; chapter timestamps are added automatically"},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 15},
        "thumbnail_text": {"type": "string", "description": "<= 4 simple words"},
    },
    "required": ["title", "hook", "chapters", "cta", "description", "tags", "thumbnail_text"],
}

# A silent, looping animated explainer (posted as MP4; GIF fallback). Each beat is on screen ~2-4 s.
ANIM_BEAT = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["code", "trace", "flow", "timeline", "compare", "reveal", "plot", "metric"],
                 "description": "code: code types in, highlighted line moves, output appears. trace: code + a live "
                                "variables panel that changes step by step. flow: boxes and arrows light up in order "
                                "(data/request flow). timeline: parallel lanes with bars (threads/tasks/async). "
                                "compare: before vs after side by side. reveal: one big statement with a sub-line. "
                                "plot: a function curve drawn left to right with labelled points and an optional "
                                "horizontal threshold line. metric: 2-3 bold KPI/stat cards for business/engineering impact."},
        "step_badge": {"type": "string", "description": "optional <= 22 chars pill label at top of frame"},
        "caption": {"type": "string", "description": "on-screen caption for this beat, <= 70 chars"},
        "metrics": {"type": "array", "items": METRIC_ITEM, "description": "metric: 2-3 bold KPI stat cards"},
        "code": {"type": "string", "description": "code/trace/compare: <= 10 lines, <= 44 chars per line"},
        "output": {"type": "string", "description": "code: the exact stdout, <= 4 lines"},
        "steps": {"type": "array", "description": "trace: per step {line (1-based), vars {name: value-as-text}}",
                  "items": {"type": "object", "properties": {"line": {"type": "integer"},
                                                             "vars": {"type": "object",
                                                                      "additionalProperties": {"type": "string"}}},
                            "required": ["line", "vars"]}},
        "nodes": {"type": "array", "items": {"type": "string"}, "description": "flow: 3-6 node labels <= 16 chars"},
        "edges": {"type": "array", "description": "flow: [from_index, to_index, label] in animation order",
                  "items": {"type": "array", "items": {"type": ["integer", "string"]}}},
        "lanes": {"type": "array", "description": "timeline: lanes, each {label, bars: [[start, end, text]]} on a 0-10 axis",
                  "items": {"type": "object", "properties": {
                      "label": {"type": "string"},
                      "bars": {"type": "array", "items": {"type": "array", "items": {"type": ["number", "string"]}}}},
                      "required": ["label", "bars"]}},
        "left_title": {"type": "string"}, "right_title": {"type": "string"},
        "style": {"type": "string", "enum": ["versus", "mapping"],
                  "description": "compare: versus = wrong/slow vs right/fast (red/green marks); mapping = analogy vs "
                                 "real mechanism, line for line (neutral colours)"},
        "left": {"type": "string"}, "right": {"type": "string"},
        "big": {"type": "string", "description": "reveal: <= 40 chars"}, "sub": {"type": "string"},
        "fn": {"type": "string", "description": "plot: a Python expression in x using math, e.g. '1/(1+math.exp(-x))'"},
        "fn2": {"type": "string", "description": "plot: optional second curve to compare"},
        "x_range": {"type": "array", "items": {"type": "number"}, "description": "plot: [min, max]"},
        "y_range": {"type": "array", "items": {"type": "number"}, "description": "plot: [min, max]"},
        "x_label": {"type": "string"}, "y_label": {"type": "string"},
        "labels": {"type": "array", "items": {"type": "string"}, "description": "plot: names for fn and fn2"},
        "points": {"type": "array", "description": "plot: [x, label] markers that pop in along the curve",
                   "items": {"type": "array", "items": {"type": ["number", "string"]}}},
        "threshold": {"type": "number", "description": "plot: y value of a horizontal dashed line"},
    },
    "required": ["kind", "caption"],
}

LINKEDIN_SCHEMA = {
    "type": "object",
    "properties": {
        "post": {"type": "string", "description": "850-1350 characters; first line is the hook; varied structure matching the assigned format"},
        "code_snippet": {"type": "string", "description": "For technical formats: 3-8 lines of runnable Python 3.11 that appears in the post. For business-simple formats: empty string '' (no code wall in the post text)."},
        "animation": {"type": "object", "properties": {
            "title": {"type": "string", "description": "<= 44 chars, shown on the opening frame"},
            "beats": {"type": "array", "items": ANIM_BEAT, "minItems": 3, "maxItems": 6}},
            "required": ["title", "beats"],
            "description": "a self-explanatory animated explainer of THIS idea; mix beat kinds (metric, flow, compare, trace, timeline, plot, code, reveal)"},
        "hashtags": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
    },
    "required": ["post", "code_snippet", "animation", "hashtags"],
}

CRITIC_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {"type": "object", "properties": {
            "hook": {"type": "number"}, "accuracy": {"type": "number"}, "specificity": {"type": "number"},
            "clarity": {"type": "number"}, "originality": {"type": "number"}, "brand_rules": {"type": "number"},
            "simplicity": {"type": "number", "description": "how clearly the complex mechanism is explained without unexplained jargon"},
            "topic_depth": {"type": "number", "description": "0-10: is the underlying concept genuinely complex, architectural, and substantive (8-10) rather than a basic task, intro syntax, or trivial toy arithmetic (0-5)?"}},
            "required": ["hook", "accuracy", "specificity", "clarity", "originality", "brand_rules", "simplicity", "topic_depth"]},
        "overall": {"type": "number", "description": "0-10; 8+ means publishable as-is"},
        "factual_errors": {"type": "array", "items": {"type": "string"},
                           "description": "statements that are wrong and would mislead a reader"},
        "blocking_issues": {"type": "array", "items": {"type": "string"},
                            "description": "problems that make it unpublishable: basic/toy topic lacking depth, unexplained jargon, broken/misleading code or visuals, weak hook, or brand-rule violations. Empty if publishable."},
        "polish": {"type": "array", "items": {"type": "string"},
                   "description": "at most 4 optional improvements, most valuable first"},
    },
    "required": ["scores", "overall", "factual_errors", "blocking_issues", "polish"],
}

YOUTUBE_SELF_EXPLANATORY_RULES = """Complex Engineering Breakdown & Self-Explanatory Visual Story Arc (CRITICAL—tackle a genuinely HARD AI/systems mechanism and make its mental model so clear even a non-technical person grasps how it works):
- NEVER replace a complex topic with a trivial basic task (never teach 'how to sum a list', 'how to add an invoice', or '1 box = 10, 2 boxes = 13'). Keep the REAL advanced mechanism (e.g., KV-Cache, Self-Attention, Speculative Decoding, Reciprocal Rank Fusion, Event Loop, Quantization, Idempotency) front and center, and demystify HOW it works in crisp plain English.
- Whenever you introduce a technical term, translate what it means in 4-7 plain words right away so both engineers and newcomers get an instant 'aha!' moment.
- Every scene.visual MUST include:
  1. `step_badge` (e.g. "1 · THE BOTTLENECK", "2 · MENTAL MODEL", "3 · UNDER THE HOOD", "4 · BENCHMARK IMPACT", "5 · ARCHITECT'S RULE")
  2. `note` (<= 56 chars crisp plain-English takeaway banner so muted viewers grasp the exact mechanism)
- Across the 5 scenes of a Short, you MUST use at least 3 DIFFERENT `visual.type` kinds from `["flow", "compare", "metric", "trace", "code", "timeline", "plot", "reveal"]`:
  - Scene 1: `compare` or `metric` or `timeline` — show the real systems/AI bottleneck (latency, memory explosion, hallucination, race condition) in concrete numbers.
  - Scene 2: `flow` or `compare` (`style="mapping"`) or `timeline` — reveal the core architectural mental model step by step so anyone sees *why* it works.
  - Scene 3: `code` (clean 4-6 line Python <= 30 chars/line showing the actual algorithm/mechanism with `output`) OR `trace` — prove the mechanism in real runnable Python.
  - Scene 4: `metric` or `compare` or `plot` — show the real quantitative gain (e.g., 4x smaller KV-cache, 2.5x lower latency, RRF rank jump).
  - Scene 5: `reveal` or `bullets` — state the sharp 1-sentence engineering takeaway rule."""


def short_prompt(les, feedback=None, previous=None):
    greeting_rule = (
        'LIVE INFLUENCER GREETING: Open `hook` warmly as our live mentor with "Vanakkam nanba and nanbis!" '
        "followed immediately by a sharp <= 11-word engineering bottleneck or counter-intuitive fact about this complex mechanism (<= 16 words total in `hook`)."
    )
    if les.get("is_hf_space"):
        return f"""Write a high-impact, crystal-clear YouTube Short (40-50 seconds spoken, strictly 90-120 words across hook + all scenes[].narration + cta)
demystifying the REAL AI/systems engineering mechanism inside our live PyMasters app ({les['title']}) so viewers grasp an intimidating concept effortlessly.
{greeting_rule}
Spotlight the real algorithmic bottleneck first, map the core mechanism to a sharp intuitive mental model, then prove it with a compact runnable Python snippet and exact numbers from the material.
Use 5 scenes, each with 16-20 spoken words, and a brief cta (<= 12 words) inviting viewers to try the free interactive lab at pymasters.net.
The description MUST include BOTH the Hugging Face Space link ({les['space_url']}) AND {les['url']}.
Every number mentioned in spoken narration or shown in an output visual MUST match the exact output of the lesson code.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
COMPLEX ENGINEERING MATERIAL TO DEMYSTIFY:
{material_block(les)}"""
    if les.get("is_daily_trend"):
        return f"""Write a high-impact, crystal-clear YouTube Short (40-50 seconds spoken, strictly 90-120 words across hook + all scenes[].narration + cta) demystifying today's
complex architecture topic in {les.get('pillar_label', 'AI Engineering')} ({les['title']}) with crystal-clear intuition and real engineering depth.
{greeting_rule}
Expose the real production bottleneck first, explain the core mechanism through a sharp operational mental model, then prove it with a compact visual/code example and exact output.
Use 5 scenes, each with 16-20 spoken words, and end with a brief cta (<= 12 words) pointing to pymasters.net.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
COMPLEX ENGINEERING MATERIAL TO DEMYSTIFY:
{material_block(les)}"""
    return f"""Write a high-impact, crystal-clear YouTube Short (40-50 seconds spoken, strictly 90-120 words across hook + all scenes[].narration + cta) demystifying the MOST COMPLEX, high-value engineering/AI mechanism in this PyMasters lesson (NEVER reduce it to a basic intro task or toy arithmetic).
{greeting_rule}
Name the real concept clearly, translate how it works under the hood using a sharp intuitive mental model, and prove it with compact runnable Python and real numbers from the material.
Use 5 scenes, each with 16-20 spoken words, and a brief cta (<= 12 words) mentioning pymasters.net.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
COMPLEX ENGINEERING MATERIAL TO DEMYSTIFY:
{material_block(les)}"""


def long_prompt(les, feedback=None, previous=None):
    return f"""Write a super clear, beginner-friendly 6-9 minute YouTube lesson (about 950-1350 spoken words) structured as a warm, NotebookLM-style 2-host audio explainer ("Vaathiyaar:" and curious learner "Ananya:") that breaks down this PyMasters topic in simple terms so anyone—even with zero technical background—follows effortlessly from start to finish:
- Open `hook` warmly with: "Vaathiyaar: Vanakkam nanba and nanbis! ..." followed by Ananya asking the everyday question every beginner wonders about.
- Across `chapters[].scenes[].narration`, write natural, engaging 2-speaker lines prefixed with `Vaathiyaar:` and `Ananya:` (1-2 short turns per scene) so Ananya asks the exact intuitive question on the viewer's mind and Vaathiyaar explains the context clearly over the visuals (no on-camera presenter is shown—the visuals carry the screen while the two voices guide the learner):
1. Open with a relatable everyday problem in plain English—zero jargon (`metric` / `compare` / `flow` visuals).
2. Build the visual mental model step by step using concrete real-world comparisons (`flow` / `compare` `style="mapping"` / `timeline`) so the viewer understands WHY and HOW it works before seeing code.
3. Introduce tiny, clean Python examples one small step at a time (`trace` / `code` with `output`), translating every single keyword into plain English as if speaking to a first-time learner.
4. Show a common mistake vs. the simple fix (`compare` with `style="versus"`), and close `cta` with Vaathiyaar inviting listeners to practice interactively at pymasters.net.
Every scene.visual MUST include `step_badge` and a plain-English `note` banner so any frame is self-explanatory on mute, and each chapter must mix visual types (`flow`, `compare`, `metric`, `trace`, `code`, `plot`).
{_fb(feedback, previous)}
LESSON MATERIAL (break down complexity and avoid unexplained jargon):
{material_block(les)}"""


BUSINESS_STYLES = {"business_story", "boardroom_explainer", "executive_playbook"}
TECH_STYLES = {"tech_deep_dive", "myth_vs_benchmark", "production_code_audit", "jargon"}

LINKEDIN_SIMPLIFY_MANDATE = """Editorial Mission — SIMPLIFYING COMPLEX TOPICS:
- Every post on the @PyMasters LinkedIn page exists to take a genuinely COMPLEX, intimidating technical, AI, or systems topic and make it unmistakably SIMPLE so any smart reader grasps it on the first read.
- Never hide behind academic math, dense acronyms, or unexplained jargon. Whenever a technical concept appears (e.g., attention heads, KV-cache, GIL contention, async event loop, idempotency, calibration, AST verification, Reciprocal Rank Fusion), translate it immediately into plain everyday English using ONE crisp, strictly professional real-world mental model (such as a bank teller ledger, airport fast-track lane, library reference card, or warehouse staging shelf—never casual trivia or Hindi words).
- Walk the reader clearly from: (1) Why this complex topic sounds intimidating or trips teams up -> (2) What it actually means in plain words -> (3) How it works step by step -> (4) The 1-sentence mental rule they will remember tomorrow."""

# Six distinct formats: 3 Business-Audience in Simple Terms (no code wall in post text) + 3 Technical-Simplified (plain-English breakdown + tiny runnable Python proof).
STYLE_BLUEPRINTS = {
    # --- TRACK A: COMPLEX TOPICS SIMPLIFIED FOR ANY READER (NO CODE WALL IN POST TEXT) ---
    "business_story": """Format: Complex System, Simplified Through a Real-World Enterprise Story (Simple Terms, NO raw code block in the post text).
- Audience: Executives, product managers, risk leaders, founders, and curious professionals who want complex AI/tech explained simply.
- Open by naming the complex concept or costly operational failure mode in plain, vivid words (<= 110 chars).
- Simplify the complex mechanism in 2-3 short, jargon-free paragraphs using a crystal-clear real-world operational comparison (DO NOT put raw Python code in the post text; set `code_snippet` to `""`).
- Give 3 crisp bullet points (`•`) distilling: What it is simply, Why naive approaches fail, and The 1-line rule to remember.
- Close by explaining how @PyMasters ({url}) breaks complex AI & Python down simply for professionals and teams.
- Animation beats: use `compare` (analogy vs real mechanism), `flow` (step-by-step boxes), `metric` (impact), and `reveal`.""",
    "boardroom_explainer": """Format: 60-Second Complex-to-Simple Executive Explainer (Simple Terms, NO raw code block in the post text).
- Audience: Decision-makers, managers, analysts, and non-specialists who hear intimidating AI/engineering buzzwords daily and want the plain truth.
- Open with a sharp question or counter-intuitive truth demystifying this complex topic (<= 110 chars).
- Structure the body around three ultra-clear plain-English sections (no markdown headers, just clean line breaks; DO NOT put raw Python code in the post text; set `code_snippet` to `""`):
  1. In Plain English: explain the complex concept in one crystal-clear sentence using an everyday banking, ledger, or operations analogy.
  2. Why It Matters in Practice: explain what breaks—money, speed, or accuracy—when this concept is misunderstood (cite real numbers from the material).
  3. One Simple Takeaway: the single plain-English rule anyone can remember and apply.
- Close by tagging @PyMasters and linking to {url}.
- Animation beats: use `compare` (jargon vs plain meaning), `flow` (how it works simply), `metric` (the numbers), and `reveal`.""",
    "executive_playbook": """Format: Complex Architecture Simplified — Naive Way vs. Smart Way (Simple Terms, NO raw code block in the post text).
- Audience: Product leaders, FinTech/enterprise builders, and professionals learning how modern AI & software systems work under the hood.
- Open with the headline contrast showing why this complex concept changes real outcomes (<= 110 chars).
- Contrast `Why It Sounds Complicated (The Old Mental Model):` against `How It Actually Works Simply (The Clear Model):` in plain, everyday professional English (DO NOT put raw Python code in the post text; set `code_snippet` to `""`).
- State the measurable real-world impact and how @PyMasters ({url}) makes complex Python & AI effortless to learn.
- Animation beats: use `compare`, `flow` or `timeline`, `metric`, and `reveal`.""",

    # --- TRACK B: COMPLEX MECHANICS SIMPLIFIED WITH TINY RUNNABLE PYTHON PROOF ---
    "tech_deep_dive": """Format: Under-the-Hood Complexity, Made Simple + Tiny Python Proof (Plain-English Breakdown + Runnable Python).
- Audience: Engineers, data practitioners, and learners who want intimidating internals/AI mechanics explained simply without textbook density.
- Open by naming the complex mechanism and translating what it really does in one plain-English hook line (<= 110 chars).
- Explain the step-by-step mental model in 2-3 simple, jargon-free sentences BEFORE showing code so even a newcomer follows the logic.
- Prove how simple it really is with a tiny, clean runnable Python 3.11 snippet (indented 4 spaces, 4-7 lines, copied into `code_snippet`) and explain its exact printed output in plain words.
- Invite readers to explore the interactive step-by-step visualiser with @PyMasters at {url}.
- Animation beats: mix `compare` or `flow` (the simple mental model) with `trace` or `code` (exact output) and `reveal`.""",
    "myth_vs_benchmark": """Format: Intimidating Technical Myth vs. Simple Reality + Python Proof (Plain-English Breakdown + Runnable Python).
- Audience: Developers, AI builders, and technical learners who want confusing myths cleared up simply.
- Open by naming a confusing technical myth or complex edge case in plain English (<= 110 chars).
- Explain in simple everyday words why people get confused—and what actually happens step by step using a concrete mental model.
- Show the proof in a tiny, self-contained Python 3.11 snippet (indented 4 spaces, 4-7 lines, copied into `code_snippet`) and translate its exact stdout into one plain takeaway sentence.
- Close with the 1-line rule to remember, tag @PyMasters, and link to {url}.""",
    "production_code_audit": """Format: Complex Production Bug, Explained Simply + Clean Fix (Plain-English Breakdown + Runnable Python).
- Audience: Builders, engineers, and technical leads who want subtle systems/AI traps explained in crystal-clear terms.
- Open by spotlighting a tricky hidden failure mode in plain words anyone can picture (<= 110 chars).
- Explain in 2 simple sentences why it happens using a real-world operational analogy, then show the clean Python 3.11 fix (indented 4 spaces, 4-7 lines, copied into `code_snippet`) with its exact output.
- Explain how @PyMasters makes complex engineering concepts intuitive at {url}.""",
    "jargon": """Format: Complex Concept Distillation ("jargon, made simple").
- Open by naming the complex technical term and translating why it matters in plain everyday words (<= 110 chars).
- Simplify the mechanism using ONE precise, strictly professional real-world comparison mapped step by step (and note in one clause where the analogy ends).
- Give the crystal-clear one-sentence plain-English definition and a tiny runnable Python 3.11 snippet (indented 4 spaces) with its real output.
- Close with the 1-line takeaway rule, tag @PyMasters, and link to {url}.""",
}


def linkedin_prompt(les, feedback=None, previous=None, style="jargon", sub_style=None):
    variety = sub_style if sub_style in STYLE_BLUEPRINTS else (style if style in STYLE_BLUEPRINTS else "business_story")
    if les.get("is_thematic") or style == "thematic":
        return thematic_prompt(les, feedback, previous)
    if les.get("is_hf_space") or style == "hf_space":
        return _linkedin_hf_space_prompt(les, feedback, previous, variety=variety)
    if les.get("is_daily_trend") or style == "trend":
        return _linkedin_trend_prompt(les, feedback, previous, variety=variety)
    blueprint = STYLE_BLUEPRINTS.get(variety, STYLE_BLUEPRINTS["business_story"]).format(url=les["url"])
    return f"""Write a strictly professional, crystal-clear LinkedIn post for the @PyMasters company page that SIMPLIFIES A COMPLEX TOPIC.
{LINKEDIN_SIMPLIFY_MANDATE}
Follow this specific format so our hourly feed stays fresh and engaging (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- Include both @PyMasters and the link {les['url']} (and https://pymasters.net) in the post text.
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
- Make the animation visually self-explanatory so a reader scrolling on mute grasps the complex idea in 5 seconds (mix `compare`, `flow`, `metric`, `timeline`, `plot`, `trace`, `code`, `reveal`).
{_fb(feedback, previous)}
COMPLEX TOPIC MATERIAL TO SIMPLIFY:
{material_block(les)}"""


def thematic_prompt(les, feedback=None, previous=None, style="thematic", sub_style=None):
    return f"""Write our weekly "Thematic Analysis Research Brief" LinkedIn post for the @PyMasters company page:
"{les['title']}"
This weekly research post synthesizes the underlying business and engineering theme connecting AI in Finance, AI in Risk,
AI in Consumer Cards & Banking, AI Around the World, and AI Key Concepts—written so both C-suite/risk leaders and senior
engineers immediately grasp the strategic thesis and its technical proof.
Structure (plain text; LinkedIn has no markdown; authoritative research voice; no emoji walls):
1. Research Thesis Headline (first line, <= 115 chars): state the cross-industry thesis uniting finance, risk, banking, and AI systems this week.
2. Business & Cross-Pillar Synthesis (2-3 crisp sentences in plain terms): explain why this theme matters for capital, customer trust, and latency across banking, risk, and global AI.
3. Executable Quantitative Proof: a short, complete Python 3.11 snippet (indented 4 spaces, 4-8 lines) from the material and one sentence citing its exact printed output in plain terms.
4. Strategic Mandate & @PyMasters Link: state what business and engineering leaders should audit this week, tag @PyMasters, and link to {les['url']}
Then exactly three relevant hashtags. Length 950-1350 characters in total.
Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def _linkedin_trend_prompt(les, feedback=None, previous=None, variety="business_story"):
    blueprint = STYLE_BLUEPRINTS.get(variety, STYLE_BLUEPRINTS["business_story"]).format(url=les["url"])
    return f"""Write a strictly professional LinkedIn post for the @PyMasters company page that SIMPLIFIES A COMPLEX TOPIC from today's live trending signal in {les.get('pillar_label', 'AI Engineering')}:
"{les['title']}" (live signal: {les.get('live_headline', '')}).
{LINKEDIN_SIMPLIFY_MANDATE}
Follow the assigned format below (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- Explicitly state how @PyMasters helps professionals and engineering/quant teams master this capability on {les['url']}.
- Include both @PyMasters and {les['url']} in the post text.
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
{_fb(feedback, previous)}
COMPLEX TOPIC MATERIAL TO SIMPLIFY:
{material_block(les)}"""


def _linkedin_hf_space_prompt(les, feedback=None, previous=None, variety="boardroom_explainer"):
    blueprint = STYLE_BLUEPRINTS.get(variety, STYLE_BLUEPRINTS["boardroom_explainer"]).format(url=les["url"])
    return f"""Write a strictly professional LinkedIn post for the @PyMasters company page showcasing our live Hugging Face Space ({les['title']}) by SIMPLIFYING THE COMPLEX TOPIC behind it.
{LINKEDIN_SIMPLIFY_MANDATE}
Follow the assigned format below (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- You MUST include @PyMasters AND BOTH links verbatim in the post text:
  - Live Hugging Face App: {les.get('space_url', '')}
  - Interactive platform: {les['url']}
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
- The animation must visualise the Space's value and mechanism step by step (`metric`, `flow`, `compare`, `trace`, `code`, `reveal`).
{_fb(feedback, previous)}
COMPLEX TOPIC MATERIAL TO SIMPLIFY:
{material_block(les)}"""


def _video_rule(kind: str) -> str:
    label = "YouTube Short" if kind == "short" else "YouTube tutorial"
    return (
        f"This is a {label} whose mission is DEMYSTIFYING GENUINELY COMPLEX AI & SYSTEMS TOPICS so clearly that both engineers and non-technical viewers grasp the mechanism effortlessly: "
        "1) Score `scores.topic_depth` < 7.0 and add a `blocking_issues` entry if the draft reduces the lesson to a basic programming task, "
        "elementary syntax, or trivial toy arithmetic (e.g., 'add up an invoice', '1 box = 10, 2 boxes = 13', simple list sums). It MUST teach a real, non-trivial architectural/AI/internals mechanism. "
        "2) Score `scores.simplicity` < 7.5 and add a `blocking_issues` entry if technical terms, acronyms, or dense formulas are dropped without an immediate plain-English mental model. "
        "Every visual must be self-explanatory on mute with `step_badge` and `note` banners, and `cta`/`description` must point to https://pymasters.net."
    )


def _linkedin_rule(draft: dict) -> str:
    variety = draft.get("format_variety") or draft.get("style") or ""
    is_biz = variety in BUSINESS_STYLES
    simplify_rule = (
        "CRITICAL EDITORIAL MANDATE — SIMPLIFYING COMPLEX TOPICS: Every LinkedIn post on the @PyMasters page must take "
        "a genuinely complex idea and simplify it into crystal-clear everyday English with a concrete professional mental "
        "model so any smart reader grasps it effortlessly on the first read. Penalise `scores.simplicity` (below 7.5) and "
        "add a `blocking_issues` entry if technical jargon, math, or acronyms are left unexplained. "
    )
    if is_biz:
        base = simplify_rule + (
            "This post is in our BUSINESS AUDIENCE (Simple Terms) track: demand strictly professional, jargon-free "
            "plain-English explanation that executives, product leaders, and non-technical readers understand immediately, "
            "backed by real numbers from the material, a link to https://pymasters.net, and a @PyMasters mention "
            "(no raw Python code block is required in the post text). "
        )
    else:
        base = simplify_rule + (
            "This post is in our TECHNICAL AUDIENCE track: demand a strictly professional yet simple, crystal-clear teaching voice "
            "that explains the complex mechanism in plain English BEFORE/AROUND the code, a link to https://pymasters.net, "
            "a @PyMasters mention, and runnable Python 3.11 code whose output matches the post. "
        )
    if draft.get("style") == "thematic":
        return base + ("For Weekly Thematic Analysis Research posts, demand a clear cross-domain synthesis connecting "
                       "AI in Finance, AI in Risk, AI in Consumer Cards & Banking, AI Around the World, and AI Key Concepts "
                       "in simple plain English, backed by verified Python code and a clear link to @PyMasters (https://pymasters.net).")
    if draft.get("style") == "hf_space":
        return base + ("For LinkedIn Hugging Face Space showcase posts, demand that the post includes both the Hugging Face "
                       "Space URL and https://pymasters.net, explains what the tool does simply, and has an animation spec that visualises the Space clearly.")
    if draft.get("style") == "trend":
        return base + ("For LinkedIn Live Trending Topic posts (AI in Finance, AI in Risk, AI in Consumer Cards & Banking, "
                       "AI Around the World, or AI Key Concepts), demand a catchy yet simple hook grounded in plain everyday terms "
                       "and a clear explanation of how @PyMasters (https://pymasters.net) helps anyone learn this capability.")
    return base + ("Demand that the post follows its assigned editorial format cleanly and that the animation spec is self-explanatory.")


def critic_prompt(kind: str, draft: dict, les: dict) -> str:
    d = {k: v for k, v in draft.items() if not k.startswith("_")}
    real = draft.get("_real_outputs") or {}
    track_rule = _video_rule(kind) if kind in ("short", "long") else _linkedin_rule(draft)
    return f"""You are the strict editor of the PyMasters channel. Score this {kind} draft 0-10 on each criterion and overall.
Calibration: 10 = exceptional—complex idea broken down so clearly that even a completely non-technical viewer gets it immediately;
8 = strong, crystal-clear, engaging and publishable unchanged; 6 = competent but too technical or forgettable; 4 = confusing, jargon-heavy, or flawed.
Do not deduct for nitpicks a reasonable viewer would not raise. Check every factual claim and every line of code against the lesson material.
Put a statement in factual_errors ONLY if it is actually wrong (would mislead a viewer). blocking_issues are what truly prevents publishing:
unexplained jargon or complex wording a non-technical viewer cannot follow, broken code/visuals, weak hooks, or brand-rule violations. {track_rule}
BRAND RULES:
{BRAND}
DRAFT:
{json.dumps(d, ensure_ascii=False, indent=1)}
ACTUAL OUTPUT OF THE DRAFT'S CODE (executed with Python 3.11; trust this over your own estimates):
{json.dumps(real, ensure_ascii=False, indent=1)}
LESSON MATERIAL:
{material_block(les)}"""


def _fb(feedback, previous=None):
    if not feedback:
        return ""
    out = "\nTHE EDITOR SENT YOUR PREVIOUS DRAFT BACK. Revise it (keep what works, fix every point; do not start over " \
          "unless the editor says the core idea fails). Make the language flow naturally; avoid choppy fragments.\n" \
          "Editor notes:\n- " + "\n- ".join(feedback) + "\n"
    if previous:
        out += "PREVIOUS DRAFT:\n" + json.dumps({k: v for k, v in previous.items() if not k.startswith("_")},
                                                ensure_ascii=False)[:12000] + "\n"
        if previous.get("_real_outputs"):
            out += "WHAT YOUR CODE ACTUALLY PRINTS (executed; any numbers you state must match this):\n" + \
                   json.dumps(previous["_real_outputs"], ensure_ascii=False)[:3000] + "\n"
    return out
