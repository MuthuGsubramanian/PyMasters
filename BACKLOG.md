## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-29*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-05-29) — Flagship tutorial on local sentence embeddings; the lightweight default embedding backbone for Homie's on-device RAG [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-29) — Tutorial on running a tiny conversational LLM locally; ideal sub-1B local LLM for Homie including Android [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **google-bert/bert-base-uncased** (score: 9, source: huggingface, added: 2026-05-29) — Foundational NLP tutorial on BERT, masked language modeling, and transformer basics [link](https://huggingface.co/google-bert/bert-base-uncased)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-29) — Compact high-quality embedding tutorial; strong drop-in RAG embedder for Homie's privacy-first local search [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-05-29) — Tutorial comparing MiniLM vs MPNet quality/speed; Homie's higher-accuracy local embedding option [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-05-29) — Tutorial on multilingual hybrid (dense+sparse) embeddings; advanced Homie RAG backbone with multi-vector retrieval [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-29) — Tutorial on long-context local embeddings; Homie RAG embedder for longer documents on-device [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **hexgrad/Kokoro-TTS** (score: 9, source: huggingface, added: 2026-05-29) — Tutorial on lightweight local TTS; ideal privacy-first voice-output engine for Homie's voice interaction [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-05-29) — Tutorial on RAG reranking; Homie can add a cross-encoder reranker stage to sharpen local retrieval results [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-29) — Multilingual embedding tutorial; powers Homie RAG across non-English documents on-device [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-29) — Tutorial on ColBERT late-interaction retrieval; advanced high-precision retrieval mode for Homie RAG [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **openai-community/gpt2** (score: 8, source: huggingface, added: 2026-05-29) — Beginner-friendly historical tutorial on GPT-2 and autoregressive text generation [link](https://huggingface.co/openai-community/gpt2)
- **BAAI/bge-large-en-v1.5** (score: 8, source: huggingface, added: 2026-05-29) — Tutorial on high-accuracy BGE embeddings; Homie's quality-tier RAG embedder where device resources allow [link](https://huggingface.co/BAAI/bge-large-en-v1.5)

### Prototyping (scored >= 7)

- **google/electra-base-discriminator** (score: 7, source: huggingface, added: 2026-05-29) — Educational deep-dive on ELECTRA's replaced-token-detection pretraining vs. BERT [link](https://huggingface.co/google/electra-base-discriminator)
- **openai/clip-vit-large-patch14** (score: 7, source: huggingface, added: 2026-05-29) — Tutorial on CLIP and zero-shot image classification; large size limits on-device use but enables a Homie image-tagging plugin [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **FacebookAI/xlm-roberta-base** (score: 7, source: huggingface, added: 2026-05-29) — Tutorial on multilingual masked LM and cross-lingual transfer with XLM-RoBERTa [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-05-29) — Tutorial on lightweight CLIP; small enough for a local Homie image-search/auto-tagging plugin [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **FacebookAI/roberta-base** (score: 7, source: huggingface, added: 2026-05-29) — Tutorial on fine-tuning RoBERTa-base for sentiment/classification tasks [link](https://huggingface.co/FacebookAI/roberta-base)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-05-29) — Article on using the MTEB leaderboard to choose embeddings; directly informs Homie's RAG embedder selection [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 7, source: huggingface, added: 2026-05-29) — Advanced learning-path content on large-scale distributed model training [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Evaluating (scored >= 6)

- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-05-29) — Tutorial on scaling RoBERTa for fine-tuning classification tasks [link](https://huggingface.co/FacebookAI/roberta-large)
- **laion/clap-htsat-fused** (score: 6, source: huggingface, added: 2026-05-29) — Tutorial on audio-text embeddings (CLAP); Homie voice layer could add audio search/sound classification [link](https://huggingface.co/laion/clap-htsat-fused)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-05-29) — Article on how to read the Open LLM Leaderboard and pick models for a project [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-05-29) — Article on interpreting Chatbot Arena rankings; helps choose a local LLM for Homie [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)

### Discovered (new)

*No items yet.*
