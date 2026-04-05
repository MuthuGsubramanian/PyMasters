"""Collect trending models, spaces, and datasets from HuggingFace."""

from datetime import datetime, timedelta, timezone
from huggingface_hub import HfApi
from pipeline.config import MAX_ITEMS_PER_SOURCE
from pipeline.utils.logger import get_logger

log = get_logger("collector.huggingface")


def collect() -> list[dict]:
    """Fetch trending models, spaces, and new datasets from HuggingFace."""
    items = []
    api = HfApi()

    # Trending models (sorted by downloads, recently modified)
    try:
        log.info("Fetching trending HuggingFace models...")
        models = list(api.list_models(
            sort="downloads",
            limit=MAX_ITEMS_PER_SOURCE,
        ))
        for m in models:
            tags = list(m.tags) if m.tags else []
            items.append({
                "title": m.modelId,
                "url": f"https://huggingface.co/{m.modelId}",
                "description": (m.pipeline_tag or "") + " | " + ", ".join(tags[:5]),
                "source": "huggingface",
                "type": "model",
                "tags": tags,
            })
        log.info(f"Collected {len(models)} models.")
    except Exception as e:
        log.error(f"Failed to fetch HF models: {e}")

    # Trending spaces
    try:
        log.info("Fetching trending HuggingFace spaces...")
        spaces = list(api.list_spaces(
            sort="likes",
            limit=MAX_ITEMS_PER_SOURCE,
        ))
        for s in spaces:
            tags = list(s.tags) if s.tags else []
            items.append({
                "title": s.id,
                "url": f"https://huggingface.co/spaces/{s.id}",
                "description": (s.card_data.get("title", "") if s.card_data else "") or s.id,
                "source": "huggingface",
                "type": "space",
                "tags": tags,
            })
        log.info(f"Collected {len(spaces)} spaces.")
    except Exception as e:
        log.error(f"Failed to fetch HF spaces: {e}")

    # New datasets
    try:
        log.info("Fetching new HuggingFace datasets...")
        datasets = list(api.list_datasets(
            sort="createdAt",
            limit=MAX_ITEMS_PER_SOURCE,
        ))
        for d in datasets:
            tags = list(d.tags) if d.tags else []
            items.append({
                "title": d.id,
                "url": f"https://huggingface.co/datasets/{d.id}",
                "description": (d.card_data.get("description", "") if d.card_data else "") or d.id,
                "source": "huggingface",
                "type": "dataset",
                "tags": tags,
            })
        log.info(f"Collected {len(datasets)} datasets.")
    except Exception as e:
        log.error(f"Failed to fetch HF datasets: {e}")

    return items
