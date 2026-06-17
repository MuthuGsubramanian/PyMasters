"""Social Content Generator — create draft tweets and blog posts from pipeline discoveries."""

import os
import json
from datetime import datetime
from pipeline.utils.claude import ask_claude
from pipeline.utils.logger import get_logger
from pipeline.actors.linkedin_publisher import publish_linkedin, linkedin_enabled
from pipeline.actors.linkedin_media import generate_post_image

log = get_logger("actor.social_content")

SOCIAL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "social")

TWEET_SYSTEM_PROMPT = """You are a social media content writer for PyMasters (pymasters.net),
a platform that helps Python developers learn AI/ML. You also promote Homie (heyhomie.app),
a cross-platform local AI assistant.

Write engaging, informative tweets about AI discoveries. Each tweet must:
- Be under 280 characters
- Include relevant hashtags (1-2 max)
- Sound authentic and knowledgeable, not salesy
- Mention pymasters.net or heyhomie.app only when natural
- Focus on the value/insight, not hype"""

BLOG_SYSTEM_PROMPT = """You are a technical content writer for PyMasters (pymasters.net),
a platform for Python developers learning AI/ML. You also write about Homie (heyhomie.app),
a cross-platform local AI assistant.

Write a concise blog-style summary of today's AI trends and discoveries. The post should:
- Be 400-600 words
- Have a catchy but professional title
- Summarize 3-5 key trends/discoveries
- Include practical takeaways for Python developers
- Naturally mention pymasters.net and heyhomie.app where relevant
- End with a call-to-action (visit pymasters.net, try Homie, etc.)
- Use markdown formatting"""


LINKEDIN_SYSTEM_PROMPT = """You are the content writer for the PyMasters (pymasters.net)
LinkedIn company page — an AI-powered platform for learning Python & AI.

Write ONE LinkedIn post for today aimed at Python developers and learners. Requirements:
- 80-200 words, professional but warm; value-first, NOT salesy.
- Lead with a concrete, useful insight or tip — a Python/AI idea drawn from today's
  discoveries below — that a developer can learn from in 30 seconds.
- Short paragraphs / line breaks for readability (LinkedIn renders plain text, NOT markdown —
  do not use #, *, or markdown links).
- End with a brief, natural mention of PyMasters (pymasters.net) as where to go deeper.
- Finish with 3-5 relevant hashtags on the last line (e.g. #Python #AI #MachineLearning #LearnToCode).
Return ONLY the post text, ready to publish."""


def _prepare_item_summary(item: dict) -> dict:
    """Extract the key fields from an item for the prompt."""
    return {
        "title": item.get("title", "Unknown"),
        "description": item.get("description", "")[:200],
        "source": item.get("source", "unknown"),
        "score": item.get("relevance_score", 0),
        "opportunity": item.get("opportunity", ""),
        "url": item.get("url", ""),
    }


def generate_tweets(top_items: list[dict]) -> str:
    """Generate 3 tweet-length posts from the top discoveries.

    Returns the tweet content as markdown text.
    """
    items_for_prompt = [_prepare_item_summary(item) for item in top_items[:3]]

    prompt = f"""Write exactly 3 tweets, one for each of these AI discoveries:

{json.dumps(items_for_prompt, indent=2)}

Format each tweet as:
### Tweet 1
<tweet text>

### Tweet 2
<tweet text>

### Tweet 3
<tweet text>
"""

    try:
        full_prompt = TWEET_SYSTEM_PROMPT + "\n\n" + prompt
        tweets_content = ask_claude(full_prompt)
    except Exception as e:
        log.error(f"Claude CLI call failed for tweets: {e}")
        # Fallback: generate simple tweets without AI
        tweets_content = _fallback_tweets(items_for_prompt)

    today = datetime.now().strftime("%Y-%m-%d")
    header = f"# Social Media Drafts - {today}\n\n"
    header += "*These are DRAFTS for review. Do not post without editing.*\n\n"
    return header + tweets_content


def _fallback_tweets(items: list[dict]) -> str:
    """Generate basic tweets without API call."""
    tweets = []
    for i, item in enumerate(items, 1):
        title = item["title"][:100]
        source = item["source"]
        tweets.append(
            f"### Tweet {i}\n"
            f"Interesting AI development: {title} (via {source}). "
            f"More insights at pymasters.net #AI #Python"
        )
    return "\n\n".join(tweets)


def generate_blog_draft(top_items: list[dict]) -> str:
    """Generate a blog-style summary post from the top discoveries.

    Returns the blog content as markdown text.
    """
    items_for_prompt = [_prepare_item_summary(item) for item in top_items[:5]]

    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""Write a blog post summarizing today's ({today}) top AI trends and discoveries.

Here are the top items discovered by our pipeline:

{json.dumps(items_for_prompt, indent=2)}

