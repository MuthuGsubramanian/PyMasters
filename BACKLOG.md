## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-07-13*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-07-13) — Canonical tutorial on sentence embeddings and semantic search; also the go-to lightweight local embedding model for Homie's RAG pipeline [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 9, source: huggingface, added: 2026-07-13) — Tutorial on running a sub-1B LLM locally; ideal ultra-light local model for Homie on low-end hardware and Android [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **Qwen/Qwen3-8B** (score: 9, source: huggingface, added: 2026-07-13) — Tutorial on running/quantizing an 8B model locally; strong default local LLM for Homie on desktop-class hardware [link](https://huggingface.co/Qwen/Qwen3-8B)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-07-13) — Tutorial on two-stage retrieval (retrieve + rerank); Homie could use it to rerank RAG results locally for better answer quality [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-07-13) — Classic tutorial material: fine-tuning BERT for text classification, explaining transformers fundamentals [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-small-en-v1.5** (score: 8, source: huggingface, added: 2026-07-13) — Small, fast English embedding model â€” tutorial on choosing embedding models; strong candidate for Homie's on-device RAG [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-07-13) — Multilingual embeddings tutorial; enables Homie RAG and semantic search for non-English users on-device [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-07-13) — Best-quality general sentence embedding tutorial (vs MiniLM tradeoffs); solid default for Homie document search where compute allows [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-07-13) — Tutorial on CLIP and zero-shot image classification; Homie could use it for local semantic photo search [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **nomic-ai/nomic-embed-text-v1.5** (score: 8, source: huggingface, added: 2026-07-13) — Tutorial on Matryoshka/resizable embeddings; ONNX support makes it practical for Homie's cross-platform local RAG [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)

### Prototyping (scored >= 7)

- **BAAI/bge-m3** (score: 7, source: huggingface, added: 2026-07-13) — Tutorial on hybrid dense+sparse+multilingual retrieval with BGE-M3; Homie could offer it as a higher-quality multilingual RAG option [link](https://huggingface.co/BAAI/bge-m3)
- **BAAI/bge-reranker-v2-m3** (score: 7, source: huggingface, added: 2026-07-13) — Multilingual reranker for RAG quality â€” tutorial on reranking; Homie could add it as an optional RAG quality booster [link](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-07-13) — Guide on using the MTEB leaderboard to choose embedding models â€” directly informs Homie's embedding model selection [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 7, source: huggingface, added: 2026-07-13) — Excellent source material for advanced content on large-scale LLM training (parallelism, scaling) â€” a differentiating deep-dive series [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Evaluating (scored >= 6)

- **timm/mobilenetv3_small_100.lamb_in1k** (score: 6, source: huggingface, added: 2026-07-13) — Tutorial on efficient on-device image classification with timm/MobileNetV3; possible lightweight vision plugin for Homie [link](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k)
- **google-t5/t5-small** (score: 6, source: huggingface, added: 2026-07-13) — Intro tutorial on seq2seq and translation with T5; small enough to demo fine-tuning on free hardware [link](https://huggingface.co/google-t5/t5-small)
- **amazon/chronos-2** (score: 6, source: huggingface, added: 2026-07-13) — Tutorial on zero-shot time-series forecasting with Chronos-2 â€” differentiated AI/ML content beyond LLMs [link](https://huggingface.co/amazon/chronos-2)
- **BAAI/bge-large-en-v1.5** (score: 6, source: huggingface, added: 2026-07-13) — Tutorial comparing embedding sizes (small vs large BGE) for retrieval quality vs latency tradeoffs [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-07-13) — Tutorial/guide on how to read LLM leaderboards and pick a model; useful reference when recommending Homie local models [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)

### Discovered (new)

*No items yet.*
