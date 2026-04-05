"""Collect trending Python/AI repos from GitHub using the search API."""

from datetime import datetime, timedelta, timezone
import requests
from pipeline.config import MAX_ITEMS_PER_SOURCE
from pipeline.utils.logger import get_logger

log = get_logger("collector.github")

SEARCH_URL = "https://api.github.com/search/repositories"


def collect() -> list[dict]:
    """Fetch recently created/updated Python repos with high star velocity."""
    items = []

    try:
        log.info("Fetching GitHub trending Python repos...")
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        resp = requests.get(
            SEARCH_URL,
            params={
                "q": f"language:python created:>{since} topic:ai OR topic:llm OR topic:machine-learning",
                "sort": "stars",
                "order": "desc",
                "per_page": min(MAX_ITEMS_PER_SOURCE, 30),
            },
            headers={"User-Agent": "PyMastersPipeline/1.0", "Accept": "application/vnd.github+json"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        for repo in data.get("items", []):
            items.append({
                "title": repo["full_name"],
                "url": repo["html_url"],
                "description": (repo.get("description") or "")[:300],
                "source": "github",
                "stars": repo.get("stargazers_count", 0),
                "language": repo.get("language", "Python"),
            })

        log.info(f"Collected {len(items)} trending repos.")
    except Exception as e:
        log.error(f"Failed to fetch GitHub trending: {e}")

    return items
