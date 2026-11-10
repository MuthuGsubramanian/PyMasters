"""Writing briefs and JSON schemas: one clear brief per format, plus the critic's rubric."""
import json

BRAND = """You write for PyMasters (https://pymasters.net), an interactive engineering platform that teaches Python and AI engineering.
Voice: a strictly professional, authoritative principal engineer / quantitative architect writing in plain, clear English for working developers, AI engineers, and business/technical leaders. Concrete over clever.
Hard rules:
- NEVER USE HINDI WORDS: Write in plain, clear English (Tamil words like "Vanakkam", "nanba", "Vaathiyaar" are permitted where relevant to PyMasters, but Hindi words and Hinglish are strictly banned—never use "chai", "samosa", "tapri", "roti", "jugaad", "namaste", "paisa", "lakh", "crore", "bhaiya", "yaar", "desi", "bazaar", "mandi", "kirana", "dabba", "tiffin", or any Devanagari script).
- Strictly professional tone: never use casual, whimsical, or consumer-trivia scenarios (no restaurant bills, tea/coffee rotas, sports fixtures, superhero/movie/kid metaphors, or playful banter).
- One core engineering or business mechanism per piece, backed by real runnable Python 3.11 code from the material. Never invent APIs or numbers.
- No hype or filler: never use "game-changer", "unlock", "supercharge", "dive in", "delve", "in today's world",
  "revolutionize", "level up", "mind-blowing", "secret", "hack" (as in trick), or rhetorical "Ever wondered...?".
- Every post and description MUST include a link to https://pymasters.net (and every LinkedIn post must mention @PyMasters so the company page is tagged).
- Never present code as "from the lesson" unless it is verbatim; every snippet must run on its own as shown.
- Every visual must show exactly what it claims (plots plot real functions, traces show values only after the line runs).
The editor scores: hook, accuracy, specificity, clarity, originality, brand rules and simplicity; 8/10 is the bar.
Before answering, check your draft against every rule above as the editor would."""


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
        "title": {"type": "string", "description": "YouTube title <= 60 chars, specific, no clickbait, no #shorts"},
        "hook": {"type": "string", "description": "first spoken line, <= 12 words, states the payoff or a surprising fact"},
        "scenes": {"type": "array", "items": SCENE, "minItems": 4, "maxItems": 7},
        "cta": {"type": "string", "description": "last spoken line <= 14 words, mentions pymasters.net"},
        "description": {"type": "string", "description": "2-4 sentences + the lesson URL"},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
        "thumbnail_text": {"type": "string", "description": "<= 4 words"},
    },
    "required": ["title", "hook", "scenes", "cta", "description", "tags", "thumbnail_text"],
}

LONG_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "YouTube title <= 70 chars, specific and searchable"},
        "hook": {"type": "string", "description": "opening 1-2 sentences: what the viewer will be able to do by the end"},
        "chapters": {"type": "array", "minItems": 5, "maxItems": 9, "items": {
            "type": "object",
            "properties": {"title": {"type": "string", "description": "chapter title <= 40 chars"},
                           "scenes": {"type": "array", "items": SCENE, "minItems": 2, "maxItems": 6}},
            "required": ["title", "scenes"]}},
        "cta": {"type": "string"},
        "description": {"type": "string", "description": "3-6 sentences; chapter timestamps are added automatically"},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 15},
        "thumbnail_text": {"type": "string", "description": "<= 4 words"},
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
            "simplicity": {"type": "number", "description": "how well a complex idea is made genuinely simple"}},
            "required": ["hook", "accuracy", "specificity", "clarity", "originality", "brand_rules", "simplicity"]},
        "overall": {"type": "number", "description": "0-10; 8+ means publishable as-is"},
        "factual_errors": {"type": "array", "items": {"type": "string"},
                           "description": "statements that are wrong and would mislead a reader"},
        "blocking_issues": {"type": "array", "items": {"type": "string"},
                            "description": "problems that make it unpublishable: broken/misleading code or visuals, "
                                           "a weak or generic hook, brand-rule violations. Empty if publishable."},
        "polish": {"type": "array", "items": {"type": "string"},
                   "description": "at most 4 optional improvements, most valuable first"},
    },
    "required": ["scores", "overall", "factual_errors", "blocking_issues", "polish"],
}

