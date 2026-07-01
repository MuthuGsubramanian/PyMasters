## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-07-01*

### Ready to Build (scored >= 8, validated)

- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-07-01) — Ultra-small local LLM perfect for Homie's privacy-first on-device generation; PyMasters tutorial on running tiny LLMs locally. [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-82M** (score: 10, source: huggingface, added: 2026-07-01) — Tiny local TTS powers Homie's voice output offline; PyMasters tutorial on building local text-to-speech. [link](https://huggingface.co/hexgrad/Kokoro-82M)
- **Qwen/Qwen3-4B** (score: 10, source: huggingface, added: 2026-07-01) — Strong small local LLM as Homie's core assistant brain; PyMasters guide on running Qwen3 locally with quantization. [link](https://huggingface.co/Qwen/Qwen3-4B)
- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-07-01) — Tutorial on building semantic search with sentence embeddings; Homie's default local RAG embedding model. [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-07-01) — Homie adds a reranking stage to RAG retrieval; PyMasters tutorial on two-stage retrieve-then-rerank. [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-07-01) — Small, fast local embedding model ideal for Homie's on-device RAG; PyMasters guide comparing embedding models. [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-07-01) — Homie multilingual + multi-granularity embeddings (dense/sparse/colbert); PyMasters deep-dive on BGE-M3 hybrid retrieval. [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-07-01) — Long-context local embedding model for Homie RAG over big documents; PyMasters guide on Nomic embeddings. [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **BAAI/bge-reranker-v2-m3** (score: 9, source: huggingface, added: 2026-07-01) — Homie multilingual reranker for its RAG pipeline; PyMasters tutorial on improving retrieval precision with rerankers. [link](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- **hexgrad/Kokoro-TTS** (score: 9, source: huggingface, added: 2026-07-01) — Live demo of Kokoro TTS to prototype Homie's local voice; PyMasters walkthrough of the TTS space. [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-07-01) — Classic 'how transformers work' / fill-mask tutorial and fine-tuning walkthrough for PyMasters. [link](https://huggingface.co/google-bert/bert-base-uncased)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-07-01) — Homie multilingual RAG/search support; PyMasters tutorial on cross-lingual semantic similarity. [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-07-01) — Higher-quality embedding option for Homie RAG; PyMasters piece benchmarking MiniLM vs MPNet. [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-large-en-v1.5** (score: 8, source: huggingface, added: 2026-07-01) — High-accuracy embedding option for Homie RAG when resources allow; PyMasters embedding-model comparison content. [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-07-01) — Use MTEB leaderboard to pick Homie's embedding model; PyMasters guide on evaluating embeddings. [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-07-01) — PyMasters advanced content on large-scale model training from the ultrascale playbook. [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-07-01) — Homie image-understanding/search plugin via CLIP embeddings; PyMasters zero-shot image classification tutorial. [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **google-t5/t5-small** (score: 7, source: huggingface, added: 2026-07-01) — PyMasters seq2seq tutorial (translation/summarization) with T5; optional lightweight Homie summarization plugin. [link](https://huggingface.co/google-t5/t5-small)
- **amazon/chronos-2** (score: 7, source: huggingface, added: 2026-07-01) — PyMasters tutorial on zero-shot time-series forecasting with foundation models. [link](https://huggingface.co/amazon/chronos-2)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-07-01) — PyMasters tutorial on ELECTRA pretraining and efficient discriminative NLP models. [link](https://huggingface.co/google/electra-base-discriminator)
- **timm/mobilenetv3_small_100.lamb_in1k** (score: 6, source: huggingface, added: 2026-07-01) — PyMasters tutorial on lightweight edge image classification with timm/MobileNetV3; possible Homie vision plugin. [link](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-07-01) — PyMasters tutorial on multilingual NLP; foundation for Homie's multilingual understanding. [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **laion/clap-htsat-fused** (score: 6, source: huggingface, added: 2026-07-01) — Homie audio-tagging/sound-search plugin via CLAP; PyMasters tutorial on audio-text contrastive models. [link](https://huggingface.co/laion/clap-htsat-fused)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-07-01) — Reference for PyMasters 'how to pick an LLM' article and for choosing Homie's local model. [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-07-01) — Reference for comparing LLMs in PyMasters content and choosing Homie's backing model. [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Discovered (new)

*No items yet.*
