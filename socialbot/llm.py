"""Multi-provider structured-JSON LLM client for the PyMasters social bot.

Provider order (configurable via PMSOCIAL_LLM_PROVIDERS, default "ollama,claude,local"), all zero GCP cost:
  1. ollama  — Ollama Cloud API (gpt-oss:120b) via OLLAMA_API_KEY (env or ~/.config/pymasters-ops/ops.env),
               with automatic 429 cooldown.
  2. claude  — Claude Code CLI in headless mode (--output-format json --json-schema). Automatically
               enters a cooldown when weekly usage_limit_reached (429) occurs.
  3. local   — local llama-server OpenAI-compatible endpoint (PMSOCIAL_LOCAL_LLM_URL, default :8080).
Opt-in only (bills GCP Vertex AI, never used by default):
     gemini  — Vertex AI (gemini-3.5-flash -> gemini-3.1-pro-preview); add "gemini" to PMSOCIAL_LLM_PROVIDERS.
"""
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path

import requests

from socialbot import config

log = logging.getLogger("socialbot.llm")

GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "pymasters-app")
GCP_ACCOUNT = os.getenv("PMSOCIAL_GCP_ACCOUNT", "muthu@pymasters.net")
GEMINI_MODELS = [
    m.strip()
    for m in os.getenv("PMSOCIAL_GEMINI_MODELS", "gemini-3.5-flash,gemini-3.1-pro-preview").split(",")
    if m.strip()
]
PROVIDERS = [
    p.strip()
    for p in os.getenv("PMSOCIAL_LLM_PROVIDERS", "ollama,claude,local").split(",")
    if p.strip()
]
LOCAL_LLM_URL = os.getenv("PMSOCIAL_LOCAL_LLM_URL", "http://127.0.0.1:8080/v1/chat/completions")
LOCAL_LLM_KEY_FILE = Path("/run/user/1000/eternity/keys/llama-8080.key")
OPS_ENV_FILE = Path.home() / ".config/pymasters-ops/ops.env"


def _load_ops_env_key(name: str) -> None:
    """Populate os.environ[name] from ops.env when running outside systemd (no EnvironmentFile)."""
    if os.environ.get(name):
        return
    try:
        for line in OPS_ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[7:].lstrip()
            key, sep, val = line.partition("=")
            if sep and key.strip() == name:
                val = val.strip().strip("'\"")
                if val:
                    os.environ[name] = val
                return
    except OSError:
        pass


_load_ops_env_key("OLLAMA_API_KEY")

_gcp_token_cache = {"token": None, "expires_at": 0.0}
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.S)


class LLMError(RuntimeError):
    pass


def _in_cooldown(name: str) -> bool:
    p = Path(f"/tmp/pmsocial-{name}-cooldown")
    try:
        until = float(p.read_text().strip())
        if time.time() < until:
            return True
        p.unlink(missing_ok=True)
    except Exception:
        pass
    return False


def _set_cooldown(name: str, seconds: int = 6 * 3600) -> None:
    try:
        Path(f"/tmp/pmsocial-{name}-cooldown").write_text(str(time.time() + seconds))
    except OSError:
        pass


def _gcp_access_token() -> str:
    now = time.time()
    if _gcp_token_cache["token"] and now < _gcp_token_cache["expires_at"]:
        return _gcp_token_cache["token"]
    env = {**os.environ, "CLOUDSDK_CORE_DISABLE_PROMPTS": "1"}
    for cmd in (
        ["gcloud", "auth", "print-access-token", f"--account={GCP_ACCOUNT}", "--quiet"],
        ["gcloud", "auth", "print-access-token", "--quiet"],
    ):
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15, env=env)
            tok = proc.stdout.strip()
            if proc.returncode == 0 and tok:
                _gcp_token_cache["token"] = tok
                _gcp_token_cache["expires_at"] = now + 1500
                return tok
        except Exception:
            continue
    raise LLMError("GCP access token unavailable (run ~/pymasters-ops/gcloud_reauth.sh)")


def _validate_schema(data: dict, schema: dict) -> None:
    if not isinstance(data, dict):
        raise LLMError(f"Expected JSON object, got {type(data).__name__}")
    missing = [k for k in schema.get("required", []) if k not in data]
    if missing:
        raise LLMError(f"JSON missing required keys: {missing}")


