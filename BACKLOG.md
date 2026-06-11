## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-27*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-05-27) — Core embedding model for Homie's local RAG; PyMasters tutorial on building semantic search with MiniLM [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-27) — Ideal small local LLM for Homie's on-device generation; PyMasters tutorial on running Qwen3 locally [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-TTS** (score: 10, source: huggingface, added: 2026-05-27) — Homie local TTS plugin for voice replies; PyMasters tutorial on running Kokoro offline [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **google-bert/bert-base-uncased** (score: 9, source: huggingface, added: 2026-05-27) — Foundational BERT tutorial series â€” fill-mask, fine-tuning basics, and transformer fundamentals [link](https://huggingface.co/google-bert/bert-base-uncased)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-05-27) — Homie RAG reranker plugin for better retrieval precision; PyMasters tutorial on two-stage retrieval [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-27) — Lightweight embedding option for Homie on low-RAM devices; PyMasters benchmark post vs MiniLM [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **Qwen/Qwen3-VL-2B-Instruct** (score: 9, source: huggingface, added: 2026-05-27) — Homie vision plugin for screenshot/image understanding; PyMasters tutorial on local VLMs [link](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-05-27) — Homie multilingual+long-context retrieval upgrade; PyMasters advanced embeddings tutorial [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-27) — Matryoshka embeddings for adaptive Homie storage; PyMasters tutorial on variable-dimension embeddings [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **mteb/leaderboard** (score: 9, source: huggingface, added: 2026-05-27) — Reference MTEB leaderboard when picking Homie's embedding model; PyMasters guide to choosing embeddings via MTEB [link](https://huggingface.co/spaces/mteb/leaderboard)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-27) — Multilingual embedding support for Homie's international users; PyMasters multilingual RAG tutorial [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-05-27) — Higher-quality embedding option for Homie when accuracy matters more than speed; PyMasters comparison post [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-27) — Late-interaction retrieval option for Homie RAG quality boost; PyMasters ColBERT tutorial [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-05-27) — PyMasters deep-dive series on distributed training and scaling laws using the ultrascale playbook [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)
- **said-rag-eval-2026/said-rag-eval-benchmark** (score: 8, source: huggingface, added: 2026-05-27) — PyMasters tutorial on evaluating RAG pipelines using this benchmark; reference for measuring Homie RAG quality [link](https://huggingface.co/datasets/said-rag-eval-2026/said-rag-eval-benchmark)

### Prototyping (scored >= 7)

- **openai/clip-vit-large-patch14** (score: 7, source: huggingface, added: 2026-05-27) — Homie image search/tagging plugin; PyMasters multimodal embeddings tutorial [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-05-27) — Lightweight CLIP for Homie image organization plugin; PyMasters intro to zero-shot vision [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **laion/clap-htsat-fused** (score: 7, source: huggingface, added: 2026-05-27) — Homie audio-tagging plugin for local media library; PyMasters audio embeddings tutorial [link](https://huggingface.co/laion/clap-htsat-fused)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-05-27) — Beginner tutorial on causal LM fundamentals using the canonical GPT-2 [link](https://huggingface.co/openai-community/gpt2)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 7, source: huggingface, added: 2026-05-27) — PyMasters article on how to interpret LLM leaderboards and pick models for local use [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 7, source: huggingface, added: 2026-05-27) — PyMasters article on using LMArena rankings to choose local-capable open models for Homie-style apps [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-05-27) — Tutorial comparing ELECTRA vs BERT for efficient pretraining [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-05-27) — Tutorial on multilingual transformer foundations and token classification [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-05-27) — Tutorial on RoBERTa for classification fine-tuning [link](https://huggingface.co/FacebookAI/roberta-large)
- **FacebookAI/roberta-base** (score: 6, source: huggingface, added: 2026-05-27) — Baseline tutorial for text classification fine-tuning [link](https://huggingface.co/FacebookAI/roberta-base)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-05-27) — PyMasters tutorial on diffusion models and prompting FLUX via diffusers [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-05-27) — Fast diffusion tutorial â€” comparing schnell vs dev for image generation pipelines [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)

### Discovered (new)

*No items yet.*
