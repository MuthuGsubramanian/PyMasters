"""5-stage module generation pipeline."""

import json
import re
import uuid
import sqlite3
import os
from datetime import datetime
from vaathiyaar.engine import call_vaathiyaar
from vaathiyaar.profiler import get_student_profile
from modules.templates import CONCEPT_TEMPLATES, get_template_for_topic
from notifications.dispatcher import create_notification


def _get_db_path():
    return os.environ.get("DB_PATH", "pymasters.db")


def _update_job_status(job_id, status, stage_data=None, error=None):
    conn = sqlite3.connect(_get_db_path())
    conn.execute(
        "UPDATE module_generation_jobs SET status = ?, current_stage_data = ?, error_message = ?, updated_at = ? WHERE id = ?",
        [status, json.dumps(stage_data) if stage_data else None, error, datetime.utcnow().isoformat(), job_id],
    )
    conn.commit()
    conn.close()


def _extract_json(raw: str) -> dict:
    """Extract a JSON object from a raw string, stripping markdown code fences if present."""
    text = raw.strip()
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()
    # Attempt direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find a JSON object within the text using a regex scan
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Return raw text wrapped in a dict as last resort
    return {"raw": raw}


def stage_1_outline(job_id, topic, user_id):
    """Stage 1: Generate learning objectives and outline for the topic."""
    _update_job_status(job_id, "stage_1_outline")

    profile = get_student_profile(_get_db_path(), str(user_id))
    skill_level = (profile or {}).get("skill_level", "beginner")

    prompt = (
        f"You are generating a structured Python lesson outline for a {skill_level} student.\n"
        f"Topic: {topic}\n\n"
        "Return a JSON object with these fields:\n"
        "{\n"
        '  "title": "Short lesson title",\n'
        '  "description": "One-sentence description of what the student will learn",\n'
        '  "learning_objectives": ["objective 1", "objective 2", "objective 3"],\n'
        '  "key_concepts": ["concept 1", "concept 2"],\n'
        '  "track": "python_fundamentals",\n'
        '  "module": "module_slug",\n'
        '  "xp_reward": 75,\n'
        '  "difficulty": "beginner"\n'
        "}\n\n"
        "Respond ONLY with valid JSON. No markdown, no explanation."
    )

    response = call_vaathiyaar(
        user_message=prompt,
        student_profile=profile,
        lesson_context={"pipeline_stage": "outline", "topic": topic},
        temperature=0.5,
        max_tokens=600,
    )

    raw_message = response.get("message", "")
    outline = _extract_json(raw_message)

    # Ensure required keys have sensible defaults
    outline.setdefault("title", topic.replace("_", " ").title())
    outline.setdefault("description", f"Learn about {topic}")
    outline.setdefault("learning_objectives", [f"Understand {topic}"])
    outline.setdefault("key_concepts", [topic])
    outline.setdefault("track", "python_fundamentals")
    outline.setdefault("module", topic.lower().replace(" ", "_"))
    outline.setdefault("xp_reward", 75)
    outline.setdefault("difficulty", skill_level)

    _update_job_status(job_id, "stage_1_complete", stage_data={"outline": outline})
    return outline


def stage_2_narrative(job_id, outline, user_id):
    """Stage 2: Generate structured story content (story_variants) for the lesson."""
    _update_job_status(job_id, "stage_2_narrative")

    profile = get_student_profile(_get_db_path(), str(user_id))
    title = outline.get("title", "")
    objectives = outline.get("learning_objectives", [])
    key_concepts = outline.get("key_concepts", [])

    prompt = (
        f"You are writing the narrative content for a PyMasters lesson titled: '{title}'.\n"
        f"Learning objectives: {', '.join(objectives)}\n"
        f"Key concepts: {', '.join(key_concepts)}\n\n"
        "Write an engaging story-based explanation in structured Markdown. Use:\n"
        "- ## headings for sections\n"
        "- Bullet points for lists\n"
        "- | tables | for comparisons\n"
        "> blockquote callouts for key concepts\n\n"
        "Return a JSON object with this structure:\n"
        "{\n"
        '  "en": "## Story Title\\n\\nNarrative content in English...",\n'
        '  "ta": "## கதை தலைப்பு\\n\\nTamil narrative content..."\n'
        "}\n\n"
        "Make the story relatable with a real-world analogy (e.g. postman, chef, train). "
        "Respond ONLY with valid JSON. No extra text."
    )

    response = call_vaathiyaar(
        user_message=prompt,
        student_profile=profile,
        lesson_context={"pipeline_stage": "narrative", "outline": outline},
        temperature=0.7,
        max_tokens=1200,
    )

    raw_message = response.get("message", "")
    narrative = _extract_json(raw_message)

    # Ensure at minimum an English variant exists
    if "en" not in narrative or not isinstance(narrative.get("en"), str):
        narrative = {
            "en": (
                f"## {outline.get('title', 'Lesson')}\n\n"
                f"{outline.get('description', '')}\n\n"
                + "\n".join(f"- {obj}" for obj in objectives)
            ),
            "ta": "",
        }

    _update_job_status(job_id, "stage_2_complete", stage_data={"narrative_keys": list(narrative.keys())})
    return narrative