def _ask_gemini(prompt: str, schema: dict, system: str, timeout: int) -> dict:
    tok = _gcp_access_token()
    full_prompt = (
        f"{prompt}\n\n"
        "IMPORTANT: Respond ONLY with a single valid JSON object conforming strictly to this JSON Schema "
        "(include every required property, no markdown fences, no commentary):\n"
        f"{json.dumps(schema)}"
    )
    last_err = None
    for model in GEMINI_MODELS:
        url = (
            f"https://aiplatform.googleapis.com/v1/projects/{GCP_PROJECT}/locations/global/"
            f"publishers/google/models/{model}:generateContent"
        )
        body = {
            "contents": [{"role": "user", "parts": [{"text": full_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.5,
                "maxOutputTokens": 8192,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        try:
            r = requests.post(
                url,
                headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                json=body,
                timeout=min(timeout, 120),
            )
            if r.status_code in (401, 403):
                _gcp_token_cache["token"] = None
                raise LLMError(f"Vertex AI {model} auth {r.status_code}: {r.text[:200]}")
            if not r.ok:
                raise LLMError(f"Vertex AI {model} HTTP {r.status_code}: {r.text[:240]}")
            resp = r.json()
            cands = resp.get("candidates") or []
            if not cands:
                raise LLMError(f"Vertex AI {model} returned no candidates")
            parts = (cands[0].get("content") or {}).get("parts") or []
            raw = "".join(p.get("text", "") for p in parts if "text" in p).strip()
            raw = _FENCE_RE.sub("", raw).strip()
            data = json.loads(raw)
            _validate_schema(data, schema)
            usage = resp.get("usageMetadata") or {}
            in_tok = usage.get("promptTokenCount", 0)
            out_tok = usage.get("candidatesTokenCount", 0)
            data["_cost_usd"] = round((in_tok * 0.15 + out_tok * 0.60) / 1_000_000, 6)
            return data
        except Exception as e:
            last_err = e
            log.warning("gemini (%s) failed: %s", model, e)
    raise LLMError(f"gemini failed: {last_err}")


def _ask_claude(prompt: str, schema: dict, system: str, timeout: int, effort: str) -> dict:
    if _in_cooldown("claude"):
        raise LLMError("claude in rate-limit cooldown")
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
        "--dangerously-skip-permissions",
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
        msg = f"{out.get('subtype')} {str(out.get('result'))[:300]}"
        if out.get("api_error_status") == 429 or "limit" in msg.lower():
            _set_cooldown("claude", 6 * 3600)
        raise LLMError(f"claude error: {msg}")
    data = out.get("structured_output")
    _validate_schema(data, schema)
    data["_cost_usd"] = out.get("total_cost_usd", 0)
    return data


def _ask_ollama(prompt: str, schema: dict, system: str, timeout: int) -> dict:
    api_key = os.getenv("OLLAMA_API_KEY", "")
    if not api_key or _in_cooldown("ollama"):
        raise LLMError("ollama unavailable or in cooldown")
    full_prompt = (
        f"{prompt}\n\n"
        "Respond ONLY with a single valid JSON object conforming strictly to this JSON Schema:\n"
        f"{json.dumps(schema)}"
    )
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": full_prompt})
    r = requests.post(
        "https://ollama.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("OLLAMA_MODEL", "gpt-oss:120b"),
            "messages": msgs,
            "response_format": {"type": "json_object"},
            "temperature": 0.5,
        },
        timeout=min(timeout, 90),
    )
    if r.status_code == 429:
        _set_cooldown("ollama", 6 * 3600)
        raise LLMError(f"ollama rate-limited (429): {r.text[:200]}")
    if not r.ok:
        raise LLMError(f"ollama HTTP {r.status_code}: {r.text[:200]}")
    content = ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    content = _FENCE_RE.sub("", content).strip()
    data = json.loads(content)
    _validate_schema(data, schema)
    data["_cost_usd"] = 0.0
    return data


def _ask_local(prompt: str, schema: dict, system: str, timeout: int) -> dict:
    full_prompt = (
        f"{prompt}\n\n"
        "Respond ONLY with a single valid JSON object conforming strictly to this JSON Schema:\n"
        f"{json.dumps(schema)}"
    )
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": full_prompt})
    headers = {"Content-Type": "application/json"}
    try:
        key = LOCAL_LLM_KEY_FILE.read_text().strip()
        if key:
            headers["Authorization"] = f"Bearer {key}"
    except OSError:
        pass
    try:
        r = requests.post(
            LOCAL_LLM_URL,
            headers=headers,
            json={
                "messages": msgs,
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
            },
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise LLMError(f"local llama-server unreachable at {LOCAL_LLM_URL}: {e}") from e
    if not r.ok:
        raise LLMError(f"local llama-server HTTP {r.status_code}: {r.text[:200]}")
    content = ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    content = _FENCE_RE.sub("", content).strip()
    data = json.loads(content)
    _validate_schema(data, schema)
    data["_cost_usd"] = 0.0
    return data


def ask_json(prompt: str, schema: dict, system: str = "", timeout: int = config.LLM_TIMEOUT_S,
             effort: str = "medium") -> dict:
    errors = []
    for prov in PROVIDERS:
        try:
            if prov == "gemini":
                return _ask_gemini(prompt, schema, system, timeout)
            if prov == "claude":
                return _ask_claude(prompt, schema, system, timeout, effort)
            if prov == "ollama":
                return _ask_ollama(prompt, schema, system, timeout)
            if prov == "local":
                return _ask_local(prompt, schema, system, timeout)
        except Exception as e:
            errors.append(f"{prov}: {e}")
            log.warning("LLM provider %s failed: %s", prov, e)
    raise LLMError("; ".join(errors) if errors else "no LLM providers configured")
