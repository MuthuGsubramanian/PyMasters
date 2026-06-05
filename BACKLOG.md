## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-06-05*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-06-05) — Tutorial on building embeddings/semantic search for PyMasters; the default lightweight RAG embedding backbone for Homie's local document Q&A. [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-06-05) — Tutorial on running tiny local LLMs; an ideal ultra-light on-device chat model for Homie's privacy-first assistant. [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial on two-stage retrieval (bi-encoder + cross-encoder reranking); Homie could add this as a local reranker to sharpen RAG results. [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **google-bert/bert-base-uncased** (score: 9, source: huggingface, added: 2026-06-05) — Foundational tutorial explaining BERT, masked language modeling, and the transformer that started it all. [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial benchmarking BGE embeddings; a strong small embedding model for Homie's on-device RAG. [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial on higher-quality embeddings vs MiniLM trade-offs; Homie's accuracy-tier embedding option for capable devices. [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial on multi-vector/multilingual dense+sparse retrieval; powerful local RAG backbone for Homie's privacy-first search. [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial on long-context Matryoshka embeddings; a flexible local embedding option for Homie RAG. [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **Qwen/Qwen3-4B** (score: 9, source: huggingface, added: 2026-06-05) — Tutorial on capable small local LLMs; Homie's mid-tier on-device reasoning/chat model. [link](https://huggingface.co/Qwen/Qwen3-4B)
- **hexgrad/Kokoro-TTS** (score: 9, source: huggingface, added: 2026-06-05) — Homie voice-output plugin for natural local TTS; PyMasters tutorial on lightweight on-device speech synthesis. [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-06-05) — Tutorial on multilingual semantic search; lets Homie serve RAG and similarity across 50+ languages locally. [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-06-05) — Tutorial on ColBERT late-interaction retrieval; Homie could use it for higher-fidelity local RAG ranking. [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **BAAI/bge-large-en-v1.5** (score: 8, source: huggingface, added: 2026-06-05) — Tutorial on high-accuracy BGE embeddings; Homie's premium embedding tier for desktop-class devices. [link](https://huggingface.co/BAAI/bge-large-en-v1.5)

### Prototyping (scored >= 7)

- **openai/clip-vit-large-patch14** (score: 7, source: huggingface, added: 2026-06-05) — Tutorial on CLIP zero-shot image classification; Homie could power a local image-search/tagging plugin (large variant). [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-06-05) — Tutorial on multimodal embeddings; the lighter CLIP that Homie can realistically run for on-device photo search. [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-06-05) — Beginner-friendly tutorial on text generation and how GPT-2 works under the hood. [link](https://huggingface.co/openai-community/gpt2)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-06-05) — Article on the MTEB benchmark to choose embeddings; guides which model Homie ships for RAG. [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 7, source: huggingface, added: 2026-06-05) — Advanced PyMasters learning path on large-scale distributed training internals. [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-06-05) — Tutorial contrasting ELECTRA's replaced-token-detection pretraining with BERT's masking. [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-06-05) — Tutorial on cross-lingual transfer with XLM-RoBERTa for multilingual NLP. [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-06-05) — Tutorial on fine-tuning RoBERTa-large for classification tasks. [link](https://huggingface.co/FacebookAI/roberta-large)
- **FacebookAI/roberta-base** (score: 6, source: huggingface, added: 2026-06-05) — Tutorial on fine-tuning RoBERTa-base for NLP downstream tasks. [link](https://huggingface.co/FacebookAI/roberta-base)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-06-05) — Article on reading LLM leaderboards; reference for picking Homie's bundled local model. [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-06-05) — Article explaining LMArena human-preference rankings; reference for selecting Homie's local model. [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Discovered (new)

*No items yet.*
