"""Auto-generate PyMasters lesson content from pipeline discoveries.

Takes high-scoring items (pymasters_score >= 7) and generates complete
lesson JSON files matching the existing schema, then creates a PR.
"""

import json
import os
import re
import subprocess
from pipeline.config import PYMASTERS_REPO, RELEVANCE_THRESHOLD_PYMASTERS
from pipeline.utils.claude import ask_claude_json
from pipeline.utils.logger import get_logger

log = get_logger("actor.pymasters_content")

LESSONS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend",
    "lessons",
)

# The track where pipeline-generated lessons land
DEFAULT_TRACK = "ai_engineering"
DEFAULT_MODULE = "trending_ai"

LESSON_GENERATION_PROMPT = """You are a Python/AI education content creator for PyMasters (pymasters.net).

Generate a COMPLETE lesson JSON file for the following trending AI topic.

TOPIC: {title}
DESCRIPTION: {description}
OPPORTUNITY: {opportunity}

The lesson must follow this EXACT JSON schema and match the quality of existing PyMasters lessons.
Use these rules:
- id: snake_case slug derived from the topic (e.g., "fine_tuning_llama")
- topic: same as id
- track: "{track}"
- module: "{module}"
- order: 99 (will be reordered later)
- title: object with "en" key (English title)
- description: object with "en" key (1-2 sentence description)
- xp_reward: 50-75 based on complexity
- next_unlock: null
- story_variants: object with "en" key containing rich markdown content:
  - Start with a ## heading and an engaging intro paragraph from "Vaathiyaar" (the AI teacher)
  - Include ### subheadings for key concepts
  - Use markdown tables for comparisons
  - Include ``` code blocks with Python examples
  - End with a > blockquote "Key Insight"
  - Should be 400-600 words
- animation_sequence: array with at least:
  - One StoryCard (intro)
  - One CodeStepper with 6-10 steps showing Python code line by line
  - One ParticleEffect (finish)
- practice_challenges: array with 1-2 challenges, each having:
  - instruction: object with "en" key
  - starter_code: string with skeleton code
  - expected_output: string
  - hints: object with "en" key (array of 2-3 hint strings)
  - test_code: string with assertion-based test
- tags: object with concepts_taught, concepts_required, difficulty, engagement_type, estimated_minutes, category, path_memberships
- generated: true

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON."""


def _slugify(text: str) -> str:
    """Convert text to a snake_case slug."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    text = re.sub(r"\s+", "_", text)
    text = text[:50].rstrip("_")
    return text


def _branch_exists_remote(branch_name: str) -> bool:
    """Check if a branch already exists on the remote."""
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--heads", "origin", branch_name],
            capture_output=True, text=True, timeout=15,
            cwd=os.path.dirname(LESSONS_DIR),
        )
        return branch_name in result.stdout
    except Exception:
        return False


def _get_existing_lesson_ids() -> set[str]:
    """Get all existing lesson IDs to avoid duplicates."""
    ids = set()
    for track_dir in os.listdir(LESSONS_DIR):
        track_path = os.path.join(LESSONS_DIR, track_dir)
        if os.path.isdir(track_path):
            for f in os.listdir(track_path):
                if f.endswith(".json") and f != "schema.json":
                    ids.add(f.replace(".json", ""))
    return ids


def generate_lesson(item: dict) -> dict | None:
    """Generate a lesson JSON from a scored pipeline item using Claude.

    Returns the lesson dict on success, None on failure.
    """
    title = item.get("title", "Unknown")
    description = item.get("description", "")[:500]
    opportunity = item.get("opportunity", "")

    log.info(f"Generating lesson for: {title}")

    try:
        prompt = LESSON_GENERATION_PROMPT.format(
            title=title,
            description=description,
            opportunity=opportunity,
            track=DEFAULT_TRACK,
            module=DEFAULT_MODULE,
        )
        lesson = ask_claude_json(prompt)

        # Ensure required fields
        lesson.setdefault("generated", True)
        lesson.setdefault("track", DEFAULT_TRACK)
        lesson.setdefault("module", DEFAULT_MODULE)

        # Validate id is a proper slug
        if not lesson.get("id"):
            lesson["id"] = _slugify(title)
        lesson["topic"] = lesson["id"]

        log.info(f"Lesson generated: {lesson['id']}")
        return lesson

    except json.JSONDecodeError as e:
        log.error(f"Failed to parse lesson JSON: {e}")
        return None
    except Exception as e:
        log.error(f"Lesson generation failed: {e}")
        return None


def save_and_create_pr(lesson: dict, source_item: dict) -> str | None:
    """Save lesson to file, create a git branch, commit, and open a PR.

    Returns the PR URL on success, None on failure.
    """
    lesson_id = lesson["id"]
    track = lesson.get("track", DEFAULT_TRACK)
    branch_name = f"pipeline/lesson-{lesson_id}"
    repo_root = os.path.dirname(os.path.dirname(LESSONS_DIR))

    # Check if branch already exists (lesson already proposed)
    if _branch_exists_remote(branch_name):
        log.info(f"Branch {branch_name} already exists. Skipping.")
        return None

    # Ensure track directory exists
    track_dir = os.path.join(LESSONS_DIR, track)
    os.makedirs(track_dir, exist_ok=True)

    lesson_path = os.path.join(track_dir, f"{lesson_id}.json")
    relative_path = os.path.relpath(lesson_path, repo_root)

    # Save lesson JSON
    with open(lesson_path, "w", encoding="utf-8") as f:
        json.dump(lesson, f, indent=2, ensure_ascii=False)
        f.write("\n")

    log.info(f"Lesson saved to {lesson_path}")

    # Git operations
    try:
        run = lambda cmd: subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, cwd=repo_root
        )

        # Start from main
        run(["git", "checkout", "main"])
        run(["git", "pull", "origin", "main"])

        # Create branch
        result = run(["git", "checkout", "-b", branch_name])
        if result.returncode != 0:
            log.error(f"Failed to create branch: {result.stderr}")
            return None

        # Stage and commit
        run(["git", "add", relative_path])
        commit_msg = f"feat(lesson): auto-generate lesson '{lesson['title'].get('en', lesson_id)}'"
        result = run(["git", "commit", "-m", commit_msg])
        if result.returncode != 0:
            log.error(f"Commit failed: {result.stderr}")
            run(["git", "checkout", "main"])
            return None

        # Push
        result = run(["git", "push", "-u", "origin", branch_name])
        if result.returncode != 0:
            log.error(f"Push failed: {result.stderr}")
            run(["git", "checkout", "main"])
            return None

        # Create PR
        pr_title = f"[Pipeline] New lesson: {lesson['title'].get('en', lesson_id)}"
        pr_body = f"""## Auto-generated Lesson

