"""Analyze collected items for relevance using Claude API."""

import json
from anthropic import Anthropic
from pipeline.utils.logger import get_logger

log = get_logger("analyzer.relevance")

SYSTEM_PROMPT = """You are an AI analyst for two products:

1. **PyMasters** (pymasters.net) — A web portal for Python and AI learning. Content includes
   tutorials, courses, code examples, and learning paths for Python developers interested in AI/ML.

2. **Homie** (heyhomie.app) — A cross-platform LOCAL AI assistant for Windows, Linux, Mac, and
   Android. It runs locally on user devices (NOT a web service). Features include plugins, voice
   interaction, RAG (retrieval-augmented generation), local LLM support, and privacy-first design.

Your job: Score each item for relevance and identify opportunities."""

USER_PROMPT_TEMPLATE = """Analyze these trending AI items and score each one.

For EACH item, provide:
- pymasters_score (0-10): How relevant is this for PyMasters content/tutorials?
- homie_score (0-10): How relevant is this for Homie features/plugins?
- product: "pymasters", "homie", "both", or "neither"
- opportunity: A brief sentence describing how this could be used (e.g., "Could become a tutorial about X" or "Homie could integrate this as a plugin")

Items to analyze:
{items_json}

Respond with ONLY a JSON array. Each element must have:
- "index" (int): The item's position in the input list (0-based)
- "pymasters_score" (int): 0-10
- "homie_score" (int): 0-10
- "product" (str): "pymasters" | "homie" | "both" | "neither"
- "opportunity" (str): Brief actionable description

Example response format:
[
  {{"index": 0, "pymasters_score": 8, "homie_score": 3, "product": "pymasters", "opportunity": "Great topic for a tutorial on fine-tuning local models"}},
  {{"index": 1, "pymasters_score": 5, "homie_score": 9, "product": "homie", "opportunity": "This library could power a new Homie plugin for document Q&A"}}
]"""


def analyze(items: list[dict]) -> list[dict]:
    """Score items for relevance using Claude API. Returns items enriched with scores."""
    if not items:
        log.info("No items to analyze.")
        return []

    # Prepare a compact summary for the prompt
    summaries = []
    for i, item in enumerate(items):
        summaries.append({
            "index": i,
            "title": item.get("title", ""),
            "source": item.get("source", ""),
            "type": item.get("type", ""),
            "description": item.get("description", "")[:300],
        })

    # Batch into chunks of 50 to stay within token limits
    BATCH_SIZE = 50
    all_scores = {}

    for batch_start in range(0, len(summaries), BATCH_SIZE):
        batch = summaries[batch_start:batch_start + BATCH_SIZE]
        items_json = json.dumps(batch, indent=2)

        try:
            log.info(f"Sending batch ({batch_start}-{batch_start + len(batch)}) to Claude for analysis...")
            client = Anthropic()
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": USER_PROMPT_TEMPLATE.format(items_json=items_json)}
                ],
            )

            response_text = response.content[0].text.strip()

            # Extract JSON from response (handle markdown code blocks)
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1])

            scores = json.loads(response_text)

            for score_entry in scores:
                idx = score_entry["index"]
                # Adjust index for batch offset
                global_idx = batch_start + idx if idx < len(batch) else None
                if global_idx is not None and global_idx < len(items):
                    all_scores[global_idx] = score_entry

        except Exception as e:
            log.error(f"Claude analysis failed for batch starting at {batch_start}: {e}")
            # Assign default scores for failed batch
            for item_summary in batch:
                idx = batch_start + item_summary["index"]
                all_scores[idx] = {
                    "pymasters_score": 0,
                    "homie_score": 0,
                    "product": "neither",
                    "opportunity": "Analysis failed",
                }

    # Enrich original items with scores
    enriched = []
    for i, item in enumerate(items):
        scores = all_scores.get(i, {
            "pymasters_score": 0,
            "homie_score": 0,
            "product": "neither",
            "opportunity": "Not analyzed",
        })
        enriched_item = {**item}
        enriched_item["pymasters_score"] = scores.get("pymasters_score", 0)
        enriched_item["homie_score"] = scores.get("homie_score", 0)
        enriched_item["relevance_score"] = max(
            scores.get("pymasters_score", 0),
            scores.get("homie_score", 0),
        )
        enriched_item["product"] = scores.get("product", "neither")
        enriched_item["opportunity"] = scores.get("opportunity", "")
        enriched.append(enriched_item)

    # Sort by highest relevance score
    enriched.sort(key=lambda x: x["relevance_score"], reverse=True)
    log.info(f"Analysis complete. {len(enriched)} items scored.")

    return enriched
