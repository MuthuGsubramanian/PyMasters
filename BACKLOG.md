## Innovation Backlog

*Auto-maintained by the PyMasters AI Intelligence Pipeline.*
*Last updated: 2026-10-29*

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
- **The Agent SDK** (score: 9, source: hackernews, added: 2026-10-29) — Build a PyMasters course module teaching the Agent SDK for building AI agents in Python; Homie could adopt its agent patterns for its own plugin/agent architecture. [link](https://cursor.com/blog/agent-sdk)
- **Claude Code burns ~15–20% of your tokens on a 3-word status line** (score: 8, source: hackernews, added: 2026-10-29) — Token-efficiency teardown fits a PyMasters tutorial on prompt/context budgeting, and informs Homie's local-LLM context design to avoid wasteful overhead. [link](https://gist.github.com/flamerix-ai/c3905705cc4205e5de3011fa2e74efce)

### Prototyping (scored >= 7)

- **google-bert/bert-base-uncased** (score: 7, source: huggingface, added: 2026-07-26) — Classic 'understanding BERT and fill-mask' lesson for the transformers fundamentals track [link](https://huggingface.co/google-bert/bert-base-uncased)
- **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** (score: 7, source: huggingface, added: 2026-07-26) — Multilingual embeddings tutorial (ties into PyMasters' 8-language effort); Homie could embed non-English notes locally [link](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- **BAAI/bge-m3** (score: 7, source: huggingface, added: 2026-07-26) — Lesson on hybrid dense+sparse+multi-vector retrieval; strong multilingual RAG embedder option for Homie [link](https://huggingface.co/BAAI/bge-m3)
- **mteb/leaderboard** (score: 7, source: huggingface, added: 2026-07-26) — Lesson on using MTEB to pick the right embedding model â€” directly supports the semantic-search content already published [link](https://huggingface.co/spaces/mteb/leaderboard)
- **Open-weight AI is having its Kubernetes moment** (score: 7, source: hackernews, added: 2026-07-26) — Open-weight ecosystem overview fits a PyMasters lesson and validates Homie's local-LLM positioning for marketing content [link](https://tobi.knaup.me/2026-07-25-open-weight-ai-is-having-its-kubernetes-moment/)
- **Becoming a Research Engineer at a Big LLM Lab** (score: 7, source: hackernews, added: 2026-07-26) — Career-path content: adapt into a PyMasters guide on becoming an ML/research engineer [link](https://www.maxmynter.com/pages/blog/jobhunt)
- **Bringing PyTorch Monarch to AMD GPUs** (score: 7, source: hackernews, added: 2026-07-26) — Tutorial on distributed PyTorch (Monarch) and the AMD GPU ecosystem for advanced learners [link](https://pytorch.org/blog/bringing-pytorch-monarch-to-amd-gpus-single-controller-distributed-training-on-rocm/)
- **Gemini 4 Carbon** (score: 7, source: hackernews, added: 2026-10-29) — Write a breakdown of Gemini 4 Carbon's capabilities as a model-comparison tutorial for PyMasters learners. [link](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/)
- **Sleep framework: A new way for LLMs to retain knowledge in continual learning** (score: 7, source: hackernews, added: 2026-10-29) — Turn the Sleep framework into a PyMasters lesson on continual learning, and evaluate it as a memory/retention mechanism for Homie's local assistant. [link](https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/)
- **Here be monsters: What do you still need to know when agents do the work?** (score: 7, source: hackernews, added: 2026-10-29) — Adapt into a PyMasters lesson on agent oversight/verification skills needed when agents do autonomous work. [link](https://blog.adrq.dev/here-be-monsters-what-do-you-still-need-to-know-when-agents-do-the-work)

### Evaluating (scored >= 6)

- **google-t5/t5-small** (score: 6, source: huggingface, added: 2026-07-26) — Beginner-friendly seq2seq/translation tutorial with a tiny model that runs anywhere [link](https://huggingface.co/google-t5/t5-small)
- **open-llm-leaderboard/open_llm_leaderboard** (score: 6, source: huggingface, added: 2026-07-26) — Article/lesson on how to read LLM benchmarks and choose a model for your use case [link](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- **black-forest-labs/FLUX.1-dev** (score: 6, source: huggingface, added: 2026-07-26) — Diffusion-model tutorial using FLUX.1-dev with the diffusers library [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-dev)
- **black-forest-labs/FLUX.1-schnell** (score: 6, source: huggingface, added: 2026-07-26) — Fast 4-step image generation tutorial; borderline feasible as an optional Homie image-gen plugin on GPU machines [link](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
- **Dayjob: Tax – evaluating AI agents on 50 professional tax assignments** (score: 6, source: hackernews, added: 2026-10-29) — Use the tax-agent benchmark methodology as a case study for a PyMasters lesson on evaluating AI agents on real-world tasks. [link](https://surgehq.ai/blog/dayjob-tax)
- **Decompiling Games with AI: Virtueel Zoetermeer** (score: 6, source: hackernews, added: 2026-10-29) — Could become an advanced PyMasters tutorial on using AI for reverse engineering/decompilation workflows. [link](https://bou.ke/blog/zoetermeer/)
- **Early progress on accelerating drug development with Claude** (score: 6, source: hackernews, added: 2026-10-29) — Feature as a real-world AI-impact case study in a PyMasters lesson on applied ML in science/healthcare. [link](https://www.anthropic.com/research/early-progress-drug-development)
- **Wikipedia's Cleanup of AI-Generated Content** (score: 6, source: hackernews, added: 2026-10-29) — Use Wikipedia's AI-content cleanup as a cautionary case study for a PyMasters lesson on content quality and AI-detection. [link](https://spectrum.ieee.org/wikipedia-wikiproject-ai-writing-cleanup)

### Discovered (new)

*No items yet.*
