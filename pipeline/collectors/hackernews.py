"""Collect AI-related items from Hacker News."""

import requests
from pipeline.config import AI_KEYWORDS, MAX_ITEMS_PER_SOURCE
from pipeline.utils.logger import get_logger

log = get_logger("collector.hackernews")

HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"


def _is_ai_related(title: str) -> bool:
    """Check if a title contains AI/ML keywords."""
    title_lower = title.lower()
    return any(kw in title_lower for kw in AI_KEYWORDS)


def collect() -> list[dict]:
    """Fetch top HN stories and filter for AI/ML content."""
    items = []

    try:
        log.info("Fetching Hacker News top stories...")
        resp = requests.get(HN_TOP_URL, timeout=10)
        resp.raise_for_status()
        story_ids = resp.json()

        # Check top 100 stories for AI relevance
        checked = 0
        for story_id in story_ids[:100]:
            if len(items) >= MAX_ITEMS_PER_SOURCE:
                break

            try:
                item_resp = requests.get(
                    HN_ITEM_URL.format(story_id), timeout=5
                )
                item_resp.raise_for_status()
                story = item_resp.json()

                if not story or story.get("type") != "story":
                    continue

                title = story.get("title", "")
                if not _is_ai_related(title):
                    continue

                items.append({
                    "title": title,
                    "url": story.get("url", f"https://news.ycombinator.com/item?id={story_id}"),
                    "description": title,  # HN stories don't have descriptions
                    "source": "hackernews",
                    "score": story.get("score", 0),
                })
                checked += 1
            except Exception:
                continue

        log.info(f"Collected {len(items)} AI-related HN stories.")
    except Exception as e:
        log.error(f"Failed to fetch Hacker News: {e}")

    return items