YOUTUBE_SELF_EXPLANATORY_RULES = """Self-Explanatory Visual Story Arc (CRITICAL—never make a monotonous video of just bullets or static code):
- A viewer watching on mute must understand the entire story from the visuals alone.
- Every scene.visual MUST include:
  1. `step_badge` (e.g. "1 · THE PROBLEM", "2 · HOW IT WORKS", "3 · LIVE CODE", "4 · REAL IMPACT", "5 · TAKEAWAY")
  2. `note` (<= 56 chars plain-English takeaway banner explaining what the visual proves right now)
- Across the 5 scenes of a Short, you MUST use at least 3 DIFFERENT `visual.type` kinds from `["flow", "compare", "metric", "trace", "code", "timeline", "plot", "reveal"]`:
  - Scene 1: `compare` or `metric` or `flow` — make the real-world business or engineering problem immediately visible in simple terms.
  - Scene 2: `flow` or `timeline` or `plot` — show the visual mental model / architecture diagram so anyone understands how it works before seeing code.
  - Scene 3: `code` (with `output`) or `trace` (with live `steps`) — show the concise Python 3.11 code (<= 7 lines, <= 30 chars/line) and its exact result.
  - Scene 4: `metric` or `compare` or `plot` — show the measurable before-vs-after impact.
  - Scene 5: `reveal` or `bullets` — state the 1-sentence actionable rule of thumb."""


def short_prompt(les, feedback=None, previous=None):
    if les.get("is_hf_space"):
        return f"""Write a self-explanatory, high-retention YouTube Short (40-50 seconds spoken, strictly 90-115 words across hook + all scenes[].narration + cta)
teaching the real-world problem and Python/AI mechanism behind our live PyMasters Hugging Face Space ({les['title']}).
Explain why it matters in simple terms first, then show how it works visually and in code.
The hook must land in the first 2 seconds (<= 11 words). Use 5 scenes, each with 16-20 spoken words, and a brief cta (<= 12 words) that invites viewers to try the live Hugging Face app and pymasters.net.
The description MUST include BOTH the Hugging Face Space link ({les['space_url']}) AND {les['url']}.
Every number mentioned in spoken narration or shown in an output visual MUST match the exact output of the lesson code.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""
    if les.get("is_daily_trend"):
        return f"""Write a self-explanatory, high-retention YouTube Short (40-50 seconds spoken, strictly 90-115 words across hook + all scenes[].narration + cta) on today's live
trending topic in {les.get('pillar_label', 'AI Engineering')} ({les['title']}).
Make the hook catchy yet unique in the first 2 seconds (<= 11 words)—frame the real-world business or engineering stakes in simple terms.
Use 5 scenes, each with 16-20 spoken words, and end with a brief cta (<= 12 words) on how pymasters.net helps you build this.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""
    return f"""Write a self-explanatory, high-retention YouTube Short (40-50 seconds spoken, strictly 90-115 words across hook + all scenes[].narration + cta) teaching ONE
specific, useful idea from this PyMasters lesson in a way that is immediately clear to both business-minded viewers and developers.
The hook must land in the first 2 seconds (<= 11 words). Use 5 scenes, each with 16-20 spoken words, and a brief cta (<= 12 words) that mentions pymasters.net.
{YOUTUBE_SELF_EXPLANATORY_RULES}
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def long_prompt(les, feedback=None, previous=None):
    return f"""Write a self-explanatory 6-9 minute YouTube tutorial (about 950-1350 spoken words) that teaches this PyMasters lesson with visual variety and zero monotony:
1. Start with the real-world business/engineering problem in plain terms (`metric` / `compare` / `flow` visuals).
2. Build the visual mental model (`flow` / `timeline` / `plot`) before writing code.
3. Walk through worked Python examples step by step (`trace` / `code` with `output`).
4. Show a common production mistake vs. the fix (`compare` with `style="versus"`), and close with a crisp recap.
Every scene.visual MUST include `step_badge` and a plain-English `note` banner so any frame is self-explanatory on mute, and each chapter must mix visual types (`flow`, `compare`, `metric`, `trace`, `code`, `plot`).
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


BUSINESS_STYLES = {"business_story", "boardroom_explainer", "executive_playbook"}
TECH_STYLES = {"tech_deep_dive", "myth_vs_benchmark", "production_code_audit", "jargon"}

