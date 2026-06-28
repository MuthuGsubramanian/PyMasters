# Spec — Vaathiyaar AI Resilience & Graceful Degradation

**Date:** 2026-06-28
**Status:** Approved (design), implementing
**Author:** Claude (autonomous prod-hardening)

## Problem

Vaathiyaar (the core AI tutor + lesson generator) runs on **Ollama Cloud free tier**, which has a **weekly usage cap**. When exhausted (observed live in prod on 2026-06-27/28), every AI call hard-fails:

- `POST /api/classroom/chat` → **HTTP 502** with the raw upstream string `"you (PyMasters) have reached your weekly usage limit…"`.
- `POST /api/classroom/chat/stream` (the path the Classroom UI actually uses) → emits an SSE `error` event whose body is that same raw string; the UI renders it as `Error: you (PyMasters) have reached…`.
- `POST /api/playground/*` AI paths → same raw failure.
- Lesson generation (`backend/modules/pipeline.py`) already fails "safely" (job status `failed`) but surfaces the raw exception text.

Net effect: the product's flagship feature shows raw vendor error text to learners whenever the weekly cap is hit, with no fallback.

## Goals

1. **Never hard-fail with raw vendor text.** Any AI outage degrades to a calm, branded, learner-facing message.
2. **Provider-agnostic fallback seam.** Adding a fallback LLM later is a one-line config change, not a refactor. (Per founder decision 2026-06-28: build the seam now, wire **Ollama only**; choose the fallback provider later.)
3. **No regression** to the happy path (latency, JSON parsing, training-pair recording, pair_id feedback).

Non-goals: choosing/funding a fallback provider; changing the Ollama model; streaming-token fallback fidelity (a fallback provider may yield one block rather than token-by-token).

## Design

### 1. `backend/vaathiyaar/engine.py` — provider seam + graceful exception

- **`class VaathiyaarUnavailable(RuntimeError)`** — raised when *all* configured providers fail. Carries `.friendly` (learner-facing text) and `.detail` (operator log text).
- **`FRIENDLY_UNAVAILABLE`** constant: e.g. _"Vaathiyaar is taking a quick breather — a lot of learners are practising right now. Please try again in a moment. 🙏"_
- **Provider registry**, ordered by env `VAATHIYAAR_PROVIDERS` (default `"ollama"`). Map name → callable:
  - `_PROVIDER_COMPLETE = {"ollama": _ollama_complete}`
  - `_PROVIDER_STREAM   = {"ollama": _ollama_stream}`
  - Future: implement `_gemini_complete`/`_claude_complete`/`_openai_complete`, add to the maps, set `VAATHIYAAR_PROVIDERS="ollama,gemini"`.
- **`complete(messages, options) -> str`** — iterate providers in order; first success returns its raw content string; each failure is logged and the next is tried; if all fail → `raise VaathiyaarUnavailable`.
- **`stream(messages, options) -> Iterator[str]`** — try provider[0] in streaming mode yielding tokens; if it raises *before any token*, fall through to the next provider via `complete()` and yield its full text once; if all fail → `raise VaathiyaarUnavailable`.
- **`call_vaathiyaar(...)`** now calls `complete(...)` instead of `client.chat` directly; everything downstream (`parse_vaathiyaar_response`) is unchanged. Lets `VaathiyaarUnavailable` propagate to callers.
- `get_ollama_client()` retained (back-compat); the streaming route switches to `engine.stream`.

### 2. `backend/routes/classroom.py`

- **`/chat`**: wrap the `call_vaathiyaar` call; on `VaathiyaarUnavailable` (and any unexpected `Exception`) return a normal **200** body shaped like a Vaathiyaar response: `{"message": <friendly>, "phase": "chat", "ai_unavailable": true, …defaults}`. No more 502.
- **`/chat/stream`** `generate()`: build messages, iterate `engine.stream(...)`. On `VaathiyaarUnavailable`/`Exception`, emit a **`done`** event (not `error`) with `message=<friendly>` and `ai_unavailable: true`, so the existing UI renders a calm assistant bubble. Training-pair recording stays best-effort and is skipped on failure.

### 3. `backend/routes/playground.py`

- Same treatment: non-stream AI path returns a graceful 200; stream path emits a friendly `done`.

### 4. `backend/modules/pipeline.py`

- Catch `VaathiyaarUnavailable` at the stage boundary and set the job's failure message to the friendly text (status stays `failed`; UI already handles a failed job gracefully).

### 5. Frontend

- Minimal. The stream `done` path already renders `data.message`, so the friendly text replaces the old `Error: …`. Confirm `VoiceTutor.jsx` and the non-stream consumers tolerate the new 200 shape (they read `.message`). Optionally style an `ai_unavailable` bubble, but not required for the fix.

## Testing

- **Unit (pytest), monkeypatching the provider funcs:**
  - `complete` returns provider[0]'s output on success; falls through to provider[1] when [0] raises; raises `VaathiyaarUnavailable` when all raise.
  - `call_vaathiyaar` raises `VaathiyaarUnavailable` (not a raw vendor error) when the provider fails.
  - `/chat` returns 200 + `ai_unavailable` when the provider is forced to fail (TestClient + monkeypatch).
  - `/chat/stream` emits a `done` with friendly message (no `error` event) on provider failure.
- **Live prod proof (the weekly cap is currently exhausted — ideal):** after deploy, `POST /api/classroom/chat` returns a friendly 200, and the Classroom UI shows a calm bubble instead of `Error: …`.

## Rollout

- Implement on a branch, run backend tests, deploy via `./scripts/deploy.sh` (image-only, preserves env/secrets), live-verify, then merge to `main`.

## Out of scope / follow-ups

- Picking + funding the fallback provider (Gemini/Claude/OpenAI) — a one-line `VAATHIYAAR_PROVIDERS` change once decided.
- The separate **apex DNS** issue (2 of 4 Cloud Run anycast IPs unreachable → ~11s connect hang) — tracked separately; not part of this change.
