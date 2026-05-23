## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-23*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-05-23) — Foundational tutorial on semantic embeddings for PyMasters; powers Homie's local RAG embedding pipeline [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-23) — Tutorial on running tiny LLMs locally; Homie's ideal default local LLM for low-spec devices [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-TTS** (score: 10, source: huggingface, added: 2026-05-23) — Tutorial on running TTS locally in Python; Homie should integrate Kokoro as its default offline voice output [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **google-bert/bert-base-uncased** (score: 9, source: huggingface, added: 2026-05-23) — Classic 'Transformers 101' tutorial â€” fine-tuning BERT for classification on PyMasters [link](https://huggingface.co/google-bert/bert-base-uncased)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-05-23) — Tutorial on rerankers in RAG; Homie should use this to rerank retrieved chunks for higher answer quality [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-23) — Tutorial on BGE embeddings; small footprint makes it ideal as a Homie default local embedder [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-05-23) — Higher-quality embeddings tutorial; offer as a Homie 'quality mode' embedding option [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-05-23) — Advanced tutorial on BGE-M3 multi-vector retrieval; Homie could use for dense+sparse hybrid local search [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-23) — Tutorial on Nomic embeddings with Matryoshka representation; great Homie embedding option with variable dims [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **Qwen/Qwen3-VL-2B-Instruct** (score: 8, source: huggingface, added: 2026-05-23) — Tutorial on vision-language models; 2B size makes it viable as a Homie multimodal plugin for screenshot/image Q&A [link](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-23) — Multilingual RAG tutorial; Homie plugin to enable non-English document understanding [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **openai/clip-vit-large-patch14** (score: 8, source: huggingface, added: 2026-05-23) — Tutorial on CLIP for zero-shot image classification; heavy for local Homie but possible as desktop plugin [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-05-23) — Tutorial on CLIP basics; Homie plugin for local image search across user's photo library [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-23) — Advanced RAG tutorial on ColBERT late-interaction retrieval; optional Homie 'precision mode' [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **amazon/chronos-2** (score: 8, source: huggingface, added: 2026-05-23) — Tutorial on zero-shot time-series forecasting with Chronos-2 â€” fresh content for PyMasters [link](https://huggingface.co/amazon/chronos-2)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-05-23) — Reference guide on choosing embedding models via MTEB; Homie config doc for picking optimal local embedder [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-05-23) — Advanced learning path on distributed LLM training â€” strong PyMasters deep-dive content [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **google/electra-base-discriminator** (score: 7, source: huggingface, added: 2026-05-23) — Comparative tutorial: ELECTRA vs BERT pre-training objectives [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 7, source: huggingface, added: 2026-05-23) — Tutorial on multilingual masked language modeling and downstream fine-tuning [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 7, source: huggingface, added: 2026-05-23) — Tutorial on scaling RoBERTa for classification tasks [link](https://huggingface.co/FacebookAI/roberta-large)
- **laion/clap-htsat-fused** (score: 7, source: huggingface, added: 2026-05-23) — Audio embedding tutorial; Homie plugin for local audio search and voice-tagged note retrieval [link](https://huggingface.co/laion/clap-htsat-fused)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-05-23) — Educational tutorial on autoregressive LM fundamentals using GPT-2 [link](https://huggingface.co/openai-community/gpt2)
- **FacebookAI/roberta-base** (score: 7, source: huggingface, added: 2026-05-23) — Beginner tutorial on RoBERTa fine-tuning for text classification [link](https://huggingface.co/FacebookAI/roberta-base)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 7, source: huggingface, added: 2026-05-23) — Reference article on how to read the Open LLM Leaderboard to choose models [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 7, source: huggingface, added: 2026-05-23) — Tutorial on running FLUX.1 image generation via diffusers in Python [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **lmarena-ai/arena-leaderboard** (score: 7, source: huggingface, added: 2026-05-23) — Reference article on interpreting LMArena rankings when picking a local model for Homie [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Evaluating (scored >= 6)

- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-05-23) — Tutorial on fast distilled image generation with FLUX.1-schnell [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)

### Discovered (new)

*No items yet.*
