"""Collect trending Python repos from GitHub."""

import re
import requests
from pipeline.config import MAX_ITEMS_PER_SOURCE
from pipeline.utils.logger import get_logger

log = get_logger("collector.github")

TRENDING_URL = "https://github.com/trending/python?since=daily"


def collect() -> list[dict]:
    """Scrape GitHub trending Python repos."""
    items = []

    try:
        log.info("Fetching GitHub trending Python repos...")
        resp = requests.get(TRENDING_URL, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (compatible; PyMastersPipeline/1.0)"
        })
        resp.raise_for_status()
        html = resp.text

        # Parse repo entries from the trending page HTML
        # Each repo is in an <article> with an h2 containing the repo link
        repo_pattern = re.compile(
            r'<h2[^>]*class="[^"]*h3[^"]*"[^>]*>\s*<a\s+href="(/[^"]+)"',
            re.DOTALL,
        )
        desc_pattern = re.compile(
            r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*(.*?)\s*</p>',
            re.DOTALL,
        )
        stars_pattern = re.compile(
            r'(\d[\d,]*)\s*stars today',
            re.IGNORECASE,
        )

        repo_links = repo_pattern.findall(html)
        descriptions = desc_pattern.findall(html)
        stars_today = stars_pattern.findall(html)

        for i, link in enumerate(repo_links[:MAX_ITEMS_PER_SOURCE]):
            repo_name = link.strip("/")
            desc = ""
            if i < len(descriptions):
                desc = re.sub(r"<[^>]+>", "", descriptions[i]).strip()
            stars = 0
            if i < len(stars_today):
                stars = int(stars_today[i].replace(",", ""))

            items.append({
                "title": repo_name,
                "url": f"https://github.com{link}",
                "description": desc,
                "source": "github",
                "stars": stars,
                "language": "Python",
            })

        log.info(f"Collected {len(items)} trending repos.")
    except Exception as e:
        log.error(f"Failed to fetch GitHub trending: {e}")

    return items
