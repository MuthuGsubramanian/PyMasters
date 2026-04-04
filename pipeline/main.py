"""Main entry point for the PyMasters Daily AI Intelligence Pipeline."""

import sys
import os

# Ensure the project root is on the path so imports work when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.collectors import huggingface, arxiv, github, hackernews
from pipeline.analyzers.relevance import analyze
from pipeline.actors.github_issues import create_issues
from pipeline.actors.digest import generate_digest
from pipeline.actors.pymasters_content import create_lesson_pr
from pipeline.actors.pymasters_seo import generate_seo_for_lesson
from pipeline.utils.logger import get_logger

log = get_logger("pipeline.main")


def run_daily_pipeline():
    """Orchestrate the full daily pipeline: collect, analyze, act, report."""
    log.info("=" * 60)
    log.info("Starting PyMasters Daily AI Intelligence Pipeline")
    log.info("=" * 60)

    # 1. Collect from all sources (each collector is independent)
    all_items = []
    collection_stats = {}

    collectors = [
        ("huggingface", huggingface.collect),
        ("arxiv", arxiv.collect),
        ("github", github.collect),
        ("hackernews", hackernews.collect),
    ]

    for name, collect_fn in collectors:
        try:
            log.info(f"Running collector: {name}")
            items = collect_fn()
            collection_stats[name] = len(items)
            all_items.extend(items)
            log.info(f"  -> {len(items)} items from {name}")
        except Exception as e:
            log.error(f"Collector '{name}' failed: {e}")
            collection_stats[name] = 0

    log.info(f"Total items collected: {len(all_items)}")

    if not all_items:
        log.warning("No items collected from any source. Exiting.")
        return

    # 2. Analyze with Claude
    log.info("Analyzing items with Claude...")
    try:
        scored_items = analyze(all_items)
    except Exception as e:
        log.error(f"Analysis failed: {e}")
        scored_items = all_items  # Continue with unscored items

    # 3. Act on high-scoring items
    log.info("Creating GitHub issues for high-scoring Homie items...")
    try:
        issues_created = create_issues(scored_items)
    except Exception as e:
        log.error(f"Issue creation failed: {e}")
        issues_created = []

    # 3b. Auto-generate PyMasters lesson for top pymasters-scored item (max 1 per run)
    log.info("Checking for PyMasters lesson generation opportunities...")
    lessons_created = []
    try:
        lessons_created = create_lesson_pr(scored_items, max_lessons=1)
        for lc in lessons_created:
            log.info(f"  Lesson PR: {lc.get('title', '?')} -> {lc.get('pr_url', 'no PR')}")
    except Exception as e:
        log.error(f"Lesson generation failed: {e}")

    # 3c. Generate SEO metadata for any new lessons
    if lessons_created:
        log.info("Generating SEO metadata for new lessons...")
        for lc in lessons_created:
            try:
                # Reload the lesson JSON to pass to SEO generator
                lesson_id = lc.get("lesson_id", "")
                if lesson_id:
                    import json
                    from pathlib import Path
                    lessons_dir = Path(__file__).parent.parent / "backend" / "lessons"
                    for track_dir in lessons_dir.iterdir():
                        lesson_file = track_dir / f"{lesson_id}.json"
                        if lesson_file.exists():
                            with open(lesson_file, "r", encoding="utf-8") as f:
                                lesson_data = json.load(f)
                            seo_path = generate_seo_for_lesson(lesson_data)
                            if seo_path:
                                log.info(f"  SEO metadata saved: {seo_path}")
                            break
            except Exception as e:
                log.error(f"SEO generation failed for {lc.get('lesson_id', '?')}: {e}")

    # 4. Generate digest
    log.info("Generating daily digest...")
    try:
        report_path = generate_digest(scored_items, issues_created, collection_stats)
        log.info(f"Report saved: {report_path}")
    except Exception as e:
        log.error(f"Digest generation failed: {e}")

    # 5. Summary
    log.info("=" * 60)
    log.info("Pipeline complete!")
    log.info(f"  Items collected: {len(all_items)}")
    log.info(f"  Items analyzed: {len(scored_items)}")
    log.info(f"  Issues created: {len(issues_created)}")
    log.info(f"  Lessons generated: {len(lessons_created)}")
    log.info("=" * 60)


if __name__ == "__main__":
    run_daily_pipeline()
