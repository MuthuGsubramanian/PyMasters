"""Wrapper around the Claude Code CLI for AI operations.

Replaces the anthropic Python SDK — all AI calls go through the CLI.
"""

import subprocess
import json


def ask_claude(prompt, max_tokens=4096):
    """Send a prompt to Claude Code CLI and return the response text."""
    result = subprocess.run(
        ["claude", "--print", "--dangerously-skip-permissions", "-p", prompt],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI failed: {result.stderr}")
    return result.stdout.strip()


def ask_claude_json(prompt):
    """Send a prompt to Claude and parse JSON from the response."""
    response = ask_claude(prompt)
    # Try to extract JSON from the response
    # Claude may wrap JSON in markdown code blocks
    if "```json" in response:
        response = response.split("```json")[1].split("```")[0]
    elif "```" in response:
        response = response.split("```")[1].split("```")[0]
    return json.loads(response.strip())
