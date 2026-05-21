## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-21*

### Ready to Build (scored >= 8, validated)

- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-21) — Tutorial on running tiny local LLMs in Python; Homie's default on-device LLM for low-resource devices [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-TTS** (score: 10, source: huggingface, added: 2026-05-21) — Tutorial on local TTS in Python; Homie's local voice output engine for offline speech [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-05-21) — Tutorial on building RAG with MiniLM embeddings; Homie's default lightweight local embedding backbone [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **google-bert/bert-base-uncased** (score: 9, source: huggingface, added: 2026-05-21) — Foundational tutorial on BERT, fine-tuning, and masked language modeling for Python learners [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-21) — Tutorial on BGE embeddings; Homie alternative embedding backbone with strong MTEB scores [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-05-21) — Tutorial on higher-quality sentence embeddings vs MiniLM; Homie embedding upgrade option [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-05-21) — Tutorial on multilingual/multifunctional embeddings; Homie's premium embedding option for long-context RAG [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-21) — Tutorial on long-context embeddings with Matryoshka; Homie embedding option for large documents [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **Qwen/Qwen3-VL-2B-Instruct** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on local vision-language inference; Homie plugin for screenshot/image Q&A on-device [link](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on reranking for RAG; Homie could add reranker stage to local RAG pipeline [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on multilingual semantic search; Homie multilingual RAG plugin [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **openai/clip-vit-large-patch14** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on CLIP for image search; Homie plugin for local image search across user photos [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on lightweight CLIP; Homie's small image-tagging plugin [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on late-interaction retrieval with ColBERT; Homie advanced RAG retrieval mode [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **openai-community/gpt2** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial on GPT-2 internals and text generation fundamentals [link](https://huggingface.co/openai-community/gpt2)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-05-21) — Reference guide on using MTEB leaderboard to choose Homie's embedding model [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-05-21) — Tutorial series on large-scale training fundamentals from the ultrascale playbook [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **FacebookAI/xlm-roberta-base** (score: 7, source: huggingface, added: 2026-05-21) — Tutorial on multilingual MLM fine-tuning for NLP tasks [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 7, source: huggingface, added: 2026-05-21) — Tutorial on fine-tuning RoBERTa for classification tasks [link](https://huggingface.co/FacebookAI/roberta-large)
- **laion/clap-htsat-fused** (score: 7, source: huggingface, added: 2026-05-21) — Tutorial on audio embeddings with CLAP; Homie voice/audio classification plugin [link](https://huggingface.co/laion/clap-htsat-fused)
- **FacebookAI/roberta-base** (score: 7, source: huggingface, added: 2026-05-21) — Tutorial on RoBERTa for downstream NLP fine-tuning [link](https://huggingface.co/FacebookAI/roberta-base)
- **amazon/chronos-2** (score: 7, source: huggingface, added: 2026-05-21) — Tutorial on zero-shot time-series forecasting with Chronos-2 [link](https://huggingface.co/amazon/chronos-2)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-05-21) — Tutorial comparing ELECTRA vs BERT pretraining objectives [link](https://huggingface.co/google/electra-base-discriminator)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-05-21) — Reference article on how to read the Open LLM Leaderboard to pick models [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-05-21) — Tutorial on running FLUX.1 for image generation in Python [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-05-21) — Tutorial on fast image generation with FLUX schnell [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-05-21) — Reference on using arena leaderboard to compare LLMs for Homie [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)
- **toola/Annoy-PyEdu-Rs** (score: 6, source: huggingface, added: 2026-05-21) — Python-education dataset could seed lesson examples or fine-tuning experiments [link](https://huggingface.co/datasets/toola/Annoy-PyEdu-Rs)
- **toola/Annoy-PyEdu-Rs-Raw** (score: 6, source: huggingface, added: 2026-05-21) — Raw Python-education corpus for content mining and lesson scaffolding [link](https://huggingface.co/datasets/toola/Annoy-PyEdu-Rs-Raw)

### Discovered (new)

*No items yet.*