**Topic:** {lesson['title'].get('en', lesson_id)}
**Track:** {track}
**Source:** {source_item.get('source', 'pipeline')} - [{source_item.get('title', '')}]({source_item.get('url', '')})
**PyMasters Score:** {source_item.get('pymasters_score', 0)}/10

### Description
{lesson.get('description', {}).get('en', 'N/A')}

### What's included
- Theory/explanation content (story_variants)
- Code examples (animation_sequence with CodeStepper)
- Practice challenges with tests

---
*Auto-generated by PyMasters AI Intelligence Pipeline*"""

        # Ensure label exists
        subprocess.run(
            [
                "gh", "label", "create", "pipeline-generated",
                "--repo", PYMASTERS_REPO,
                "--color", "0E8A16",
                "--description", "Auto-generated by AI pipeline",
                "--force",
            ],
            capture_output=True, text=True, timeout=15,
        )

        result = subprocess.run(
            [
                "gh", "pr", "create",
                "--repo", PYMASTERS_REPO,
                "--title", pr_title,
                "--body", pr_body,
                "--label", "pipeline-generated",
                "--head", branch_name,
                "--base", "main",
            ],
            capture_output=True, text=True, timeout=30,
        )

        # Return to main
        run(["git", "checkout", "main"])

        if result.returncode == 0:
            pr_url = result.stdout.strip()
            log.info(f"PR created: {pr_url}")
            return pr_url
        else:
            log.error(f"PR creation failed: {result.stderr}")
            return None

    except Exception as e:
        log.error(f"Git/PR workflow failed: {e}")
        # Try to return to main
        try:
            subprocess.run(
                ["git", "checkout", "main"],
                capture_output=True, text=True, timeout=10, cwd=repo_root,
            )
        except Exception:
            pass
        return None


def create_lesson_pr(items: list[dict], max_lessons: int = 1) -> list[dict]:
    """Main entry point: generate lessons for high-scoring pymasters items.

    Args:
        items: Scored items from the pipeline analysis step.
        max_lessons: Maximum number of lesson PRs to create (default 1).

    Returns:
        List of dicts with lesson info and PR URLs.
    """
    results = []

    # Filter to pymasters-relevant items above threshold
    candidates = [
        item for item in items
        if item.get("pymasters_score", 0) >= RELEVANCE_THRESHOLD_PYMASTERS
        and item.get("product") in ("pymasters", "both")
    ]

    if not candidates:
        log.info("No items above PyMasters relevance threshold for lesson generation.")
        return results

    # Sort by score descending, take the best ones
    candidates.sort(key=lambda x: x.get("pymasters_score", 0), reverse=True)

    existing_ids = _get_existing_lesson_ids()
    lessons_created = 0

    for item in candidates:
        if lessons_created >= max_lessons:
            break

        # Generate a slug to check for duplicates
        slug = _slugify(item.get("title", ""))
        if slug in existing_ids:
            log.info(f"Lesson '{slug}' already exists. Skipping.")
            continue

        # Generate the lesson content
        lesson = generate_lesson(item)
        if lesson is None:
            continue

        # Check again with the actual generated ID
        if lesson["id"] in existing_ids:
            log.info(f"Lesson '{lesson['id']}' already exists. Skipping.")
            continue

        # Save and create PR
        pr_url = save_and_create_pr(lesson, item)

        results.append({
            "lesson_id": lesson["id"],
            "title": lesson.get("title", {}).get("en", lesson["id"]),
            "pr_url": pr_url,
            "source_item": item.get("title", ""),
        })
        lessons_created += 1

    log.info(f"Lesson generation complete. {lessons_created} lesson(s) created.")
    return results
