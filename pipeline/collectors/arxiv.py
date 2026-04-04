"""Collect recent AI/ML papers from arXiv."""

import arxiv
from datetime import datetime, timedelta, timezone
from pipeline.config import MAX_ITEMS_PER_SOURCE
from pipeline.utils.logger import get_logger

log = get_logger("collector.arxiv")

CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"]


def collect() -> list[dict]:
    """Fetch top recent papers from arXiv in AI/ML categories."""
    items = []

    try:
        log.info("Fetching recent arXiv papers...")
        query = " OR ".join(f"cat:{cat}" for cat in CATEGORIES)
        client = arxiv.Client()
        search = arxiv.Search(
            query=query,
            max_results=MAX_ITEMS_PER_SOURCE,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending,
        )

        for paper in client.results(search):
            abstract = paper.summary.replace("\n", " ").strip()
            if len(abstract) > 500:
                abstract = abstract[:497] + "..."

            items.append({
                "title": paper.title,
                "url": paper.entry_id,
                "description": abstract,
                "source": "arxiv",
                "authors": [a.name for a in paper.authors[:5]],
            })

        log.info(f"Collected {len(items)} arXiv papers.")
    except Exception as e:
        log.error(f"Failed to fetch arXiv papers: {e}")

    return items
