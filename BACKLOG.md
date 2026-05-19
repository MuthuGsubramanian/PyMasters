## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-19*

### Ready to Build (scored >= 8, validated)

- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-19) — Tutorial on tiny local LLMs; Homie can ship this as default lightweight model for low-spec devices [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-05-19) — Tutorial on lightweight embeddings for RAG; Homie can use this as its default local embedding model [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-19) — Tutorial on BGE embeddings for RAG; Homie can offer this as a higher-quality local embedding option [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-05-19) — Tutorial comparing MPNet vs MiniLM embeddings; Homie alternative embedding backend [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **BAAI/bge-m3** (score: 9, source: huggingface, added: 2026-05-19) — Tutorial on BGE-M3 multi-vector embeddings; Homie plugin for advanced multilingual RAG [link](https://huggingface.co/BAAI/bge-m3)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-19) — Tutorial on Nomic embeddings with long context; Homie plugin for embedding long local docs [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **mteb/leaderboard** (score: 9, source: huggingface, added: 2026-05-19) — Reference guide for picking embedding models; Homie can use MTEB scores to select default embeddings [link](https://huggingface.co/spaces/mteb/leaderboard)
- **Qwen/Qwen3-VL-2B-Instruct** (score: 8, source: huggingface, added: 2026-05-19) — Tutorial on small vision-language models; Homie could integrate for local screenshot/image understanding [link](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-05-19) — Foundational tutorial on BERT and transformer fundamentals [link](https://huggingface.co/google-bert/bert-base-uncased)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-05-19) — Tutorial on reranking in RAG pipelines; Homie can use this to rerank local search results [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-19) — Tutorial on multilingual embeddings; Homie plugin for multilingual document search [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-19) — Tutorial on late-interaction retrieval with ColBERT; Homie advanced retrieval plugin [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **distilbert/distilbert-base-uncased** (score: 8, source: huggingface, added: 2026-05-19) — Tutorial on DistilBERT for fast inference and model distillation concepts [link](https://huggingface.co/distilbert/distilbert-base-uncased)

### Prototyping (scored >= 7)

- **openai/clip-vit-large-patch14** (score: 7, source: huggingface, added: 2026-05-19) — Tutorial on CLIP for image search; Homie plugin for local image library semantic search [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **openai/clip-vit-base-patch32** (score: 7, source: huggingface, added: 2026-05-19) — Tutorial on smaller CLIP for resource-constrained image tasks; Homie image search plugin [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **laion/clap-htsat-fused** (score: 7, source: huggingface, added: 2026-05-19) — Tutorial on audio embeddings with CLAP; Homie plugin for local audio classification or voice search [link](https://huggingface.co/laion/clap-htsat-fused)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-05-19) — Tutorial on GPT-2 as an intro to autoregressive language models [link](https://huggingface.co/openai-community/gpt2)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 7, source: huggingface, added: 2026-05-19) — Reference resource for choosing local LLMs to power Homie; useful comparison article [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **lmarena-ai/arena-leaderboard** (score: 7, source: huggingface, added: 2026-05-19) — Reference for picking chat models; helps choose default Homie LLM and inform comparison articles [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)
- **nanotron/ultrascale-playbook** (score: 7, source: huggingface, added: 2026-05-19) — Reference for advanced tutorials on distributed training and scaling LLMs [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)
- **HuggingFaceTB/smol-training-playbook** (score: 7, source: huggingface, added: 2026-05-19) — Reference resource for tutorials on training small LMs from scratch [link](https://huggingface.co/spaces/HuggingFaceTB/smol-training-playbook)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-05-19) — Tutorial comparing ELECTRA pretraining to BERT/MLM approaches [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-05-19) — Tutorial on multilingual masked language models for NLP fundamentals [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-05-19) — Tutorial on RoBERTa for fine-tuning classification tasks [link](https://huggingface.co/FacebookAI/roberta-large)
- **FacebookAI/roberta-base** (score: 6, source: huggingface, added: 2026-05-19) — Tutorial on RoBERTa-base fine-tuning workflows [link](https://huggingface.co/FacebookAI/roberta-base)

### Discovered (new)

*No items yet.*
