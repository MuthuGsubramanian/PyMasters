## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-06-01*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-06-01) — Tutorial on building local RAG with MiniLM embeddings; Homie's default lightweight embedding model for local semantic search [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-06-01) — Tutorial on running tiny LLMs locally; Qwen3-0.6B as Homie's default ultra-light model for low-end devices [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **Qwen/Qwen2.5-1.5B-Instruct** (score: 10, source: huggingface, added: 2026-06-01) — Tutorial on running Qwen2.5 locally with chat templates; strong candidate as Homie's default conversational LLM [link](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)
- **hexgrad/Kokoro-TTS** (score: 10, source: huggingface, added: 2026-06-01) — Tutorial on local TTS; Kokoro becomes Homie's default offline voice-output engine [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-06-01) — Tutorial on two-stage retrieval (bi-encoder + cross-encoder reranker); Homie plugin for reranking RAG results locally [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-06-01) — Tutorial on BGE embeddings for RAG; Homie can use bge-small as a quality-vs-size embedding option [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 9, source: huggingface, added: 2026-06-01) — Tutorial on multilingual semantic search; Homie multilingual RAG plugin for non-English users [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-06-01) — Tutorial on higher-accuracy embeddings; Homie's premium embedding option when users want quality over speed [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-06-01) — Tutorial on long-context embeddings (8k); Homie embedding option for long-document RAG [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-06-01) — Foundational BERT tutorial series covering fill-mask, fine-tuning, and transformer internals [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-m3** (score: 8, source: huggingface, added: 2026-06-01) — Tutorial on hybrid dense+sparse+multi-vector retrieval; Homie advanced RAG mode with BGE-M3 [link](https://huggingface.co/BAAI/bge-m3)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-06-01) — Lightweight CLIP tutorial; Homie image-tagging plugin with smaller CLIP for low-resource devices [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **BAAI/bge-large-en-v1.5** (score: 8, source: huggingface, added: 2026-06-01) — Tutorial on high-quality embeddings; Homie's high-accuracy embedding tier for users with more RAM [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-06-01) — Tutorial on using MTEB to choose the right embedding model; Homie's evidence-based default model selection [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-06-01) — Tutorial series on large-scale training fundamentals based on the ultrascale playbook [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **openai/clip-vit-large-patch14** (score: 7, source: huggingface, added: 2026-06-01) — Tutorial on CLIP for zero-shot image classification; Homie vision plugin for local image search/tagging [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **colbert-ir/colbertv2.0** (score: 7, source: huggingface, added: 2026-06-01) — Tutorial on late-interaction retrieval with ColBERT; Homie advanced retrieval mode for precise document Q&A [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-06-01) — Educational tutorial on transformer text generation fundamentals using GPT-2 [link](https://huggingface.co/openai-community/gpt2)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 7, source: huggingface, added: 2026-06-01) — Tutorial on how to read and interpret LLM benchmarks for model selection [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial comparing ELECTRA's discriminator pretraining vs BERT MLM for efficient model training [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on multilingual NLP foundations with XLM-RoBERTa [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-base** (score: 6, source: huggingface, added: 2026-06-01) — Beginner NLP fine-tuning tutorial with RoBERTa-base [link](https://huggingface.co/FacebookAI/roberta-base)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on diffusion image generation with FLUX; could power an optional Homie image-gen plugin if GPU available [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on fast image generation with FLUX schnell; optional lightweight Homie image plugin [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on Chatbot Arena methodology and picking models for production [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)
- **akhaliq/anycoder** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on building an AI coding assistant; could inspire a Homie coding plugin [link](https://huggingface.co/spaces/akhaliq/anycoder)
- **Karmane/vscode-ai-agent-extensions-enriched** (score: 6, source: huggingface, added: 2026-06-01) — Dataset to analyze VS Code AI agent ecosystem; tutorial on building IDE AI agents [link](https://huggingface.co/datasets/Karmane/vscode-ai-agent-extensions-enriched)
- **ubetu/rstar-coder-synthetic-sft** (score: 6, source: huggingface, added: 2026-06-01) — Tutorial on synthetic SFT datasets and how to fine-tune code models [link](https://huggingface.co/datasets/ubetu/rstar-coder-synthetic-sft)

### Discovered (new)

*No items yet.*
