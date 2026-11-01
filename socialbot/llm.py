"""Claude Code CLI in headless mode as the bot's writer and critic.

No tools, no MCP servers, no project settings, a pinned model and a JSON Schema: the model can only
return the structured object we asked for. Failures raise; callers drop the draft rather than
falling back to template text (the old pipeline's biggest quality problem)."""
import json
import os
import subprocess

from socialbot import config


class LLMError(RuntimeError):
    pass


def ask_json(prompt: str, schema: dict, system: str = "", timeout: int = config.LLM_TIMEOUT_S,
             effort: str = "high") -> dict:
    cmd = [
        "claude", "-p", prompt,
        "--model", config.LLM_MODEL,
        "--effort", effort,
        "--output-format", "json",
        "--json-schema", json.dumps(schema),
        "--tools", "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--setting-sources", "",
    ]
    if system:
        cmd += ["--system-prompt", system]
    env = {k: v for k, v in os.environ.items() if k not in ("VIRTUAL_ENV",)}
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd="/tmp", env=env)
    except subprocess.TimeoutExpired as e:
        raise LLMError(f"claude timed out after {timeout}s") from e
    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise LLMError(f"claude returned non-JSON (exit {proc.returncode}): {proc.stderr[-400:]}") from e
    if out.get("is_error") or out.get("subtype") != "success":
        raise LLMError(f"claude error: {out.get('subtype')} {str(out.get('result'))[:300]}")
    data = out.get("structured_output")
    if not isinstance(data, dict):
        raise LLMError("claude returned no structured_output")
    data["_cost_usd"] = out.get("total_cost_usd", 0)
    return data