def stage_3_animation(job_id, outline, narrative):
    """Stage 3: Select animation template and compose the animation_sequence."""
    _update_job_status(job_id, "stage_3_animation")

    topic = outline.get("module", outline.get("title", ""))
    template_key = get_template_for_topic(topic)
    template = CONCEPT_TEMPLATES[template_key]
    base_sequence = template["sequence"]

    # Compose a richer animation sequence with ids and durations
    animation_sequence = []
    for i, item in enumerate(base_sequence):
        step = dict(item)
        step["id"] = f"{item['type'].lower()}_{i + 1}"
        step["duration_ms"] = 3000 if item["type"] == "StoryCard" else 2500
        # Remove placeholder props dict for cleaner output
        if "props" in step and step["props"] == {}:
            del step["props"]
        animation_sequence.append(step)

    result = {
        "template_key": template_key,
        "template_description": template["description"],
        "animation_sequence": animation_sequence,
    }

    _update_job_status(job_id, "stage_3_complete", stage_data={"template_key": template_key, "step_count": len(animation_sequence)})
    return result


def stage_4_challenges(job_id, outline, narrative):
    """Stage 4: Generate practice challenges with hints and test code."""
    _update_job_status(job_id, "stage_4_challenges")

    title = outline.get("title", "")
    objectives = outline.get("learning_objectives", [])
    difficulty = outline.get("difficulty", "beginner")
    story_en = narrative.get("en", "") if isinstance(narrative, dict) else ""

    prompt = (
        f"Generate 2 practice challenges for a PyMasters lesson on: '{title}'\n"
        f"Difficulty: {difficulty}\n"
        f"Learning objectives: {', '.join(objectives)}\n\n"
        "Return a JSON array with exactly 2 challenge objects:\n"
        "[\n"
        "  {\n"
        '    "instruction": {"en": "Write a Python program that...", "ta": "Tamil translation..."},\n'
        '    "expected_output": "exact expected stdout output",\n'
        '    "hints": ["Hint 1", "Hint 2"],\n'
        '    "test_code": "# starter code or None"\n'
        "  }\n"
        "]\n\n"
        "Each challenge must be solvable with basic Python. "
        "expected_output must be an exact string matching print() output. "
        "Respond ONLY with a valid JSON array. No extra text."
    )

    response = call_vaathiyaar(
        user_message=prompt,
        lesson_context={"pipeline_stage": "challenges", "outline": outline},
        temperature=0.6,
        max_tokens=900,
    )

    raw_message = response.get("message", "")
    text = raw_message.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()

    challenges = []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            challenges = parsed
        elif isinstance(parsed, dict) and "challenges" in parsed:
            challenges = parsed["challenges"]
    except json.JSONDecodeError:
        # Try to extract JSON array from text
        match = re.search(r'\[[\s\S]*\]', text)
        if match:
            try:
                challenges = json.loads(match.group())
            except json.JSONDecodeError:
                challenges = []

    # Ensure at least one fallback challenge
    if not challenges:
        challenges = [
            {
                "instruction": {
                    "en": f"Write a Python program related to {title}.",
                    "ta": f"{title} பற்றிய Python நிரல் எழுதுங்கள்.",
                },
                "expected_output": "Hello, PyMasters!",
                "hints": ["Start with print()", "Use a variable to store your message"],
                "test_code": "# Write your solution here\n",
            }
        ]

    # Normalise each challenge
    normalised = []
    for ch in challenges:
        if not isinstance(ch, dict):
            continue
        ch.setdefault("instruction", {"en": f"Practice {title}", "ta": ""})
        ch.setdefault("expected_output", "")
        ch.setdefault("hints", ["Think step by step"])
        ch.setdefault("test_code", "# Write your solution here\n")
        normalised.append(ch)

    _update_job_status(job_id, "stage_4_complete", stage_data={"challenge_count": len(normalised)})
    return normalised


