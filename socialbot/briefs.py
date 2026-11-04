"""Writing briefs and JSON schemas: one clear brief per format, plus the critic's rubric."""
import json

BRAND = """You write for PyMasters (pymasters.net), an interactive platform that teaches Python and AI engineering.
Voice: a precise, friendly senior engineer explaining one real idea to a smart learner. Concrete over clever.
Hard rules:
- One idea per piece, explained with the real code from the lesson material. Never invent APIs or numbers.
- Code must be correct, runnable on Python 3.11 with the standard library (unless the material uses a library), and short.
- No hype or filler: never use "game-changer", "unlock", "supercharge", "dive in", "delve", "in today's world",
  "revolutionize", "level up", "mind-blowing", "secret", "hack" (as in trick), or rhetorical "Ever wondered...?".
- No superhero, movie or kid metaphors. No emojis in spoken text.
- Speak to intermediate developers; never condescend.
- The call to action is honest and brief: the full interactive lesson is free on pymasters.net.
- Never present code as "from the lesson" unless it is verbatim; every snippet must run on its own as shown.
- Every visual must show exactly what it claims (plots plot real functions, traces show values only after the line runs).
The editor scores: hook, accuracy, specificity, clarity, originality, brand rules and simplicity; 8/10 is the bar.
Before answering, check your draft against every rule above as the editor would."""


def material_block(les: dict) -> str:
    return json.dumps({
        "lesson_title": les["title"], "track": les["track"], "difficulty": les["difficulty"],
        "summary": les["description"], "concepts": les["concepts"],
        "lesson_text": les["story"][:9000], "practice": les["challenges"], "lesson_url": les["url"],
    }, ensure_ascii=False, indent=1)


VISUAL = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["title", "code", "bullets", "compare", "output"]},
        "heading": {"type": "string", "description": "<= 40 chars, on-screen heading"},
        "code": {"type": "string", "description": "for code/output: <= 12 lines, <= 46 chars per line"},
        "highlight_lines": {"type": "array", "items": {"type": "integer"}},
        "bullets": {"type": "array", "items": {"type": "string"}, "description": "<= 4 bullets, <= 32 chars each"},
        "left": {"type": "string", "description": "compare: left label + code/text"},
        "right": {"type": "string", "description": "compare: right label + code/text"},
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
        "kind": {"type": "string", "enum": ["code", "trace", "flow", "timeline", "compare", "reveal", "plot"],
                 "description": "code: code types in, highlighted line moves, output appears. trace: code + a live "
                                "variables panel that changes step by step. flow: boxes and arrows light up in order "
                                "(data/request flow). timeline: parallel lanes with bars (threads/tasks/async). "
                                "compare: before vs after side by side. reveal: one big statement with a sub-line. "
                                "plot: a function curve drawn left to right with labelled points and an optional "
                                "horizontal threshold line (sigmoid, loss curves, O(n) vs O(n^2), learning rate...)."},
        "caption": {"type": "string", "description": "on-screen caption for this beat, <= 70 chars"},
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
        "post": {"type": "string", "description": "900-1300 characters incl. the code snippet; first line is the hook"},
        "code_snippet": {"type": "string", "description": "3-8 lines of runnable Python that appears in the post"},
        "animation": {"type": "object", "properties": {
            "title": {"type": "string", "description": "<= 44 chars, shown on the opening frame"},
            "beats": {"type": "array", "items": ANIM_BEAT, "minItems": 3, "maxItems": 6}},
            "required": ["title", "beats"],
            "description": "a one-of-a-kind animated explainer of THIS idea; choose beat kinds that make the idea "
                           "visible (e.g. trace for state changes, timeline for concurrency, flow for pipelines)"},
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


