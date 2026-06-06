## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-06-06*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 10, source: huggingface, added: 2026-06-06) — Cornerstone tutorial on sentence embeddings; the default lightweight embedding backbone for Homie's local RAG. [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-06-06) — Tiny conversational LLM perfect as Homie's default local model; tutorial on running Qwen3 locally. [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-06-06) — Tutorial on two-stage retrieval; Homie can add cross-encoder reranking to sharpen local RAG results. [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-06-06) — Small, fast embedding ideal for Homie's on-device RAG; tutorial on BGE vs MiniLM tradeoffs. [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-06-06) — Long-context local embedding great for Homie document RAG; tutorial on Matryoshka embeddings. [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **Qwen/Qwen3-4B** (score: 9, source: huggingface, added: 2026-06-06) — Mid-size local LLM for stronger Homie reasoning on capable hardware; tutorial on quantizing and serving it. [link](https://huggingface.co/Qwen/Qwen3-4B)
- **hexgrad/Kokoro-TTS** (score: 9, source: huggingface, added: 2026-06-06) — Lightweight local TTS ideal for Homie's voice output; tutorial on running offline text-to-speech in Python. [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-06-06) — Foundational tutorial on BERT, fill-mask, and fine-tuning for classification. [link](https://huggingface.co/google-bert/bert-base-uncased)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-06-06) — Powers multilingual local RAG/search in Homie; tutorial on cross-language semantic similarity. [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-06-06) — Higher-accuracy embedding option for Homie RAG; tutorial on quality-vs-speed embedding choices. [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 8, source: huggingface, added: 2026-06-06) — Multi-functional (dense+sparse+ColBERT) multilingual embedding for advanced Homie retrieval; deep-dive tutorial. [link](https://huggingface.co/BAAI/bge-m3)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-06-06) — Excellent source for an advanced learning path on large-scale distributed training. [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-06-06) — Tutorial on zero-shot image classification; Homie plugin for local image search/tagging. [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **colbert-ir/colbertv2.0** (score: 7, source: huggingface, added: 2026-06-06) — Tutorial on ColBERT late-interaction retrieval; advanced high-recall option for Homie RAG. [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-06-06) — Classic educational tutorial on text generation and how transformers learn language. [link](https://huggingface.co/openai-community/gpt2)
- **BAAI/bge-large-en-v1.5** (score: 7, source: huggingface, added: 2026-06-06) — High-accuracy embedding for Homie RAG on stronger devices; tutorial on large vs small BGE tradeoffs. [link](https://huggingface.co/BAAI/bge-large-en-v1.5)
- **FacebookAI/roberta-base** (score: 7, source: huggingface, added: 2026-06-06) — Tutorial on fine-tuning RoBERTa for text classification and sentiment. [link](https://huggingface.co/FacebookAI/roberta-base)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-06-06) — MTEB benchmark guide to choose the right embedding; directly informs Homie's local embedding selection. [link](https://huggingface.co/spaces/mteb/leaderboard)
- **taylorbollman/cosmoV2-300_python-edu-emin-200-4096_smollm3-base-tokenized** (score: 7, source: huggingface, added: 2026-06-06) — Python-education tokenized corpus â€” useful training/eval data for PyMasters' Vaathiyaar content pipeline. [link](https://huggingface.co/datasets/taylorbollman/cosmoV2-300_python-edu-emin-200-4096_smollm3-base-tokenized)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-06-06) — Tutorial comparing ELECTRA's replaced-token-detection pretraining vs BERT masking. [link](https://huggingface.co/google/electra-base-discriminator)
- **openai/clip-vit-large-patch14** (score: 6, source: huggingface, added: 2026-06-06) — Tutorial on higher-fidelity CLIP; heavier weight makes it less ideal for on-device Homie. [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-06-06) — Tutorial on multilingual masked LM and cross-lingual transfer fine-tuning. [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-06-06) — Tutorial on large-model fine-tuning tradeoffs and when bigger RoBERTa pays off. [link](https://huggingface.co/FacebookAI/roberta-large)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-06-06) — Article/guide on reading LLM leaderboards to pick a model for your project. [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-06-06) — Explainer on Chatbot Arena ELO rankings to help learners pick LLMs. [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)
- **chengze79/Annoy-PyEdu-Rs-Raw** (score: 6, source: huggingface, added: 2026-06-06) — Python-edu dataset usable for curating or fine-tuning PyMasters learning content. [link](https://huggingface.co/datasets/chengze79/Annoy-PyEdu-Rs-Raw)
- **tooldev/Annoy-PyEdu-Rs-Raw** (score: 6, source: huggingface, added: 2026-06-06) — Python-edu raw dataset mirror; candidate corpus for PyMasters content models. [link](https://huggingface.co/datasets/tooldev/Annoy-PyEdu-Rs-Raw)

### Discovered (new)

*No items yet.*