# Six distinct formats: 3 Business-Audience in Simple Terms (no code wall in post text) + 3 Technical-Detail (with runnable Python).
STYLE_BLUEPRINTS = {
    # --- TRACK A: BUSINESS AUDIENCE IN SIMPLE TERMS (NO CODE WALL IN POST TEXT) ---
    "business_story": """Format: Real-World Banking, Risk & Business Story (Business Audience — Simple Terms, NO raw code block in the post text).
- Audience: Banking executives, product managers, risk leaders, founders, and tech-curious professionals.
- Open with a vivid, concrete business situation or costly operational mistake (<= 110 chars)—e.g., customer friction, false card declines, capital exposure, or delayed decisions.
- Explain the underlying cause and how modern AI solves it in plain, jargon-free English (2-3 short paragraphs; DO NOT put raw Python code in the post text; set `code_snippet` to `""`).
- Give 3 crisp bullet points (`•`) stating the business & operational takeaway.
- Close by explaining how @PyMasters ({url}) helps professionals and teams understand and build real-world AI systems.
- Animation beats: use `metric`, `flow`, `compare`, and `reveal` to make the business story visually self-explanatory.""",
    "boardroom_explainer": """Format: 60-Second Boardroom & Executive Explainer (Business Audience — Simple Terms, NO raw code block in the post text).
- Audience: Decision-makers, engineering managers, finance/risk analysts, and business leaders who hear AI buzzwords daily and want the plain truth.
- Open with a sharp question or counter-intuitive business fact about this topic (<= 110 chars).
- Structure the body around three ultra-clear plain-English sections (no markdown headers, just clean line breaks; DO NOT put raw Python code in the post text; set `code_snippet` to `""`):
  1. What it actually means in one plain sentence (using a sharp banking, treasury, or enterprise operations mental model).
  2. Why companies lose money, speed, or trust when they get it wrong (cite the real numbers from the material).
  3. The one practical question to ask your engineering or risk team this week.
- Close by tagging @PyMasters and linking to {url}.
- Animation beats: use `compare` (naive vs smart), `flow` (how the system works), `metric` (the numbers), and `reveal`.""",
    "executive_playbook": """Format: Before-vs-After Industry Decision Playbook (Business Audience — Simple Terms & ROI, NO raw code block in the post text).
- Audience: FinTech leaders, consumer banking heads, risk officers, and enterprise architects.
- Open with the headline metric—milliseconds saved, basis points protected, or operational cost reduced (<= 110 chars).
- Contrast `The Legacy Way:` (why manual rules or naive AI fail) against `The Modern Playbook:` (how calibrated, guarded systems work) in simple, compelling business language (DO NOT put raw Python code in the post text; set `code_snippet` to `""`).
- State the measurable bottom-line impact and how @PyMasters ({url}) equips teams with practical AI & Python fluency.
- Animation beats: use `compare`, `metric`, `timeline` or `flow`, and `reveal`.""",

    # --- TRACK B: TECHNICAL & ENGINEERING AUDIENCE (DEEP DETAILS + RUNNABLE PYTHON CODE) ---
    "tech_deep_dive": """Format: Under-the-Hood Technical Deep Dive (Technical Audience — Deep Mechanics + Runnable Python).
- Audience: Senior software engineers, ML engineers, quant developers, and systems architects.
- Open with a sharp technical statement on how the runtime, model, or risk engine executes this mechanism (<= 110 chars).
- Trace the exact data transformation and mathematical/systems trade-off in 2-3 rigorous sentences.
- Include a concise, runnable Python 3.11 snippet (indented 4 spaces, 4-8 lines, and copied into `code_snippet`) and state its exact printed output.
- Invite engineers to practice the full implementation with @PyMasters at {url}.
- Animation beats: mix `trace` or `code` (showing the exact output) with `flow` or `plot`.""",
    "myth_vs_benchmark": """Format: Engineering Myth vs. Executed Benchmark (Technical Audience — Deep Details + Runnable Python).
- Audience: Working Python developers, AI engineers, and quantitative analysts.
- Open by challenging a widespread technical or quantitative misconception (<= 110 chars).
- Contrast the naive assumption against what actually happens at runtime or under stress.
- Prove the reality with a self-contained Python 3.11 snippet (indented 4 spaces, 4-8 lines, and copied into `code_snippet`) and cite its exact stdout.
- State the production takeaway, tag @PyMasters, and link to {url}.""",
    "production_code_audit": """Format: Principal Engineer Code & Risk Audit (Technical Audience — Deep Details + Runnable Python).
- Audience: Production engineers, risk modelers, and technical leads.
- Open by spotlighting a subtle production failure mode—silent drift, uncalibrated probabilities, or duplicate execution (<= 110 chars).
- Explain in 2 sentences why standard reviews miss this defect, then show the deterministic Python 3.11 fix (indented 4 spaces, 4-8 lines, and copied into `code_snippet`) with its exact output.
- Explain how @PyMasters trains engineers to build auditable systems at {url}.""",
    "jargon": """Format: Executive & Practitioner Concept Distillation ("jargon, made simple").
- Open by naming the complex technical term and stating the concrete production consequence of misapplying it (<= 110 chars).
- Clarify the mechanism using ONE precise, strictly professional enterprise/systems comparison and note where the comparison ends.
- Give the exact one-sentence technical definition and a runnable Python 3.11 snippet (indented 4 spaces) with its real output.
- Close with when this matters on the job, tag @PyMasters, and link to {url}.""",
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
    return f"""Write a strictly professional, non-monotonous LinkedIn post for the @PyMasters company page.
Follow this specific format so our feed alternates engagingly between plain-English business insights and deep technical breakdowns (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- Include both @PyMasters and the link {les['url']} (and https://pymasters.net) in the post text.
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
- Make the animation visually self-explanatory (mix `metric`, `flow`, `compare`, `timeline`, `plot`, `trace`, `code`, `reveal`).
{_fb(feedback, previous)}
LESSON MATERIAL:
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
    return f"""Write a strictly professional LinkedIn post for the @PyMasters company page on today's live trending topic in {les.get('pillar_label', 'AI Engineering')}:
"{les['title']}" (live signal: {les.get('live_headline', '')}).
Make it catchy, unique, and immediately interesting—follow the assigned format below so our feed varies between simple business impact stories and technical deep dives (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- Explicitly state how @PyMasters helps professionals and engineering/quant teams master this capability on {les['url']}.
- Include both @PyMasters and {les['url']} in the post text.
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def _linkedin_hf_space_prompt(les, feedback=None, previous=None, variety="boardroom_explainer"):
    blueprint = STYLE_BLUEPRINTS.get(variety, STYLE_BLUEPRINTS["boardroom_explainer"]).format(url=les["url"])
    return f"""Write a strictly professional LinkedIn post for the @PyMasters company page showcasing our live Hugging Face Space ({les['title']}).
Follow the assigned format below so our posts vary between plain-English business/product value and under-the-hood technical breakdowns (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
{blueprint}
Hard requirements:
- You MUST include @PyMasters AND BOTH links verbatim in the post text:
  - Live Hugging Face App: {les.get('space_url', '')}
  - Interactive platform: {les['url']}
- Then exactly three relevant hashtags. Length 850-1300 characters in total.
- Any code beat in `animation.beats` must be self-contained runnable Python whose `output` matches real execution.
- The animation must visualise the Space's value and mechanism step by step (`metric`, `flow`, `compare`, `trace`, `code`, `reveal`).
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def _linkedin_rule(draft: dict) -> str:
    variety = draft.get("format_variety") or draft.get("style") or ""
    is_biz = variety in BUSINESS_STYLES
    if is_biz:
        base = ("This post is in our BUSINESS AUDIENCE (Simple Terms) track: demand crystal-clear, jargon-free business "
                "explanation that executives, banking/risk leaders, and product managers find immediately interesting, "
                "backed by real numbers from the material, a link to https://pymasters.net, and a @PyMasters mention "
                "(no raw Python code block is required in the post text). ")
    else:
        base = ("This post is in our TECHNICAL AUDIENCE track: demand a strictly professional engineering voice, "
                "a link to https://pymasters.net, a @PyMasters mention, and runnable Python 3.11 code whose output matches the post. ")
    if draft.get("style") == "thematic":
        return base + ("For Weekly Thematic Analysis Research posts, demand a rigorous cross-domain synthesis connecting "
                       "AI in Finance, AI in Risk, AI in Consumer Cards & Banking, AI Around the World, and AI Key Concepts, "
                       "backed by verified Python code and a clear link to @PyMasters (https://pymasters.net).")
    if draft.get("style") == "hf_space":
        return base + ("For LinkedIn Hugging Face Space showcase posts, demand that the post includes both the Hugging Face "
                       "Space URL and https://pymasters.net, and has an animation spec that visualises the Space clearly.")
    if draft.get("style") == "trend":
        return base + ("For LinkedIn Live Trending Topic posts (AI in Finance, AI in Risk, AI in Consumer Cards & Banking, "
                       "AI Around the World, or AI Key Concepts), demand a catchy yet unique hook grounded in concrete numbers "
                       "and a clear explanation of how @PyMasters (https://pymasters.net) helps teams master this capability.")
    return base + ("Demand that the post follows its assigned editorial format cleanly and that the animation spec is self-explanatory.")


def critic_prompt(kind: str, draft: dict, les: dict) -> str:
    d = {k: v for k, v in draft.items() if not k.startswith("_")}
    real = draft.get("_real_outputs") or {}
    return f"""You are the strict editor of the PyMasters channel. Score this {kind} draft 0-10 on each criterion and overall.
Calibration: 10 = exceptional, among the best developer content you have read; 8 = a strong post a respected senior
engineer would be proud of, publishable unchanged; 6 = competent but forgettable; 4 = generic or flawed. Do not deduct for
nitpicks a reasonable expert reader would not raise. Be demanding about real errors, weak hooks and generic writing. Check every technical claim and every line
of code against the lesson material and your own knowledge. Put a statement in factual_errors ONLY if it is actually
wrong (would mislead a reader). blocking_issues are only what truly prevents publishing; everything else is polish. Penalise generic phrasing, filler,
weak hooks, anything that breaks the brand rules, and code that would not run. {_linkedin_rule(draft)}
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
