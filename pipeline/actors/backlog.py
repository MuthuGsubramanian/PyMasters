"""Innovation Backlog Manager — maintain BACKLOG.md across repos from pipeline discoveries."""

import os
import re
import subprocess
import tempfile
from datetime import datetime
from pipeline.config import PYMASTERS_REPO, HOMIE_REPO
from pipeline.utils.logger import get_logger

log = get_logger("actor.backlog")

BACKLOG_TEMPLATE = """## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: {date}*

### Ready to Build (scored >= 8, validated)

{ready_to_build}

### Prototyping (scored >= 7)

{prototyping}

### Evaluating (scored >= 6)

{evaluating}

### Discovered (new)

{discovered}
"""

SECTION_HEADERS = [
    "Ready to Build",
    "Prototyping",
    "Evaluating",
    "Discovered",
]


def _parse_backlog(content: str) -> dict[str, list[str]]:
    """Parse a BACKLOG.md into its sections.

    Returns a dict mapping section name -> list of item lines.
    """
    sections = {name: [] for name in SECTION_HEADERS}

    current_section = None
    for line in content.split("\n"):
        stripped = line.strip()

        # Detect section headers
        for header in SECTION_HEADERS:
            if header.lower() in stripped.lower() and stripped.startswith("#"):
                current_section = header
                break
        else:
            # Only add non-empty lines that look like list items
            if current_section and stripped.startswith("- "):
                sections[current_section].append(stripped)

    return sections


def _format_item_line(item: dict) -> str:
    """Format a pipeline item as a backlog entry line."""
    title = item.get("title", "Unknown")
    score = item.get("relevance_score", 0)
    source = item.get("source", "unknown")
    opportunity = item.get("opportunity", "")
    url = item.get("url", "")
    date = datetime.now().strftime("%Y-%m-%d")

    line = f"- **{title}** (score: {score}, source: {source}, added: {date})"
    if opportunity:
        line += f" — {opportunity}"
    if url:
        line += f" [link]({url})"
    return line


def _item_already_in_backlog(item: dict, all_items: list[str]) -> bool:
    """Check if an item is already listed in any backlog section."""
    title = item.get("title", "")
    if not title:
        return False
    title_lower = title.lower()
    for existing in all_items:
        if title_lower in existing.lower():
            return True
    return False


def _render_backlog(sections: dict[str, list[str]]) -> str:
    """Render parsed sections back into markdown."""
    return BACKLOG_TEMPLATE.format(
        date=datetime.now().strftime("%Y-%m-%d"),
        ready_to_build="\n".join(sections.get("Ready to Build", [])) or "*No items yet.*",
        prototyping="\n".join(sections.get("Prototyping", [])) or "*No items yet.*",
        evaluating="\n".join(sections.get("Evaluating", [])) or "*No items yet.*",
        discovered="\n".join(sections.get("Discovered", [])) or "*No items yet.*",
    )


