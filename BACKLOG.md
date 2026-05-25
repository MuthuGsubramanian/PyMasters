## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-05-25*

### Ready to Build (scored >= 8, validated)

- **Qwen/Qwen3-0.6B** (score: 10, source: huggingface, added: 2026-05-25) — Perfect tiny local LLM for Homie's on-device chat; tutorial on running Qwen3 locally with quantization [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-TTS** (score: 10, source: huggingface, added: 2026-05-25) — Tutorial on Kokoro TTS; Homie should ship Kokoro as the local voice plugin for offline speech [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-05-25) — Tutorial on building semantic search with MiniLM; ideal lightweight embedding backbone for Homie's local RAG [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 9, source: huggingface, added: 2026-05-25) — BGE small is perfect lightweight embedding for Homie's local RAG; tutorial on BGE vs MiniLM tradeoffs [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 9, source: huggingface, added: 2026-05-25) — Higher-quality embedding alternative tutorial; Homie users with more RAM could opt for mpnet over MiniLM [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **nomic-ai/nomic-embed-text-v1.5** (score: 9, source: huggingface, added: 2026-05-25) — Tutorial on Matryoshka embeddings; Homie could use Nomic for efficient adjustable-dimension local RAG [link](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- **google-bert/bert-base-uncased** (score: 8, source: huggingface, added: 2026-05-25) — Foundational NLP tutorial on BERT for fill-mask and transfer learning [link](https://huggingface.co/google-bert/bert-base-uncased)
- **Qwen/Qwen3-VL-2B-Instruct** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on multimodal vision-language models; Homie could use 2B VLM for local image understanding plugin [link](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on reranking for RAG; Homie could add cross-encoder reranking stage to improve retrieval quality [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on multilingual semantic search; Homie could offer multilingual RAG for non-English users [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **openai/clip-vit-large-patch14** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on CLIP for image search; Homie could enable local image-text retrieval over user's photo library [link](https://huggingface.co/openai/clip-vit-large-patch14)
- **BAAI/bge-m3** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on multilingual long-context embeddings; Homie could use BGE-M3 for high-quality multilingual RAG [link](https://huggingface.co/BAAI/bge-m3)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-05-25) — Lightweight CLIP variant ideal for tutorial and for Homie's on-device image search plugin [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **laion/clap-htsat-fused** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on audio embeddings; Homie could add audio search/classification plugin for voice memos [link](https://huggingface.co/laion/clap-htsat-fused)
- **colbert-ir/colbertv2.0** (score: 8, source: huggingface, added: 2026-05-25) — Tutorial on late-interaction retrieval; Homie could integrate ColBERT for higher-fidelity local retrieval [link](https://huggingface.co/colbert-ir/colbertv2.0)
- **mteb/leaderboard** (score: 8, source: huggingface, added: 2026-05-25) — Reference guide on using MTEB to select the best embedding model for RAG (Homie and tutorials) [link](https://huggingface.co/spaces/mteb/leaderboard)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-05-25) — Strong tutorial source on distributed/large-scale training fundamentals [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)

### Prototyping (scored >= 7)

- **FacebookAI/roberta-base** (score: 7, source: huggingface, added: 2026-05-25) — Tutorial on RoBERTa base for fine-tuning downstream NLP tasks [link](https://huggingface.co/FacebookAI/roberta-base)
- **openai-community/gpt2** (score: 7, source: huggingface, added: 2026-05-25) — Educational tutorial on GPT2 architecture and text generation fundamentals [link](https://huggingface.co/openai-community/gpt2)
- **amazon/chronos-2** (score: 7, source: huggingface, added: 2026-05-25) — Tutorial on zero-shot time-series forecasting with Chronos [link](https://huggingface.co/amazon/chronos-2)

### Evaluating (scored >= 6)

- **google/electra-base-discriminator** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial comparing ELECTRA's discriminative pretraining vs BERT [link](https://huggingface.co/google/electra-base-discriminator)
- **FacebookAI/xlm-roberta-base** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial on multilingual masked LM as base for multilingual tasks [link](https://huggingface.co/FacebookAI/xlm-roberta-base)
- **FacebookAI/roberta-large** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial on RoBERTa fine-tuning for classification tasks [link](https://huggingface.co/FacebookAI/roberta-large)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-05-25) — Reference article on how to read the Open LLM Leaderboard when picking a model [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial on FLUX.1 image generation API and diffusion fundamentals [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial on fast distilled diffusion model FLUX.1-schnell [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
- **lmarena-ai/arena-leaderboard** (score: 6, source: huggingface, added: 2026-05-25) — Reference article on LMArena methodology for model selection [link](https://huggingface.co/spaces/lmarena-ai/arena-leaderboard)
- **akhaliq/anycoder** (score: 6, source: huggingface, added: 2026-05-25) — Tutorial on AI-assisted code generation patterns [link](https://huggingface.co/spaces/akhaliq/anycoder)
- **mingye-eigenai/Annoy-PyEdu-Rs-Raw** (score: 6, source: huggingface, added: 2026-05-25) — Python educational dataset could inspire tutorial corpus or model fine-tuning examples [link](https://huggingface.co/datasets/mingye-eigenai/Annoy-PyEdu-Rs-Raw)

### Discovered (new)

*No items yet.*
