## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-07-26*

### Ready to Build (scored >= 8, validated)

- **sentence-transformers/all-MiniLM-L6-v2** (score: 9, source: huggingface, added: 2026-07-26) — Already the workhorse embedder â€” PyMasters tutorial on fast CPU embeddings; Homie's default local RAG embedding model [link](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Qwen/Qwen3-0.6B** (score: 9, source: huggingface, added: 2026-07-26) — Sub-1B local LLM â€” extend the existing Qwen3-0.6B Explains content; ideal low-RAM fallback model for Homie [link](https://huggingface.co/Qwen/Qwen3-0.6B)
- **hexgrad/Kokoro-TTS** (score: 9, source: huggingface, added: 2026-07-26) — Kokoro is a top local TTS â€” natural upgrade for Homie's voice output/TTS queue plugin; also a good 'local TTS in Python' tutorial [link](https://huggingface.co/spaces/hexgrad/Kokoro-TTS)
- **The new rules of context engineering for Claude 5 generation models** (score: 9, source: hackernews, added: 2026-07-26) — High-value tutorial on context engineering for Claude 5-gen models; principles also apply to Homie's local context/RAG window management [link](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)
- **cross-encoder/ms-marco-MiniLM-L6-v2** (score: 8, source: huggingface, added: 2026-07-26) — Tutorial on two-stage retrieval (embed then rerank); Homie could use it as a lightweight RAG reranker [link](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- **BAAI/bge-small-en-v1.5** (score: 8, source: huggingface, added: 2026-07-26) — Small, fast English embedder â€” good Homie RAG alternative and a benchmark comparison lesson vs MiniLM [link](https://huggingface.co/BAAI/bge-small-en-v1.5)
- **sentence-transformers/all-mpnet-base-v2** (score: 8, source: huggingface, added: 2026-07-26) — Quality-vs-speed embedder comparison lesson; Homie 'high quality' RAG embedding tier on capable machines [link](https://huggingface.co/sentence-transformers/all-mpnet-base-v2)
- **openai/clip-vit-base-patch32** (score: 8, source: huggingface, added: 2026-07-26) — Zero-shot image classification lesson; already powers Homie's CLIP photo search plugin â€” could extend to on-device image tagging workflows [link](https://huggingface.co/openai/clip-vit-base-patch32)
- **timm/mobilenetv3_small_100.lamb_in1k** (score: 8, source: huggingface, added: 2026-07-26) — Edge-AI image classification tutorial; fits Homie's existing MobileNet tagger plugin for fast on-device inference including Android [link](https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k)
- **amazon/chronos-2** (score: 8, source: huggingface, added: 2026-07-26) — Timely tutorial: zero-shot time-series forecasting with Chronos-2 (foundation models beyond text) [link](https://huggingface.co/amazon/chronos-2)
- **BAAI/bge-reranker-v2-m3** (score: 8, source: huggingface, added: 2026-07-26) — Complete-the-RAG-stack lesson (bge-m3 + reranker); Homie could add reranking to improve local RAG answer quality [link](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- **Qwen/Qwen3-8B** (score: 8, source: huggingface, added: 2026-07-26) — Tutorial on running an 8B model locally with quantization; Homie's 'full power' local LLM tier on GPU machines [link](https://huggingface.co/Qwen/Qwen3-8B)
- **intfloat/multilingual-e5-small** (score: 8, source: huggingface, added: 2026-07-26) — Small multilingual embedder comparison lesson; strong candidate for Homie multilingual RAG on modest hardware [link](https://huggingface.co/intfloat/multilingual-e5-small)
- **nanotron/ultrascale-playbook** (score: 8, source: huggingface, added: 2026-07-26) — Excellent source material for an advanced 'how LLMs are trained at scale' lesson series (parallelism, GPU efficiency) [link](https://huggingface.co/spaces/nanotron/ultrascale-playbook)
- **Running a 28.9M parameter LLM on an $8 microcontroller** (score: 8, source: hackernews, added: 2026-07-26) — Great tutorial on extreme LLM quantization/tiny models; reinforces Homie's small-local-model story and edge-device ambitions [link](https://github.com/slvDev/esp32-ai)
- **Claude Opus 5** (score: 8, source: hackernews, added: 2026-07-26) — Timely PyMasters coverage/tutorial on Claude Opus 5 capabilities and API usage; optionally add as a cloud-provider fallback option in Homie [link](https://www.anthropic.com/news/claude-opus-5)

### Prototyping (scored >= 7)

- **google-bert/bert-base-uncased** (score: 7, source: huggingface, added: 2026-07-26) — Classic 'understanding BERT and fill-mask' lesson for the transformers fundamentals track [link](https://huggingface.co/google-bert/bert-base-uncased)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 7, source: huggingface, added: 2026-07-26) — Multilingual embeddings tutorial (ties into PyMasters' 8-language effort); Homie could embed non-English notes locally [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **BAAI/bge-m3** (score: 7, source: huggingface, added: 2026-07-26) — Lesson on hybrid dense+sparse+multi-vector retrieval; strong multilingual RAG embedder option for Homie [link](https://huggingface.co/BAAI/bge-m3)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-07-26) — Lesson on using MTEB to pick the right embedding model â€” directly supports the semantic-search content already published [link](https://huggingface.co/spaces/mteb/leaderboard)
- **Open-weight AI is having its Kubernetes moment** (score: 7, source: hackernews, added: 2026-07-26) — Open-weight ecosystem overview fits a PyMasters lesson and validates Homie's local-LLM positioning for marketing content [link](https://tobi.knaup.me/2026-07-25-open-weight-ai-is-having-its-kubernetes-moment/)
- **Becoming a Research Engineer at a Big LLM Lab** (score: 7, source: hackernews, added: 2026-07-26) — Career-path content: adapt into a PyMasters guide on becoming an ML/research engineer [link](https://www.maxmynter.com/pages/blog/jobhunt)
- **Bringing PyTorch Monarch to AMD GPUs** (score: 7, source: hackernews, added: 2026-07-26) — Tutorial on distributed PyTorch (Monarch) and the AMD GPU ecosystem for advanced learners [link](https://pytorch.org/blog/bringing-pytorch-monarch-to-amd-gpus-single-controller-distributed-training-on-rocm/)

### Evaluating (scored >= 6)

- **google-t5/t5-small** (score: 6, source: huggingface, added: 2026-07-26) — Beginner-friendly seq2seq/translation tutorial with a tiny model that runs anywhere [link](https://huggingface.co/google-t5/t5-small)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-07-26) — Article/lesson on how to read LLM benchmarks and choose a model for your use case [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-07-26) — Diffusion-model tutorial using FLUX.1-dev with the diffusers library [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-07-26) — Fast 4-step image generation tutorial; borderline feasible as an optional Homie image-gen plugin on GPU machines [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)

### Discovered (new)

*No items yet.*
