"""Zero-cost Eighty Browser CDP bridge (`http://127.0.0.1:9222`) for:
1. Gemini Notebook / NotebookLM Ultra (`https://notebook.google.com/`) — included in 30 TB Google AI Ultra (`$0.00`).
2. Google Vids AI Avatars (`https://docs.google.com/videos/u/0/`) — included in 30 TB Google AI Ultra (`$0.00`).

Used as an optional live web-studio companion alongside the 100% automated `$0.00` `gemini-2.5-flash-preview-tts`
2-speaker (`Vaathiyaar` + `Ananya`) pipeline."""
from __future__ import annotations

import json
import logging
import subprocess
import urllib.request
from pathlib import Path
from typing import Optional

from socialbot import briefs, config

log = logging.getLogger("socialbot.notebooklm_bridge")

NOTEBOOK_URL = "https://notebook.google.com/"
GOOGLE_VIDS_URL = "https://docs.google.com/videos/u/0/"


def cdp_is_reachable(cdp_url: Optional[str] = None, timeout: float = 2.0) -> bool:
    url = (cdp_url or config.CDP_URL).rstrip("/") + "/json/version"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def build_notebooklm_source_markdown(lesson: dict) -> str:
    """Format a PyMasters lesson into a clean source document + custom Audio Overview instructions for Gemini Notebook."""
    return (
        f"# {lesson.get('title', 'PyMasters Lesson')}\n\n"
        f"- **Track**: {lesson.get('track', '')}\n"
        f"- **Interactive Lesson URL**: {lesson.get('url', config.SITE)}\n"
        f"- **Platform**: {config.SITE}\n\n"
        "## Editorial Instructions for Audio Overview Hosts\n"
        "- Open warmly with: `Vanakkam nanba and nanbis!`\n"
        "- Explain every technical idea in crystal-clear everyday English for beginners before mentioning code.\n"
        "- Strictly NEVER use Hindi words (`chai`, `samosa`, `jugaad`, `namaste`, `paisa`, `lakh`, `crore`, etc.).\n"
        f"- Close by inviting listeners to practice interactively for free at {config.SITE}.\n\n"
        "## Lesson Material\n\n"
        f"{lesson.get('story', '')}\n"
    )


def stage_lesson_in_gemini_notebook(lesson: dict, cdp_url: Optional[str] = None) -> dict:
    """Create a fresh Gemini Notebook with `lesson` pasted as a source via Eighty Browser CDP (`u/0` AI Ultra)."""
    endpoint = cdp_url or config.CDP_URL
    if not cdp_is_reachable(endpoint):
        raise RuntimeError(f"Eighty Browser CDP is not reachable at {endpoint}")
    pw_py = Path(config.PLAYWRIGHT_PYTHON)
    if not pw_py.is_file():
        raise RuntimeError(f"Playwright Python not found at {pw_py}")

    source_md = build_notebooklm_source_markdown(lesson)
    runner = f"""
import json
from playwright.sync_api import sync_playwright

src = {json.dumps(source_md)}
title = {json.dumps("PyMasters · " + str(lesson.get("title", "Lesson"))[:60])}
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp({json.dumps(endpoint)})
    ctx = b.contexts[0]
    page = ctx.new_page()
    page.goto({json.dumps(NOTEBOOK_URL)}, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3500)
    btn = page.locator('button[aria-label="New notebook"], nb-button[aria-label="New notebook"]').first
    btn.click(timeout=15000)
    page.wait_for_timeout(4000)
    notebook_url = page.url
    # Click 'Copied text' if source modal is open
    copied = page.get_by_text("Copied text", exact=False)
    if copied.count() > 0:
        copied.first.click()
        page.wait_for_timeout(1500)
        ta = page.locator("textarea").first
        if ta.count() > 0:
            ta.fill(src)
            ins = page.get_by_role("button", name="Insert")
            if ins.count() > 0:
                ins.first.click()
                page.wait_for_timeout(3000)
    print(json.dumps({{"status": "staged", "notebook_url": notebook_url, "title": title}}))
    page.close()
"""
    out = subprocess.check_output([str(pw_py), "-c", runner], text=True, timeout=90).strip().splitlines()[-1]
    return json.loads(out)
