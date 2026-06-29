## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-06-29*

### Ready to Build (scored >= 8, validated)

- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-06-29) — Tutorial on running tiny LLMs locally; ideal low-footprint local LLM for Homie on modest hardware [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-82M** (score: 10, source: huggingface, added: 2026-06-29) — Tutorial on local TTS; core engine for Homie's voice/offline speech output [link](https://huggingface.co/hexgrad/Kokoro-82M)
- **Qwen/Qwen3-4B** (score: 10, source: huggingface, added: 2026-06-29) — Tutorial on running mid-size LLMs locally; strong default local LLM brain for Homie [link](https://huggingface.co/Qwen/Qwen3-4B)
- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-06-29) — Flagship tutorial on semantic search/embeddings for PyMasters; default lightweight embedding model for Homie's local RAG index [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-06-29) — Tutorial on two-stage retrieval; Homie can use it to rerank RAG candidates for sharper local document Q&A [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-06-29) — Compact, high-quality embedding modelâ€”tutorial on RAG; strong on-device embedder for Homie privacy-first RAG [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-06-29) — Tutorial on multilingual/multi-function (dense+sparse) retrieval; powerful unified embedder for Homie RAG [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-06-29) — Tutorial on long-context embeddings; strong local RAG embedder for Homie with Matryoshka dimension control [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **BAAI/bge-reranker-v2-m3** (score: 9, source: huggingface, added: 2026-06-29) — Tutorial on multilingual reranking; Homie reranker to boost local RAG relevance across languages [link](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-06-29) — Canonical model for an educational NLP/transformers fundamentals course on PyMasters [link](https://huggingface.co/google-bert/bert-base-uncased)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-06-29) — Tutorial on multilingual embeddings; lets Homie do RAG across non-English documents locally [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-06-29) — Tutorial on choosing embedding quality vs speed; Homie's higher-accuracy embedding option for capable devices [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-06-29) — Tutorial on multimodal/zero-shot image classification; Homie plugin for local image search/tagging [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **BAAI/bge-large-en-v1.5** (score: 8, source: huggingface, added: 2026-06-29) — Tutorial on high-accuracy embeddings; Homie's premium RAG embedder for powerful devices [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-06-29) — Reference for a PyMasters embedding-selection guide; directly informs which embedder Homie ships for RAG [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-06-29) — Excellent source for an advanced PyMasters course on large-scale LLM training [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)
- **hexgrad/Kokoro-TTS** (score: 8, source: huggingface, added: 2026-06-29) — Live demo to reference in a TTS tutorial; validates Kokoro as Homie's local voice engine [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **dfsfsdg5657/Annoy-PyEdu-Rs-Raw** (score: 8, source: huggingface, added: 2026-06-29) — Python-education datasetâ€”raw source to mine for PyMasters tutorials/exercises [link](https://huggingface.co/datasets/dfsfsdg5657/Annoy-PyEdu-Rs-Raw)
- **asfafaf4546/Annoy-PyEdu-Rs-Raw** (score: 8, source: huggingface, added: 2026-06-29) — Python-education dataset mirrorâ€”source material for PyMasters content generation [link](https://huggingface.co/datasets/asfafaf4546/Annoy-PyEdu-Rs-Raw)

### Prototyping (scored >= 7)

- **timm/mobilenetv3_small_100.lamb_in1k** (score: 7, source: huggingface, added: 2026-06-29) — Lightweight vision modelâ€”tutorial on edge inference; Homie on-device image classification plugin [link](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k)
- **FacebookAI/xlm-roberta-base** (score: 7, source: huggingface, added: 2026-06-29) — Tutorial on multilingual transformers; secondary multilingual NLP backbone for Homie features [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **amazon/chronos-2** (score: 7, source: huggingface, added: 2026-06-29) — Tutorial on zero-shot time-series forecasting in Python [link](https://huggingface.co/amazon/chronos-2)
- **google-t5/t5-small** (score: 7, source: huggingface, added: 2026-06-29) — Classic seq2seq for a PyMasters tutorial on translation/summarization; lightweight Homie text-transform plugin [link](https://huggingface.co/google-t5/t5-small)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-06-29) — Useful for a PyMasters deep-dive comparing pretraining objectives (ELECTRA vs BERT) [link](https://huggingface.co/google/electra-base-discriminator)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-06-29) — Reference for a PyMasters 'how to pick an LLM' guide; informs Homie's bundled-model selection [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-06-29) — Reference for PyMasters model-comparison content; helps decide Homie's local LLM choice [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Discovered (new)

*No items yet.*