def _get_file_from_repo(repo: str, file_path: str) -> str | None:
    """Fetch a file's content from a GitHub repo using gh CLI."""
    try:
        result = subprocess.run(
            ["gh", "api", f"repos/{repo}/contents/{file_path}",
             "--jq", ".content"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            import base64
            content = base64.b64decode(result.stdout.strip()).decode("utf-8")
            return content
    except Exception as e:
        log.warning(f"Could not fetch {file_path} from {repo}: {e}")
    return None


def _update_repo_backlog(
    repo: str,
    new_items: list[dict],
    product_filter: str,
) -> dict:
    """Update BACKLOG.md in a single repo.

    Args:
        repo: GitHub repo in "owner/name" format.
        new_items: Scored items from the pipeline.
        product_filter: Only include items where product matches this or "both".

    Returns:
        dict with status info.
    """
    log.info(f"Updating backlog for {repo}...")

    # Fetch existing BACKLOG.md
    existing_content = _get_file_from_repo(repo, "BACKLOG.md")
    if existing_content:
        sections = _parse_backlog(existing_content)
    else:
        log.info(f"No existing BACKLOG.md in {repo}, creating new one.")
        sections = {name: [] for name in SECTION_HEADERS}

    # Collect all existing items for dedup
    all_existing = []
    for items in sections.values():
        all_existing.extend(items)

    # Filter and categorize new items
    added_count = 0
    for item in new_items:
        product = item.get("product", "neither")
        if product not in (product_filter, "both"):
            continue

        score = item.get("relevance_score", 0)
        if score < 6:
            continue

        if _item_already_in_backlog(item, all_existing):
            log.info(f"Skipping duplicate: {item.get('title', 'Unknown')}")
            continue

        line = _format_item_line(item)

        # Place in the appropriate section based on score
        if score >= 8:
            sections["Ready to Build"].append(line)
        elif score >= 7:
            sections["Prototyping"].append(line)
        elif score >= 6:
            sections["Evaluating"].append(line)
        else:
            sections["Discovered"].append(line)

        added_count += 1
        all_existing.append(line)  # Prevent duplicates within same run

    if added_count == 0:
        log.info(f"No new items to add to {repo} backlog.")
        return {"repo": repo, "items_added": 0, "status": "no_changes"}

    # Render the updated backlog
    updated_content = _render_backlog(sections)

    # Create a branch and PR via gh CLI
    branch_name = f"pipeline/backlog-update-{datetime.now().strftime('%Y%m%d')}"
    repo_short = repo.split("/")[-1]

    try:
        # Write the content to a temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write(updated_content)
            tmp_path = f.name

        # Clone the repo to a temp dir, make the change, push, and create PR
        with tempfile.TemporaryDirectory() as tmp_dir:
            clone_dir = os.path.join(tmp_dir, repo_short)

            # Clone
            result = subprocess.run(
                ["gh", "repo", "clone", repo, clone_dir],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode != 0:
                log.error(f"Failed to clone {repo}: {result.stderr}")
                return {"repo": repo, "items_added": 0, "status": f"clone_failed: {result.stderr}"}

            # Create branch
            subprocess.run(
                ["git", "checkout", "-b", branch_name],
                cwd=clone_dir, capture_output=True, text=True, timeout=15,
            )

            # Write BACKLOG.md
            backlog_path = os.path.join(clone_dir, "BACKLOG.md")
            with open(backlog_path, "w", encoding="utf-8") as f:
                f.write(updated_content)

            # Stage and commit
            subprocess.run(
                ["git", "add", "BACKLOG.md"],
                cwd=clone_dir, capture_output=True, text=True, timeout=15,
            )

            commit_msg = f"chore: update innovation backlog ({added_count} new items)"
            result = subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=clone_dir, capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                log.error(f"Commit failed in {repo}: {result.stderr}")
                return {"repo": repo, "items_added": 0, "status": f"commit_failed: {result.stderr}"}

            # Push
            result = subprocess.run(
                ["git", "push", "-u", "origin", branch_name],
                cwd=clone_dir, capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                log.error(f"Push failed for {repo}: {result.stderr}")
                return {"repo": repo, "items_added": 0, "status": f"push_failed: {result.stderr}"}

            # Create PR
            pr_body = (
                f"## Innovation Backlog Update\n\n"
                f"Added **{added_count}** new items discovered by the AI intelligence pipeline.\n\n"
                f"*Auto-generated by the PyMasters pipeline on "
                f"{datetime.now().strftime('%Y-%m-%d')}.*"
            )
            result = subprocess.run(
                [
                    "gh", "pr", "create",
                    "--repo", repo,
                    "--head", branch_name,
                    "--title", f"chore: update innovation backlog (+{added_count} items)",
                    "--body", pr_body,
                ],
                cwd=clone_dir,
                capture_output=True, text=True, timeout=30,
            )

            pr_url = ""
            if result.returncode == 0:
                pr_url = result.stdout.strip()
                log.info(f"PR created for {repo}: {pr_url}")
            else:
                log.warning(f"PR creation failed for {repo}: {result.stderr}")

        # Cleanup temp file
        os.unlink(tmp_path)

        return {
            "repo": repo,
            "items_added": added_count,
            "pr_url": pr_url,
            "status": "pr_created" if pr_url else "pushed_no_pr",
        }

    except Exception as e:
        log.error(f"Backlog update failed for {repo}: {e}")
        return {"repo": repo, "items_added": 0, "status": f"failed: {e}"}


def update_backlogs(scored_items: list[dict]) -> list[dict]:
    """Update BACKLOG.md in both PyMasters and Homie repos.

    Args:
        scored_items: All scored items from the pipeline.

    Returns:
        List of result dicts, one per repo.
    """
    results = []

    # Update PyMasters repo backlog (pymasters-relevant items)
    pymasters_result = _update_repo_backlog(
        repo=PYMASTERS_REPO,
        new_items=scored_items,
        product_filter="pymasters",
    )
    results.append(pymasters_result)

    # Update Homie repo backlog (homie-relevant items)
    homie_result = _update_repo_backlog(
        repo=HOMIE_REPO,
        new_items=scored_items,
        product_filter="homie",
    )
    results.append(homie_result)

    total_added = sum(r.get("items_added", 0) for r in results)
    log.info(f"Backlog update complete. Total items added across repos: {total_added}")

    return results
