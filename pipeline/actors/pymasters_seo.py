"""Auto-generate SEO metadata for new PyMasters lessons.

For each new lesson, generates meta description, keywords, and
structured data suitable for search engine optimization.
"""

import json
import os
from anthropic import Anthropic
from pipeline.utils.logger import get_logger

log = get_logger("actor.pymasters_seo")

SEO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend",
    "content",
    "seo",
)

SEO_PROMPT = """Generate SEO metadata for this Python/AI lesson on pymasters.net.

LESSON TITLE: {title}
LESSON DESCRIPTION: {description}
LESSON TRACK: {track}
TAGS: {tags}

Return ONLY a JSON object with these fields:
- "meta_title": SEO-optimized page title (50-60 chars), include "PyMasters" brand
- "meta_description": Compelling meta description (150-160 chars) with primary keyword
- "keywords": array of 5-8 relevant search keywords/phrases
- "og_title": Open Graph title for social sharing
- "og_description": Open Graph description (under 200 chars)
- "canonical_slug": URL-friendly slug like "learn-python-decorators"
- "structured_data": JSON-LD schema.org object for a Course/LearningResource

No markdown fences. Valid JSON only."""


def generate_seo_metadata(lesson: dict) -> dict | None:
    """Generate SEO metadata for a lesson using Claude.

    Args:
        lesson: A lesson dict (matching the PyMasters lesson schema).

    Returns:
        SEO metadata dict, or None on failure.
    """
    title = lesson.get("title", {}).get("en", "")
    description = lesson.get("description", {}).get("en", "")
    track = lesson.get("track", "")
    tags = lesson.get("tags", {})
    tags_str = json.dumps(tags) if isinstance(tags, dict) else str(tags)

    if not title:
        log.warning("Lesson has no title, skipping SEO generation.")
        return None

    log.info(f"Generating SEO metadata for: {title}")

    client = Anthropic()
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": SEO_PROMPT.format(
                        title=title,
                        description=description,
                        track=track,
                        tags=tags_str,
                    ),
                }
            ],
        )

        response_text = response.content[0].text.strip()
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])

        seo_data = json.loads(response_text)
        seo_data["lesson_id"] = lesson.get("id", "")
        log.info(f"SEO metadata generated for: {title}")
        return seo_data

    except json.JSONDecodeError as e:
        log.error(f"Failed to parse SEO JSON: {e}")
        return None
    except Exception as e:
        log.error(f"SEO generation failed: {e}")
        return None


def save_seo_metadata(seo_data: dict) -> str | None:
    """Save SEO metadata to the seo directory.

    Args:
        seo_data: SEO metadata dict from generate_seo_metadata.

    Returns:
        Path to saved file, or None on failure.
    """
    lesson_id = seo_data.get("lesson_id", "unknown")
    os.makedirs(SEO_DIR, exist_ok=True)

    filepath = os.path.join(SEO_DIR, f"{lesson_id}.json")
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(seo_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        log.info(f"SEO metadata saved to {filepath}")
        return filepath
    except Exception as e:
        log.error(f"Failed to save SEO metadata: {e}")
        return None


def generate_seo_for_lesson(lesson: dict) -> str | None:
    """Convenience function: generate and save SEO metadata for a lesson.

    Args:
        lesson: A lesson dict.

    Returns:
        Path to saved SEO file, or None on failure.
    """
    seo_data = generate_seo_metadata(lesson)
    if seo_data is None:
        return None
    return save_seo_metadata(seo_data)
