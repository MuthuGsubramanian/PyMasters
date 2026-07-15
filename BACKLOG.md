## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-07-15*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-07-15) — The default embedding model for semantic search â€” PyMasters tutorial on building RAG from scratch; Homie already-compatible lightweight local embedder for its RAG pipeline [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 9, source: huggingface, added: 2026-07-15) — Sub-1B modern LLM â€” tutorial on running LLMs on any laptop; prime Homie candidate for low-end devices and Android [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **Qwen/Qwen3-8B** (score: 9, source: huggingface, added: 2026-07-15) — Qwen3-8B is the sweet spot for local desktop LLMs â€” tutorial on quantized local inference; strong default chat model for Homie via ollama/llama.cpp [link](https://huggingface.co/Qwen/Qwen3-8B)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-07-15) — Cross-encoder reranking tutorial (two-stage retrieval); Homie could add reranking to improve RAG answer quality with a tiny ONNX model [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 8, source: huggingface, added: 2026-07-15) — Compact high-quality English embedder with ONNX â€” tutorial comparing embedding models; strong candidate for Homie's default local embedding backend [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-07-15) — Multilingual sentence embeddings â€” tutorial on cross-language semantic search; lets Homie's RAG work for non-English users (aligns with PyMasters' 8-language push) [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **BAAI/bge-m3** (score: 8, source: huggingface, added: 2026-07-15) — BGE-M3's dense+sparse+multi-vector hybrid retrieval is a great advanced-RAG tutorial; Homie hybrid search plugin, though the model is heavier than ideal for edge devices [link](https://huggingface.co/BAAI/bge-m3)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-07-15) — The quality benchmark among sentence-transformers â€” use in a 'speed vs quality embedding tradeoffs' lesson; Homie high-quality embedding option on desktop [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-07-15) — CLIP zero-shot classification tutorial (text-image embeddings); Homie could use it for local photo search by natural language [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **nomic-ai/nomic-embed-text-v1.5** (score: 8, source: huggingface, added: 2026-07-15) — Nomic's resizable (Matryoshka) embeddings make a great tutorial on dimension/storage tradeoffs; ONNX support fits Homie's local RAG well [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **intfloat/multilingual-e5-small** (score: 8, source: huggingface, added: 2026-07-15) — Small multilingual E5 with OpenVINO/ONNX â€” ideal Homie embedder for weaker hardware and non-English users; comparison entry in an embeddings lesson [link](https://huggingface.co/intfloat/multilingual-e5-small)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-07-15) — Ultrascale Playbook is a goldmine for advanced PyMasters content on distributed training (could seed an 'AI engineering at scale' track); irrelevant to local Homie [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **google-bert/bert-base-uncased** (score: 7, source: huggingface, added: 2026-07-15) — Classic BERT â€” ideal for a 'transformers fundamentals' lesson (masked LM, fine-tuning); too dated for a Homie feature [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-reranker-v2-m3** (score: 7, source: huggingface, added: 2026-07-15) — Multilingual reranker â€” pairs with BGE-M3 for an advanced retrieval-pipeline tutorial; Homie RAG quality boost for multilingual documents [link](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- **amazon/chronos-2** (score: 7, source: huggingface, added: 2026-07-15) — Chronos-2 time-series forecasting â€” fresh tutorial territory beyond NLP (forecasting with pretrained models); niche Homie plugin for personal data trends [link](https://huggingface.co/amazon/chronos-2)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-07-15) — MTEB leaderboard â€” companion resource for embedding tutorials ('how to choose an embedding model'); guides Homie's embedder selection [link](https://huggingface.co/spaces/mteb/leaderboard)

### Evaluating (scored >= 6)

- **google-t5/t5-small** (score: 6, source: huggingface, added: 2026-07-15) — T5-small is perfect for teaching seq2seq and fine-tuning on modest hardware; marginal for Homie vs modern small LLMs [link](https://huggingface.co/google-t5/t5-small)
- **timm/mobilenetv3_small_100.lamb_in1k** (score: 6, source: huggingface, added: 2026-07-15) — MobileNetV3 tutorial on efficient on-device image classification with timm; could power a lightweight Homie image-tagging plugin [link](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k)
- **BAAI/bge-large-en-v1.5** (score: 6, source: huggingface, added: 2026-07-15) — Large BGE variant rounds out an embedding size/quality benchmark tutorial; too heavy to be Homie's default [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-07-15) — Open LLM Leaderboard â€” teach students how to read benchmarks and pick models; could inform Homie's model-recommendation defaults [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-07-15) — FLUX.1-dev tutorial on state-of-the-art open image generation with diffusers; too GPU-heavy for typical Homie devices [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-07-15) — FLUX.1-schnell's speed makes 'fast local image generation' feasible as a tutorial and a stretch Homie plugin for GPU-equipped desktops [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-07-15) — LM Arena leaderboard â€” content on human-preference evaluation vs static benchmarks; background input for Homie model picks [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Discovered (new)

*No items yet.*
