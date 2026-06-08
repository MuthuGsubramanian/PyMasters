# AI Engineering Track Consolidation — 2026-06-09

## Problem
The `backend/lessons/ai_engineering/` track had **361 lesson files**, ~99%
auto-generated and heavily duplicated. ~245 were untracked (never committed),
so they were neither version-controlled nor shipped in the production image —
they existed only on the authoring machine. Examples of the duplication: ~29
near-identical `all_minilm_l6_v2_*` lessons, 44 `bge_m3_*`, 39
`msmarco_minilm_cross_encoder_*`, all paraphrasing the same handful of concepts.

This buried the genuinely good content and made the catalog read as spam.

## Method
1. Inventoried all 361 files; clustered by model/topic from filenames and
   `concepts_taught`.
2. Within each cluster, kept the most complete, concept-diverse exemplars and
   quarantined the paraphrase-redundant remainder.
3. **Invariant: every git-tracked lesson was kept** (tracked = intentional,
   canonical). Only untracked auto-generated bloat was removed.
4. Quality-gated the survivors: valid JSON, non-empty story, challenge code
   parses, in-range quiz answers. All 124 survivors passed.

## Result
- `ai_engineering`: **361 → 124** lessons.
- Whole catalog: ~602 → **~366** lessons, 0 broken.
- Removed files quarantined to `_archive/ai_engineering_dedup_2026-06-09/`
  (gitignored, reversible) rather than hard-deleted.
- The 124 survivors are now committed/tracked, so they are version-controlled
  and ship in the production image for the first time.

## Coverage retained (124 lessons)
Embeddings (MiniLM, MPNet, BGE, multilingual), rerankers (cross-encoder,
ColBERT, MS-MARCO), hybrid dense+sparse RAG (BGE-M3), vision (CLIP, Qwen-VL),
local/edge LLMs (Qwen3), time-series (Chronos-2), model selection (MTEB / Open
LLM leaderboards), and hand-crafted deep-dives (eval-driven dev, LLM APIs,
Polars, structured outputs).

## Follow-ups
- Some clusters could still merge further (BGE-M3, MS-MARCO have the most
  remaining overlap); revisit if the track still feels embedding-heavy.
- Authoring of net-new differentiator tracks (vibe-coding, deep-CS internals,
  transformers-from-scratch) is tracked separately.