Write the full blog post in markdown format.
"""

    try:
        full_prompt = BLOG_SYSTEM_PROMPT + "\n\n" + prompt
        blog_content = ask_claude(full_prompt)
    except Exception as e:
        log.error(f"Claude CLI call failed for blog draft: {e}")
        blog_content = _fallback_blog(items_for_prompt, today)

    header = f"<!-- Draft generated {today} - Review before publishing -->\n\n"
    return header + blog_content


def _fallback_blog(items: list[dict], today: str) -> str:
    """Generate a basic blog draft without API call."""
    lines = [
        f"# AI Trends and Discoveries - {today}",
        "",
        "Here are today's top AI discoveries from the PyMasters intelligence pipeline:",
        "",
    ]
    for i, item in enumerate(items, 1):
        lines.append(f"## {i}. {item['title']}")
        lines.append("")
        lines.append(item["description"] if item["description"] else "No description available.")
        lines.append("")
        if item["opportunity"]:
            lines.append(f"**Opportunity:** {item['opportunity']}")
            lines.append("")

    lines.extend([
        "---",
        "",
        f"Visit [pymasters.net](https://pymasters.net) for more AI insights.",
        f"Try [Homie](https://heyhomie.app) - your local AI assistant.",
    ])
    return "\n".join(lines)


def generate_linkedin_post(top_items: list[dict]) -> str:
    """Generate one ready-to-publish LinkedIn post from the day's top discoveries."""
    items_for_prompt = [_prepare_item_summary(item) for item in top_items[:3]]
    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""Today is {today}. Write the LinkedIn post using these top discoveries:

{json.dumps(items_for_prompt, indent=2)}
"""
    try:
        return ask_claude(LINKEDIN_SYSTEM_PROMPT + "\n\n" + prompt).strip()
    except Exception as e:
        log.error(f"Claude CLI call failed for LinkedIn post: {e}")
        return _fallback_linkedin(items_for_prompt)


def _fallback_linkedin(items: list[dict]) -> str:
    """A safe, decent LinkedIn post without an AI call."""
    lead = items[0] if items else {"title": "Python & AI", "opportunity": ""}
    body = lead.get("opportunity") or lead.get("description") or (
        "A new idea worth exploring in the Python & AI world today.")
    return (
        f"Today in Python & AI: {lead.get('title', 'a discovery worth your time')}.\n\n"
        f"{body}\n\n"
        "We break concepts like this into hands-on, sandbox-graded lessons at PyMasters — "
        "learn by building, with an AI tutor that adapts to you: pymasters.net\n\n"
        "#Python #AI #MachineLearning #LearnToCode"
    )


def generate_social_content(scored_items: list[dict]) -> dict:
    """Main entry point: generate all social content drafts and save to disk.

    Args:
        scored_items: List of scored items from the pipeline (already sorted by score).

    Returns:
        dict with keys: tweets_path, blog_path, status.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    day_dir = os.path.join(SOCIAL_DIR, today)
    os.makedirs(day_dir, exist_ok=True)

    top_items = scored_items[:5]  # Use top 5 for blog, top 3 for tweets

    if not top_items:
        log.warning("No items available for social content generation.")
        return {"tweets_path": "", "blog_path": "", "status": "skipped: no items"}

    log.info(f"Generating social content for {len(top_items)} top items...")

    # Generate tweets
    tweets_path = os.path.join(day_dir, "tweets.md")
    try:
        tweets_content = generate_tweets(top_items[:3])
        with open(tweets_path, "w", encoding="utf-8") as f:
            f.write(tweets_content)
        log.info(f"Tweets saved: {tweets_path}")
    except Exception as e:
        log.error(f"Tweet generation failed: {e}")
        tweets_path = ""

    # Generate blog draft
    blog_path = os.path.join(day_dir, "blog_draft.md")
    try:
        blog_content = generate_blog_draft(top_items)
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(blog_content)
        log.info(f"Blog draft saved: {blog_path}")
    except Exception as e:
        log.error(f"Blog draft generation failed: {e}")
        blog_path = ""

    # Generate the daily LinkedIn post, save the draft, then auto-post if enabled.
    linkedin_path = os.path.join(day_dir, "linkedin.txt")
    linkedin_status = "skipped"
    try:
        linkedin_text = generate_linkedin_post(top_items)
        with open(linkedin_path, "w", encoding="utf-8") as f:
            f.write(linkedin_text)
        log.info(f"LinkedIn post saved: {linkedin_path}")
        # On-brand banner image (saved for review + attached to the post).
        headline = (top_items[0].get("title") if top_items else None) or "Today in Python & AI"
        image_bytes = generate_post_image(headline)
        if image_bytes:
            with open(os.path.join(day_dir, "linkedin.png"), "wb") as f:
                f.write(image_bytes)
            log.info("LinkedIn banner image generated")
        result = publish_linkedin(linkedin_text, image_bytes=image_bytes)  # no-op unless enabled
        linkedin_status = result.get("status", "unknown")
        log.info(f"LinkedIn publish: {linkedin_status}")
    except Exception as e:
        log.error(f"LinkedIn post generation failed: {e}")
        linkedin_path = ""
        linkedin_status = "error"

    return {
        "tweets_path": tweets_path,
        "blog_path": blog_path,
        "linkedin_path": linkedin_path,
        "linkedin_status": linkedin_status,
        "status": "generated",
    }
