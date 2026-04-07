"""Wrapper around the Claude Code CLI for AI operations.

Replaces the anthropic Python SDK — all AI calls go through the CLI.
"""

import subprocess
import json
import re
import time


def ask_claude(prompt, max_tokens=4096, timeout=300):
    """Send a prompt to Claude Code CLI and return the response text."""
    result = subprocess.run(
        ["claude", "--print", "--dangerously-skip-permissions", "-p", prompt],
        capture_output=True, text=True, timeout=timeout
    )
    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI failed: {result.stderr}")
    return result.stdout.strip()


def ask_claude_json(prompt, timeout=300, retries=2):
    """Send a prompt to Claude and parse JSON from the response.

    Retries on parse failure with a nudge to return valid JSON.
    """
    last_error = None

    for attempt in range(retries + 1):
        try:
            if attempt > 0:
                prompt_to_use = prompt + "\n\nIMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no code fences."
                time.sleep(2)
            else:
                prompt_to_use = prompt

            response = ask_claude(prompt_to_use, timeout=timeout)

            if not response:
                last_error = ValueError("Empty response from Claude CLI")
                continue

            # Extract JSON from various wrapper formats
            text = response

            # Strip markdown code fences
            if "```json" in text:
                text = text.split("```json", 1)[1].split("```", 1)[0]
            elif "```" in text:
                # Find the first ``` block that looks like JSON
                blocks = re.findall(r"```(?:\w*\n)?(.*?)```", text, re.DOTALL)
                for block in blocks:
                    stripped = block.strip()
                    if stripped.startswith("{") or stripped.startswith("["):
                        text = stripped
                        break

            # Try to find JSON object/array boundaries
            text = text.strip()
            if not (text.startswith("{") or text.startswith("[")):
                # Search for first { or [
                start = min(
                    (text.find("{") if text.find("{") >= 0 else len(text)),
                    (text.find("[") if text.find("[") >= 0 else len(text)),
                )
                if start < len(text):
                    text = text[start:]

            return json.loads(text)

        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            continue

    raise last_error or ValueError("Failed to get JSON from Claude CLI")