def stage_5_assembly(job_id, user_id, topic, outline, narrative, animation, challenges):
    """Stage 5: Assemble full lesson JSON, store in DB, send notification."""
    _update_job_status(job_id, "stage_5_assembly")

    # Generate a deterministic-ish but unique lesson ID
    uid8 = str(uuid.uuid4()).replace("-", "")[:8]
    topic_slug = re.sub(r"[^a-z0-9_]", "_", topic.lower().strip()).strip("_")
    lesson_id = f"gen_{topic_slug}_{uid8}"

    # Build the full lesson JSON matching the existing schema
    lesson_data = {
        "id": lesson_id,
        "topic": topic_slug,
        "track": outline.get("track", "python_fundamentals"),
        "module": outline.get("module", topic_slug),
        "order": 1,
        "title": {
            "en": outline.get("title", topic.replace("_", " ").title()),
            "ta": outline.get("title_ta", ""),
        },
        "description": {
            "en": outline.get("description", f"Learn about {topic}"),
            "ta": outline.get("description_ta", ""),
        },
        "xp_reward": outline.get("xp_reward", 75),
        "next_unlock": None,
        "story_variants": narrative if isinstance(narrative, dict) else {"en": str(narrative)},
        "animation_sequence": animation.get("animation_sequence", []),
        "practice_challenges": challenges,
        "generated": True,
        "speed_multiplier": 1.0,
    }

    db_path = _get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        # Fetch trigger info from the job row so we can store it alongside the lesson
        job_row = conn.execute(
            "SELECT trigger, trigger_detail FROM module_generation_jobs WHERE id = ?",
            [job_id],
        ).fetchone()
        trigger = job_row[0] if job_row else "manual"
        trigger_detail = job_row[1] if job_row else None

        conn.execute(
            """INSERT INTO generated_lessons
               (id, user_id, job_id, topic, track, lesson_data, trigger, trigger_detail, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                lesson_id,
                user_id,
                job_id,
                topic_slug,
                outline.get("track", "python_fundamentals"),
                json.dumps(lesson_data),
                trigger,
                trigger_detail,
                datetime.utcnow().isoformat(),
            ],
        )

        # Mark the job as completed and store the result lesson id
        conn.execute(
            "UPDATE module_generation_jobs SET status = ?, result_lesson_id = ?, updated_at = ? WHERE id = ?",
            ["completed", lesson_id, datetime.utcnow().isoformat(), job_id],
        )
        conn.commit()
    finally:
        conn.close()

    # Send an in-app notification to the user
    lesson_title = lesson_data["title"]["en"]
    try:
        create_notification(
            user_id=user_id,
            notif_type="module_ready",
            title="Your new lesson is ready!",
            message=f'"{lesson_title}" has been generated just for you. Start learning now!',
            link=f"/lesson/{lesson_id}",
            metadata={"lesson_id": lesson_id, "topic": topic_slug, "job_id": job_id},
        )
    except Exception:
        # Notification failure should not abort a successful pipeline run
        pass

    return lesson_id


def run_pipeline(job_id, user_id, topic):
    """Run full 5-stage pipeline."""
    try:
        outline = stage_1_outline(job_id, topic, user_id)
        narrative = stage_2_narrative(job_id, outline, user_id)
        animation = stage_3_animation(job_id, outline, narrative)
        challenges = stage_4_challenges(job_id, outline, narrative)
        lesson_id = stage_5_assembly(job_id, user_id, topic, outline, narrative, animation, challenges)
        return lesson_id
    except Exception as e:
        _update_job_status(job_id, "failed", error=str(e))
        raise
