"""Generate quiz questions for lessons that have none (2026-11-02).

Runs on the ops laptop with the Claude Code CLI (subscription, no GCP cost), reusing socialbot.llm.
Quality gate per question:
  1. structure: 4 distinct options in English and Tamil, one correct index;
  2. blind check: a separate call answers the question WITHOUT the key; disagreement or an
     "ambiguous" verdict drops the question;
  3. at least MIN_KEEP questions must survive, otherwise the lesson is left unchanged.
Correct-answer positions are shuffled in code (same permutation for both languages).

Usage: python scripts/gen_quizzes.py [--track python_fundamentals] [--limit N] [--dry-run] [lesson_id ...]
"""
import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from socialbot.llm import LLMError, ask_json  # noqa: E402

LESSONS = ROOT / "backend" / "lessons"
WANT, MIN_KEEP, CANDIDATES = 4, 3, 6

WRITER_SCHEMA = {
    "type": "object", "required": ["questions"],
    "properties": {"questions": {"type": "array", "minItems": CANDIDATES, "maxItems": CANDIDATES, "items": {
        "type": "object", "required": ["q_en", "q_ta", "options_en", "options_ta", "correct"],
        "properties": {
            "q_en": {"type": "string"}, "q_ta": {"type": "string"},
            "options_en": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
            "options_ta": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
            "correct": {"type": "integer", "minimum": 0, "maximum": 3},
        }}}},
}
CHECK_SCHEMA = {
    "type": "object", "required": ["answers"],
    "properties": {"answers": {"type": "array", "items": {
        "type": "object", "required": ["index", "choice", "ambiguous"],
        "properties": {"index": {"type": "integer"}, "choice": {"type": "integer", "minimum": 0, "maximum": 3},
                       "ambiguous": {"type": "boolean"}}}}},
}

WRITER = """You write multiple-choice recall questions for a Python learning platform (PyMasters).
Rules:
- Base every question ONLY on the lesson text given; test understanding, not trivia or wording.
- Mix kinds: "what does this print" with a tiny snippet (inline, max 3 short lines), concept checks, and spot-the-mistake.
- Exactly one option is correct; the 3 wrong options are plausible misconceptions a beginner really has.
- Keep each question under 160 characters and each option under 70. No "all of the above"/"none of the above".
- Python code must be exactly right for Python 3.12.
- q_ta / options_ta: natural Tamil translations of the same question and options in the SAME order (keep code, numbers and identifiers unchanged).
- "correct" is the 0-based index of the right option."""

CHECKER = """You are checking quiz questions. For each question choose the single best option (0-based index).
Set ambiguous=true if more than one option could be argued correct, none is correct, or the question is unclear.
Be rigorous: mentally run any code exactly as Python 3.12 would."""


def lesson_text(d: dict, limit: int = 12000) -> str:
    parts = []

    def walk(o, key=""):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("ta", "hi", "es", "fr", "de", "zh", "ja"):
                    continue
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, str) and len(o) > 2 and key not in ("id", "type", "track", "module", "topic"):
            parts.append(o)

    for k in ("title", "description", "story_variants", "content_sections", "practice_challenges"):
        walk(d.get(k))
    return "\n".join(parts)[:limit]


def structurally_ok(q: dict) -> bool:
    en, ta = q["options_en"], q["options_ta"]
    return (len(en) == len(ta) == 4 and len({o.strip().lower() for o in en}) == 4
            and all(o.strip() for o in en + ta) and q["q_en"].strip() and q["q_ta"].strip()
            and 0 <= q["correct"] <= 3 and not any("all of the above" in o.lower() for o in en))


def shuffled(q: dict) -> dict:
    order = list(range(4))
    random.shuffle(order)
    return {"q": {"en": q["q_en"].strip(), "ta": q["q_ta"].strip()},
            "options": {"en": [q["options_en"][i].strip() for i in order],
                        "ta": [q["options_ta"][i].strip() for i in order]},
            "correct": order.index(q["correct"])}


def make_quiz(d: dict) -> tuple[list, str]:
    title = d["title"]["en"] if isinstance(d["title"], dict) else d["title"]
    w = ask_json(f"Lesson: {title}\n\n{lesson_text(d)}\n\nWrite {CANDIDATES} questions.", WRITER_SCHEMA, system=WRITER)
    cands = [q for q in w["questions"] if structurally_ok(q)]
    if not cands:
        return [], "no structurally valid questions"
    listing = "\n\n".join(f"[{i}] {q['q_en']}\n" + "\n".join(f"  {j}. {o}" for j, o in enumerate(q["options_en"]))
                          for i, q in enumerate(cands))
    c = ask_json(f"Questions:\n\n{listing}", CHECK_SCHEMA, system=CHECKER)
    verdict = {a["index"]: a for a in c["answers"]}
    kept = [q for i, q in enumerate(cands)
            if i in verdict and not verdict[i]["ambiguous"] and verdict[i]["choice"] == q["correct"]]
    note = f"{len(w['questions'])} written, {len(cands)} valid, {len(kept)} passed blind check"
    return [shuffled(q) for q in kept[:WANT]], note


def with_quiz(text: str, quiz: list) -> str:
    """Append "quiz" as the last key by text insertion so the rest of the file keeps its formatting."""
    body = text.rstrip()
    assert body.endswith("}")
    block = json.dumps(quiz, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    out = body[:-1].rstrip() + ',\n  "quiz": ' + block + "\n}" + text[len(body):]
    expected = json.loads(text)
    expected["quiz"] = quiz
    assert json.loads(out) == expected
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--track")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    files = sorted(LESSONS.glob(f"{a.track or '*'}/*.json"))
    todo = []
    for f in files:
        if f.name == "schema.json":
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("quiz") or (a.ids and d.get("id") not in a.ids):
            continue
        todo.append((f, d))
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(todo)} lessons to do", flush=True)
    for f, d in todo:
        try:
            quiz, note = make_quiz(d)
        except LLMError as e:
            print(f"SKIP {d.get('id')}: {e}", flush=True)
            continue
        if len(quiz) < MIN_KEEP:
            print(f"SKIP {d.get('id')}: {note}", flush=True)
            continue
        print(f"OK   {d.get('id')}: {note}", flush=True)
        if a.dry_run:
            print(json.dumps(quiz, ensure_ascii=False, indent=1))
            continue
        f.write_text(with_quiz(f.read_text(encoding="utf-8"), quiz), encoding="utf-8")


if __name__ == "__main__":
    main()