def short_prompt(les, feedback=None, previous=None):
    return f"""Write a YouTube Short (40-50 seconds spoken, 90-120 words in total across hook, scenes and cta) teaching ONE
specific, useful idea from this PyMasters lesson. The hook must land in the first 2 seconds. Each scene's narration is
1-2 sentences and its visual shows exactly what is being said (prefer real code). End on the cta.
On-screen code for a Short is read on a phone: at most 8 lines and 32 characters per line.
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def long_prompt(les, feedback=None, previous=None):
    return f"""Write a 6-9 minute YouTube tutorial (about 950-1350 spoken words) that teaches this PyMasters lesson properly:
motivation, the core concept, worked code examples built up step by step, a common mistake and its fix, and a short recap.
Visuals should mostly be code the viewer can follow. Chapters must flow; no filler.
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def linkedin_prompt(les, feedback=None, previous=None, style="jargon"):
    if style == "fun":
        return _linkedin_fun_prompt(les, feedback, previous)
    return f"""Write a LinkedIn post for the PyMasters company page in our "jargon, made simple" format: take ONE
intimidating term or complex task from this lesson and make it genuinely simple for working developers and tech-curious
professionals, in a way they have not seen before.
Structure (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
1. Hook (first line, <= 110 chars): name the scary term/task and promise the simple version, or state the surprising
   real-world consequence of not understanding it.
2. The simple version: ONE original analogy from everyday adult life (a kitchen, a warehouse, a bank queue, an office
   workflow...) that maps precisely onto the real mechanism, step for step. Then one sentence on where the analogy breaks.
   Never use superhero, movie or children's metaphors, and never a cliche analogy everybody uses.
3. The precise definition in one sentence, now that the reader is ready for it.
4. A tiny code snippet (indented 4 spaces) that shows the idea for real.
5. One practical takeaway: when this matters on the job.
6. An invitation to the free interactive lesson: {les['url']}
Then exactly three relevant hashtags. Length 900-1300 characters in total.
The animation must make the simplification visible: open on the jargon (reveal), show the analogy and the real
mechanism side by side or step by step (compare / flow / timeline / trace), and close on the takeaway (reveal).
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def _linkedin_fun_prompt(les, feedback=None, previous=None):
    return f"""Write a LinkedIn post for the PyMasters company page in our "Fun with Python" format: show the idea from
this lesson solving a small, playful real-world problem that working professionals and students in India recognise
from everyday life (splitting a restaurant bill fairly, planning a cricket tournament's fixtures, tracking monsoon
rainfall, picking a chai rota for the office, packing a trip within a baggage limit...). Pick a scenario that fits the
lesson's concept naturally; the reader should smile and think "I could use that this week".
Structure (plain text; LinkedIn has no markdown; short paragraphs; no emoji walls):
1. Hook (first line, <= 110 chars): the everyday situation, framed as a tiny challenge.
2. The fun part: 2-3 sentences setting up the scenario with concrete numbers or names.
3. A short, complete Python snippet (indented 4 spaces, 4-10 lines) that really solves it and prints a result.
4. One sentence on the Python idea that made it easy, named precisely (this is what the reader learns).
5. An invitation to try the free interactive lesson: {les['url']}
Then exactly three relevant hashtags. Length 900-1300 characters in total.
The code must run as written with the Python standard library and print what the post says it prints.
The animation must visualise the solution playfully: open on the scenario (reveal), show the data changing step by step
or the computation flowing (trace / flow / compare / timeline), and close on the result (reveal).
{_fb(feedback, previous)}
LESSON MATERIAL:
{material_block(les)}"""


def _linkedin_rule(draft: dict) -> str:
    if draft.get("style") == "fun":
        return ("For LinkedIn \"Fun with Python\" posts, demand a playful, concrete scenario from everyday life that a "
                "working professional or student recognises, solved by short Python that really runs and prints what "
                "the post claims; a contrived or boring scenario caps overall at 6. Also demand that the animation spec "
                "visualises the solution.")
    return ("For LinkedIn posts, demand that the jargon is made genuinely simple with an original, precise analogy (a "
            "cliche or inaccurate analogy caps overall at 6), and that the animation spec actually visualises the idea.")


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
