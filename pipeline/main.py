"""Main entry point for the PyMasters Daily AI Intelligence Pipeline."""

import sys
import os

# Ensure the project root is on the path so imports work when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.collectors import huggingface, arxiv, github, hackernews
from pipeline.analyzers.relevance import analyze
from pipeline.actors.github_issues import create_issues
from pipeline.actors.digest import generate_digest
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
    log.info("=" * 60)


if __name__ == "__main__":
    run_daily_pipeline()
