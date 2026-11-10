"""HuggingFace Publisher — create, repair, and enhance Spaces and dataset cards from pipeline discoveries."""

import base64
import json
import os
import tempfile
import urllib.error
import urllib.request
from datetime import datetime
try:
    from huggingface_hub import CommitOperationAdd, HfApi, create_repo, upload_file
except ModuleNotFoundError:
    CommitOperationAdd = HfApi = create_repo = upload_file = None
from pipeline.utils.logger import get_logger

log = get_logger("actor.hf_publisher")

HF_NAMESPACE = "Muthu88"
PYMASTERS_URL = "https://pymasters.net"
HOMIE_URL = "https://heyhomie.app"
GRADIO_SDK_VERSION = "5.23.1"
PYTHON_VERSION = "3.11"

MOJIBAKE_MAP = {
    "â€”": "—",
    "â€“": "–",
    "â€™": "'",
    "â€œ": '"',
    "â€\x9d": '"',
}


def clean_text(text: str) -> str:
    """Fix common UTF-8/Latin-1 mojibake sequences and normalize whitespace."""
    out = str(text or "")
    for bad, good in MOJIBAKE_MAP.items():
        out = out.replace(bad, good)
    return out.strip()


def _build_readme(
    title: str,
    description: str,
    extra_content: str = "",
    emoji: str = "\U0001f680",
    color_from: str = "indigo",
    color_to: str = "purple",
    tags: list[str] | None = None,
) -> str:
    """Build a Hugging Face Space README.md with Python 3.11 + Gradio 5 SDK metadata and branding links."""
    title_clean = clean_text(title)
    desc_clean = clean_text(description)
    tag_lines = ""
    if tags:
        tag_items = "\n".join(f"  - {t}" for t in tags)
        tag_lines = f"tags:\n{tag_items}\n"
    return f"""---
title: "{title_clean.replace('"', "'")}"
emoji: "{emoji}"
colorFrom: {color_from}
colorTo: {color_to}
sdk: gradio
sdk_version: "{GRADIO_SDK_VERSION}"
python_version: "{PYTHON_VERSION}"
app_file: app.py
pinned: false
{tag_lines}---

<p align="center"><img src="logo.svg" alt="PyMasters" width="260" /></p>

# {title_clean}

{desc_clean}

{clean_text(extra_content)}

---

**Built by [PyMasters]({PYMASTERS_URL})** | Try [Homie — Local AI Assistant]({HOMIE_URL})

*Updated by the PyMasters AI Intelligence Pipeline on {datetime.now().strftime("%Y-%m-%d")}*
"""


def build_interactive_space_code(
    title: str,
    description: str,
    opportunity: str,
    source_url: str,
    score: int = 9,
    slug: str = "",
) -> str:
    """Generate a rich, interactive Gradio application tailored to the Space's AI domain."""
    title_c = clean_text(title).replace('"""', "'''")
    desc_c = clean_text(description).replace('"""', "'''")
    opp_c = clean_text(opportunity).replace('"""', "'''")
    url_c = clean_text(source_url)
    key = (slug or title_c).lower()

    if "memory" in key or "forgetting" in key:
        mode = "memory"
    elif "minilm" in key or "bge-" in key or "sentence-transformers" in key:
        mode = "embeddings"
    elif "kokoro" in key or "tts" in key:
        mode = "tts"
    elif "qwen" in key or "survival-llm" in key or "llm" in key:
        mode = "llm"
    else:
        mode = "agent"

    return f'''"""Interactive PyMasters AI Discovery & Playground Space."""

import json
import math
import re
import gradio as gr

TITLE = """{title_c}"""
DESCRIPTION = """{desc_c}"""
OPPORTUNITY = """{opp_c}"""
SOURCE_URL = "{url_c}"
SCORE = {int(score)}
MODE = "{mode}"


def overview_markdown() -> str:
    return f"""### Executive Summary
- **Discovery:** {{TITLE}}
- **PyMasters Relevance Score:** `{{SCORE}}/10`
- **Technical Summary:** {{DESCRIPTION}}
- **Engineering Opportunity:** {{OPPORTUNITY}}
- **Primary Reference:** [Open Source / Paper Link]({{SOURCE_URL}})
"""


def run_interactive_tool(primary_input: str, secondary_input: str, param_a: float, param_b: int) -> tuple[str, str]:
    text_a = (primary_input or "").strip()
    text_b = (secondary_input or "").strip()

    if MODE == "memory":
        turns = [line.strip() for line in text_a.splitlines() if line.strip()] or [
            "Turn 1: User prefers dark mode and concise Python 3.11 type-annotated examples.",
            "Turn 2: Asked about temporary weather in Chennai.",
            "Turn 3: Building an offline RAG pipeline with SQLite + BGE-small embeddings.",
            "Turn 4: Fixed a typo in variable name foo_bar.",
            "Turn 5: Critical constraint: all inference must stay under 4 GB VRAM on laptop GPU.",
        ]
        decay = max(0.01, min(0.95, float(param_a)))
        budget = max(1, int(param_b))
        scored = []
        n = len(turns)
        for idx, t in enumerate(turns):
            recency = math.exp(-decay * (n - 1 - idx))
            salience = 1.35 if any(k in t.lower() for k in ("prefer", "constraint", "must", "pipeline", "architecture")) else 0.75
            retention = round(min(1.0, recency * salience), 3)
            scored.append((retention, idx + 1, t))
        kept = sorted(scored, key=lambda x: -x[0])[:budget]
        kept_ids = {{idx for _, idx, _ in kept}}
        rows = ["| Turn | Memory Entry | Retention Score | Action |", "|---|---|---|---|"]
        for ret, idx, t in sorted(scored, key=lambda x: x[1]):
            status = "KEEP (Active Working Memory)" if idx in kept_ids else "FORGET / ARCHIVE"
            rows.append(f"| {{idx}} | {{t}} | `{{ret:.3f}}` | **{{status}}** |")
        code = (
            "def score_memory(age_turns: int, salience: float, decay: float = "
            + f"{{decay:.2f}}"
            + ") -> float:\\n"
            "    import math\\n"
            "    return min(1.0, math.exp(-decay * age_turns) * salience)\\n"
        )
        return "\\n".join(rows), code

    if MODE == "embeddings":
        query = text_a or "How do I run local RAG with low memory in Python?"
        docs = [line.strip() for line in text_b.splitlines() if line.strip()] or [
            "SentenceTransformers all-MiniLM-L6-v2 maps sentences to a 384-dimensional dense vector space for semantic search.",
            "BGE-small-en-v1.5 achieves top MTEB retrieval accuracy with a compact 33M parameter footprint.",
            "Kokoro-82M is a lightweight 82M parameter open-weight text-to-speech model.",
            "SQLite-vec and FAISS enable sub-millisecond cosine similarity search on CPU.",
        ]
        q_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))
        ranked = []
        for doc in docs:
            d_tokens = set(re.findall(r"[a-z0-9]+", doc.lower()))
            overlap = len(q_tokens & d_tokens)
            denom = math.sqrt(max(1, len(q_tokens)) * max(1, len(d_tokens)))
            sim = round(min(0.99, 0.25 + (overlap / denom) * float(param_a)), 4)
            ranked.append((sim, doc))
        ranked.sort(reverse=True)
        top_k = max(1, min(len(ranked), int(param_b)))
        rows = [f"### Top-{{top_k}} Retrieved Passages for: *{{query}}*", "", "| Rank | Cosine Similarity | Passage |", "|---|---|---|"]
        for i, (sim, doc) in enumerate(ranked[:top_k], 1):
            rows.append(f"| {{i}} | `{{sim:.4f}}` | {{doc}} |")
        model_id = TITLE if "/" in TITLE else "BAAI/bge-small-en-v1.5"
        code = (
            f"from sentence_transformers import SentenceTransformer, util\\n\\n"
            f"model = SentenceTransformer('{{model_id}}')\\n"
            f"q_emb = model.encode({{query!r}}, normalize_embeddings=True)\\n"
            f"d_embs = model.encode({{docs!r}}, normalize_embeddings=True)\\n"
            f"scores = util.cos_sim(q_emb, d_embs)[0].tolist()\\n"
        )
        return "\\n".join(rows), code

    if MODE == "tts":
        script = text_a or "Welcome to PyMasters! Today we are building a local voice assistant powered by Kokoro TTS."
        voice = text_b or "af_heart"
        speed = max(0.5, min(2.0, float(param_a)))
        words = re.findall(r"\\S+", script)
        chunks = [" ".join(words[i:i + int(param_b)]) for i in range(0, len(words), max(5, int(param_b)))]
        est_sec = round((len(words) / 2.6) / speed, 1)
        summary = [
            f"### Kokoro-82M Synthesis Plan (`voice={{voice}}`, `speed={{speed:.2f}}x`)",
            f"- **Word Count:** `{{len(words)}}` words (~`{{est_sec}}s` audio at 24 kHz)",
            f"- **Streaming Segments (`{{len(chunks)}}`):**",
        ] + [f"  {{i}}. `{{c}}`" for i, c in enumerate(chunks, 1)]
        code = (
            "from kokoro import KPipeline\\n"
            "import soundfile as sf\\n\\n"
            "pipeline = KPipeline(lang_code='a')\\n"
            f"generator = pipeline({{script!r}}, voice={{voice!r}}, speed={{speed:.2f}})\\n"
            "for idx, (_, _, audio) in enumerate(generator):\\n"
            "    sf.write(f'segment_{{idx}}.wav', audio, 24000)\\n"
        )
        return "\\n".join(summary), code

    if MODE == "llm":
        prompt = text_a or "Explain how 4-bit GGUF quantization fits a 0.6B model into 500 MB of RAM."
        sys_prompt = text_b or "You are Homie, a fast, privacy-first local AI assistant."
        bll = max(2.0, min(16.0, float(param_a)))
        ctx = max(512, int(param_b))
        params_b = 0.6
        weights_mb = round(params_b * 1000 * (bll / 8.0) * 1.08, 1)
        kv_mb = round((ctx / 1024.0) * 28.0 * (bll / 8.0), 1)
        total_mb = round(weights_mb + kv_mb + 120.0, 1)
        report = f"""### Local Inference Memory & ChatML Planner
| Metric | Value |
|---|---|
| **Quantization Bits/Weight** | `{{bll:.1f}} bpw` |
| **Context Window** | `{{ctx}} tokens` |
| **Model Weights Footprint** | `{{weights_mb}} MB` |
| **KV Cache Footprint** | `{{kv_mb}} MB` |
| **Total Estimated RAM/VRAM** | **`{{total_mb}} MB`** |
"""
        chatml = (
            f"<|im_start|>system\\n{{sys_prompt}}<|im_end|>\\n"
            f"<|im_start|>user\\n{{prompt}}<|im_end|>\\n"
            f"<|im_start|>assistant\\n"
        )
        return report, chatml

    goal = text_a or "Analyze repository test failures, isolate the root cause, and propose a minimal patch."
    tools_raw = text_b or "search_code, run_pytest, apply_patch"
    tools = [t.strip() for t in tools_raw.split(",") if t.strip()]
    max_steps = max(1, int(param_b))
    trace = [f"### Plan-Act-Observe Execution Trace (Confidence Gate: `{{param_a:.2f}}`, Max Steps: `{{max_steps}}`)"]
    for step in range(1, min(max_steps, len(tools)) + 1):
        tool = tools[(step - 1) % len(tools)]
        trace.append(f"- **Step {{step}} — PLAN:** Select `{{tool}}` for sub-goal {{step}} of *{{goal[:60]}}*.")
        trace.append(f"  - **ACT:** `{{tool}}(target='workspace', step={{step}})`")
        trace.append(f"  - **OBSERVE:** Structured JSON returned; confidence `{{min(0.99, param_a + 0.05 * step):.2f}}` >= threshold.")
    schema = {{
        "agent": TITLE,
        "goal": goal,
        "max_steps": max_steps,
        "tools": [{{"name": t, "type": "function"}} for t in tools],
    }}
    return "\\n".join(trace), json.dumps(schema, indent=2)


with gr.Blocks(title=TITLE) as demo:
    gr.Markdown(f"# {{TITLE}}")
    gr.Markdown("*Interactive AI Discovery & Engineering Sandbox — Powered by [PyMasters](https://pymasters.net) & [Homie](https://heyhomie.app)*")

    with gr.Tabs():
        with gr.Tab("Interactive Sandbox"):
            with gr.Row():
                with gr.Column(scale=1):
                    inp1 = gr.Textbox(
                        label="Primary Input (Prompt / Query / Conversation Turns / Goal)",
                        lines=5,
                        placeholder="Enter a prompt, search query, or multi-line input...",
                    )
                    inp2 = gr.Textbox(
                        label="Secondary Input (Passages / Voice ID / System Prompt / Tools)",
                        lines=4,
                        placeholder="Optional passages (one per line), voice preset (af_heart), or comma-separated tool names...",
                    )
                    with gr.Row():
                        slider_a = gr.Slider(0.1, 8.0, value=1.2, step=0.1, label="Parameter A (Decay / Scale / Speed / Bits)")
                        slider_b = gr.Slider(1, 4096, value=4, step=1, label="Parameter B (Top-K / Budget / Chunk / Context)")
                    run_btn = gr.Button("Run Interactive Simulation", variant="primary")
                with gr.Column(scale=1):
                    out_md = gr.Markdown(label="Simulation & Analysis Output")
                    out_code = gr.Code(label="Ready-to-Run Python Snippet / Config", language="python")

            run_btn.click(
                fn=run_interactive_tool,
                inputs=[inp1, inp2, slider_a, slider_b],
                outputs=[out_md, out_code],
            )
            demo.load(
                fn=run_interactive_tool,
                inputs=[inp1, inp2, slider_a, slider_b],
                outputs=[out_md, out_code],
            )

        with gr.Tab("Discovery Brief & Architecture"):
            gr.Markdown(value=overview_markdown())

    gr.Markdown(
        "---\\n"
        "**Built by [PyMasters](https://pymasters.net)** — Hands-on Python & AI Engineering Tutorials | "
        "Try **[Homie](https://heyhomie.app)** — Your Privacy-First Local AI Assistant"
    )

if __name__ == "__main__":
    demo.launch()
'''


DEFAULT_SPACE_REQUIREMENTS = "gradio>=5.0.0\naudioop-lts; python_version>='3.13'\n"


def publish_space(
    title: str,
    description: str,
    code: str,
    token: str | None = None,
    repo_id: str | None = None,
    *,
    requirements: str | None = None,
    extra_content: str = "",
    emoji: str = "\U0001f680",
    color_from: str = "indigo",
    color_to: str = "purple",
    tags: list[str] | None = None,
    commit_message: str | None = None,
) -> dict:
    """Create or update a Gradio-based HuggingFace Space (README.md + app.py + requirements.txt in one commit)."""
    if not repo_id:
        if "/" in title and title.startswith(f"{HF_NAMESPACE}/"):
            repo_id = title
            title = title.split("/", 1)[-1]
        else:
            slug = title.lower().replace(" ", "-")
            slug = "".join(c for c in slug if c.isalnum() or c == "-")[:60]
            repo_id = f"{HF_NAMESPACE}/{slug}"

    log.info(f"Publishing HF Space: {repo_id}")

    try:
        readme_content = _build_readme(
            title, description, extra_content=extra_content, emoji=emoji,
            color_from=color_from, color_to=color_to, tags=tags,
        )
        # Default includes audioop-lts so Python 3.13 runtimes never fail with ModuleNotFoundError: No module named 'pyaudioop'
        requirements = requirements or DEFAULT_SPACE_REQUIREMENTS
        commit_message = commit_message or f"Fix Python 3.13 Gradio runtime and upgrade {repo_id} to interactive sandbox"

        if HfApi is not None and CommitOperationAdd is not None:
            api = HfApi(token=token)
            create_repo(
                repo_id=repo_id,
                repo_type="space",
                space_sdk="gradio",
                exist_ok=True,
                token=token,
            )
            api.create_commit(
                repo_id=repo_id,
                repo_type="space",
                operations=[
                    CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme_content.encode("utf-8")),
                    CommitOperationAdd(path_in_repo="app.py", path_or_fileobj=code.encode("utf-8")),
                    CommitOperationAdd(path_in_repo="requirements.txt", path_or_fileobj=requirements.encode("utf-8")),
                ],
                commit_message=commit_message,
            )
        else:
            tok = token or os.environ.get("HF_TOKEN") or ""
            if not tok and os.path.isfile(os.path.expanduser("~/.cache/huggingface/token")):
                with open(os.path.expanduser("~/.cache/huggingface/token"), encoding="utf-8") as f:
                    tok = f.read().strip()
            lines = [
                json.dumps({"key": "header", "value": {"summary": commit_message}}),
                json.dumps({"key": "file", "value": {"content": base64.b64encode(readme_content.encode("utf-8")).decode("ascii"), "path": "README.md", "encoding": "base64"}}),
                json.dumps({"key": "file", "value": {"content": base64.b64encode(code.encode("utf-8")).decode("ascii"), "path": "app.py", "encoding": "base64"}}),
                json.dumps({"key": "file", "value": {"content": base64.b64encode(requirements.encode("utf-8")).decode("ascii"), "path": "requirements.txt", "encoding": "base64"}}),
            ]
            body = ("\n".join(lines) + "\n").encode("utf-8")
            req = urllib.request.Request(
                f"https://huggingface.co/api/spaces/{repo_id}/commit/main",
                data=body,
                headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/x-ndjson"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                json.loads(r.read())

        url = f"https://huggingface.co/spaces/{repo_id}"
        log.info(f"Space published: {url}")
        return {"repo_id": repo_id, "url": url, "status": "published"}

    except Exception as e:
        log.error(f"Failed to publish Space '{repo_id}': {e}")
        return {"repo_id": repo_id, "url": "", "status": f"failed: {e}"}


def publish_dataset_card(name: str, description: str, data_url: str, token: str | None = None) -> dict:
    """Create a dataset repository with a card linking back to pymasters.net."""
    slug = name.lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")[:60]
    repo_id = f"{HF_NAMESPACE}/{slug}"

    log.info(f"Publishing dataset card: {repo_id}")

    try:
        api = HfApi(token=token)

        create_repo(
            repo_id=repo_id,
            repo_type="dataset",
            exist_ok=True,
            token=token,
        )

        card_content = f"""---
dataset_info:
  name: {clean_text(name)}
  description: {clean_text(description)}
license: mit
---

# {clean_text(name)}

{clean_text(description)}

## Data Source

The data for this dataset is available at: [{data_url}]({data_url})

## About

This dataset was curated as part of the [PyMasters]({PYMASTERS_URL}) AI intelligence pipeline.
PyMasters provides tutorials, courses, and learning paths for Python developers working with AI/ML.

Check out [Homie]({HOMIE_URL}) — a cross-platform local AI assistant that runs on your device.

---

*Auto-generated by the PyMasters AI Intelligence Pipeline on {datetime.now().strftime("%Y-%m-%d")}*
"""

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write(card_content)
            card_path = f.name

        try:
            api.upload_file(
                path_or_fileobj=card_path,
                path_in_repo="README.md",
                repo_id=repo_id,
                repo_type="dataset",
            )
        finally:
            os.unlink(card_path)

        url = f"https://huggingface.co/datasets/{repo_id}"
        log.info(f"Dataset card published: {url}")
        return {"repo_id": repo_id, "url": url, "status": "published"}

    except Exception as e:
        log.error(f"Failed to publish dataset card '{repo_id}': {e}")
        return {"repo_id": repo_id, "url": "", "status": f"failed: {e}"}


def maybe_publish_space_for_item(item: dict, token: str | None = None) -> dict | None:
    """Generate an interactive Gradio demo Space for a high-scoring pipeline item."""
    title = clean_text(item.get("title", "AI Discovery"))
    description = clean_text(item.get("description", ""))[:300]
    opportunity = clean_text(item.get("opportunity", ""))
    source_url = item.get("url", "")
    score = item.get("relevance_score", 9)

    space_title = f"pymasters-{title[:40]}".replace(" ", "-").lower()
    space_title = "".join(c for c in space_title if c.isalnum() or c == "-")

    code = build_interactive_space_code(
        title=title,
        description=description,
        opportunity=opportunity,
        source_url=source_url,
        score=score,
        slug=space_title,
    )
    return publish_space(space_title, f"AI Discovery: {title}", code, token=token)


# ---------------------------------------------------------------------------------------------------------------------
# Consolidated Muthu88 Spaces: the original 8 single-purpose Spaces are merged pairwise into 4 rich multi-tab labs, plus
# the PyMasters AI Lesson Studio. Every app is generated from a raw-string template below (no f-string brace escaping);
# per-Space metadata is injected as a JSON literal so any title/description text is always valid Python.
# ---------------------------------------------------------------------------------------------------------------------

_SPACE_REQUIREMENTS_BASE = f"gradio=={GRADIO_SDK_VERSION}\naudioop-lts; python_version>='3.13'\n"

KNOWN_MUTHU88_SPACES = [
    {
        "repo_id": "Muthu88/pymasters-sentence-transformersall-minilm-l6-v2",
        "mode": "embeddings",
        "title": "PyMasters Embeddings & Local RAG Lab: MiniLM-L6-v2 + BGE-Small-en-v1.5",
        "tagline": "Compare two 384-d embedders side by side, then build a hybrid FAISS / SQLite-vec + cross-encoder retrieval pipeline.",
        "description": "Dual-embedder semantic search and RAG comparison lab: sentence-transformers/all-MiniLM-L6-v2 vs BAAI/bge-small-en-v1.5, chunking strategies, cosine similarity matrices, vector stores and hybrid BM25 + cross-encoder reranking.",
        "opportunity": "Canonical local-RAG backbone for PyMasters semantic-search tutorials and Homie's offline RAG plugin: pick the embedder, chunker, store and reranker with measured numbers instead of guesses.",
        "score": 9,
        "emoji": "\U0001f9ed",
        "color_from": "indigo",
        "color_to": "blue",
        "tags": ["sentence-transformers", "rag", "embeddings", "faiss", "sqlite-vec", "reranking", "pymasters"],
        "merged_spaces": ["Muthu88/pymasters-baaibge-small-en-v15"],
        "sources": [
            {"title": "sentence-transformers/all-MiniLM-L6-v2", "url": "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
             "description": "6-layer, 384-d BERT-style encoder with mean pooling; the fast default for semantic search."},
            {"title": "BAAI/bge-small-en-v1.5", "url": "https://huggingface.co/BAAI/bge-small-en-v1.5",
             "description": "12-layer, 384-d retrieval-tuned encoder with CLS pooling and an optional query instruction."},
            {"title": "cross-encoder/ms-marco-MiniLM-L-6-v2", "url": "https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-6-v2",
             "description": "Cross-encoder reranker that scores (query, passage) pairs jointly."},
        ],
        "architecture": """
documents -> chunker (fixed words | sentence pack | paragraph)
          -> bi-encoder (MiniLM-L6-v2 | BGE-small-en-v1.5) -> 384-d unit vectors
          -> vector store (FAISS Flat / HNSW | SQLite-vec vec0)   +   BM25 keyword index
query     -> same bi-encoder -> top-k ANN  ⨁  BM25 top-k -> fusion (weighted | RRF)
          -> cross-encoder rerank (top-n pairs) -> context window for the LLM
""",
        "curriculum": [
            ["ai_engineering", "Embeddings, cosine similarity and vector search", "Tab 1"],
            ["ai_engineering", "Chunking strategies and RAG retrieval quality", "Tab 1"],
            ["ai_agents", "Hybrid retrieval and reranking for agent memory", "Tab 2"],
            ["dsa", "BM25, top-k selection and approximate nearest neighbours", "Tab 2"],
        ],
        "requirements": _SPACE_REQUIREMENTS_BASE
        + "--extra-index-url https://download.pytorch.org/whl/cpu\ntorch\nsentence-transformers>=3.0.0\n",
    },
    {
        "repo_id": "Muthu88/pymasters-hexgradkokoro-tts",
        "mode": "tts",
        "title": "PyMasters Kokoro-82M Local Voice Synthesis & TTS Architecture Studio",
        "tagline": "Plan Kokoro-82M synthesis and streaming, size the model for your hardware, and wire it into a local voice assistant.",
        "description": "Kokoro-82M synthesis planner and streaming chunker (af_heart, am_michael, bf_emma, bm_george), StyleTTS2/ISTFTNet architecture explorer, VRAM/CPU footprint calculator and the Homie local voice assistant pipeline.",
        "opportunity": "Offline voice output for Homie and a build-a-talking-assistant PyMasters tutorial: segment text for low time-to-first-audio and budget every stage of the speech loop.",
        "score": 10,
        "emoji": "\U0001f399️",
        "color_from": "pink",
        "color_to": "purple",
        "tags": ["kokoro", "tts", "styletts2", "text-to-speech", "voice-assistant", "pymasters"],
        "merged_spaces": ["Muthu88/pymasters-hexgradkokoro-82m"],
        "sources": [
            {"title": "hexgrad/Kokoro-82M", "url": "https://huggingface.co/hexgrad/Kokoro-82M",
             "description": "82M-parameter open-weight TTS model (StyleTTS2-style predictor + ISTFTNet decoder), 24 kHz output."},
            {"title": "hexgrad/Kokoro-TTS", "url": "https://huggingface.co/spaces/hexgrad/Kokoro-TTS",
             "description": "Reference demo Space for the kokoro KPipeline API."},
        ],
        "architecture": """
text -> G2P (misaki) phonemes -> PL-BERT (ALBERT, 12 shared layers, 768-d) contextual phoneme features
     -> prosody predictor (duration, pitch F0, energy) conditioned on a 256-d voice pack (style)
     -> ISTFTNet decoder: upsample 10 x 6, iSTFT hop 5  => 300 samples/frame at 24 kHz (80 frames/s)
     -> PCM audio chunks streamed per text segment
""",
        "curriculum": [
            ["ai_engineering", "Local TTS with kokoro.KPipeline and streaming playback", "Tab 1"],
            ["deep_learning", "StyleTTS2, vocoders and iSTFT decoders", "Tab 2"],
            ["ai_agents", "Voice assistant loop: VAD -> STT -> LLM -> TTS", "Tab 2"],
            ["python_intermediate", "Generators for streaming audio chunks", "Tab 1"],
        ],
        "requirements": _SPACE_REQUIREMENTS_BASE,
    },
    {
        "repo_id": "Muthu88/pymasters-qwenqwen3-06b",
        "mode": "llm",
        "title": "PyMasters Edge & Survival LLM Lab: Qwen3-0.6B + Offline Emergency AI",
        "tagline": "Budget RAM/VRAM for sub-1B LLMs down to the KV cache, then plan an air-gapped survival assistant for your hardware.",
        "description": "Qwen3-0.6B quantization and KV-cache planner (2-16 bits/weight, 512-32768 context, thinking vs non-thinking ChatML) plus an air-gapped Survival LLM hardware tier advisor with offline knowledge-pack, power and tokens/sec estimates.",
        "opportunity": "Sub-1B local LLM memory math for low-RAM laptops and phones, and an offline emergency assistant reference design for Homie.",
        "score": 10,
        "emoji": "\U0001f9e0",
        "color_from": "green",
        "color_to": "indigo",
        "tags": ["qwen3", "llm", "quantization", "gguf", "kv-cache", "offline-ai", "edge-ai", "pymasters"],
        "merged_spaces": ["Muthu88/pymasters-survival-llm-ai-assistant-and-emergency"],
        "sources": [
            {"title": "Qwen/Qwen3-0.6B", "url": "https://huggingface.co/Qwen/Qwen3-0.6B",
             "description": "28-layer causal LM, 16 query / 8 KV heads (GQA), head_dim 128, tied 151,936-token embeddings, thinking + non-thinking modes."},
            {"title": "Survival LLM", "url": "https://www.brangus.io/survival-llm",
             "description": "Local-first, air-gapped AI assistant and offline knowledge base on consumer hardware."},
        ],
        "architecture": """
prompt -> ChatML template (<|im_start|>role ... <|im_end|>, optional empty <think></think> for non-thinking)
       -> tokenizer -> 28 x [RMSNorm -> GQA attention (16 Q / 8 KV heads) -> RMSNorm -> SwiGLU MLP]
       -> KV cache grows 2 x layers x kv_heads x head_dim values per token
       -> quantized weights (GGUF Q2_K..F16) bound decode speed by memory bandwidth
offline: knowledge packs (ZIM / docs) -> local RAG index -> small LLM -> answers without network
""",
        "curriculum": [
            ["ai_engineering", "Quantization, GGUF and running LLMs on CPUs", "Tab 1"],
            ["deep_learning", "Grouped-query attention and the KV cache", "Tab 1"],
            ["ai_engineering", "Offline RAG and hardware sizing for edge AI", "Tab 2"],
            ["python_internals", "Memory budgets: bytes, dtypes and buffers", "Tab 1"],
        ],
        "requirements": _SPACE_REQUIREMENTS_BASE,
    },
    {
        "repo_id": "Muthu88/pymasters-the-agent-sdk",
        "mode": "agent",
        "title": "PyMasters Autonomous Agents & Memory Lab: Agent SDK + Ebbinghaus Forgetting",
        "tagline": "Trace a Plan-Act-Observe loop over your own tool registry, then tune how an agent remembers and forgets.",
        "description": "Plan-Act-Observe loop and tool dispatcher sandbox (tool registry, confidence gate, multi-turn traces, JSON Schema + Python dispatcher) and an Ebbinghaus forgetting-curve agent memory simulator with salience, rehearsal and working-memory budgets.",
        "opportunity": "Agent engineering reference for PyMasters agent tutorials and Homie's long-running conversations: tool dispatch you can test, and memory that keeps what matters.",
        "score": 9,
        "emoji": "\U0001f916",
        "color_from": "yellow",
        "color_to": "red",
        "tags": ["agents", "tool-calling", "agent-memory", "forgetting-curve", "json-schema", "pymasters"],
        "merged_spaces": ["Muthu88/pymasters-novel-memory-forgetting-techniques-for-a"],
        "sources": [
            {"title": "The Agent SDK", "url": "https://cursor.com/blog/agent-sdk",
             "description": "Modular toolkit for tool-using, self-verifying autonomous workflows."},
            {"title": "Novel Memory Forgetting Techniques for Autonomous AI Agents", "url": "https://arxiv.org/abs/2604.02280v1",
             "description": "Uncontrolled memory accumulation causes temporal decay and false-memory propagation in long-horizon agents (LOCOMO, LOCCO, MultiWOZ)."},
        ],
        "architecture": """
goal -> PLAN (pick tool by relevance) -> ACT (validated JSON args -> dispatcher -> tool)
     -> OBSERVE (structured result, confidence) -> confidence gate: continue | reflect & retry | ask user
     -> memory write: salience-weighted entry with stability S
memory: retention R = exp(-age / S); rehearsal raises S; working memory keeps top-B by R,
        mid-R entries are summarised to long-term store, low-R entries are forgotten
""",
        "curriculum": [
            ["ai_agents", "Plan-Act-Observe loops and tool calling", "Tab 1"],
            ["ai_agents", "Agent memory, forgetting curves and context budgets", "Tab 2"],
            ["python_intermediate", "Decorator-based registries and JSON Schema validation", "Tab 1"],
            ["testing_devops", "Deterministic traces for testing agents", "Tab 1"],
        ],
        "requirements": _SPACE_REQUIREMENTS_BASE,
    },
]

# Redundant single-purpose Spaces -> the consolidated Space that now contains them.
MERGED_REDUNDANT_SPACES = {
    "Muthu88/pymasters-baaibge-small-en-v15": "Muthu88/pymasters-sentence-transformersall-minilm-l6-v2",
    "Muthu88/pymasters-hexgradkokoro-82m": "Muthu88/pymasters-hexgradkokoro-tts",
    "Muthu88/pymasters-survival-llm-ai-assistant-and-emergency": "Muthu88/pymasters-qwenqwen3-06b",
    "Muthu88/pymasters-novel-memory-forgetting-techniques-for-a": "Muthu88/pymasters-the-agent-sdk",
}

LESSON_GENERATOR_SPACE = {
    "repo_id": "Muthu88/pymasters-ai-lesson-generator",
    "title": "PyMasters AI Lesson Studio: Generate Interactive Python & AI Lessons",
    "description": "Generate complete, pymasters.net-compliant interactive lessons for any Python or AI topic: Vaathiyaar story, "
                   "Under the Hood explainer, traceable example, graded practice challenges with verified solutions, "
                   "bilingual quiz, commit-ready lesson JSON and a live grading sandbox. Runs on CPU Basic with no paid keys.",
    "emoji": "\U0001f393",
    "color_from": "purple",
    "color_to": "indigo",
    "tags": ["education", "python", "lesson-generator", "curriculum", "gradio", "pymasters"],
    "requirements": _SPACE_REQUIREMENTS_BASE + "huggingface_hub>=0.25.0\n",
}


# Shared prelude of every consolidated Space app. __SPACE_META__ becomes a Python string literal holding JSON.
_APP_COMMON = r'''"""__TITLE_DOC__ — generated by the PyMasters AI Intelligence Pipeline (pipeline/actors/hf_publisher.py)."""

import json
import math
import re
import time

import gradio as gr
import pandas as pd

PYMASTERS_URL = "https://pymasters.net"
HOMIE_URL = "https://heyhomie.app"
SPACE_META = json.loads(__SPACE_META__)
TITLE = SPACE_META["title"]
THEME = gr.themes.Soft(primary_hue="indigo", secondary_hue="purple")


def md_table(headers, rows) -> str:
    out = ["| " + " | ".join(str(h) for h in headers) + " |", "|" + "---|" * len(headers)]
    for row in rows:
        out.append("| " + " | ".join(str(c).replace("|", "\\|").replace("\n", " ") for c in row) + " |")
    return "\n".join(out)


def fmt_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024 or unit == "TB":
            return f"{n:,.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024.0
    return f"{n:,.1f} TB"


def curriculum_brief_markdown() -> str:
    m = SPACE_META
    parts = [f"## {m['title']}", "", m["description"], "", "### Consolidated from", ""]
    for src in m["sources"]:
        parts.append(f"- **[{src['title']}]({src['url']})** — {src['description']}")
    if m.get("merged_spaces"):
        merged = ", ".join(f"`{s}`" for s in m["merged_spaces"])
        parts += ["", f"Previously separate Space(s) now merged into this lab: {merged}."]
    parts += ["", "### Architecture", "", "```text", m["architecture"].strip(), "```", ""]
    parts += ["### PyMasters curriculum map", "",
              md_table(["Track", "Lesson focus", "Practise it in"], m["curriculum"]), ""]
    parts += ["### Engineering opportunity", "", m["opportunity"], "",
              f"**PyMasters relevance score:** `{m['score']}/10`", "",
              f"Learn the full path on **[pymasters.net]({PYMASTERS_URL})** — story first, then visuals, then code."]
    return "\n".join(parts)


def render_header() -> None:
    gr.Markdown(f"# {TITLE}\n{SPACE_META['tagline']}")


def render_footer() -> None:
    gr.Markdown(
        "---\n"
        f"**Built by [PyMasters]({PYMASTERS_URL})** — hands-on Python & AI engineering lessons | "
        f"Try **[Homie]({HOMIE_URL})** — a privacy-first local AI assistant. "
        "Numbers marked *estimate* are rule-of-thumb models; measure on your own hardware with the generated code."
    )

'''

_APP_BRIEF_TAB_AND_LAUNCH = r'''
        with gr.Tab("3 · Architecture & PyMasters Curriculum Brief"):
            gr.Markdown(curriculum_brief_markdown())
    render_footer()

if __name__ == "__main__":
    demo.launch()
'''

_APP_EMBEDDINGS = r'''
import hashlib
from collections import Counter

MINILM = "sentence-transformers/all-MiniLM-L6-v2"
BGE = "BAAI/bge-small-en-v1.5"
RERANKER = "cross-encoder/ms-marco-MiniLM-L-6-v2"
# Architecture values come from each model's config.json on the Hub; parameter counts are computed from them.
MODELS = {
    MINILM: {"short": "MiniLM-L6-v2", "dim": 384, "layers": 6, "ffn": 1536, "vocab": 30522, "max_seq": 256,
             "pooling": "mean", "query_prefix": ""},
    BGE: {"short": "BGE-small-en-v1.5", "dim": 384, "layers": 12, "ffn": 1536, "vocab": 30522, "max_seq": 512,
          "pooling": "CLS", "query_prefix": "Represent this sentence for searching relevant passages: "},
}
PRECISION_BYTES = {"float32": 4.0, "float16": 2.0, "int8 (scalar quantized)": 1.0, "binary (1 bit/dim)": 0.125}

DEFAULT_QUERY = "How can I run retrieval-augmented generation on a laptop without a GPU?"
DEFAULT_CORPUS = """Retrieval-augmented generation (RAG) first retrieves passages relevant to a question and then asks a language model to answer using only those passages. It reduces hallucination because the model can quote its sources.

Small embedding models such as all-MiniLM-L6-v2 and bge-small-en-v1.5 produce 384-dimensional vectors. They run comfortably on a laptop CPU and encode hundreds of short passages per second.

FAISS stores vectors in memory and supports exact inner-product search as well as approximate HNSW graphs. SQLite-vec adds a vec0 virtual table to SQLite so vectors live in a single file next to your other data.

BM25 is a keyword ranking function. It rewards rare query terms that appear often in a passage and penalises very long passages. Hybrid search combines BM25 with dense vectors so exact names and error codes are not lost.

A cross-encoder reads the query and a passage together and outputs a relevance score. It is slower than a bi-encoder, so it is used to rerank only the top few candidates.

Kokoro-82M is a text-to-speech model. It turns text into 24 kHz audio and is unrelated to retrieval, which makes it a useful distractor passage in this demo."""


def bert_params(cfg: dict) -> int:
    """Parameter count of a BERT encoder (+ pooler) from its config values."""
    h, i, v, layers = cfg["dim"], cfg["ffn"], cfg["vocab"], cfg["layers"]
    embeddings = v * h + 512 * h + 2 * h + 2 * h
    per_layer = (4 * h * h + 4 * h) + 2 * h + (2 * h * i + i + h) + 2 * h
    return embeddings + layers * per_layer + (h * h + h)


_MODEL_CACHE = {}


def _load_model(model_id: str, kind: str = "bi"):
    key = (model_id, kind)
    if key not in _MODEL_CACHE:
        try:
            from sentence_transformers import CrossEncoder, SentenceTransformer
            _MODEL_CACHE[key] = CrossEncoder(model_id, device="cpu") if kind == "cross" else SentenceTransformer(model_id, device="cpu")
        except Exception as exc:  # no torch / offline: fall back to a labelled proxy instead of crashing
            print(f"[embeddings-lab] {model_id} unavailable, using hashed proxy: {exc}")
            _MODEL_CACHE[key] = None
    return _MODEL_CACHE[key]


def _tokens(text: str) -> list:
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def _normalize(vec: list) -> list:
    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


def _proxy_embed(text: str, model_id: str) -> list:
    """Feature-hashing stand-in (384-d) used only when the real model cannot load."""
    toks = _tokens(text)
    if model_id == MINILM:
        feats = toks + [a + "_" + b for a, b in zip(toks, toks[1:])]
    else:
        feats = toks + [t[i:i + 3] for t in toks if len(t) > 3 for i in range(len(t) - 2)]
    vec = [0.0] * 384
    for f in feats:
        h = hashlib.md5((model_id + "|" + f).encode()).digest()
        vec[int.from_bytes(h[:4], "little") % 384] += 1.0 if h[4] & 1 else -1.0
    return _normalize(vec)


def embed(texts: list, model_id: str, is_query: bool = False, use_instruction: bool = True):
    t0 = time.perf_counter()
    model = _load_model(model_id)
    if model is not None:
        prefix = MODELS[model_id]["query_prefix"] if (is_query and use_instruction) else ""
        vecs = model.encode([prefix + t for t in texts], normalize_embeddings=True).tolist()
        backend = "real model"
    else:
        vecs = [_proxy_embed(t, model_id) for t in texts]
        backend = "hashed n-gram proxy (model unavailable)"
    return vecs, backend, (time.perf_counter() - t0) * 1000.0


def cosine(a: list, b: list) -> float:
    return sum(x * y for x, y in zip(a, b))


def chunk_text(corpus: str, strategy: str, size: int, overlap: int) -> list:
    text = (corpus or "").strip()
    if not text:
        return []
    size, overlap = max(8, int(size)), max(0, int(overlap))
    if strategy == "Paragraph":
        chunks = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    elif strategy == "Sentence pack":
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        chunks, cur = [], []
        for s in sents:
            if cur and sum(len(x.split()) for x in cur) + len(s.split()) > size:
                chunks.append(" ".join(cur))
                cur = cur[-1:] if overlap > 0 else []
            cur.append(s)
        if cur:
            chunks.append(" ".join(cur))
    else:
        words = text.split()
        step = max(1, size - min(overlap, size - 1))
        chunks = []
        for i in range(0, len(words), step):
            chunks.append(" ".join(words[i:i + size]))
            if i + size >= len(words):
                break
    return chunks[:40]


def run_compare(query, corpus, strategy, size, overlap, top_k, use_instruction):
    query = (query or "").strip() or DEFAULT_QUERY
    chunks = chunk_text(corpus or DEFAULT_CORPUS, strategy, size, overlap)
    if not chunks:
        return "Add some passages to search.", None, None, ""
    k = max(1, min(int(top_k), len(chunks)))
    res = {}
    for mid in (MINILM, BGE):
        q, backend, ms_q = embed([query], mid, True, use_instruction)
        d, _, ms_d = embed(chunks, mid)
        scores = [cosine(q[0], v) for v in d]
        order = sorted(range(len(chunks)), key=lambda i: -scores[i])
        res[mid] = {"scores": scores, "order": order, "backend": backend, "ms": ms_q + ms_d, "vecs": d,
                    "rank": {i: r + 1 for r, i in enumerate(order)}}
    top_a, top_b = set(res[MINILM]["order"][:k]), set(res[BGE]["order"][:k])
    jaccard = len(top_a & top_b) / len(top_a | top_b)
    rows = []
    for i in sorted(range(len(chunks)), key=lambda i: res[BGE]["rank"][i]):
        rows.append([i + 1, res[MINILM]["rank"][i], round(res[MINILM]["scores"][i], 4),
                     res[BGE]["rank"][i], round(res[BGE]["scores"][i], 4), chunks[i][:180]])
    table = pd.DataFrame(rows, columns=["Chunk #", "MiniLM rank", "MiniLM cosine", "BGE rank", "BGE cosine", "Chunk preview"])
    n = min(8, len(chunks))
    matrix = pd.DataFrame(
        [[f"{cosine(res[MINILM]['vecs'][a], res[MINILM]['vecs'][b]):.2f} / {cosine(res[BGE]['vecs'][a], res[BGE]['vecs'][b]):.2f}"
          for b in range(n)] for a in range(n)],
        columns=[f"C{b + 1}" for b in range(n)], index=[f"C{a + 1}" for a in range(n)],
    ).reset_index(names="MiniLM / BGE")
    warn = []
    for i, c in enumerate(chunks):
        est = int(len(c.split()) * 1.3)  # rough WordPiece tokens per English word
        if est > MODELS[MINILM]["max_seq"]:
            warn.append(f"- Chunk {i + 1} is ~{est} tokens: MiniLM truncates after 256, BGE after 512.")
    summary = [
        f"### Top-{k} retrieval for: *{query}*",
        md_table(["", "MiniLM-L6-v2", "BGE-small-en-v1.5"], [
            ["Backend", res[MINILM]["backend"], res[BGE]["backend"]],
            ["Encode time (query + chunks)", f"{res[MINILM]['ms']:.0f} ms", f"{res[BGE]['ms']:.0f} ms"],
            ["Top-1 chunk", f"C{res[MINILM]['order'][0] + 1}", f"C{res[BGE]['order'][0] + 1}"],
            ["Pooling / max tokens", "mean / 256", "CLS / 512"],
        ]),
        "",
        f"**Top-{k} agreement:** {len(top_a & top_b)}/{k} shared chunks (Jaccard `{jaccard:.2f}`) across `{len(chunks)}` chunks "
        f"from the *{strategy}* chunker.",
        "First call downloads the models (~250 MB); later calls are fast." if "real" in res[BGE]["backend"] else
        "Models could not load here, so a deterministic hashed proxy is shown; run the generated code for real scores.",
    ] + (["", "**Chunking warnings**"] + warn if warn else [])
    code = (
        "from sentence_transformers import SentenceTransformer, util\n\n"
        f"query = {query!r}\n"
        f"chunks = {chunks!r}\n\n"
        f"for model_id, prefix in [({MINILM!r}, ''), ({BGE!r}, {MODELS[BGE]['query_prefix']!r} if {bool(use_instruction)} else '')]:\n"
        "    model = SentenceTransformer(model_id, device='cpu')\n"
        "    q = model.encode(prefix + query, normalize_embeddings=True)\n"
        "    d = model.encode(chunks, normalize_embeddings=True, batch_size=32)\n"
        "    scores = util.cos_sim(q, d)[0].tolist()\n"
        f"    top = sorted(range(len(chunks)), key=lambda i: -scores[i])[:{k}]\n"
        "    print(model_id)\n"
        "    for rank, i in enumerate(top, 1):\n"
        "        print(f'  {rank}. {scores[i]:.4f}  {chunks[i][:70]}')\n"
    )
    return "\n".join(summary), table, matrix, code


def tradeoff(n_chunks, avg_tokens, precision, cores):
    n_chunks, avg_tokens, cores = int(n_chunks), int(avg_tokens), max(1, int(cores))
    rows = []
    for mid, m in MODELS.items():
        params = bert_params(m)
        encoder_params = params - (m["vocab"] + 512 + 2) * m["dim"]  # embedding lookups cost (almost) no FLOPs
        seq = min(avg_tokens, m["max_seq"])
        flops_per_chunk = 2 * encoder_params * seq  # forward pass ~ 2 FLOPs per weight per token (estimate)
        chunks_per_s = cores * 50e9 / flops_per_chunk  # estimate: ~50 GFLOP/s sustained per AVX2/AVX-512 core
        index_bytes = n_chunks * m["dim"] * PRECISION_BYTES[precision]
        search_ms = n_chunks * m["dim"] / (cores * 4e9) * 1000  # brute-force dot products at ~4 G/s per core
        rows.append([m["short"], f"{params / 1e6:.1f} M", fmt_bytes(params * 4), fmt_bytes(index_bytes),
                     f"{chunks_per_s:,.0f}", f"{n_chunks / chunks_per_s / 60:,.1f} min", f"{search_ms:,.2f} ms"])
    return md_table(["Model", "Params (from config)", "fp32 weights", f"Index ({precision})", "Chunks/s (estimate)",
                     "Full index build (estimate)", "Exact search / query (estimate)"], rows) + (
        "\n\nParameter counts are computed from each config.json (embeddings + encoder layers + pooler). "
        "BGE has twice the layers, so it encodes at roughly half MiniLM's speed for the same chunk length; "
        "index size depends only on dimension and precision, so both models cost the same to store.")


def bm25_scores(query: str, docs: list, k1: float = 1.5, b: float = 0.75) -> list:
    toks = [_tokens(d) for d in docs]
    n = len(docs)
    avgdl = (sum(len(t) for t in toks) / n) or 1.0
    df = Counter(t for ts in toks for t in set(ts))
    out = []
    for ts in toks:
        tf, s = Counter(ts), 0.0
        for t in set(_tokens(query)):
            if t in tf:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(ts) / avgdl))
        out.append(s)
    return out


def _minmax(xs: list) -> list:
    lo, hi = min(xs), max(xs)
    return [0.0 if hi == lo else (x - lo) / (hi - lo) for x in xs]


def rerank_scores(query: str, docs: list):
    t0 = time.perf_counter()
    ce = _load_model(RERANKER, "cross")
    if ce is not None:
        scores = [float(s) for s in ce.predict([(query, d) for d in docs])]
        return scores, "cross-encoder/ms-marco-MiniLM-L-6-v2", (time.perf_counter() - t0) * 1000
    q = _tokens(query)
    bigrams = {a + " " + b for a, b in zip(q, q[1:])}
    scores = []
    for d in docs:
        dt = _tokens(d)
        joined = " ".join(dt)
        scores.append(sum(1.0 / (1 + dt.count(t)) for t in set(q) if t in dt) + 0.8 * sum(bg in joined for bg in bigrams))
    return scores, "lexical proxy reranker (cross-encoder unavailable)", (time.perf_counter() - t0) * 1000


STORE_INFO = {
    "FAISS IndexFlatIP (exact)": "exact",
    "FAISS IndexHNSWFlat (M=32)": "hnsw",
    "SQLite-vec vec0 (single file)": "sqlite",
}


def store_estimates(store: str, n_index: int, dim: int = 384) -> tuple:
    kind = STORE_INFO[store]
    if kind == "exact":
        return n_index * dim * 4, n_index * dim / 4e9 * 1000, "brute-force inner product over every vector"
    if kind == "hnsw":
        return n_index * (dim * 4 + 32 * 2 * 4), 0.15 + 0.04 * math.log2(max(2, n_index)), "graph walk, ~log(N) hops (approximate)"
    return n_index * dim * 4 * 1.05, n_index * dim / 2e9 * 1000, "brute-force KNN inside SQLite (vec0 scan)"


def run_hybrid(query, corpus, strategy, size, overlap, store, embedder, fusion, alpha, first_k, rerank_n, use_rerank, n_index):
    query = (query or "").strip() or DEFAULT_QUERY
    chunks = chunk_text(corpus or DEFAULT_CORPUS, strategy, size, overlap)
    if not chunks:
        return "Add some passages to search.", None, ""
    mid = MINILM if embedder.startswith("MiniLM") else BGE
    first_k = max(1, min(int(first_k), len(chunks)))
    rerank_n = max(1, min(int(rerank_n), first_k))
    q, backend, ms_q = embed([query], mid, True)
    d, _, ms_d = embed(chunks, mid)
    dense = [cosine(q[0], v) for v in d]
    sparse = bm25_scores(query, chunks)
    dense_rank = {i: r for r, i in enumerate(sorted(range(len(chunks)), key=lambda i: -dense[i]), 1)}
    sparse_rank = {i: r for r, i in enumerate(sorted(range(len(chunks)), key=lambda i: -sparse[i]), 1)}
    if fusion.startswith("Reciprocal"):
        fused = [1 / (60 + dense_rank[i]) + 1 / (60 + sparse_rank[i]) for i in range(len(chunks))]
    else:
        nd, ns = _minmax(dense), _minmax(sparse)
        fused = [float(alpha) * ns[i] + (1 - float(alpha)) * nd[i] for i in range(len(chunks))]
    candidates = sorted(range(len(chunks)), key=lambda i: -fused[i])[:first_k]
    final, rr_scores, rr_name, rr_ms = list(candidates), {}, "off", 0.0
    if use_rerank:
        head = candidates[:rerank_n]
        scores, rr_name, rr_ms = rerank_scores(query, [chunks[i] for i in head])
        rr_scores = dict(zip(head, scores))
        final = sorted(head, key=lambda i: -rr_scores[i]) + candidates[rerank_n:]
    rows = []
    for pos, i in enumerate(final, 1):
        before = candidates.index(i) + 1
        rows.append([pos, f"C{i + 1}", round(sparse[i], 3), round(dense[i], 4), round(fused[i], 4),
                     round(rr_scores[i], 3) if i in rr_scores else "—", f"{before - pos:+d}" if use_rerank else "0", chunks[i][:150]])
    table = pd.DataFrame(rows, columns=["Final rank", "Chunk", "BM25", "Dense cosine", "Fused", "Rerank score", "Rank change", "Preview"])
    mem, ann_ms, how = store_estimates(store, int(n_index))
    stages = md_table(["Stage", "Candidates", "Latency", "Notes"], [
        ["1. Embed query", "1", f"{ms_q:.1f} ms (measured)", f"{MODELS[mid]['short']} · {backend}"],
        ["2. Dense ANN search", f"{int(n_index):,} -> {first_k}", f"{ann_ms:.2f} ms (estimate)", f"{store}: {how}"],
        ["3. BM25 keyword search", f"{int(n_index):,} -> {first_k}", "~1-5 ms (inverted index, estimate)", "rare exact terms, names, error codes"],
        ["4. Fusion", f"{2 * first_k} -> {first_k}", "< 0.1 ms", fusion if fusion.startswith("Reciprocal") else f"alpha={float(alpha):.2f} x BM25 + {1 - float(alpha):.2f} x dense"],
        ["5. Rerank", f"{rerank_n if use_rerank else 0} pairs", f"{rr_ms:.1f} ms (measured)" if use_rerank else "skipped", rr_name],
    ])
    summary = (f"### Hybrid pipeline for *{query}*\n{stages}\n\n**{store}** index of {int(n_index):,} x 384-d float32 vectors "
               f"needs about **{fmt_bytes(mem)}**. Demo corpus encoded in {ms_d:.0f} ms.")
    code = _store_code(store, mid, query, first_k, rerank_n, use_rerank, fusion, float(alpha))
    return summary, table, code


def _store_code(store, mid, query, first_k, rerank_n, use_rerank, fusion, alpha) -> str:
    kind = STORE_INFO[store]
    head = (
        "from sentence_transformers import SentenceTransformer, CrossEncoder\n"
        "import numpy as np\n\n"
        "chunks = open('corpus.txt', encoding='utf-8').read().split('\\n\\n')\n"
        f"model = SentenceTransformer({mid!r}, device='cpu')\n"
        "vecs = model.encode(chunks, normalize_embeddings=True).astype('float32')\n"
        f"query = {query!r}\n"
        "qv = model.encode([query], normalize_embeddings=True).astype('float32')\n\n"
    )
    if kind == "sqlite":
        body = (
            "import sqlite3, sqlite_vec  # pip install sqlite-vec\n"
            "db = sqlite3.connect('rag.db')\n"
            "db.enable_load_extension(True); sqlite_vec.load(db); db.enable_load_extension(False)\n"
            "db.execute('CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING vec0(embedding float[384])')\n"
            "db.executemany('INSERT INTO chunks(rowid, embedding) VALUES (?, ?)',\n"
            "               [(i, sqlite_vec.serialize_float32(v.tolist())) for i, v in enumerate(vecs)])\n"
            "rows = db.execute('SELECT rowid, distance FROM chunks WHERE embedding MATCH ? ORDER BY distance LIMIT ?',\n"
            f"                  (sqlite_vec.serialize_float32(qv[0].tolist()), {first_k})).fetchall()\n"
            "candidates = [rowid for rowid, _ in rows]\n"
        )
    else:
        index = "faiss.IndexFlatIP(384)" if kind == "exact" else "faiss.IndexHNSWFlat(384, 32, faiss.METRIC_INNER_PRODUCT)"
        body = (
            "import faiss  # pip install faiss-cpu\n"
            f"index = {index}\n"
            "index.add(vecs)\n"
            f"scores, ids = index.search(qv, {first_k})\n"
            "candidates = [int(i) for i in ids[0] if i >= 0]\n"
        )
    body += (
        "\n# Hybrid: add BM25 candidates (pip install rank-bm25) and fuse ranks\n"
        "from rank_bm25 import BM25Okapi\n"
        "bm25 = BM25Okapi([c.lower().split() for c in chunks])\n"
        f"sparse = list(np.argsort(-bm25.get_scores(query.lower().split()))[:{first_k}])\n"
    )
    if fusion.startswith("Reciprocal"):
        body += ("rrf = {}\nfor ranking in (candidates, sparse):\n    for r, i in enumerate(ranking, 1):\n"
                 "        rrf[int(i)] = rrf.get(int(i), 0.0) + 1.0 / (60 + r)\n"
                 f"candidates = sorted(rrf, key=rrf.get, reverse=True)[:{first_k}]\n")
    else:
        body += (f"alpha = {alpha:.2f}  # weight of BM25 in the fused score\n"
                 "dense = vecs @ qv[0]\nbm = bm25.get_scores(query.lower().split())\n"
                 "norm = lambda x: (x - x.min()) / (x.max() - x.min() + 1e-9)\n"
                 "fused = alpha * norm(bm) + (1 - alpha) * norm(dense)\n"
                 f"candidates = list(np.argsort(-fused)[:{first_k}])\n")
    if use_rerank:
        body += (f"\nreranker = CrossEncoder({RERANKER!r}, device='cpu')\n"
                 f"head = candidates[:{rerank_n}]\n"
                 "scores = reranker.predict([(query, chunks[i]) for i in head])\n"
                 f"candidates = [head[j] for j in np.argsort(-scores)] + candidates[{rerank_n}:]\n")
    body += "\nfor rank, i in enumerate(candidates, 1):\n    print(rank, chunks[i][:80])\n"
    return head + body


with gr.Blocks(title=TITLE, theme=THEME) as demo:
    render_header()
    with gr.Tabs():
        with gr.Tab("1 · Dual-Embedder Semantic Search & RAG Comparison"):
            with gr.Row():
                with gr.Column(scale=1):
                    e_query = gr.Textbox(label="Query", value=DEFAULT_QUERY, lines=2)
                    e_corpus = gr.Textbox(label="Corpus (blank line between documents)", value=DEFAULT_CORPUS, lines=10)
                    with gr.Row():
                        e_strategy = gr.Radio(["Paragraph", "Sentence pack", "Fixed words"], value="Paragraph", label="Chunking strategy")
                        e_instr = gr.Checkbox(value=True, label="Use BGE query instruction")
                    with gr.Row():
                        e_size = gr.Slider(16, 256, value=60, step=4, label="Chunk size (words)")
                        e_overlap = gr.Slider(0, 64, value=10, step=2, label="Overlap (words; sentence pack: >0 carries 1 sentence)")
                        e_k = gr.Slider(1, 10, value=3, step=1, label="Top-k")
                    e_btn = gr.Button("Embed & compare both models", variant="primary")
                with gr.Column(scale=1):
                    e_summary = gr.Markdown()
                    e_table = gr.Dataframe(label="Query-to-chunk cosine similarity (sorted by BGE rank)", wrap=True)
                    e_matrix = gr.Dataframe(label="Chunk x chunk cosine similarity matrix (MiniLM / BGE, first 8 chunks)")
            e_code = gr.Code(label="Ready-to-run Python", language="python")
            e_inputs = [e_query, e_corpus, e_strategy, e_size, e_overlap, e_k, e_instr]
            e_btn.click(run_compare, e_inputs, [e_summary, e_table, e_matrix, e_code])
            gr.Markdown("#### Latency / memory trade-off calculator")
            with gr.Row():
                t_n = gr.Slider(1000, 10_000_000, value=100_000, step=1000, label="Chunks in the index")
                t_tok = gr.Slider(16, 512, value=128, step=16, label="Average tokens per chunk")
                t_prec = gr.Dropdown(list(PRECISION_BYTES), value="float32", label="Vector precision")
                t_cores = gr.Slider(1, 32, value=4, step=1, label="CPU cores")
            t_btn = gr.Button("Calculate trade-offs")
            t_out = gr.Markdown()
            t_btn.click(tradeoff, [t_n, t_tok, t_prec, t_cores], t_out)
            demo.load(tradeoff, [t_n, t_tok, t_prec, t_cores], t_out)

        with gr.Tab("2 · Vector Store & Hybrid Reranking Simulator"):
            with gr.Row():
                with gr.Column(scale=1):
                    h_query = gr.Textbox(label="Query", value="BM25 hybrid search for exact error codes", lines=2)
                    h_corpus = gr.Textbox(label="Corpus (blank line between documents)", value=DEFAULT_CORPUS, lines=8)
                    with gr.Row():
                        h_store = gr.Dropdown(list(STORE_INFO), value="FAISS IndexFlatIP (exact)", label="Vector store")
                        h_embedder = gr.Radio(["MiniLM-L6-v2", "BGE-small-en-v1.5"], value="BGE-small-en-v1.5", label="Bi-encoder")
                    with gr.Row():
                        h_fusion = gr.Radio(["Weighted (alpha)", "Reciprocal Rank Fusion (k=60)"], value="Weighted (alpha)", label="Fusion")
                        h_alpha = gr.Slider(0.0, 1.0, value=0.4, step=0.05, label="alpha = BM25 weight")
                    with gr.Row():
                        h_k = gr.Slider(1, 20, value=5, step=1, label="First-stage candidates")
                        h_n = gr.Slider(1, 20, value=3, step=1, label="Rerank top-n")
                        h_rr = gr.Checkbox(value=True, label="Cross-encoder rerank")
                    h_index = gr.Slider(1000, 50_000_000, value=1_000_000, step=1000, label="Simulated production index size (vectors)")
                    h_btn = gr.Button("Run hybrid retrieval pipeline", variant="primary")
                with gr.Column(scale=1):
                    h_summary = gr.Markdown()
                    h_table = gr.Dataframe(label="Ranked results through every stage", wrap=True)
            h_code = gr.Code(label="Production pipeline code for the selected store", language="python")
            h_btn.click(run_hybrid, [h_query, h_corpus, e_strategy, e_size, e_overlap, h_store, h_embedder, h_fusion,
                                     h_alpha, h_k, h_n, h_rr, h_index], [h_summary, h_table, h_code])
'''

_APP_TTS = r'''
SAMPLE_RATE = 24000
TOTAL_PARAMS = 82_000_000  # published model size
VOICE_PACK_BYTES = 523_425  # size of voices/af_heart.pt on the Hub
VOICES = {
    "af_heart": ("a", "American English, female"),
    "am_michael": ("a", "American English, male"),
    "bf_emma": ("b", "British English, female"),
    "bm_george": ("b", "British English, male"),
}
# Real-time factor = seconds of compute per second of audio. Assumptions, editable in the UI.
HARDWARE_RTF = {
    "Laptop CPU (4 cores)": 0.30,
    "Apple M-series CPU": 0.15,
    "Raspberry Pi 5": 1.10,
    "Consumer GPU (RTX 3060 class)": 0.03,
    "Hugging Face CPU Basic (2 vCPU)": 0.60,
}
DEFAULT_SCRIPT = ("Vanakkam! Welcome to PyMasters. Today we build a voice assistant that runs entirely on your laptop. "
                  "First, the text is split into short segments; then Kokoro turns each one into speech at 24 kHz. "
                  "Because we stream segment by segment, you hear the first words in well under a second. Ready? Let's go!")
NUMBER_RE = re.compile(r"\b\d[\d,.:]*\b")
ACRONYM_RE = re.compile(r"\b[A-Z]{2,}\b")


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 1 if any(ch.isdigit() for ch in word) else 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups) - (1 if w.endswith("e") and len(groups) > 1 and not w.endswith("le") else 0)
    return max(1, n)


def prosody_tag(segment: str) -> str:
    s = segment.rstrip()
    if s.endswith("?"):
        return "question: rising F0 at the end"
    if s.endswith("!"):
        return "exclamation: higher energy"
    if s.endswith((",", ";", ":")):
        return "continuation: short pause (~150 ms)"
    return "statement: falling F0, ~300 ms pause"


def segment_script(script: str, max_chars: int) -> list:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", script or "") if s.strip()]
    out = []
    for sent in sentences:
        while len(sent) > max_chars:
            cut = max(sent.rfind(",", 0, max_chars), sent.rfind(";", 0, max_chars), sent.rfind(" ", 0, max_chars))
            cut = cut if cut > 0 else max_chars
            out.append(sent[:cut + 1].strip())
            sent = sent[cut + 1:].strip()
        if sent:
            out.append(sent)
    return out


def plan_synthesis(script, voice, speed, max_chars, hardware, rtf_override):
    script = (script or "").strip() or DEFAULT_SCRIPT
    speed = max(0.5, min(2.0, float(speed)))
    rtf = float(rtf_override) if float(rtf_override) > 0 else HARDWARE_RTF[hardware]
    segments = segment_script(script, int(max_chars))
    rows, t_audio, t_compute = [], 0.0, 0.0
    first_audio_at = None
    for i, seg in enumerate(segments, 1):
        words = seg.split()
        syl = sum(syllables(w) for w in words)
        dur = syl / (4.0 * speed)  # ~4 syllables/s is a relaxed English speaking rate at speed 1.0
        compute = dur * rtf
        t_compute += compute
        if first_audio_at is None:
            first_audio_at = 0.15 + compute  # warm-up + first segment
        flags = []
        if NUMBER_RE.search(seg):
            flags.append("numbers -> words")
        if ACRONYM_RE.search(seg):
            flags.append("acronym spelled out")
        rows.append([i, seg, len(words), syl, f"{dur:.2f}", f"{int(dur * SAMPLE_RATE):,}", prosody_tag(seg), ", ".join(flags) or "—"])
        t_audio += dur
    table = pd.DataFrame(rows, columns=["#", "Segment", "Words", "Syllables", "Audio s", "Samples @24 kHz", "Prosody", "G2P notes"])
    stalls = max(0.0, t_compute - t_audio)
    lang, accent = VOICES[voice]
    summary = (
        f"### Synthesis plan · `{voice}` ({accent}) · speed `{speed:.2f}x`\n"
        + md_table(["Metric", "Value"], [
            ["Segments", len(segments)],
            ["Total audio (estimate)", f"{t_audio:.1f} s"],
            ["Compute on " + hardware, f"{t_compute:.2f} s at RTF {rtf:.2f}"],
            ["Time to first audio, streaming", f"**{first_audio_at:.2f} s**"],
            ["Time to first audio, whole script at once", f"{0.15 + t_compute:.2f} s"],
            ["Playback stalls while streaming", "none (faster than real time)" if rtf < 1 else f"~{stalls:.1f} s total: buffer or use a GPU"],
            ["Audio buffer (float32)", fmt_bytes(t_audio * SAMPLE_RATE * 4)],
        ])
        + "\n\nShort first segments cut time-to-first-audio; KPipeline yields one chunk per segment, so playback can start "
          "while later segments are still being generated."
    )
    code = (
        "# pip install kokoro soundfile   (and: apt-get install espeak-ng for fallback G2P)\n"
        "from kokoro import KPipeline\n"
        "import numpy as np\n"
        "import soundfile as sf\n\n"
        f"pipeline = KPipeline(lang_code={lang!r})  # 'a' = American English, 'b' = British English\n"
        f"text = {script!r}\n\n"
        "chunks = []\n"
        f"for i, (graphemes, phonemes, audio) in enumerate(pipeline(text, voice={voice!r}, speed={speed:.2f}, split_pattern=r'(?<=[.!?])\\s+')):\n"
        "    print(i, graphemes, '->', phonemes)\n"
        "    chunks.append(audio)\n"
        "    # stream: sounddevice.play(audio, 24000) here to start playback immediately\n\n"
        "sf.write('pymasters_voice.wav', np.concatenate(chunks), 24000)\n"
    )
    return summary, table, code


def footprint(precision, streams, seconds):
    bpp = {"fp32": 4, "fp16 / bf16": 2, "int8 (dynamic quant)": 1}[precision]
    weights = TOTAL_PARAMS * bpp
    voices = VOICE_PACK_BYTES * len(VOICES)
    audio = int(streams) * float(seconds) * SAMPLE_RATE * 4
    activations = int(streams) * float(seconds) * 80 * 512 * 4 * 6  # 80 frames/s x 512 channels, ~6 live buffers (estimate)
    total = weights + voices + audio + activations + 250 * 1024 ** 2  # + Python/torch runtime (estimate)
    return md_table(["Component", "Memory"], [
        ["Weights (82M params, " + precision + ")", fmt_bytes(weights)],
        [f"{len(VOICES)} voice packs (~{VOICE_PACK_BYTES / 1024:.0f} KB each)", fmt_bytes(voices)],
        [f"Audio buffers ({int(streams)} streams x {float(seconds):.0f} s)", fmt_bytes(audio)],
        ["Decoder activations (estimate)", fmt_bytes(activations)],
        ["Runtime overhead (estimate)", "250.0 MB"],
        ["**Total**", f"**{fmt_bytes(total)}**"],
    ]) + "\n\nKokoro fits comfortably in CPU RAM; a GPU mainly buys lower latency, not capacity."


ARCH_MD = """### How Kokoro-82M turns text into sound
| Stage | What it does | From config.json |
|---|---|---|
| G2P (misaki) | text -> phonemes; espeak-ng as fallback | 178 phoneme tokens (`n_token`) |
| PL-BERT | contextual phoneme features | ALBERT, 12 layers sharing one set of weights, 768-d |
| Text encoder | CNN + LSTM over phonemes | kernel 5, hidden 512 |
| Prosody predictor | durations, pitch (F0), energy | conditioned on a 256-d voice vector (`style_dim` 128 x 2) |
| ISTFTNet decoder | features -> waveform | upsample 10 x 6, iSTFT hop 5 => 300 samples/frame |

Each decoder frame covers 300 samples, so 1 s of 24 kHz audio is **80 frames**. Kokoro drops StyleTTS2's diffusion
sampler and predicts style from the voice pack, which is why it is fast on CPUs.

Print the exact parameter split of the checkpoint yourself:
```python
from kokoro import KModel
model = KModel()
for name, module in model.named_children():
    print(f"{name:14s} {sum(p.numel() for p in module.parameters()) / 1e6:6.2f} M")
print("total", sum(p.numel() for p in model.parameters()) / 1e6, "M")
```
"""

STT_OPTIONS = {"Whisper tiny (39M)": 0.25, "Whisper base (74M)": 0.45, "Whisper small (244M)": 1.2, "Moonshine tiny (27M)": 0.12}


def assistant_pipeline(stt, vad_ms, utter_s, llm_tps, reply_words, hardware):
    rtf = HARDWARE_RTF[hardware]
    stt_s = STT_OPTIONS[stt] * float(utter_s) / 5.0  # scaled from a 5 s utterance (estimate)
    first_sentence_tokens = 18
    llm_ttft = 0.25 + first_sentence_tokens / max(1.0, float(llm_tps))
    first_seg_audio = 12 / 2.6  # first ~12 words
    tts_first = 0.15 + first_seg_audio * rtf
    total = float(vad_ms) / 1000 + stt_s + llm_ttft + tts_first
    reply_s = int(reply_words) / 2.6
    rows = [
        ["1. Wake word + VAD end-of-speech", f"{float(vad_ms):.0f} ms", "silence needed to decide the user stopped"],
        [f"2. STT · {stt}", f"{stt_s:.2f} s", f"{float(utter_s):.0f} s utterance"],
        ["3. LLM first sentence (e.g. Qwen3-0.6B)", f"{llm_ttft:.2f} s", f"prefill + {first_sentence_tokens} tokens at {float(llm_tps):.0f} tok/s"],
        ["4. Kokoro first segment", f"{tts_first:.2f} s", f"RTF {rtf:.2f} on {hardware}"],
        ["**Voice-to-voice latency**", f"**{total:.2f} s**", "target < 1.5 s for natural conversation"],
        ["Rest of the reply", f"{reply_s:.1f} s audio", "LLM + TTS keep streaming while audio plays"],
    ]
    verdict = "feels conversational" if total < 1.5 else "noticeable pause: use a smaller STT model, a faster LLM or stream earlier"
    return md_table(["Stage", "Time", "Notes"], rows) + f"\n\n**Verdict:** {verdict}.\n\n```text\nmic -> VAD -> STT -> LLM (stream sentences) -> Kokoro (stream segments) -> speaker\n```"


with gr.Blocks(title=TITLE, theme=THEME) as demo:
    render_header()
    with gr.Tabs():
        with gr.Tab("1 · Kokoro-82M Synthesis & Streaming Chunker"):
            with gr.Row():
                with gr.Column(scale=1):
                    k_script = gr.Textbox(label="Script", value=DEFAULT_SCRIPT, lines=6)
                    with gr.Row():
                        k_voice = gr.Dropdown(list(VOICES), value="af_heart", label="Voice preset")
                        k_speed = gr.Slider(0.5, 2.0, value=1.0, step=0.05, label="Speed")
                    with gr.Row():
                        k_chars = gr.Slider(40, 400, value=140, step=10, label="Max characters per segment")
                        k_hw = gr.Dropdown(list(HARDWARE_RTF), value="Laptop CPU (4 cores)", label="Hardware")
                    k_rtf = gr.Number(value=0, label="Measured RTF override (0 = use hardware preset)")
                    k_btn = gr.Button("Plan synthesis & streaming", variant="primary")
                with gr.Column(scale=1):
                    k_summary = gr.Markdown()
            k_table = gr.Dataframe(label="Phoneme / prosody segmenter", wrap=True)
            k_code = gr.Code(label="Python KPipeline code", language="python")
            k_in = [k_script, k_voice, k_speed, k_chars, k_hw, k_rtf]
            k_btn.click(plan_synthesis, k_in, [k_summary, k_table, k_code])
            demo.load(plan_synthesis, k_in, [k_summary, k_table, k_code])

        with gr.Tab("2 · StyleTTS2 & 82M Architecture Explorer"):
            gr.Markdown(ARCH_MD)
            gr.Markdown("#### VRAM / CPU RAM footprint calculator")
            with gr.Row():
                f_prec = gr.Radio(["fp32", "fp16 / bf16", "int8 (dynamic quant)"], value="fp32", label="Precision")
                f_streams = gr.Slider(1, 16, value=1, step=1, label="Concurrent streams")
                f_secs = gr.Slider(5, 120, value=30, step=5, label="Seconds of audio buffered per stream")
            f_out = gr.Markdown()
            for comp in (f_prec, f_streams, f_secs):
                comp.change(footprint, [f_prec, f_streams, f_secs], f_out)
            demo.load(footprint, [f_prec, f_streams, f_secs], f_out)
            gr.Markdown("#### Homie local voice assistant pipeline")
            with gr.Row():
                a_stt = gr.Dropdown(list(STT_OPTIONS), value="Whisper base (74M)", label="Speech-to-text")
                a_vad = gr.Slider(200, 1200, value=500, step=50, label="VAD end-of-speech silence (ms)")
                a_utt = gr.Slider(1, 20, value=5, step=1, label="User utterance (s)")
            with gr.Row():
                a_tps = gr.Slider(5, 150, value=40, step=5, label="LLM decode speed (tokens/s)")
                a_words = gr.Slider(10, 200, value=60, step=5, label="Reply length (words)")
                a_hw = gr.Dropdown(list(HARDWARE_RTF), value="Laptop CPU (4 cores)", label="Hardware")
            a_out = gr.Markdown()
            a_in = [a_stt, a_vad, a_utt, a_tps, a_words, a_hw]
            for comp in a_in:
                comp.change(assistant_pipeline, a_in, a_out)
            demo.load(assistant_pipeline, a_in, a_out)
'''

_APP_LLM = r'''
# Qwen/Qwen3-0.6B config.json
QWEN = {"layers": 28, "hidden": 1024, "ffn": 3072, "q_heads": 16, "kv_heads": 8, "head_dim": 128, "vocab": 151936}


def qwen_params(c: dict = QWEN) -> tuple:
    """(total, embedding) parameters of a Qwen3 decoder with tied embeddings, computed from config values."""
    h, hd = c["hidden"], c["head_dim"]
    attn = h * c["q_heads"] * hd + 2 * h * c["kv_heads"] * hd + c["q_heads"] * hd * h + 2 * hd  # q,k,v,o + q/k norms
    mlp = 3 * h * c["ffn"]
    per_layer = attn + mlp + 2 * h
    emb = c["vocab"] * h
    return emb + c["layers"] * per_layer + h, emb


TOTAL_PARAMS, EMB_PARAMS = qwen_params()
KV_VALUES_PER_TOKEN = 2 * QWEN["layers"] * QWEN["kv_heads"] * QWEN["head_dim"]
KV_BYTES = {"fp16 / bf16": 2.0, "q8_0": 1.0625, "q4_0": 0.5625}
GGUF_TYPES = [(2.6, "Q2_K"), (3.5, "Q3_K_M"), (4.5, "Q4_0"), (4.85, "Q4_K_M"), (5.7, "Q5_K_M"), (6.6, "Q6_K"), (8.5, "Q8_0"), (16.0, "F16 / BF16")]
SAMPLING = {True: "temperature=0.6, top_p=0.95, top_k=20, min_p=0", False: "temperature=0.7, top_p=0.8, top_k=20, min_p=0"}


def nearest_gguf(bpw: float) -> str:
    return min(GGUF_TYPES, key=lambda t: abs(t[0] - bpw))[1]


def chatml(system: str, user: str, thinking: bool) -> str:
    text = ""
    if system.strip():
        text += f"<|im_start|>system\n{system.strip()}<|im_end|>\n"
    text += f"<|im_start|>user\n{user.strip()}<|im_end|>\n<|im_start|>assistant\n"
    if not thinking:
        text += "<think>\n\n</think>\n\n"  # what apply_chat_template(enable_thinking=False) appends
    return text


def plan_memory(bpw, ctx, kv_type, batch, thinking, emb_fp16, system, user):
    bpw, ctx, batch = float(bpw), int(ctx), int(batch)
    body = TOTAL_PARAMS - EMB_PARAMS
    emb_bits = 16.0 if emb_fp16 else bpw
    weights = body * bpw / 8 + EMB_PARAMS * emb_bits / 8
    kv = KV_VALUES_PER_TOKEN * KV_BYTES[kv_type] * ctx * batch
    compute = batch * (QWEN["vocab"] * 4 + ctx * QWEN["hidden"] * 4 * 2) + 64 * 1024 ** 2  # logits + scratch (estimate)
    runtime = 150 * 1024 ** 2  # llama.cpp / Python runtime (estimate)
    total = weights + kv + compute + runtime
    reserve = min(ctx // 2, 8192 if thinking else 1024)
    rows = [
        ["Parameters (from config)", f"{TOTAL_PARAMS / 1e6:.0f} M total · {EMB_PARAMS / 1e6:.1f} M tied embedding · {(TOTAL_PARAMS - EMB_PARAMS) / 1e6:.0f} M in layers"],
        ["Quantization", f"{bpw:.2f} bits/weight (closest GGUF: **{nearest_gguf(bpw)}**), embeddings at {emb_bits:.2f} bits"],
        ["Weights", fmt_bytes(weights)],
        ["KV cache per token", f"{KV_VALUES_PER_TOKEN:,} values = {fmt_bytes(KV_VALUES_PER_TOKEN * KV_BYTES[kv_type])} ({kv_type})"],
        [f"KV cache ({ctx:,} tokens x {batch} seq)", fmt_bytes(kv)],
        ["Compute buffers (estimate)", fmt_bytes(compute)],
        ["Runtime overhead (estimate)", fmt_bytes(runtime)],
        ["**Total RAM / VRAM**", f"**{fmt_bytes(total)}**"],
    ]
    fits = []
    for name, cap in [("2 GB phone / Pi Zero 2", 2), ("4 GB laptop", 4), ("8 GB GPU / laptop", 8)]:
        usable = cap * 1024 ** 3 * 0.6  # leave ~40% for the OS and other apps
        fits.append([name, "fits" if total <= usable else "too large", f"{total / usable * 100:.0f}% of usable"])
    report = (
        "### Qwen3-0.6B memory budget\n" + md_table(["Item", "Value"], rows)
        + "\n\n" + md_table(["Device", "Verdict", "Share of usable RAM"], fits)
        + f"\n\n**Mode:** {'thinking' if thinking else 'non-thinking'} · recommended sampling `{SAMPLING[bool(thinking)]}` · "
          f"reserve ~{reserve:,} tokens of the window for the answer"
          f"{' (reasoning traces are long)' if thinking else ''}, leaving {ctx - reserve:,} for the prompt.\n\n"
        "Grouped-query attention stores 8 KV heads instead of 16, halving the cache; at long contexts the KV cache, not the "
        "weights, dominates memory."
    )
    prompt = chatml(system or "You are Homie, a fast, privacy-first local AI assistant.",
                    user or "Explain how 4-bit quantization lets a 0.6B model run on a phone.", bool(thinking))
    code = (
        "from transformers import AutoModelForCausalLM, AutoTokenizer\n\n"
        "tok = AutoTokenizer.from_pretrained('Qwen/Qwen3-0.6B')\n"
        "model = AutoModelForCausalLM.from_pretrained('Qwen/Qwen3-0.6B', torch_dtype='auto')\n"
        f"messages = [{{'role': 'system', 'content': {(system or 'You are Homie, a fast, privacy-first local AI assistant.')!r}}},\n"
        f"            {{'role': 'user', 'content': {(user or 'Explain how 4-bit quantization lets a 0.6B model run on a phone.')!r}}}]\n"
        f"text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking={bool(thinking)})\n"
        "inputs = tok(text, return_tensors='pt')\n"
        f"out = model.generate(**inputs, max_new_tokens={reserve}, do_sample=True, {SAMPLING[bool(thinking)]})\n"
        "print(tok.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True))\n\n"
        f"# llama.cpp equivalent:\n# llama-cli -hf Qwen/Qwen3-0.6B-GGUF -c {ctx} --temp {0.6 if thinking else 0.7} "
        f"--top-p {0.95 if thinking else 0.8} --top-k 20 --cache-type-k {'f16' if kv_type.startswith('fp16') else kv_type}\n"
    )
    return report, prompt, code


# Survival LLM planner. Bandwidths are spec-sheet peaks; power figures are typical-load assumptions you can override.
HARDWARE = {
    "Raspberry Pi 5 (8 GB)": {"ram_gb": 8, "bw_gbs": 17.0, "watts": 8.0, "storage_note": "microSD / NVMe HAT"},
    "4 GB laptop (CPU only)": {"ram_gb": 4, "bw_gbs": 25.6, "watts": 25.0, "storage_note": "internal SSD"},
    "8 GB GPU desktop": {"ram_gb": 8, "bw_gbs": 272.0, "watts": 180.0, "storage_note": "NVMe SSD"},
    "Phone (8 GB, LPDDR5)": {"ram_gb": 8, "bw_gbs": 51.2, "watts": 6.0, "storage_note": "internal flash"},
}
LLM_CHOICES = {"Qwen3-0.6B": 0.6, "Qwen3-1.7B": 1.7, "Qwen3-4B": 4.0, "Qwen3-8B": 8.2}
PACKS = {  # approximate download sizes; check the current Kiwix / devdocs catalogue before relying on them
    "Wikipedia (English, no images)": 50.0,
    "Medical (WikiMed / MedlinePlus)": 2.0,
    "Engineering & repair (iFixit + manuals)": 4.0,
    "Python Docs (python.org + devdocs)": 0.1,
}


def survival_plan(hw_name, packs, battery_wh, bpw, rag_index, efficiency):
    hw = HARDWARE[hw_name]
    bpw, eff = float(bpw), float(efficiency)
    usable = hw["ram_gb"] * (0.5 if "8 GB GPU" not in hw_name else 0.9)  # GPU VRAM is dedicated; shared RAM needs headroom
    rows, best = [], None
    for name, b in LLM_CHOICES.items():
        size_gb = b * 1e9 * bpw / 8 / 1024 ** 3
        tps = eff * hw["bw_gbs"] / (size_gb * 1.074)  # decode reads every weight once per token (bandwidth-bound)
        fits = size_gb + 0.6 <= usable
        rows.append([name, f"{size_gb:.2f} GB", "yes" if fits else "no", f"{tps:.1f}" if fits else "—"])
        if fits and tps >= 5:
            best = (name, size_gb, tps)
    pack_gb = sum(PACKS[p] for p in packs or [])
    chunks = pack_gb * 1024 ** 3 / 1500  # ~1.5 KB text per chunk (images excluded)
    index_gb = chunks * 384 * (1 if rag_index.startswith("int8") else 4) / 1024 ** 3 if packs else 0.0
    model_gb = best[1] if best else 0.0
    hours = float(battery_wh) / hw["watts"]
    verdict = (f"Run **{best[0]}** at ~{best[2]:.0f} tokens/s (estimate)." if best else
               "No Qwen3 model reaches 5 tokens/s within this RAM budget: lower the bits/weight or pick bigger hardware.")
    tokens_per_wh = (best[2] * 3600 / hw["watts"]) if best else 0
    md = (
        f"### Air-gapped plan for **{hw_name}**\n{verdict}\n\n"
        + md_table(["Model", f"Weights at {bpw:.1f} bpw", f"Fits in ~{usable:.1f} GB", "Decode tok/s (estimate)"], rows)
        + "\n\n" + md_table(["Offline budget", "Value"], [
            ["Knowledge packs", ", ".join(packs) if packs else "none selected"],
            ["Pack downloads (approx.)", f"{pack_gb:,.1f} GB"],
            [f"RAG vector index ({rag_index})", f"{index_gb:,.1f} GB for ~{chunks:,.0f} chunks"],
            ["Total storage incl. model", f"**{pack_gb + index_gb + model_gb:,.1f} GB** on {hw['storage_note']}"],
            [f"Runtime on {float(battery_wh):.0f} Wh battery at ~{hw['watts']:.0f} W", f"{hours:.1f} h of continuous inference"],
            ["Energy efficiency", f"{tokens_per_wh:,.0f} tokens per Wh" if best else "—"],
        ])
        + "\n\nDecode speed ≈ efficiency x memory bandwidth / model bytes: each new token reads every weight once. "
          "Bandwidths are spec-sheet peaks and pack sizes are approximate; check the current Kiwix catalogue."
    )
    return md


with gr.Blocks(title=TITLE, theme=THEME) as demo:
    render_header()
    with gr.Tabs():
        with gr.Tab("1 · Qwen3-0.6B & Sub-1B Quantization & KV-Cache Planner"):
            with gr.Row():
                with gr.Column(scale=1):
                    q_bpw = gr.Slider(2, 16, value=4.85, step=0.05, label="Bits per weight")
                    q_ctx = gr.Slider(512, 32768, value=8192, step=512, label="Context window (tokens)")
                    with gr.Row():
                        q_kv = gr.Dropdown(list(KV_BYTES), value="fp16 / bf16", label="KV cache type")
                        q_batch = gr.Slider(1, 8, value=1, step=1, label="Parallel sequences")
                    with gr.Row():
                        q_think = gr.Checkbox(value=True, label="Thinking mode")
                        q_emb = gr.Checkbox(value=False, label="Keep tied embeddings at 16-bit")
                    q_sys = gr.Textbox(label="System prompt", value="You are Homie, a fast, privacy-first local AI assistant.")
                    q_user = gr.Textbox(label="User message", value="Explain how 4-bit quantization lets a 0.6B model run on a phone.", lines=2)
                    q_btn = gr.Button("Plan memory & build prompt", variant="primary")
                with gr.Column(scale=1):
                    q_report = gr.Markdown()
            q_prompt = gr.Code(label="ChatML prompt (exact template text)", language="markdown")
            q_code = gr.Code(label="transformers / llama.cpp code", language="python")
            q_in = [q_bpw, q_ctx, q_kv, q_batch, q_think, q_emb, q_sys, q_user]
            q_btn.click(plan_memory, q_in, [q_report, q_prompt, q_code])
            demo.load(plan_memory, q_in, [q_report, q_prompt, q_code])

        with gr.Tab("2 · Air-Gapped Survival LLM & Hardware Tier Advisor"):
            with gr.Row():
                with gr.Column(scale=1):
                    s_hw = gr.Radio(list(HARDWARE), value="Raspberry Pi 5 (8 GB)", label="Hardware profile")
                    s_packs = gr.CheckboxGroup(list(PACKS), value=["Medical (WikiMed / MedlinePlus)", "Python Docs (python.org + devdocs)"], label="Offline knowledge packs")
                    with gr.Row():
                        s_bat = gr.Slider(10, 2000, value=100, step=10, label="Battery / power bank (Wh)")
                        s_bpw = gr.Slider(2, 8.5, value=4.85, step=0.05, label="Bits per weight")
                    with gr.Row():
                        s_index = gr.Radio(["int8 vectors", "float32 vectors"], value="int8 vectors", label="RAG index precision")
                        s_eff = gr.Slider(0.3, 0.9, value=0.6, step=0.05, label="Achieved share of peak bandwidth")
                    s_btn = gr.Button("Advise hardware tier", variant="primary")
                with gr.Column(scale=1):
                    s_out = gr.Markdown()
            s_in = [s_hw, s_packs, s_bat, s_bpw, s_index, s_eff]
            s_btn.click(survival_plan, s_in, s_out)
            demo.load(survival_plan, s_in, s_out)
'''

_APP_AGENT = r'''
DEFAULT_GOAL = "Find why the test suite fails on Python 3.11, patch the bug and confirm all tests pass."
DEFAULT_TOOLS = """search_code: Search the repository for text or symbols | query:string, path:string
read_file: Read a file from the workspace | path:string
run_pytest: Run the test suite and return failures | target:string
apply_patch: Apply a unified diff to the workspace | diff:string
ask_user: Ask the human a clarifying question | question:string"""
PHASES = [("search", "find", "list", "fetch", "lookup", "query"), ("read", "inspect", "open", "load", "get"),
          ("run", "test", "analy", "eval", "compute", "check"), ("apply", "write", "patch", "edit", "send", "create"),
          ("verify", "confirm", "validate")]
STOP = {"the", "a", "an", "and", "or", "to", "of", "on", "for", "in", "all", "why", "it", "is", "from", "with"}
ARG_HINTS = {"path": "tests/", "target": "tests/", "file": "tests/", "diff": "<unified diff from the previous step>",
             "question": "Which behaviour should I keep?", "url": "https://pymasters.net"}


def parse_tools(raw: str) -> list:
    tools = []
    for line in (raw or "").splitlines():
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        desc, _, params = rest.partition("|")
        props = {}
        for p in params.split(","):
            if ":" in p:
                pn, pt = p.split(":", 1)
                props[pn.strip()] = {"type": pt.strip() or "string"}
        name = re.sub(r"\W", "_", name.strip())
        if name:
            tools.append({"name": name, "description": desc.strip(), "params": props})
    return tools


def _words(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP}


def _phase(tool: dict) -> int:
    key = tool["name"].lower() + " " + tool["description"].lower()
    for i, verbs in enumerate(PHASES):
        if any(v in key for v in verbs):
            return i
    return 2


def run_agent(goal, tools_raw, gate, max_steps, on_low, fail_step):
    goal = (goal or "").strip() or DEFAULT_GOAL
    tools = parse_tools(tools_raw or DEFAULT_TOOLS)
    if not tools:
        return "Define at least one tool as `name: description | param:type`.", "{}", ""
    gate, max_steps, fail_step = float(gate), int(max_steps), int(fail_step)
    gw = _words(goal)
    usable = [t for t in tools if t["name"] != "ask_user"] or tools
    for t in usable:
        t["relevance"] = len(gw & _words(t["name"].replace("_", " ") + " " + t["description"])) / max(1, len(gw)) ** 0.5
    plan = sorted(usable, key=lambda t: (_phase(t), -t["relevance"]))
    trace = [f"### Plan-Act-Observe trace\n**Goal:** {goal}\n\n**Plan:** " + " -> ".join(f"`{t['name']}`" for t in plan), ""]
    keywords = " ".join(w for w in re.findall(r"[A-Za-z0-9.]+", goal) if w.lower() not in STOP)[:60]
    events, step, i, retried = [], 0, 0, set()
    while i < len(plan) and step < max_steps:
        step += 1
        tool = plan[i]
        args = {p: (ARG_HINTS.get(p, keywords) if spec["type"] == "string" else 1) for p, spec in tool["params"].items()}
        # reflection rewrites the arguments with what the failed attempt revealed, so a retry is more confident
        conf = round(min(0.99, 0.62 + 0.3 * tool["relevance"] + 0.04 * i + (0.2 if tool["name"] in retried else 0.0)), 2)
        failed = step == fail_step
        if failed:
            conf = round(conf * 0.5, 2)
        obs = (f"error: {tool['name']} returned no useful result" if failed else
               {0: "3 matching locations found", 1: "file contents loaded (212 lines)", 2: "1 failing test isolated",
                3: "patch applied cleanly", 4: "all checks green"}[_phase(tool)])
        trace += [f"**Step {step} · PLAN** — use `{tool['name']}` ({tool['description'] or 'no description'}).",
                  f"- **ACT** `{tool['name']}({json.dumps(args)})`",
                  f"- **OBSERVE** {obs} · confidence `{conf:.2f}` vs gate `{gate:.2f}`"]
        events.append({"step": step, "tool": tool["name"], "args": args, "observation": obs, "confidence": conf})
        if conf >= gate:
            trace.append("- **GATE** pass -> next sub-goal")
            i += 1
        elif on_low == "Reflect & retry" and tool["name"] not in retried:
            retried.add(tool["name"])
            trace.append("- **GATE** below threshold -> reflect: rewrite the arguments and retry the same tool")
        elif on_low == "Ask the user" and any(t["name"] == "ask_user" for t in tools):
            step += 1
            trace.append(f"**Step {step} · ACT** `ask_user({json.dumps({'question': 'Low confidence after ' + tool['name'] + ': how should I proceed?'})})` -> waiting for the human")
            events.append({"step": step, "tool": "ask_user", "confidence": None})
            break
        else:
            trace.append("- **GATE** below threshold -> abort safely and report what was tried")
            break
    done = i >= len(plan)
    trace.append(f"\n**Result:** {'goal reached' if done else 'stopped before the goal'} in {step} step(s) of a {max_steps}-step budget.")
    schema = [{"name": t["name"], "description": t["description"],
               "input_schema": {"type": "object", "properties": t["params"], "required": list(t["params"])}} for t in tools]
    code = _dispatcher_code(tools, gate, max_steps)
    return "\n".join(trace), json.dumps({"tools": schema, "trace": events}, indent=2), code


PY_TYPES = {"string": "str", "integer": "int", "number": "float", "boolean": "bool", "array": "list", "object": "dict"}


def _dispatcher_code(tools, gate, max_steps) -> str:
    lines = [
        "import json",
        "",
        "TOOLS = {}",
        "",
        "",
        "def tool(schema):",
        "    def register(fn):",
        "        TOOLS[fn.__name__] = {'fn': fn, 'schema': schema}",
        "        return fn",
        "    return register",
        "",
        "",
        "def validate(args, schema):",
        "    py = {'string': str, 'integer': int, 'number': (int, float), 'boolean': bool, 'array': list, 'object': dict}",
        "    for name in schema.get('required', []):",
        "        if name not in args:",
        "            raise ValueError(f'missing argument {name!r}')",
        "    for name, value in args.items():",
        "        spec = schema['properties'].get(name)",
        "        if spec is None:",
        "            raise ValueError(f'unknown argument {name!r}')",
        "        if not isinstance(value, py[spec['type']]):",
        "            raise TypeError(f'{name} must be {spec[\"type\"]}')",
        "",
        "",
    ]
    for t in tools:
        params = ", ".join(f"{p}: {PY_TYPES.get(s['type'], 'object')}" for p, s in t["params"].items())
        schema = {"type": "object", "properties": t["params"], "required": list(t["params"])}
        lines += [f"@tool({json.dumps(schema)})", f"def {t['name']}({params}) -> dict:",
                  f"    \"\"\"{t['description'] or t['name']}\"\"\"",
                  f"    return {{'ok': True, 'tool': {t['name']!r}, 'confidence': 0.9}}", "", ""]
    lines += [
        "def dispatch(call: dict) -> dict:",
        "    entry = TOOLS.get(call['name'])",
        "    if entry is None:",
        "        return {'ok': False, 'error': f\"unknown tool {call['name']}\", 'confidence': 0.0}",
        "    try:",
        "        validate(call['arguments'], entry['schema'])",
        "        return entry['fn'](**call['arguments'])",
        "    except (TypeError, ValueError) as exc:",
        "        return {'ok': False, 'error': str(exc), 'confidence': 0.0}",
        "",
        "",
        f"def run(plan: list, gate: float = {gate:.2f}, max_steps: int = {max_steps}) -> list:",
        "    trace = []",
        "    for step, call in enumerate(plan[:max_steps], 1):",
        "        result = dispatch(call)                       # ACT",
        "        trace.append({'step': step, 'call': call, 'result': result})  # OBSERVE",
        "        if result.get('confidence', 0.0) < gate:      # confidence gate",
        "            trace.append({'step': step, 'action': 'escalate'})",
        "            break",
        "    return trace",
        "",
        "",
        "if __name__ == '__main__':",
        f"    plan = [{{'name': n, 'arguments': {{}}}} for n in {[t['name'] for t in tools]!r}]",
        "    print(json.dumps(run(plan), indent=2))",
    ]
    return "\n".join(lines) + "\n"


DEFAULT_TURNS = """User prefers concise, type-annotated Python 3.11 examples.
Asked about today's weather in Chennai.
Project constraint: all inference must stay under 4 GB of VRAM.
Fixed a typo in variable name foo_bar.
Building an offline RAG pipeline with SQLite-vec and BGE-small embeddings.
Small talk about cricket scores.
Reminder: the RAG pipeline must stay offline, no cloud APIs.
User's daughter is in Class 8 and is learning Python loops.
Asked to rename a CSS class.
Decided to use Qwen3-0.6B as the local model because of the 4 GB VRAM constraint."""
SALIENT = ("prefer", "constraint", "must", "decided", "always", "never", "pipeline", "deadline", "allerg", "learning", "goal")


def memory_scores(turns: list, decay: float, salience_w: float, rehearsal_w: float) -> list:
    n = len(turns)
    words = [_words(t) for t in turns]
    out = []
    for idx, text in enumerate(turns):
        age = n - 1 - idx
        sal = 1.0 + (salience_w if any(k in text.lower() for k in SALIENT) else 0.0)
        rehearsals = sum(1 for later in words[idx + 1:] if len(words[idx] & later) >= 2)
        stability = sal * (1.0 + rehearsal_w * rehearsals) / max(0.01, decay)
        out.append({"turn": idx + 1, "text": text, "age": age, "salience": sal, "rehearsals": rehearsals,
                    "stability": stability, "retention": math.exp(-age / stability)})
    return out


def simulate_memory(turns_raw, decay, salience_w, rehearsal_w, budget, forget_below):
    turns = [t.strip() for t in (turns_raw or DEFAULT_TURNS).splitlines() if t.strip()]
    scored = memory_scores(turns, float(decay), float(salience_w), float(rehearsal_w))
    keep = {s["turn"] for s in sorted(scored, key=lambda s: -s["retention"])[:int(budget)]}
    rows = []
    for s in scored:
        action = ("KEEP in working memory" if s["turn"] in keep else
                  "SUMMARISE to long-term" if s["retention"] >= float(forget_below) else "FORGET")
        rows.append([s["turn"], s["text"], s["age"], f"{s['salience']:.2f}", s["rehearsals"], f"{s['stability']:.1f}",
                     f"{s['retention']:.3f}", action])
    table = pd.DataFrame(rows, columns=["Turn", "Memory", "Age (turns)", "Salience", "Rehearsals", "Stability S", "Retention R", "Action"])
    bench = []
    for name, n_turns, n_facts in (("LOCOMO-style long multi-session chat", 300, 40), ("MultiWOZ-style task dialogue", 14, 6)):
        facts = []
        for f in range(n_facts):
            age = int((f + 0.5) * n_turns / n_facts)
            important = f % 3 == 0
            sal = 1.0 + (float(salience_w) if important else 0.0)
            stab = sal * (1.0 + float(rehearsal_w) * (2 if important else 0)) / max(0.01, float(decay))
            facts.append(math.exp(-age / stab))
        ranked = sorted(facts, reverse=True)
        for b in (4, 8, 16):
            verbatim = min(b, n_facts)
            recoverable = sum(1 for r in ranked[verbatim:] if r >= float(forget_below))
            lost = n_facts - verbatim - recoverable
            bench.append([name, b, f"{verbatim}/{n_facts}", f"{recoverable}/{n_facts}", f"{lost}/{n_facts}",
                          f"{(verbatim + recoverable) / n_facts:.0%}"])
    bench_md = ("#### Synthetic retention probes (simulation of this policy, not published benchmark results)\n"
                + md_table(["Probe set", "Working-memory budget", "Held verbatim", "Recoverable from summaries", "Lost", "Answerable"], bench)
                + "\n\nProbe facts are spread evenly over each conversation; every third fact is salient and rehearsed twice. "
                  "Long LOCOMO-style histories need summarisation, because no small budget holds them verbatim.")
    code = (
        "import math\nfrom dataclasses import dataclass, field\n\n\n"
        "SALIENT = " + repr(SALIENT) + "\n\n\n"
        "@dataclass\nclass Memory:\n    text: str\n    turn: int\n    rehearsals: int = 0\n\n"
        f"    def stability(self, decay: float = {float(decay):.2f}) -> float:\n"
        f"        salience = 1.0 + ({float(salience_w):.2f} if any(k in self.text.lower() for k in SALIENT) else 0.0)\n"
        f"        return salience * (1.0 + {float(rehearsal_w):.2f} * self.rehearsals) / decay\n\n"
        "    def retention(self, now: int) -> float:\n"
        "        return math.exp(-(now - self.turn) / self.stability())   # Ebbinghaus: R = e^(-t/S)\n\n\n"
        f"def prune(memories: list, now: int, budget: int = {int(budget)}, forget_below: float = {float(forget_below):.2f}):\n"
        "    ranked = sorted(memories, key=lambda m: m.retention(now), reverse=True)\n"
        "    working = ranked[:budget]\n"
        "    summarise = [m for m in ranked[budget:] if m.retention(now) >= forget_below]\n"
        "    forgotten = [m for m in ranked[budget:] if m.retention(now) < forget_below]\n"
        "    return working, summarise, forgotten\n"
    )
    kept_n = sum(1 for r in rows if r[-1].startswith("KEEP"))
    summary = (f"**{kept_n}** kept · **{sum(1 for r in rows if r[-1].startswith('SUMMARISE'))}** summarised · "
               f"**{sum(1 for r in rows if r[-1] == 'FORGET')}** forgotten. Salient, rehearsed facts (constraints, "
               "preferences, decisions) survive; one-off small talk fades first.")
    return summary, table, bench_md, code


with gr.Blocks(title=TITLE, theme=THEME) as demo:
    render_header()
    with gr.Tabs():
        with gr.Tab("1 · Plan-Act-Observe Loop & Tool Dispatcher Sandbox"):
            with gr.Row():
                with gr.Column(scale=1):
                    a_goal = gr.Textbox(label="Goal", value=DEFAULT_GOAL, lines=2)
                    a_tools = gr.Textbox(label="Tool registry (name: description | param:type, ...)", value=DEFAULT_TOOLS, lines=6)
                    with gr.Row():
                        a_gate = gr.Slider(0.0, 1.0, value=0.6, step=0.05, label="Confidence gate")
                        a_steps = gr.Slider(1, 12, value=6, step=1, label="Max steps")
                    with gr.Row():
                        a_low = gr.Radio(["Reflect & retry", "Ask the user", "Abort"], value="Reflect & retry", label="When confidence is low")
                        a_fail = gr.Slider(0, 12, value=2, step=1, label="Inject a tool failure at step (0 = none)")
                    a_btn = gr.Button("Run agent loop", variant="primary")
                with gr.Column(scale=1):
                    a_trace = gr.Markdown()
            with gr.Row():
                a_json = gr.Code(label="Tool JSON Schemas + structured trace", language="json")
                a_code = gr.Code(label="Python dispatcher (registry, validation, gated loop)", language="python")
            a_in = [a_goal, a_tools, a_gate, a_steps, a_low, a_fail]
            a_btn.click(run_agent, a_in, [a_trace, a_json, a_code])
            demo.load(run_agent, a_in, [a_trace, a_json, a_code])

        with gr.Tab("2 · Agent Memory & Ebbinghaus Forgetting Simulator"):
            with gr.Row():
                with gr.Column(scale=1):
                    m_turns = gr.Textbox(label="Conversation turn log (one memory per line, oldest first)", value=DEFAULT_TURNS, lines=10)
                    with gr.Row():
                        m_decay = gr.Slider(0.05, 2.0, value=0.35, step=0.05, label="Decay rate")
                        m_sal = gr.Slider(0.0, 5.0, value=2.0, step=0.25, label="Salience weight")
                    with gr.Row():
                        m_reh = gr.Slider(0.0, 3.0, value=1.0, step=0.25, label="Rehearsal boost")
                        m_budget = gr.Slider(1, 20, value=4, step=1, label="Working-memory budget (entries)")
                        m_forget = gr.Slider(0.0, 0.9, value=0.2, step=0.05, label="Forget below retention")
                    m_btn = gr.Button("Simulate memory", variant="primary")
                with gr.Column(scale=1):
                    m_summary = gr.Markdown()
                    m_bench = gr.Markdown()
            m_table = gr.Dataframe(label="Memory ledger", wrap=True)
            m_code = gr.Code(label="Python memory pruning code", language="python")
            m_in = [m_turns, m_decay, m_sal, m_reh, m_budget, m_forget]
            m_btn.click(simulate_memory, m_in, [m_summary, m_table, m_bench, m_code])
            demo.load(simulate_memory, m_in, [m_summary, m_table, m_bench, m_code])
'''

_APP_LESSON = r'''"""PyMasters AI Lesson Studio — generate complete pymasters.net lessons for any Python / AI topic.

Runs on Hugging Face CPU Basic with no paid keys: a deterministic curriculum synthesizer builds every graded artifact
(example, challenges, harnesses, solutions) from hand-verified mechanism archetypes and checks them with the same
grading rules as pymasters.net. If HF_TOKEN is set, a Hugging Face InferenceClient can optionally rewrite the story.
"""

import ast
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from datetime import date

import gradio as gr

PYMASTERS_URL = "https://pymasters.net"
HOMIE_URL = "https://heyhomie.app"
TITLE = __TITLE__
HF_TOKEN = os.environ.pop("HF_TOKEN", "") or os.environ.pop("HUGGINGFACEHUB_API_TOKEN", "")
LLM_MODEL = os.environ.get("LESSON_LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")

TRACKS = ["ai_engineering", "python_fundamentals", "python_intermediate", "python_internals", "deep_learning",
          "machine_learning", "dsa", "ai_agents", "testing_devops"]
DIFFICULTIES = ["beginner", "intermediate", "advanced"]
XP = {"beginner": 50, "intermediate": 75, "advanced": 100}
MINUTES = {"beginner": 20, "intermediate": 25, "advanced": 35}

# ----------------------------------------------------------------------------------------------------------------
# validate_under_the_hood — same rules as backend/vaathiyaar/topic_uth.py on pymasters.net
# ----------------------------------------------------------------------------------------------------------------
CONSUMES = {
    "VariableBox": ["variable", "values", "value", "animate_sequence", "label", "data_type", "dataType", "variables", "boxes"],
    "TerminalOutput": ["output", "lines"],
    "FlowArrow": ["label", "branch", "direction", "stages", "steps", "nodes", "flows", "from", "to"],
    "DataStructure": ["structure", "data", "operations", "structure_type", "highlight_cells", "highlight", "highlight_color",
                      "highlightColor", "initial_state", "items", "labels", "label", "animations", "pending_append"],
    "MemoryStack": ["frames", "slots", "operations"],
    "ComparisonPanel": ["before", "after", "left", "right", "left_label", "right_label", "left_content", "right_content",
                        "items", "models", "comparisons", "x_labels"],
    "ConceptMap": ["nodes", "edges"],
    "FlowDiagram": ["nodes", "edges", "executionPath", "variables"],
    "NeuralNetworkVisualizer": ["layers", "labels", "activations"],
    "AlgorithmVisualizer": ["algorithm", "data", "target"],
    "TreeVisualizer": ["data", "operations", "operationArgs"],
    "CodeStepper": ["code", "steps", "highlightSequence", "stepDescriptions"],
}
CAPTION_KEYS = {"title", "description", "caption"}


def _text(v, path, lo, hi, errs):
    if isinstance(v, dict):
        en = v.get("en")
        if not isinstance(en, str):
            errs.append(f"{path}: localized object needs an 'en' string")
            return
        v = en
    if not isinstance(v, str) or not v.strip():
        errs.append(f"{path}: missing text")
        return
    n = len(v.strip())
    if n < lo or n > hi:
        errs.append(f"{path}: {n} chars (want {lo}-{hi})")
    if "TODO" in v or "lorem" in v.lower():
        errs.append(f"{path}: placeholder text")


def validate_under_the_hood(obj) -> list:
    errs = []
    if not isinstance(obj, dict):
        return ["under_the_hood must be an object"]
    unknown = set(obj) - {"summary", "steps", "takeaway"}
    if unknown:
        errs.append(f"unknown keys {sorted(unknown)}")
    _text(obj.get("summary"), "summary", 40, 280, errs)
    _text(obj.get("takeaway"), "takeaway", 30, 400, errs)
    steps = obj.get("steps")
    if not isinstance(steps, list) or not 4 <= len(steps) <= 7:
        errs.append("steps: need 4-7 steps")
        return errs
    visuals = 0
    for i, st in enumerate(steps):
        p = f"steps[{i}]"
        if not isinstance(st, dict):
            errs.append(f"{p}: must be an object")
            continue
        extra = set(st) - {"title", "body", "visual"}
        if extra:
            errs.append(f"{p}: unknown keys {sorted(extra)}")
        _text(st.get("title"), f"{p}.title", 3, 80, errs)
        _text(st.get("body"), f"{p}.body", 60, 600, errs)
        vis = st.get("visual")
        if vis is None:
            continue
        visuals += 1
        if not isinstance(vis, dict) or vis.get("type") not in CONSUMES or not isinstance(vis.get("props"), dict):
            errs.append(f"{p}.visual: needs type in {sorted(CONSUMES)} and a props object")
            continue
        bad = set(vis["props"]) - set(CONSUMES[vis["type"]]) - CAPTION_KEYS
        if bad:
            errs.append(f"{p}.visual: {vis['type']} does not use props {sorted(bad)}")
        if not vis["props"]:
            errs.append(f"{p}.visual: empty props")
    if visuals < 2:
        errs.append(f"need at least 2 steps with a visual (have {visuals})")
    return errs


# ----------------------------------------------------------------------------------------------------------------
# Sandbox + grading — mirrors backend/vaathiyaar/grading.py (harness mode with an end marker, vacuous-harness probe,
# expected_output matching with <placeholder> wildcards)
# ----------------------------------------------------------------------------------------------------------------
BLOCKED_MODULES = {"os", "sys", "subprocess", "socket", "shutil", "ctypes", "pathlib", "importlib", "builtins",
                   "multiprocessing", "signal", "pty", "urllib", "http", "requests", "httpx", "ftplib", "smtplib",
                   "webbrowser", "pickle", "marshal", "resource", "gc", "inspect", "code", "codeop", "io", "tempfile",
                   "glob", "fcntl", "posix", "mmap", "sqlite3", "zipimport", "runpy", "threading", "_thread"}
BLOCKED_CALLS = {"open", "eval", "exec", "compile", "__import__", "globals", "locals", "vars", "getattr", "setattr",
                 "delattr", "input", "breakpoint", "help", "memoryview"}
ALLOWED_DUNDERS = {"__name__", "__doc__", "__init__", "__qualname__"}
_OUTPUT_PLACEHOLDER = re.compile(r"<[a-z_]+>")


def safety_gate(code: str) -> str:
    """Return an error message when the code uses something the public sandbox does not allow, else ''."""
    try:
        tree = ast.parse(code or "")
    except SyntaxError as exc:
        return f"SyntaxError: {exc.msg} (line {exc.lineno})"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in BLOCKED_MODULES:
                    return f"import {alias.name} is not available in this sandbox"
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] in BLOCKED_MODULES:
                return f"from {node.module} import ... is not available in this sandbox"
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in BLOCKED_CALLS:
            return f"{node.func.id}() is not available in this sandbox"
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr not in ALLOWED_DUNDERS:
            return f"attribute {node.attr} is not available in this sandbox"
        elif isinstance(node, ast.Name) and node.id.startswith("__") and node.id not in ALLOWED_DUNDERS:
            return f"name {node.id} is not available in this sandbox"
    return ""


# The child sets its own CPU / memory / file-size limits before running the code (no preexec_fn: Gradio handlers run
# in threads, where preexec_fn is unsafe). Code arrives on stdin and is compiled as "<lesson>" so line numbers match.
RUNNER = (
    "import resource as r, sys\n"
    "for k, v in ((r.RLIMIT_CPU, 5), (r.RLIMIT_AS, 512 * 1024 ** 2), (r.RLIMIT_FSIZE, 1024 ** 2)):\n"
    "    try:\n        r.setrlimit(k, (v, v))\n    except Exception:\n        pass\n"
    "del r, k, v\n"
    "exec(compile(sys.stdin.read(), '<lesson>', 'exec'), {'__name__': '__main__'})\n"
)


def run_python(code: str, timeout: int = 10) -> dict:
    """Run code in an isolated interpreter (-I, empty env, temp cwd, CPU/memory/file limits)."""
    with tempfile.TemporaryDirectory() as tmp:
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-c", RUNNER], input=code, cwd=tmp, capture_output=True, text=True,
                timeout=timeout, env={"PATH": "/usr/bin:/bin", "PYTHONIOENCODING": "utf-8", "HOME": tmp},
            )
            return {"output": proc.stdout[-20000:], "error": proc.stderr[-5000:], "exit_code": proc.returncode}
        except subprocess.TimeoutExpired:
            return {"output": "", "error": f"Timed out after {timeout} s", "exit_code": -1}


def output_matches(actual: str, expected: str) -> bool:
    a, e = (actual or "").strip(), (expected or "").strip()
    if a == e:
        return True
    if not _OUTPUT_PLACEHOLDER.search(e):
        return False
    pattern = ".+?".join(re.escape(p) for p in _OUTPUT_PLACEHOLDER.split(e))
    return re.fullmatch(pattern, a, re.DOTALL) is not None


_VACUOUS = {}


def harness_is_vacuous(test_code: str):
    """True: harness passes with no learner code (proves nothing). False: it needs the learner. None: inconclusive
    (never cached). Cached per harness like backend/vaathiyaar/grading.py."""
    if test_code not in _VACUOUS:
        res = run_python(test_code)
        if res["exit_code"] == 0:
            _VACUOUS[test_code] = True
        elif "Traceback (most recent call last)" in (res["error"] or ""):
            _VACUOUS[test_code] = False
        else:
            return None
    return _VACUOUS[test_code]


def grade_submission(student_code: str, expected_output: str, test_code: str = "") -> dict:
    harness = test_code if isinstance(test_code, str) and test_code.strip() else None
    mode = "harness"
    if harness:
        verdict = harness_is_vacuous(harness)
        if verdict is None:
            return {"success": False, "output": "", "error": "The code runner is busy. Try again.", "mode": "inconclusive"}
        if verdict:
            harness, mode = None, "expected_output (harness ignored: it passes on its own)"
    if harness:
        marker = f"__pm_checked_{secrets.token_hex(16)}__"
        res = run_python(student_code + "\n\n" + harness + f"\nprint({marker!r}, flush=True)\n")
        raw = res["output"] or ""
        finished = marker in raw
        output = raw.replace(marker + "\n", "").replace(marker, "")
        success = res["exit_code"] == 0 and finished
        error = "" if success else (res["error"] or "Your program stopped before the checks could run. Remove exit() and run it again.")
        return {"success": success, "output": output, "error": error, "mode": mode}
    res = run_python(student_code)
    success = res["exit_code"] == 0 and output_matches(res["output"], expected_output)
    return {"success": success, "output": res["output"], "error": res["error"] if res["exit_code"] else "",
            "mode": "expected_output" if mode == "harness" else mode}


# ----------------------------------------------------------------------------------------------------------------
# Mechanism archetypes. Each one is hand-verified: its example runs, every solution passes its harness, and every
# harness fails without the learner's code. {T} in prose is replaced by the learner's topic.
# ----------------------------------------------------------------------------------------------------------------
def _flow(nodes, edges, path, title):
    return {"type": "FlowDiagram", "props": {
        "nodes": [{"id": n[0], "label": n[1], **({"type": n[2]} if len(n) > 2 else {})} for n in nodes],
        "edges": [{"from": e[0], "to": e[1], **({"label": e[2]} if len(e) > 2 else {})} for e in edges],
        "executionPath": path, "title": title}}


def _ds(data, highlight, label):
    return {"type": "DataStructure", "props": {"structure": "list", "data": data, "highlight": highlight, "label": label}}


def _cmp(left_label, left_code, right_label, right_code):
    return {"type": "ComparisonPanel", "props": {"left": {"label": left_label, "code": left_code},
                                                 "right": {"label": right_label, "code": right_code}}}


ARCHETYPES = {}


def archetype(key, keywords, module):
    def register(fn):
        ARCHETYPES[key] = {"build": fn, "keywords": keywords, "module": module}
        return fn
    return register


@archetype("attention", ("attention", "flash", "tiling", "tiled", "softmax", "transformer", "kv cache", "kv-cache"), "llm_internals")
def _attention():
    return {
        "mechanism": "tiled attention with an online softmax",
        "hook": "Attention Without the Giant Matrix",
        "analogy": ("Imagine finding the class topper among 10,000 exam papers when your desk holds only 64 at a time. "
                    "You never need every paper on the desk: you keep a running best score and a running total and update "
                    "them as each stack arrives. {T} uses the same trick for attention — it streams keys and values through "
                    "fast memory in tiles and never builds the full score matrix."),
        "why": ["Plain attention stores an N x N score matrix, so memory grows with the square of the sequence length.",
                "On GPUs, moving data between slow HBM and fast on-chip SRAM costs more time than the arithmetic.",
                "An online softmax gives exactly the same answer as the full softmax, one tile at a time."],
        "compare": ("Naive attention", "Tiled online softmax", [
            ("Score storage", "full N x N matrix", "one tile at a time"),
            ("Softmax statistics", "computed over the whole row", "running max + running denominator"),
            ("Result", "exact", "exact (same numbers)"),
            ("Bottleneck", "reading/writing the score matrix", "streaming K and V once")]),
        "insight": "Rescaling by exp(old_max - new_max) merges softmax statistics across tiles, so the whole row never has to be in memory and the answer stays exact.",
        "example": """import math

scores = [2.0, 1.0, 0.5, 3.0, 1.5, 0.0]
tile = 2
m, l = float("-inf"), 0.0
for start in range(0, len(scores), tile):
    block = scores[start:start + tile]
    new_m = max(m, max(block))
    l = l * math.exp(m - new_m) + sum(math.exp(s - new_m) for s in block)
    m = new_m
    print(f"after tile {start // tile}: max={m}, denominator={l:.4f}")

full = sum(math.exp(s - max(scores)) for s in scores)
print("full-row denominator:", round(full, 4))
print("online == full:", abs(full - l) < 1e-12)
""",
        "summary": "{T} computes exact attention without the full score matrix: it streams key/value tiles and keeps a running max, a running softmax denominator and a running weighted sum, rescaling them whenever a tile brings a larger score.",
        "steps": [
            ("Scores are one row per query",
             "For one query, attention scores every key (q · k / sqrt(d)), applies softmax to turn the row into weights, and returns the weighted sum of the value vectors. Done naively, the whole row — and for all queries an N x N matrix — sits in memory before softmax runs.",
             _ds([2.0, 1.0, 0.5, 3.0, 1.5, 0.0], [3], "scores for one query; the maximum is at index 3")),
            ("Split the row into tiles",
             "{T} loads keys and values in tiles small enough for fast on-chip SRAM. With tile size 2, the six scores above arrive as three tiles. Each tile is loaded once, used and discarded, so memory no longer grows with N x N.",
             _ds(["[2.0, 1.0]", "[0.5, 3.0]", "[1.5, 0.0]"], [1], "three tiles of size 2; tile 1 brings a new maximum")),
            ("Keep three running numbers",
             "Per query you keep m (the largest score so far), l (the sum of exp(score - m)) and acc (the sum of exp(score - m) times each value). Subtracting m keeps exp() from overflowing, exactly like a numerically stable softmax.",
             None),
            ("Rescale when the maximum changes",
             "When a tile holds a score larger than m, the old l and acc were computed against the wrong maximum. Multiplying both by exp(m_old - m_new) corrects them in one step, then the tile's own terms are added. This merge rule is what makes the online softmax exact.",
             _flow([("load", "load next K/V tile", "start"), ("max", "tile max > m?", "decision"), ("rescale", "l, acc *= exp(m_old - m_new)"),
                    ("add", "add exp(s - m) terms of the tile"), ("more", "more tiles?", "decision"), ("out", "output = acc / l", "end")],
                   [("load", "max"), ("max", "rescale", "yes"), ("max", "add", "no"), ("rescale", "add"), ("add", "more"),
                    ("more", "load", "yes"), ("more", "out", "no")],
                   ["load", "max", "rescale", "add", "more", "out"], "One pass of the online softmax")),
            ("Divide once at the end",
             "After the last tile, output = acc / l, which equals softmax(scores) · values to floating-point precision. The backward pass recomputes tiles instead of storing the matrix, so {T} trades a little extra arithmetic for far less memory traffic.",
             _cmp("Naive", "S = Q @ K.T        # N x N in memory\nP = softmax(S)\nO = P @ V",
                  "Tiled", "for K_t, V_t in tiles:\n    update m, l, acc\nO = acc / l")),
        ],
        "takeaway": "Tiling plus an online softmax turns attention from a memory-bound N x N problem into a streaming one with the exact same result. When data does not fit, keep running statistics and rescale them.",
        "concepts": ["softmax", "numerical_stability", "tiling", "attention"],
        "required": ["lists", "loops", "functions"],
        "challenges": [
            {"instruction": "Write a numerically stable `softmax(scores)` that returns a list of probabilities. Subtract the largest score before calling `math.exp` so huge scores like 1000.0 do not overflow. The demo prints the rounded probabilities of [1.0, 2.0, 3.0] (expected: `[0.09, 0.245, 0.665]`).",
             "starter": "import math\n\ndef softmax(scores):\n    # subtract max(scores) from every score, exponentiate, then divide by the total\n    return []\n\nprint([round(p, 3) for p in softmax([1.0, 2.0, 3.0])])\n",
             "solution": "import math\n\ndef softmax(scores):\n    top = max(scores)\n    exps = [math.exp(s - top) for s in scores]\n    total = sum(exps)\n    return [e / total for e in exps]\n\nprint([round(p, 3) for p in softmax([1.0, 2.0, 3.0])])\n",
             "test_code": "_p = softmax([1.0, 2.0, 3.0])\nassert len(_p) == 3, 'return one probability per score'\nassert abs(sum(_p) - 1.0) < 1e-9, 'probabilities must sum to 1'\nassert softmax([0.0, 0.0]) == [0.5, 0.5], 'equal scores give equal weights'\n_big = softmax([1000.0, 1000.0, 999.0])\nassert abs(sum(_big) - 1.0) < 1e-9 and _big[0] == _big[1], 'subtract the max so large scores do not overflow'\n",
             "expected": "[0.09, 0.245, 0.665]",
             "hints": ["Find top = max(scores) first.", "Compute exps = [math.exp(s - top) for s in scores]; the largest becomes exp(0) = 1.", "Divide every exp by sum(exps) so the results add up to 1."]},
            {"instruction": "Implement `tiled_attention(scores, values, tile)` with an online softmax: walk the scores in tiles, keep a running max `m`, denominator `l` and weighted sum `acc`, rescale `l` and `acc` by `math.exp(m_old - m_new)` when the max grows, and return `acc / l`. It must equal the full softmax-weighted average for every tile size. The demo prints `round(tiled_attention([2.0, 1.0, 0.5, 3.0], [10.0, 20.0, 30.0, 40.0], 2), 4)` (expected: `30.8131`).",
             "starter": "import math\n\ndef tiled_attention(scores, values, tile):\n    m, l, acc = float('-inf'), 0.0, 0.0\n    for start in range(0, len(scores), tile):\n        s_blk = scores[start:start + tile]\n        v_blk = values[start:start + tile]\n        # update m, rescale l and acc, then add this tile's terms\n    return 0.0\n\nprint(round(tiled_attention([2.0, 1.0, 0.5, 3.0], [10.0, 20.0, 30.0, 40.0], 2), 4))\n",
             "solution": "import math\n\ndef tiled_attention(scores, values, tile):\n    m, l, acc = float('-inf'), 0.0, 0.0\n    for start in range(0, len(scores), tile):\n        s_blk = scores[start:start + tile]\n        v_blk = values[start:start + tile]\n        new_m = max(m, max(s_blk))\n        scale = math.exp(m - new_m)\n        l = l * scale + sum(math.exp(s - new_m) for s in s_blk)\n        acc = acc * scale + sum(math.exp(s - new_m) * v for s, v in zip(s_blk, v_blk))\n        m = new_m\n    return acc / l\n\nprint(round(tiled_attention([2.0, 1.0, 0.5, 3.0], [10.0, 20.0, 30.0, 40.0], 2), 4))\n",
             "test_code": "import math as _math\n_s = [2.0, 1.0, 0.5, 3.0, 1.5, 0.0]\n_v = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0]\n_w = [_math.exp(x - max(_s)) for x in _s]\n_ref = sum(w * v for w, v in zip(_w, _v)) / sum(_w)\nfor _t in (1, 2, 3, 6):\n    _got = tiled_attention(_s, _v, _t)\n    assert abs(_got - _ref) < 1e-9, f'tile={_t}: got {_got}, expected {_ref}'\n_e = _math.e\nassert abs(tiled_attention([1000.0, 1001.0], [1.0, 2.0], 1) - (1 + 2 * _e) / (1 + _e)) < 1e-9, 'rescale by the running max so large scores do not overflow'\n",
             "expected": "30.8131",
             "hints": ["new_m = max(m, max(s_blk)); exp(float('-inf')) is 0.0, so the first tile works too.", "Rescale first: l *= exp(m - new_m) and acc *= exp(m - new_m), then add the tile's exp(s - new_m) and exp(s - new_m) * v terms.", "Set m = new_m at the end of each tile and return acc / l."]},
        ],
        "quiz": [
            ("Why does a stable softmax subtract the maximum score before exp()?", "நிலையான softmax ஏன் exp()-க்கு முன் அதிகபட்ச score-ஐக் கழிக்கிறது?",
             ["To make the output sum to 2", "To stop exp() from overflowing on large scores", "To sort the scores", "To skip the division"],
             ["Output கூட்டுத்தொகை 2 ஆக", "பெரிய score-களில் exp() overflow ஆகாமல் தடுக்க", "Score-களை வரிசைப்படுத்த", "வகுத்தலைத் தவிர்க்க"], 1),
            ("Which values does the online softmax keep per query while it streams tiles?", "Tile-களை stream செய்யும்போது online softmax ஒவ்வொரு query-க்கும் எந்த மதிப்புகளை வைத்திருக்கிறது?",
             ["The whole N x N matrix", "Only the last tile", "A running max, a running denominator and a running weighted sum", "Nothing until the end"],
             ["முழு N x N matrix", "கடைசி tile மட்டும்", "Running max, running denominator, running weighted sum", "இறுதி வரை எதுவும் இல்லை"], 2),
            ("What does print(softmax([0.0, 0.0])) show?", "print(softmax([0.0, 0.0])) என்ன காட்டும்?",
             ["[0.0, 0.0]", "[1.0, 1.0]", "[0.5, 0.5]", "ZeroDivisionError"], ["[0.0, 0.0]", "[1.0, 1.0]", "[0.5, 0.5]", "ZeroDivisionError"], 2),
            ("Why is tiled attention faster on GPUs even though it does slightly more arithmetic?", "Tiled attention சற்று அதிகக் கணக்கீடு செய்தாலும் GPU-வில் ஏன் வேகமாக உள்ளது?",
             ["It skips half the keys", "It moves far less data between slow memory and fast on-chip memory", "It uses integers only", "It approximates the softmax"],
             ["பாதி key-களைத் தவிர்க்கிறது", "மெதுவான memory-க்கும் வேகமான on-chip memory-க்கும் இடையே மிகக் குறைந்த data-வை நகர்த்துகிறது", "Integer-களை மட்டும் பயன்படுத்துகிறது", "Softmax-ஐ தோராயமாகக் கணக்கிடுகிறது"], 1),
        ],
    }


@archetype("lowrank", ("lora", "low-rank", "low rank", "adapter", "fine-tun", "finetun", "peft", "qlora"), "fine_tuning")
def _lowrank():
    return {
        "mechanism": "low-rank adapters on frozen weights",
        "hook": "Teach a Big Model with Tiny Matrices",
        "analogy": ("A textbook is already printed — reprinting all 1,000 pages to fix a few ideas would be wasteful. "
                    "Instead the teacher hands out a thin sheet of sticky notes that sit on top of the pages. {T} works the "
                    "same way: the big weight matrix stays frozen and two small matrices, B and A, learn the correction."),
        "why": ["Full fine-tuning updates and stores every weight, which needs a lot of GPU memory.",
                "Weight updates during fine-tuning tend to have low intrinsic rank, so a product B @ A captures most of them.",
                "After training, B @ A can be merged into W, so inference is exactly as fast as the base model."],
        "compare": ("Full fine-tuning", "LoRA", [
            ("Trainable parameters (d x d layer)", "d * d", "r * (d + d), with r much smaller than d"),
            ("Base weights", "updated", "frozen"),
            ("Checkpoint per task", "full model copy", "a few MB of adapters"),
            ("Inference cost after merging", "baseline", "same as baseline")]),
        "insight": "LoRA learns the update, not the weights: y = W x + (alpha / r) * B (A x), with W frozen and B initialised to zero so training starts from the base model.",
        "example": """d, r, alpha = 4, 1, 2.0
W = [[1.0 if i == j else 0.0 for j in range(d)] for i in range(d)]
B = [[0.5], [0.0], [0.0], [0.25]]
A = [[1.0, 2.0, 0.0, 0.0]]

delta = [[alpha / r * sum(B[i][k] * A[k][j] for k in range(r)) for j in range(d)] for i in range(d)]
merged = [[W[i][j] + delta[i][j] for j in range(d)] for i in range(d)]
for row in merged:
    print(row)
print("full update params:", d * d, "| LoRA params:", d * r + r * d)
""",
        "summary": "{T} freezes the pretrained weight W and learns a low-rank update B @ A instead, scaled by alpha / r. Only B and A get gradients, and the product can be merged back into W after training.",
        "steps": [
            ("The pretrained weight stays frozen",
             "A linear layer computes y = W x. In {T}, W keeps its pretrained values: no gradients, no optimizer state. That alone removes most of the memory that full fine-tuning needs for this layer.",
             _ds(["W[0] = [1, 0, 0, 0]", "W[1] = [0, 1, 0, 0]", "W[2] = [0, 0, 1, 0]", "W[3] = [0, 0, 0, 1]"], [], "frozen 4 x 4 weight (no gradients)")),
            ("Factor the update into B and A",
             "Instead of a full d x d update, {T} trains B (d x r) and A (r x d). With d = 4096 and r = 8 that is 65,536 trainable numbers instead of 16,777,216 — about 0.39% of the layer.",
             _ds(["B: 4096 x 8", "A: 8 x 4096", "B @ A: 4096 x 4096"], [0, 1], "only the two thin matrices are trained")),
            ("Two paths in the forward pass",
             "The input goes through the frozen path W x and through the adapter path B (A x). A x first squeezes x down to r numbers, B expands it back, and the result is scaled by alpha / r before the two paths are added.",
             _flow([("x", "input x", "start"), ("w", "W x (frozen)"), ("a", "A x -> r numbers"), ("b", "B (A x) -> d numbers"),
                    ("s", "scale by alpha / r"), ("y", "y = W x + scaled update", "end")],
                   [("x", "w"), ("x", "a"), ("a", "b"), ("b", "s"), ("w", "y"), ("s", "y")],
                   ["x", "a", "b", "s", "y"], "LoRA forward pass")),
            ("Start from the base model",
             "B is initialised to zeros and A to small random values, so B @ A = 0 at step 0 and the model behaves exactly like the base model. Training then moves only B and A, and alpha / r keeps the update size stable when you change r.",
             None),
            ("Merge for free inference",
             "After training, W_merged = W + (alpha / r) * B @ A is one ordinary matrix, so serving costs nothing extra. Or keep W shared and swap small adapters per task — one base model can serve many fine-tunes.",
             _cmp("Full fine-tuning", "W = W - lr * grad(W)   # d*d numbers\nsave(W)               # full copy",
                  "LoRA", "B, A = B - lr*gB, A - lr*gA\nW_merged = W + alpha/r * B @ A")),
        ],
        "takeaway": "Freeze the big matrix, train two thin ones, merge at the end: {T} keeps base-model quality and speed while training a tiny fraction of the parameters.",
        "concepts": ["low_rank_adaptation", "matrix_multiplication", "parameter_efficiency", "fine_tuning"],
        "required": ["lists", "nested_loops", "functions"],
        "challenges": [
            {"instruction": "Write `lora_param_count(d_in, d_out, r)` that returns a tuple `(full, lora, percent)`: `full = d_in * d_out` (a full update), `lora = r * (d_in + d_out)` (matrices B and A), and `percent = round(lora / full * 100, 2)`. The demo prints the count for a 4096 x 4096 layer with r = 8 (expected: `(16777216, 65536, 0.39)`).",
             "starter": "def lora_param_count(d_in, d_out, r):\n    # full update vs. B (d_out x r) + A (r x d_in)\n    return (0, 0, 0.0)\n\nprint(lora_param_count(4096, 4096, 8))\n",
             "solution": "def lora_param_count(d_in, d_out, r):\n    full = d_in * d_out\n    lora = r * (d_in + d_out)\n    return (full, lora, round(lora / full * 100, 2))\n\nprint(lora_param_count(4096, 4096, 8))\n",
             "test_code": "assert lora_param_count(10, 20, 2) == (200, 60, 30.0), lora_param_count(10, 20, 2)\nassert lora_param_count(4096, 4096, 8) == (16777216, 65536, 0.39)\nassert lora_param_count(768, 3072, 16)[1] == 16 * (768 + 3072), 'lora = r * (d_in + d_out)'\n",
             "expected": "(16777216, 65536, 0.39)",
             "hints": ["A full update has one number per weight: d_in * d_out.", "B has d_out * r numbers and A has r * d_in, so together r * (d_in + d_out).", "Use round(lora / full * 100, 2) for the percentage and return the three values as a tuple."]},
            {"instruction": "Implement the LoRA forward pass `lora_forward(x, W, A, B, alpha, r)` with plain lists: compute `W x`, then `A x` (r numbers), then `B (A x)` (d numbers), scale it by `alpha / r` and add it to `W x`. Return the output list. The demo prints `lora_forward([1.0, 2.0], [[1.0, 0.0], [0.0, 1.0]], [[1.0, 1.0]], [[0.5], [0.0]], 2.0, 1)` (expected: `[4.0, 2.0]`).",
             "starter": "def matvec(M, v):\n    return [sum(m * x for m, x in zip(row, v)) for row in M]\n\ndef lora_forward(x, W, A, B, alpha, r):\n    # frozen path W x, plus the adapter path B (A x) scaled by alpha / r\n    return matvec(W, x)\n\nprint(lora_forward([1.0, 2.0], [[1.0, 0.0], [0.0, 1.0]], [[1.0, 1.0]], [[0.5], [0.0]], 2.0, 1))\n",
             "solution": "def matvec(M, v):\n    return [sum(m * x for m, x in zip(row, v)) for row in M]\n\ndef lora_forward(x, W, A, B, alpha, r):\n    base = matvec(W, x)\n    update = matvec(B, matvec(A, x))\n    return [b + alpha / r * u for b, u in zip(base, update)]\n\nprint(lora_forward([1.0, 2.0], [[1.0, 0.0], [0.0, 1.0]], [[1.0, 1.0]], [[0.5], [0.0]], 2.0, 1))\n",
             "test_code": "_I = [[1.0, 0.0], [0.0, 1.0]]\nassert lora_forward([1.0, 2.0], _I, [[1.0, 1.0]], [[0.5], [0.0]], 2.0, 1) == [4.0, 2.0]\nassert lora_forward([3.0, -1.0], _I, [[5.0, 5.0]], [[0.0], [0.0]], 8.0, 1) == [3.0, -1.0], 'B = 0 must give exactly W x'\n_out = lora_forward([1.0, 1.0], _I, [[1.0, 0.0], [0.0, 1.0]], [[1.0, 0.0], [0.0, 1.0]], 4.0, 2)\nassert _out == [3.0, 3.0], f'rank-2 update scaled by alpha / r = 2: got {_out}'\n",
             "expected": "[4.0, 2.0]",
             "hints": ["Reuse matvec: base = matvec(W, x).", "The adapter path is matvec(B, matvec(A, x)) — A first, then B.", "Add element by element: base[i] + alpha / r * update[i]."]},
        ],
        "quiz": [
            ("In LoRA, which matrices receive gradients during training?", "LoRA-வில் பயிற்சியின்போது எந்த matrix-களுக்கு gradient கிடைக்கிறது?",
             ["Only W", "W, A and B", "Only A and B", "None of them"], ["W மட்டும்", "W, A, B மூன்றும்", "A, B மட்டும்", "எதுவும் இல்லை"], 2),
            ("How many trainable parameters does LoRA add to a 4096 x 4096 layer with r = 8?", "r = 8 உடன் 4096 x 4096 layer-க்கு LoRA எத்தனை trainable parameter-களைச் சேர்க்கிறது?",
             ["65,536", "16,777,216", "32,768", "8"], ["65,536", "16,777,216", "32,768", "8"], 0),
            ("Why is B initialised to zeros?", "B ஏன் பூஜ்ஜியங்களால் தொடங்கப்படுகிறது?",
             ["To save disk space", "So B @ A = 0 and training starts exactly from the base model", "Because A must be zero too", "To make inference faster"],
             ["Disk இடத்தைச் சேமிக்க", "B @ A = 0 ஆகி, பயிற்சி base model-இலிருந்தே தொடங்க", "A-வும் பூஜ்ஜியமாக இருக்க வேண்டும் என்பதால்", "Inference வேகமாக"], 1),
            ("What does merging W + (alpha / r) * B @ A after training give you?", "பயிற்சிக்குப் பின் W + (alpha / r) * B @ A-ஐ merge செய்தால் என்ன கிடைக்கும்?",
             ["A slower model", "One ordinary weight matrix with no extra inference cost", "A model with two outputs", "A smaller vocabulary"],
             ["மெதுவான model", "கூடுதல் inference செலவு இல்லாத ஒரே சாதாரண weight matrix", "இரண்டு output கொண்ட model", "சிறிய vocabulary"], 1),
        ],
    }


@archetype("async", ("async", "await", "taskgroup", "task group", "coroutine", "event loop", "concurren", "gather"), "async_programming")
def _async():
    return {
        "mechanism": "structured concurrency with asyncio.TaskGroup",
        "hook": "Many Waits, One Thread",
        "analogy": ("A dosa master at a busy tiffin stall never stands and watches one dosa cook. He pours batter, turns to "
                    "the next tawa, flips another, and comes back exactly when each one is ready. {T} gives Python that "
                    "habit: while one task waits, the event loop runs another, all on a single thread."),
        "why": ["Network and disk calls spend most of their time waiting, not computing.",
                "asyncio.TaskGroup (Python 3.11) starts tasks together and guarantees none is left running when the block exits.",
                "If one task fails, the group cancels its siblings and raises an ExceptionGroup you handle with except*."],
        "compare": ("asyncio.gather", "asyncio.TaskGroup", [
            ("Waiting for tasks", "await gather(*coros)", "async with TaskGroup() as tg"),
            ("When one task fails", "others keep running by default", "siblings are cancelled"),
            ("Errors you receive", "the first exception", "an ExceptionGroup with all of them"),
            ("Leaked tasks", "possible", "impossible: the block waits for every task")]),
        "insight": "Inside async with asyncio.TaskGroup(), every task created with tg.create_task() is finished — or cancelled — before the next line after the block runs.",
        "example": """import asyncio

async def fetch(name, delay):
    print(f"start {name}")
    await asyncio.sleep(delay)
    print(f"done  {name}")
    return name.upper()

async def main():
    async with asyncio.TaskGroup() as tg:
        lesson = tg.create_task(fetch("lesson", 0.02))
        quiz = tg.create_task(fetch("quiz", 0.01))
    print("results:", lesson.result(), quiz.result())

asyncio.run(main())
""",
        "summary": "{T} runs many waiting operations on one thread: coroutines pause at await, the event loop resumes whichever is ready, and asyncio.TaskGroup makes sure every task finishes or is cancelled before the block exits.",
        "steps": [
            ("Calling a coroutine does not run it",
             "async def fetch() returns a coroutine object when called — nothing runs yet. It only executes when awaited or wrapped in a Task. tg.create_task(fetch(...)) schedules it on the event loop so it starts at the next await.",
             _ds(["created", "scheduled", "running", "waiting at await", "done"], [1], "life of a task inside {T}")),
            ("The event loop is a to-do list",
             "The loop keeps a queue of tasks that are ready to run. A task runs until it hits await on something not ready yet (like asyncio.sleep), then yields control and the loop picks the next ready task.",
             _ds(["fetch('lesson')", "fetch('quiz')"], [0], "ready queue: lesson runs first, then quiz while lesson sleeps")),
            ("TaskGroup waits for everyone",
             "async with asyncio.TaskGroup() as tg: creates tasks inside the block. At the end of the block, the group awaits all of them. If any task raises, the group cancels the others and then raises an ExceptionGroup.",
             _flow([("enter", "enter TaskGroup", "start"), ("create", "tg.create_task(...) x N"), ("wait", "await all at block exit"),
                    ("fail", "a task raised?", "decision"), ("cancel", "cancel siblings, raise ExceptionGroup", "end"), ("ok", "all results ready", "end")],
                   [("enter", "create"), ("create", "wait"), ("wait", "fail"), ("fail", "cancel", "yes"), ("fail", "ok", "no")],
                   ["enter", "create", "wait", "fail", "ok"], "Structured concurrency")),
            ("Handle failures with except*",
             "Because several tasks can fail together, TaskGroup raises an ExceptionGroup. except* ValueError as eg: catches only the ValueErrors inside it (eg.exceptions lists them) and lets other error types keep propagating.",
             None),
            ("Put a deadline on waiting",
             "async with asyncio.timeout(seconds): cancels the work inside if it takes too long and raises TimeoutError at the block edge. Combined with TaskGroup, {T} gives you concurrency that always finishes, fails cleanly or times out.",
             _cmp("Sequential", "a = await fetch('lesson', 0.02)\nb = await fetch('quiz', 0.01)\n# total ~0.03 s",
                  "TaskGroup", "async with asyncio.TaskGroup() as tg:\n    a = tg.create_task(fetch('lesson', 0.02))\n    b = tg.create_task(fetch('quiz', 0.01))\n# total ~0.02 s")),
        ],
        "takeaway": "Concurrency in {T} is about waiting well: await hands control back to the event loop, TaskGroup scopes task lifetimes, and asyncio.timeout bounds how long anything may wait.",
        "concepts": ["async_await", "event_loop", "task_group", "structured_concurrency"],
        "required": ["functions", "exceptions"],
        "challenges": [
            {"instruction": "Complete `fetch_all(names)` so it runs `fake_fetch(name)` for every name **concurrently** inside an `asyncio.TaskGroup` and returns the results in the same order as `names`. Four 0.1 s fetches must take well under 0.4 s in total. The demo prints `asyncio.run(fetch_all(['a', 'bb', 'ccc']))` (expected: `[1, 2, 3]`).",
             "starter": "import asyncio\n\nasync def fake_fetch(name, delay=0.01):\n    await asyncio.sleep(delay)\n    return len(name)\n\nasync def fetch_all(names, delay=0.01):\n    results = []\n    # create one task per name inside asyncio.TaskGroup, then collect task.result() in order\n    return results\n\nprint(asyncio.run(fetch_all(['a', 'bb', 'ccc'])))\n",
             "solution": "import asyncio\n\nasync def fake_fetch(name, delay=0.01):\n    await asyncio.sleep(delay)\n    return len(name)\n\nasync def fetch_all(names, delay=0.01):\n    async with asyncio.TaskGroup() as tg:\n        tasks = [tg.create_task(fake_fetch(n, delay)) for n in names]\n    return [t.result() for t in tasks]\n\nprint(asyncio.run(fetch_all(['a', 'bb', 'ccc'])))\n",
             "test_code": "import asyncio as _asyncio\nimport time as _time\nassert _asyncio.run(fetch_all(['x', 'yy', 'zzz', 'wwww'])) == [1, 2, 3, 4], 'keep the order of names'\n_t0 = _time.perf_counter()\nassert _asyncio.run(fetch_all(['a', 'b', 'c', 'd'], delay=0.1)) == [1, 1, 1, 1]\n_elapsed = _time.perf_counter() - _t0\nassert _elapsed < 0.3, f'tasks must run concurrently: took {_elapsed:.2f}s for four 0.1s fetches'\nassert _asyncio.run(fetch_all([])) == []\n",
             "expected": "[1, 2, 3]",
             "hints": ["Open the group with: async with asyncio.TaskGroup() as tg:", "Inside it, build tasks = [tg.create_task(fake_fetch(n, delay)) for n in names].", "After the block every task is done, so return [t.result() for t in tasks]."]},
            {"instruction": "Write `first_or_timeout(delay, limit)` that awaits `asyncio.sleep(delay)` inside `async with asyncio.timeout(limit):` and returns `'done'`, or returns `'timeout'` when the deadline fires (catch `TimeoutError`). The demo prints both cases (expected: `done timeout`).",
             "starter": "import asyncio\n\nasync def first_or_timeout(delay, limit):\n    # use asyncio.timeout(limit) around asyncio.sleep(delay)\n    return None\n\nprint(asyncio.run(first_or_timeout(0.01, 0.5)), asyncio.run(first_or_timeout(0.5, 0.01)))\n",
             "solution": "import asyncio\n\nasync def first_or_timeout(delay, limit):\n    try:\n        async with asyncio.timeout(limit):\n            await asyncio.sleep(delay)\n        return 'done'\n    except TimeoutError:\n        return 'timeout'\n\nprint(asyncio.run(first_or_timeout(0.01, 0.5)), asyncio.run(first_or_timeout(0.5, 0.01)))\n",
             "test_code": "import asyncio as _asyncio\nimport time as _time\nassert _asyncio.run(first_or_timeout(0.0, 1.0)) == 'done'\n_t0 = _time.perf_counter()\nassert _asyncio.run(first_or_timeout(2.0, 0.05)) == 'timeout'\nassert _time.perf_counter() - _t0 < 1.0, 'the timeout must cancel the sleep, not wait for it'\n",
             "expected": "done timeout",
             "hints": ["asyncio.timeout(limit) is an async context manager: async with asyncio.timeout(limit):", "Put await asyncio.sleep(delay) inside it and return 'done' after the block.", "Wrap everything in try/except TimeoutError and return 'timeout' in the except branch."]},
        ],
        "quiz": [
            ("What happens when you call fetch('x') on an async def without awaiting it?", "async def fetch('x')-ஐ await இல்லாமல் அழைத்தால் என்ன நடக்கும்?",
             ["It runs immediately", "It returns a coroutine object and nothing runs yet", "It raises SyntaxError", "It runs in a new thread"],
             ["உடனே இயங்கும்", "Coroutine object-ஐத் தரும்; இன்னும் எதுவும் இயங்காது", "SyntaxError எழும்", "புதிய thread-இல் இயங்கும்"], 1),
            ("If one task in an asyncio.TaskGroup raises, what happens to the others?", "asyncio.TaskGroup-இல் ஒரு task error எழுப்பினால் மற்றவற்றுக்கு என்ன ஆகும்?",
             ["They keep running forever", "They are cancelled and an ExceptionGroup is raised", "They are restarted", "Python exits"],
             ["என்றென்றும் இயங்கும்", "Cancel செய்யப்பட்டு ExceptionGroup எழுப்பப்படும்", "மீண்டும் தொடங்கும்", "Python வெளியேறும்"], 1),
            ("Which syntax catches only the ValueErrors inside an ExceptionGroup?", "ExceptionGroup-இல் உள்ள ValueError-களை மட்டும் பிடிக்கும் syntax எது?",
             ["except ValueError:", "except* ValueError:", "catch ValueError:", "except ExceptionGroup(ValueError):"],
             ["except ValueError:", "except* ValueError:", "catch ValueError:", "except ExceptionGroup(ValueError):"], 1),
            ("In the lesson example, which line prints first after 'start lesson' and 'start quiz'?", "பாட உதாரணத்தில் 'start lesson', 'start quiz'-க்குப் பிறகு முதலில் எந்த வரி அச்சாகும்?",
             ["done  lesson", "done  quiz", "results: LESSON QUIZ", "Nothing, it deadlocks"],
             ["done  lesson", "done  quiz", "results: LESSON QUIZ", "எதுவும் இல்லை, deadlock"], 1),
        ],
    }


@archetype("tools", ("mcp", "model context protocol", "tool", "function call", "function-call", "dispatcher", "plugin", "agent"), "agent_tools")
def _tools():
    return {
        "mechanism": "a JSON-RPC tool server with a dispatch registry",
        "hook": "Give the Model Hands",
        "analogy": ("A hotel receptionist does not cook, clean or drive — she knows who does, and forwards each request "
                    "on a standard slip. {T} is that receptionist for an AI model: tools are registered once, described "
                    "with a schema, and every request arrives as the same JSON message that the server routes to the right function."),
        "why": ["Models cannot run code themselves; they emit structured requests that a host executes.",
                "A standard message format (JSON-RPC 2.0, as used by MCP) lets any client talk to any tool server.",
                "Errors returned as data (error codes) keep the conversation going instead of crashing the agent."],
        "compare": ("Hard-coded function calls", "Tool server with a registry", [
            ("Adding a tool", "edit the agent's code", "register one more function"),
            ("Discovery", "the agent must already know", "tools/list returns every tool"),
            ("Message format", "custom per tool", "one JSON-RPC envelope"),
            ("Unknown requests", "crash or silent failure", "a structured error object")]),
        "insight": "A tool server is a dictionary from names to functions behind a strict message format: parse the request, look up the name, call it, and always reply with the same id — as a result or as an error.",
        "example": """import json

TOOLS = {}

def tool(fn):
    TOOLS[fn.__name__] = fn
    return fn

@tool
def add(a, b):
    return a + b

@tool
def shout(text):
    return text.upper()

raw = '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 2, "b": 3}}}'
msg = json.loads(raw)
result = TOOLS[msg["params"]["name"]](**msg["params"]["arguments"])
print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": result}))
print("registered tools:", sorted(TOOLS))
""",
        "summary": "{T} exposes functions to a model through a registry and a fixed JSON-RPC envelope: the client sends a method and params, the server dispatches by name, and every reply echoes the request id with a result or an error.",
        "steps": [
            ("Register tools by name",
             "A decorator adds each function to a dictionary keyed by its name, along with a description and a JSON Schema for its arguments. That dictionary is the whole catalogue a model can discover with tools/list.",
             _ds(["add(a, b)", "shout(text)", "search(query)"], [0], "TOOLS registry inside {T}")),
            ("Every request has the same envelope",
             "A request is JSON with jsonrpc: \"2.0\", an id, a method such as tools/call, and params holding the tool name and arguments. The server never guesses: it reads these fields and nothing else.",
             _ds(["jsonrpc: 2.0", "id: 1", "method: tools/call", "params.name: add", "params.arguments: {a: 2, b: 3}"], [2, 3], "one JSON-RPC request")),
            ("Dispatch: parse, look up, call, reply",
             "The server parses the JSON, routes by method, finds the tool in the registry, validates the arguments, calls the function and wraps the return value as result with the same id. An unknown method becomes error code -32601 instead of an exception.",
             _flow([("req", "request arrives", "start"), ("parse", "json.loads"), ("method", "known method?", "decision"),
                    ("call", "TOOLS[name](**arguments)"), ("ok", "reply {id, result}", "end"), ("err", "reply {id, error: -32601}", "end")],
                   [("req", "parse"), ("parse", "method"), ("method", "call", "yes"), ("method", "err", "no"), ("call", "ok")],
                   ["req", "parse", "method", "call", "ok"], "Request dispatch")),
            ("Errors are data",
             "JSON-RPC defines error codes: -32700 parse error, -32601 method not found, -32602 invalid params. Returning them as a reply lets the model read what went wrong and try again, which is what keeps an agent loop alive.",
             None),
            ("Why a protocol beats ad-hoc calls",
             "Because every server speaks the same envelope, one client can use many tool servers and one server can serve many models. Adding a capability to {T} means registering a function, not rewriting the agent.",
             _cmp("Ad-hoc", "if name == 'add':\n    out = add(**args)\nelif name == 'shout':\n    out = shout(**args)",
                  "Registry", "out = TOOLS[name](**args)\nreply = {'jsonrpc': '2.0', 'id': id, 'result': out}")),
        ],
        "takeaway": "A tool server in {T} is a registry plus a contract: every request is parsed the same way, dispatched by name, and answered with the same id — successes as result, failures as structured error codes.",
        "concepts": ["json_rpc", "tool_registry", "decorators", "error_handling"],
        "required": ["dictionaries", "functions", "json"],
        "challenges": [
            {"instruction": "Write `handle_request(raw)` for a tiny tool server. Parse the JSON string, look up `params['name']` in `TOOLS`, call it with `**params['arguments']`, and return the reply as a JSON string `{\"jsonrpc\": \"2.0\", \"id\": <same id>, \"result\": <return value>}` (use `json.dumps`). The demo calls `add` with a=2, b=5 (expected: `{\"jsonrpc\": \"2.0\", \"id\": 7, \"result\": 7}`).",
             "starter": "import json\n\nTOOLS = {\n    'add': lambda a, b: a + b,\n    'multiply': lambda a, b: a * b,\n}\n\ndef handle_request(raw):\n    # parse raw, call TOOLS[name](**arguments), reply with the same id\n    return ''\n\nprint(handle_request('{\"jsonrpc\": \"2.0\", \"id\": 7, \"method\": \"tools/call\", \"params\": {\"name\": \"add\", \"arguments\": {\"a\": 2, \"b\": 5}}}'))\n",
             "solution": "import json\n\nTOOLS = {\n    'add': lambda a, b: a + b,\n    'multiply': lambda a, b: a * b,\n}\n\ndef handle_request(raw):\n    msg = json.loads(raw)\n    params = msg['params']\n    result = TOOLS[params['name']](**params['arguments'])\n    return json.dumps({'jsonrpc': '2.0', 'id': msg['id'], 'result': result})\n\nprint(handle_request('{\"jsonrpc\": \"2.0\", \"id\": 7, \"method\": \"tools/call\", \"params\": {\"name\": \"add\", \"arguments\": {\"a\": 2, \"b\": 5}}}'))\n",
             "test_code": "import json as _json\n_r = _json.loads(handle_request(_json.dumps({'jsonrpc': '2.0', 'id': 42, 'method': 'tools/call', 'params': {'name': 'multiply', 'arguments': {'a': 6, 'b': 7}}})))\nassert _r == {'jsonrpc': '2.0', 'id': 42, 'result': 42}, _r\n_r2 = _json.loads(handle_request(_json.dumps({'jsonrpc': '2.0', 'id': 'abc', 'method': 'tools/call', 'params': {'name': 'add', 'arguments': {'a': -1, 'b': 1}}})))\nassert _r2['id'] == 'abc' and _r2['result'] == 0, 'echo the request id exactly'\n",
             "expected": "{\"jsonrpc\": \"2.0\", \"id\": 7, \"result\": 7}",
             "hints": ["msg = json.loads(raw) gives you a dict; the tool name is msg['params']['name'].", "Call the tool with keyword arguments: TOOLS[name](**msg['params']['arguments']).", "Return json.dumps({'jsonrpc': '2.0', 'id': msg['id'], 'result': result})."]},
            {"instruction": "Extend the server with `handle(raw)`: method `tools/list` returns `{\"tools\": sorted tool names}` as the result, and any unknown method returns an error object `{\"code\": -32601, \"message\": \"Method not found\"}` under the key `error` (with the same id). Return JSON strings. The demo prints a list call and an unknown call (expected: two lines, see the demo output).",
             "starter": "import json\n\nTOOLS = {'add': lambda a, b: a + b, 'shout': lambda text: text.upper()}\n\ndef handle(raw):\n    msg = json.loads(raw)\n    # tools/list -> result {'tools': [...]}; anything else -> error -32601\n    return json.dumps({'jsonrpc': '2.0', 'id': msg['id']})\n\nprint(handle('{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}'))\nprint(handle('{\"jsonrpc\": \"2.0\", \"id\": 2, \"method\": \"nope\"}'))\n",
             "solution": "import json\n\nTOOLS = {'add': lambda a, b: a + b, 'shout': lambda text: text.upper()}\n\ndef handle(raw):\n    msg = json.loads(raw)\n    reply = {'jsonrpc': '2.0', 'id': msg['id']}\n    if msg['method'] == 'tools/list':\n        reply['result'] = {'tools': sorted(TOOLS)}\n    else:\n        reply['error'] = {'code': -32601, 'message': 'Method not found'}\n    return json.dumps(reply)\n\nprint(handle('{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}'))\nprint(handle('{\"jsonrpc\": \"2.0\", \"id\": 2, \"method\": \"nope\"}'))\n",
             "test_code": "import json as _json\n_l = _json.loads(handle(_json.dumps({'jsonrpc': '2.0', 'id': 5, 'method': 'tools/list'})))\nassert _l == {'jsonrpc': '2.0', 'id': 5, 'result': {'tools': sorted(TOOLS)}}, _l\n_e = _json.loads(handle(_json.dumps({'jsonrpc': '2.0', 'id': 6, 'method': 'resources/read'})))\nassert _e.get('error') == {'code': -32601, 'message': 'Method not found'} and _e['id'] == 6, _e\nassert 'result' not in _e, 'an error reply must not contain result'\n",
             "expected": "{\"jsonrpc\": \"2.0\", \"id\": 1, \"result\": {\"tools\": [\"add\", \"shout\"]}}\n{\"jsonrpc\": \"2.0\", \"id\": 2, \"error\": {\"code\": -32601, \"message\": \"Method not found\"}}",
             "hints": ["Start the reply as {'jsonrpc': '2.0', 'id': msg['id']}.", "If msg['method'] == 'tools/list', set reply['result'] = {'tools': sorted(TOOLS)}.", "Otherwise set reply['error'] = {'code': -32601, 'message': 'Method not found'} and return json.dumps(reply)."]},
        ],
        "quiz": [
            ("What must every JSON-RPC reply contain so the client can match it to its request?", "Client தன் request-உடன் பொருத்த JSON-RPC reply-இல் கட்டாயம் என்ன இருக்க வேண்டும்?",
             ["The same id as the request", "The server's IP address", "A timestamp", "The tool's source code"],
             ["Request-இன் அதே id", "Server-இன் IP முகவரி", "Timestamp", "Tool-இன் source code"], 0),
            ("Which JSON-RPC error code means 'method not found'?", "'method not found' என்பதற்கான JSON-RPC error code எது?",
             ["-32700", "-32601", "404", "0"], ["-32700", "-32601", "404", "0"], 1),
            ("Why return errors as reply objects instead of raising exceptions to the client?", "Client-க்கு exception எழுப்புவதற்குப் பதிலாக error-ஐ reply object-ஆக ஏன் தர வேண்டும்?",
             ["It is faster to type", "The model can read the error and retry, so the agent loop continues", "JSON cannot hold strings", "Exceptions are not allowed in Python"],
             ["Type செய்ய வேகமானது", "Model error-ஐப் படித்து மீண்டும் முயலும்; agent loop தொடரும்", "JSON-இல் string இருக்க முடியாது", "Python-இல் exception அனுமதி இல்லை"], 1),
            ("In the lesson example, what does sorted(TOOLS) print?", "பாட உதாரணத்தில் sorted(TOOLS) என்ன அச்சிடும்?",
             ["['shout', 'add']", "['add', 'shout']", "{'add', 'shout'}", "2"], ["['shout', 'add']", "['add', 'shout']", "{'add', 'shout'}", "2"], 1),
        ],
    }


@archetype("graph", ("graph", "networkx", "knowledge", "bfs", "rag", "retriev", "neighbo", "community"), "retrieval")
def _graph():
    return {
        "mechanism": "k-hop traversal over an entity graph",
        "hook": "Follow the Connections, Not Just the Keywords",
        "analogy": ("Ask a librarian about 'asyncio' and a good one walks you from the asyncio shelf to the event-loop "
                    "shelf and on to TaskGroup — following connections, not just matching words. {T} does that for an "
                    "AI model: it stores entities and relations as a graph and walks it hop by hop to collect context."),
        "why": ["Plain vector search finds similar text but misses facts that are connected through other entities.",
                "A graph of (subject, relation, object) triples makes multi-hop questions answerable.",
                "Breadth-first search with a hop limit collects nearby facts in order of closeness."],
        "compare": ("Vector RAG", "Graph RAG", [
            ("Index", "embeddings of text chunks", "entities + relations (adjacency lists)"),
            ("Retrieval", "top-k by cosine similarity", "k-hop traversal from linked entities"),
            ("Good at", "'what does this passage say?'", "'how are these things connected?'"),
            ("Cost", "embedding every chunk", "extracting triples once")]),
        "insight": "Breadth-first search visits nodes in order of hop distance, so a hop limit gives you exactly the context that is 1, 2, ... k relations away — closest facts first.",
        "example": """from collections import deque

graph = {
    "Python": ["asyncio", "NumPy"],
    "asyncio": ["TaskGroup", "event loop"],
    "NumPy": ["arrays"],
    "TaskGroup": [], "event loop": [], "arrays": [],
}
start, max_hops = "Python", 2
hops = {start: 0}
queue = deque([start])
while queue:
    node = queue.popleft()
    for nxt in graph[node]:
        if nxt not in hops and hops[node] < max_hops:
            hops[nxt] = hops[node] + 1
            queue.append(nxt)
for node, h in hops.items():
    print(f"{h} hop(s): {node}")
""",
        "summary": "{T} turns knowledge into a graph of entities and relations, links the question to starting entities, and collects context with a hop-limited breadth-first search so the closest connected facts reach the model first.",
        "steps": [
            ("Extract triples",
             "Text is turned into (subject, relation, object) triples, for example (rag, uses, retriever). Each triple is one edge. Doing this once at indexing time is what lets {T} answer questions that span several documents.",
             _ds(["(rag, uses, retriever)", "(retriever, uses, bm25)", "(rag, uses, llm)"], [0], "triples extracted from text")),
            ("Build adjacency lists",
             "Each subject maps to the list of objects it points to: {'rag': ['llm', 'retriever'], 'retriever': ['bm25']}. Objects with no outgoing edges still get an empty list so every node can be looked up.",
             _ds(["rag -> [llm, retriever]", "retriever -> [bm25]", "llm -> []", "bm25 -> []"], [0], "adjacency lists")),
            ("Walk k hops with BFS",
             "Starting from the entities in the question, breadth-first search pops a node, pushes its unseen neighbours with hop + 1, and stops expanding at the hop limit. A seen-set prevents loops when the graph has cycles.",
             _flow([("q", "question -> start entity", "start"), ("pop", "pop next node"), ("lim", "hops < k?", "decision"),
                    ("push", "push unseen neighbours (hop + 1)"), ("done", "queue empty?", "decision"), ("ctx", "facts sorted by hop -> prompt", "end")],
                   [("q", "pop"), ("pop", "lim"), ("lim", "push", "yes"), ("lim", "done", "no"), ("push", "done"),
                    ("done", "pop", "no"), ("done", "ctx", "yes")],
                   ["q", "pop", "lim", "push", "done", "ctx"], "k-hop retrieval")),
            ("Summarise communities for global questions",
             "For broad questions ('what are the main themes?'), GraphRAG systems group densely connected nodes into communities and pre-write a summary for each, so the model reads a few summaries instead of thousands of edges.",
             None),
            ("Combine with vector search",
             "In practice {T} often uses vector search to find the starting entities and the graph to expand around them. Similar text gets you in the door; the graph brings the connected facts the text never mentioned together.",
             _cmp("Vector RAG", "hits = top_k(cosine(q, chunks))\ncontext = hits", "Graph RAG",
                  "seeds = link_entities(question)\ncontext = bfs(graph, seeds, k=2)")),
        ],
        "takeaway": "{T} retrieves by relationship: triples become adjacency lists, a hop-limited BFS gathers connected facts closest-first, and the result complements similarity-based retrieval.",
        "concepts": ["graphs", "breadth_first_search", "adjacency_lists", "retrieval_augmented_generation"],
        "required": ["dictionaries", "lists", "loops"],
        "challenges": [
            {"instruction": "Write `neighbors_within(graph, start, k)` that returns a **sorted** list of every node reachable from `start` in at most `k` hops (not including `start`). Use breadth-first search with a seen-set so cycles do not loop forever. The demo prints the 2-hop neighbourhood of 'rag' in `G` (expected: `['bm25', 'embeddings', 'llm', 'retriever', 'tokenizer']`).",
             "starter": "from collections import deque\n\nG = {'rag': ['retriever', 'llm'], 'retriever': ['embeddings', 'bm25'], 'llm': ['tokenizer'],\n     'embeddings': ['vectors'], 'bm25': [], 'tokenizer': [], 'vectors': []}\n\ndef neighbors_within(graph, start, k):\n    # BFS from start, remembering each node's hop count; stop expanding at k hops\n    return []\n\nprint(neighbors_within(G, 'rag', 2))\n",
             "solution": "from collections import deque\n\nG = {'rag': ['retriever', 'llm'], 'retriever': ['embeddings', 'bm25'], 'llm': ['tokenizer'],\n     'embeddings': ['vectors'], 'bm25': [], 'tokenizer': [], 'vectors': []}\n\ndef neighbors_within(graph, start, k):\n    hops = {start: 0}\n    queue = deque([start])\n    while queue:\n        node = queue.popleft()\n        if hops[node] == k:\n            continue\n        for nxt in graph.get(node, []):\n            if nxt not in hops:\n                hops[nxt] = hops[node] + 1\n                queue.append(nxt)\n    return sorted(n for n in hops if n != start)\n\nprint(neighbors_within(G, 'rag', 2))\n",
             "test_code": "_G = {'rag': ['retriever', 'llm'], 'retriever': ['embeddings', 'bm25'], 'llm': ['tokenizer'], 'embeddings': ['vectors'], 'bm25': [], 'tokenizer': [], 'vectors': []}\nassert neighbors_within(_G, 'rag', 1) == ['llm', 'retriever']\nassert neighbors_within(_G, 'rag', 0) == []\nassert neighbors_within(_G, 'rag', 3) == ['bm25', 'embeddings', 'llm', 'retriever', 'tokenizer', 'vectors']\nassert neighbors_within({'a': ['b'], 'b': ['a']}, 'a', 5) == ['b'], 'use a seen-set so cycles terminate'\n",
             "expected": "['bm25', 'embeddings', 'llm', 'retriever', 'tokenizer']",
             "hints": ["Keep hops = {start: 0} and a deque([start]).", "Pop a node; if hops[node] == k, do not expand it. Otherwise add each unseen neighbour with hops[node] + 1.", "Return sorted(n for n in hops if n != start)."]},
            {"instruction": "Write `build_graph(triples)` that turns `(subject, relation, object)` triples into adjacency lists: a dict mapping each node to a **sorted list without duplicates** of the objects it points to. Every object must also appear as a key (with an empty list if it has no outgoing edges). The demo builds a 3-triple graph (expected: `{'rag': ['llm', 'retriever'], 'retriever': ['bm25'], 'bm25': [], 'llm': []}`).",
             "starter": "def build_graph(triples):\n    graph = {}\n    # for each (s, _, o): make sure s and o are keys, add o to graph[s]; then sort and de-duplicate\n    return graph\n\nprint(build_graph([('rag', 'uses', 'retriever'), ('retriever', 'uses', 'bm25'), ('rag', 'uses', 'llm')]))\n",
             "solution": "def build_graph(triples):\n    graph = {}\n    for s, _, o in triples:\n        graph.setdefault(s, set()).add(o)\n        graph.setdefault(o, set())\n    return {node: sorted(objs) for node, objs in graph.items()}\n\nprint(build_graph([('rag', 'uses', 'retriever'), ('retriever', 'uses', 'bm25'), ('rag', 'uses', 'llm')]))\n",
             "test_code": "assert build_graph([]) == {}\n_g = build_graph([('a', 'r', 'b'), ('a', 'r', 'b'), ('a', 'r2', 'c'), ('c', 'r', 'a')])\nassert _g == {'a': ['b', 'c'], 'b': [], 'c': ['a']}, _g\nassert build_graph([('x', 'r', 'z'), ('x', 'r', 'y')])['x'] == ['y', 'z'], 'neighbour lists must be sorted'\n",
             "expected": "{'rag': ['llm', 'retriever'], 'retriever': ['bm25'], 'bm25': [], 'llm': []}",
             "hints": ["graph.setdefault(s, set()).add(o) collects objects without duplicates.", "Call graph.setdefault(o, set()) too, so objects become keys.", "Finish with {node: sorted(objs) for node, objs in graph.items()} — keys keep first-seen order."]},
        ],
        "quiz": [
            ("Why does BFS return nodes in order of hop distance?", "BFS ஏன் hop தூர வரிசையில் node-களைத் தருகிறது?",
             ["It uses a stack", "It uses a FIFO queue, so all 1-hop nodes are processed before 2-hop nodes", "It sorts by name", "It is random"],
             ["Stack பயன்படுத்துவதால்", "FIFO queue பயன்படுத்துவதால் 1-hop node-கள் 2-hop-க்கு முன் செயலாக்கப்படும்", "பெயர் வரிசையில் sort செய்வதால்", "Random ஆக"], 1),
            ("What prevents BFS from looping forever on a cycle like a -> b -> a?", "a -> b -> a போன்ற cycle-இல் BFS முடிவில்லாமல் சுற்றாமல் தடுப்பது எது?",
             ["A seen-set of visited nodes", "Sorting the queue", "Using recursion", "Nothing; it always loops"],
             ["பார்வையிட்ட node-களின் seen-set", "Queue-ஐ sort செய்தல்", "Recursion", "எதுவும் இல்லை"], 0),
            ("Which question suits Graph RAG better than plain vector RAG?", "எந்தக் கேள்விக்கு vector RAG-ஐ விட Graph RAG பொருத்தமானது?",
             ["Find a passage similar to this sentence", "How is TaskGroup connected to Python through other concepts?", "Translate this word", "Count the words in a file"],
             ["இந்த வாக்கியத்தைப் போன்ற பகுதியைத் தேடு", "TaskGroup மற்ற கருத்துகள் வழியாக Python-உடன் எப்படி இணைந்துள்ளது?", "இந்த வார்த்தையை மொழிபெயர்", "File-இல் வார்த்தைகளை எண்ணு"], 1),
            ("In the lesson example with max_hops = 2, at which hop is 'TaskGroup' found?", "max_hops = 2 உள்ள பாட உதாரணத்தில் 'TaskGroup' எந்த hop-இல் கிடைக்கும்?",
             ["0", "1", "2", "It is not found"], ["0", "1", "2", "கிடைக்காது"], 2),
        ],
    }


@archetype("decorators", ("decorator", "closure", "wrapper", "functools", "higher-order", "higher order", "memoiz", "cache"), "functions_deep_dive")
def _decorators():
    return {
        "mechanism": "functions that wrap functions",
        "hook": "Wrapping a Function Without Touching It",
        "analogy": ("A gift shop wraps the present you bought — the gift inside is unchanged, but now it has a card, a "
                    "ribbon and a tag. {T} wraps functions the same way: a decorator takes a function and returns a new "
                    "function that adds behaviour before and after, while the original stays exactly as it was."),
        "why": ["Cross-cutting jobs — logging, timing, caching, retries — should not be copy-pasted into every function.",
                "In Python, functions are objects: they can be passed in, returned and stored on attributes.",
                "The @ syntax is just sugar for fn = decorator(fn), applied once at definition time."],
        "compare": ("Copy-pasted code", "Decorator", [
            ("Adding logging to 20 functions", "edit all 20", "add @log to each"),
            ("Original function body", "mixed with extra code", "unchanged"),
            ("Turning the behaviour off", "edit all 20 again", "remove one line"),
            ("Metadata (__name__, docstring)", "n/a", "kept with functools.wraps")]),
        "insight": "@decorator above def f is exactly f = decorator(f): the decorator runs once, at definition time, and whatever it returns replaces the name f.",
        "example": """import functools

def count_calls(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)
    wrapper.calls = 0
    return wrapper

@count_calls
def greet(name):
    return f"Vanakkam, {name}!"

print(greet("Asha"))
print(greet("Ravi"))
print(greet.__name__, "was called", greet.calls, "times")
""",
        "summary": "{T} relies on functions being objects: a decorator receives a function, defines a wrapper that closes over it, and returns the wrapper, which replaces the original name at definition time.",
        "steps": [
            ("Functions are objects",
             "def greet(...) creates a function object and binds it to the name greet. Like any object it can be passed to another function, returned from one, or given attributes such as wrapper.calls.",
             _ds(["name: greet", "type: function", "__name__: 'greet'", "calls: 0"], [0], "a function object in {T}")),
            ("@ is assignment in disguise",
             "Writing @count_calls above def greet makes Python run greet = count_calls(greet) right after the def. From then on, the name greet refers to the wrapper that count_calls returned.",
             _flow([("def", "def greet(...) creates function", "start"), ("call", "count_calls(greet) runs once"),
                    ("ret", "returns wrapper"), ("bind", "name greet -> wrapper"), ("use", "greet('Asha') calls wrapper", "end")],
                   [("def", "call"), ("call", "ret"), ("ret", "bind"), ("bind", "use")],
                   ["def", "call", "ret", "bind", "use"], "What @count_calls does")),
            ("The wrapper remembers the original",
             "wrapper uses fn, a variable from count_calls. Python keeps fn alive in a closure cell after count_calls returns, so every later call to wrapper can still reach and call the original function.",
             {"type": "MemoryStack", "props": {"frames": [{"name": "wrapper (call)", "variables": {"args": "('Asha',)"}},
                                                           {"name": "closure cell", "variables": {"fn": "<function greet>"}}],
                                                "caption": "What the wrapper can reach"}}),
            ("Keep the metadata with functools.wraps",
             "Without help, the wrapped function reports __name__ == 'wrapper'. @functools.wraps(fn) copies __name__, __doc__ and other metadata from fn onto wrapper, so debugging and documentation still show the real function.",
             None),
            ("Decorator factories add one more layer",
             "@repeat(3) first calls repeat(3), which returns the actual decorator; that decorator then wraps the function. Three nested functions: configuration, decoration and the wrapper that runs on each call.",
             _cmp("Plain decorator", "def log(fn):\n    def wrapper(*a):\n        return fn(*a)\n    return wrapper", "Factory",
                  "def repeat(n):\n    def deco(fn):\n        def wrapper(*a):\n            return [fn(*a) for _ in range(n)]\n        return wrapper\n    return deco")),
        ],
        "takeaway": "In {T}, a decorator is a function that takes a function and returns a replacement; closures keep the original reachable, and functools.wraps keeps its identity.",
        "concepts": ["decorators", "closures", "higher_order_functions", "functools"],
        "required": ["functions", "dictionaries"],
        "challenges": [
            {"instruction": "Write a `memoize(fn)` decorator that caches results in a dict keyed by the positional arguments, so the decorated function body runs only once per distinct input. The demo decorates `square`, which prints a message when it really computes (expected output: `computing 4`, `16`, `16` on three lines).",
             "starter": "def memoize(fn):\n    cache = {}\n    def wrapper(*args):\n        # return the cached value if args were seen before, otherwise compute and store it\n        return fn(*args)\n    return wrapper\n\n@memoize\ndef square(n):\n    print(f'computing {n}')\n    return n * n\n\nprint(square(4))\nprint(square(4))\n",
             "solution": "def memoize(fn):\n    cache = {}\n    def wrapper(*args):\n        if args not in cache:\n            cache[args] = fn(*args)\n        return cache[args]\n    return wrapper\n\n@memoize\ndef square(n):\n    print(f'computing {n}')\n    return n * n\n\nprint(square(4))\nprint(square(4))\n",
             "test_code": "_calls = []\n@memoize\ndef _slow(a, b):\n    _calls.append((a, b))\n    return a + b\nassert _slow(1, 2) == 3 and _slow(1, 2) == 3 and _slow(2, 1) == 3\nassert _calls == [(1, 2), (2, 1)], f'the body must run once per distinct input, ran for {_calls}'\n",
             "expected": "computing 4\n16\n16",
             "hints": ["The cache dict lives in memoize, so the wrapper closes over it.", "args is a tuple, so it can be a dict key: if args not in cache: cache[args] = fn(*args).", "Always return cache[args]."]},
            {"instruction": "Write a decorator factory `repeat(times)` so that `@repeat(n)` makes the decorated function return a **list** of `n` results from calling it `n` times with the same arguments. The demo decorates `shout` with `@repeat(3)` (expected: `['VANAKKAM', 'VANAKKAM', 'VANAKKAM']`).",
             "starter": "def repeat(times):\n    # return a decorator; the decorator returns a wrapper that calls fn `times` times\n    def decorator(fn):\n        return fn\n    return decorator\n\n@repeat(3)\ndef shout(word):\n    return word.upper()\n\nprint(shout('vanakkam'))\n",
             "solution": "def repeat(times):\n    def decorator(fn):\n        def wrapper(*args, **kwargs):\n            return [fn(*args, **kwargs) for _ in range(times)]\n        return wrapper\n    return decorator\n\n@repeat(3)\ndef shout(word):\n    return word.upper()\n\nprint(shout('vanakkam'))\n",
             "test_code": "assert repeat(2)(lambda x: x + 1)(1) == [2, 2]\nassert repeat(0)(lambda: 'x')() == [], 'repeat(0) gives an empty list'\n_n = []\n@repeat(4)\ndef _tick():\n    _n.append(1)\n    return len(_n)\nassert _tick() == [1, 2, 3, 4], 'call the function once per repetition'\n",
             "expected": "['VANAKKAM', 'VANAKKAM', 'VANAKKAM']",
             "hints": ["Three layers: repeat(times) -> decorator(fn) -> wrapper(*args, **kwargs).", "wrapper returns [fn(*args, **kwargs) for _ in range(times)].", "decorator returns wrapper, and repeat returns decorator."]},
        ],
        "quiz": [
            ("What is @log above def f exactly equivalent to?", "def f-க்கு மேல் உள்ள @log எதற்குச் சரியாகச் சமம்?",
             ["f = log", "f = log(f)", "log = f(log)", "f() then log()"], ["f = log", "f = log(f)", "log = f(log)", "f() பிறகு log()"], 1),
            ("When does the decorator function itself run?", "Decorator function எப்போது இயங்குகிறது?",
             ["Every time f is called", "Once, when def f is executed", "Only on errors", "Never"],
             ["f அழைக்கப்படும் ஒவ்வொரு முறையும்", "def f இயங்கும்போது ஒரே முறை", "Error-இன்போது மட்டும்", "ஒருபோதும் இல்லை"], 1),
            ("What does functools.wraps(fn) preserve on the wrapper?", "functools.wraps(fn) wrapper-இல் எதைப் பாதுகாக்கிறது?",
             ["The return value", "The function's __name__ and docstring", "The call count", "The arguments"],
             ["Return மதிப்பு", "Function-இன் __name__, docstring", "அழைப்பு எண்ணிக்கை", "Argument-கள்"], 1),
            ("In the lesson example, what is printed on the last line?", "பாட உதாரணத்தில் கடைசி வரியில் என்ன அச்சாகும்?",
             ["wrapper was called 2 times", "greet was called 2 times", "greet was called 0 times", "greet was called 1 times"],
             ["wrapper was called 2 times", "greet was called 2 times", "greet was called 0 times", "greet was called 1 times"], 1),
        ],
    }


@archetype("pipeline", (), "core_concepts")
def _pipeline():
    return {
        "mechanism": "a pipeline of small, testable stages",
        "hook": "Big Ideas Are Small Steps in a Row",
        "analogy": ("Filter coffee is not one magic step: grind, brew the decoction, boil the milk, mix, and pour from a "
                    "height for froth. Each step is simple, can be checked on its own, and feeds the next. To understand "
                    "{T}, we break it into the same kind of stages — data flows in, each stage transforms it, and the result flows out."),
        "why": ["Complex behaviour becomes understandable when you can name and inspect each stage.",
                "Small pure functions are easy to test: same input, same output.",
                "A list of stages can be reordered, extended or traced without rewriting the logic."],
        "compare": ("One big function", "Pipeline of stages", [
            ("Reading the logic", "scroll through one long body", "read a list of named steps"),
            ("Testing", "only end-to-end", "each stage alone"),
            ("Debugging", "print statements everywhere", "inspect the value between stages"),
            ("Changing behaviour", "edit deep inside", "swap or add a stage")]),
        "insight": "When every stage takes the previous stage's output as input, the whole system is just a loop: for stage in stages: data = stage(data).",
        "example": """def clean(items):
    return [x.strip().lower() for x in items]

def keep_valid(items):
    return [x for x in items if x]

def count(items):
    totals = {}
    for x in items:
        totals[x] = totals.get(x, 0) + 1
    return totals

stages = [clean, keep_valid, count]
data = [" Python ", "AI", "", "python", " ai", "Data "]
for stage in stages:
    data = stage(data)
    print(f"{stage.__name__:>10}: {data}")
""",
        "summary": "To understand {T}, model it as data flowing through small stages: each stage is a function from input to output, the stages run in order, and you can inspect the value between any two of them.",
        "steps": [
            ("Name the stages",
             "Start by listing what happens to the data in {T}, in order, as verbs: clean, filter, transform, aggregate. Each verb becomes one small function with one job and a clear input and output.",
             _ds(["clean", "keep_valid", "count"], [0], "the stages, in order")),
            ("Each stage is a function",
             "A stage takes the previous result and returns a new one without changing anything outside itself. Because it has no hidden state, you can call it alone with a tiny example and check the answer in a test.",
             _ds(["[' Python ', 'AI', '']", "['python', 'ai', '']", "['python', 'ai']", "{'python': 1, 'ai': 1}"], [1], "the value after each stage")),
            ("Run them in a loop",
             "The pipeline itself is one loop: for stage in stages: data = stage(data). Printing inside that loop gives a full trace of how {T} transforms the input, which is the fastest way to find the stage that misbehaves.",
             _flow([("in", "input data", "start"), ("s1", "stage 1"), ("s2", "stage 2"), ("s3", "stage 3"), ("out", "result", "end")],
                   [("in", "s1"), ("s1", "s2"), ("s2", "s3"), ("s3", "out")], ["in", "s1", "s2", "s3", "out"], "Data flowing through the pipeline")),
            ("Order matters",
             "Stages are not always interchangeable: counting before cleaning would treat ' Python ' and 'python' as different words. Thinking about which stage must come first is a big part of understanding how {T} works.",
             None),
            ("Grow it safely",
             "New requirements become new stages — add a stage that removes stop-words, or one that sorts the counts — and each can be tested alone before it joins the list. The rest of the pipeline does not change.",
             _cmp("One big function", "def process(items):\n    # 40 lines of mixed logic\n    ...", "Pipeline",
                  "stages = [clean, keep_valid, count]\nfor stage in stages:\n    data = stage(data)")),
        ],
        "takeaway": "Breaking {T} into named stages that each take and return data makes it readable, testable and easy to extend — and the whole system becomes one simple loop.",
        "concepts": ["functions", "composition", "pipelines", "testing"],
        "required": ["functions", "lists", "loops"],
        "challenges": [
            {"instruction": "Write `run_pipeline(data, stages)` that passes `data` through each function in `stages`, in order, and returns the final result (with no stages it returns `data` unchanged). The demo doubles, sorts and sums `[3, 1, 2]` (expected: `12`).",
             "starter": "def double(xs):\n    return [x * 2 for x in xs]\n\ndef run_pipeline(data, stages):\n    # feed the output of each stage into the next\n    return None\n\nprint(run_pipeline([3, 1, 2], [double, sorted, sum]))\n",
             "solution": "def double(xs):\n    return [x * 2 for x in xs]\n\ndef run_pipeline(data, stages):\n    for stage in stages:\n        data = stage(data)\n    return data\n\nprint(run_pipeline([3, 1, 2], [double, sorted, sum]))\n",
             "test_code": "assert run_pipeline([1, 2], []) == [1, 2], 'no stages: return data unchanged'\nassert run_pipeline('  Hi ', [str.strip, str.lower]) == 'hi'\nassert run_pipeline(3, [lambda x: x + 1, lambda x: x * 10]) == 40, 'stages must run in order'\n",
             "expected": "12",
             "hints": ["Loop over the stages: for stage in stages:", "Replace data with the stage's output each time: data = stage(data).", "Return data after the loop."]},
            {"instruction": "Write `top_words(text, n)` that lower-cases `text`, splits it into words, counts them, and returns the `n` most common as a list of `(word, count)` tuples sorted by count (highest first) and then alphabetically. The demo prints the top 2 words of a short sentence (expected: `[('the', 3), ('and', 2)]`).",
             "starter": "def top_words(text, n):\n    counts = {}\n    # count lower-cased words, then sort by (-count, word) and keep the first n\n    return []\n\nprint(top_words('The cat and the hat and the bat', 2))\n",
             "solution": "def top_words(text, n):\n    counts = {}\n    for word in text.lower().split():\n        counts[word] = counts.get(word, 0) + 1\n    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]\n\nprint(top_words('The cat and the hat and the bat', 2))\n",
             "test_code": "assert top_words('b a b a c', 2) == [('a', 2), ('b', 2)], 'ties are broken alphabetically'\nassert top_words('Go go GO stop', 1) == [('go', 3)], 'count words case-insensitively'\nassert top_words('', 3) == []\n",
             "expected": "[('the', 3), ('and', 2)]",
             "hints": ["text.lower().split() gives the words.", "counts[word] = counts.get(word, 0) + 1 counts them.", "sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n] gives the top n."]},
        ],
        "quiz": [
            ("What does the core pipeline loop look like?", "Pipeline-இன் மைய loop எப்படி இருக்கும்?",
             ["for stage in stages: data = stage(data)", "while True: pass", "data = stages(data)", "for data in stages: stage()"],
             ["for stage in stages: data = stage(data)", "while True: pass", "data = stages(data)", "for data in stages: stage()"], 0),
            ("Why are small stage functions easy to test?", "சிறிய stage function-களைச் சோதிப்பது ஏன் எளிது?",
             ["They are slower", "Each has one job and gives the same output for the same input", "They use global variables", "They cannot fail"],
             ["அவை மெதுவானவை", "ஒவ்வொன்றுக்கும் ஒரே வேலை; ஒரே input-க்கு ஒரே output", "Global variable-களைப் பயன்படுத்துகின்றன", "தோல்வியடைய முடியாது"], 1),
            ("In the lesson example, what does the final stage produce?", "பாட உதாரணத்தில் கடைசி stage என்ன தருகிறது?",
             ["['python', 'ai', 'data']", "{'python': 2, 'ai': 2, 'data': 1}", "6", "{'Python': 1, 'AI': 1}"],
             ["['python', 'ai', 'data']", "{'python': 2, 'ai': 2, 'data': 1}", "6", "{'Python': 1, 'AI': 1}"], 1),
            ("Why does stage order matter?", "Stage வரிசை ஏன் முக்கியம்?",
             ["It does not matter", "Each stage depends on the shape of the previous stage's output", "Python runs them in parallel", "Only the first stage runs"],
             ["முக்கியமில்லை", "ஒவ்வொரு stage-உம் முந்தைய stage output-இன் வடிவத்தைச் சார்ந்துள்ளது", "Python அவற்றை இணையாக இயக்குகிறது", "முதல் stage மட்டும் இயங்கும்"], 1),
        ],
    }


def pick_archetype(topic: str, track: str, concepts: str) -> str:
    text = f" {topic} {concepts} ".lower()
    for key, spec in ARCHETYPES.items():
        if any(kw in text for kw in spec["keywords"]):
            return key
    return {"deep_learning": "attention", "ai_agents": "tools", "python_internals": "decorators",
            "python_intermediate": "decorators"}.get(track, "pipeline")


def slugify(topic: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", topic.lower()).strip("_")
    return (slug or "untitled_topic")[:48].rstrip("_")


def _fill(text: str, topic: str) -> str:
    return text.replace("{T}", topic)


# ----------------------------------------------------------------------------------------------------------------
# Lesson assembly
# ----------------------------------------------------------------------------------------------------------------
def build_story(a: dict, topic: str, difficulty: str, example_stdout: str) -> str:
    left, right, rows = a["compare"]
    table = [f"| Aspect | {left} | {right} |", "|---|---|---|"] + [f"| {r[0]} | {r[1]} | {r[2]} |" for r in rows]
    stretch = {"beginner": "Take it one step at a time — every idea below comes with code you can run.",
               "intermediate": "You already know the basics; today we look at the mechanism underneath.",
               "advanced": "We go straight to the mechanism and the edge cases that bite in production."}[difficulty]
    return "\n".join([
        f"## {topic}: {a['hook']}",
        "",
        f"\"{_fill(a['analogy'], topic)}\" Vaathiyaar says. {stretch}",
        "",
        "### Why it matters",
        "",
        *[f"- {w}" for w in a["why"]],
        "",
        f"### {left} vs {right}",
        "",
        *table,
        "",
        "### See it run",
        "",
        "```python",
        a["example"].rstrip(),
        "```",
        "",
        "Output:",
        "",
        "```",
        example_stdout.rstrip(),
        "```",
        "",
        f"> **Key Insight:** {a['insight']}",
        "",
        f"Today you will build {a['mechanism']} yourself in two practice challenges, then check your understanding in a short quiz.",
    ])


def enhance_story_with_llm(story: str, topic: str, example: str) -> tuple:
    """Optional: rewrite the narrative with a Hugging Face InferenceClient. Graded artifacts are never touched."""
    if not HF_TOKEN:
        return story, "deterministic (no HF_TOKEN secret set)"
    try:
        from huggingface_hub import InferenceClient
        client = InferenceClient(model=LLM_MODEL, token=HF_TOKEN, timeout=60)
        prompt = (
            "You are Vaathiyaar, the warm, story-first Python teacher of pymasters.net (Story -> Visual -> Code). "
            f"Rewrite this lesson story about '{topic}' to be more vivid for Indian learners from Class 6 to working "
            "professionals. Keep every '##' and '###' heading, keep the markdown table, keep the ```python code block "
            "and its Output block EXACTLY unchanged, and keep the line starting with '> **Key Insight:**'. Do not add new "
            "facts or numbers. Return only the markdown.\n\n" + story
        )
        resp = client.chat_completion(messages=[{"role": "user", "content": prompt}], max_tokens=1400, temperature=0.4)
        text = (resp.choices[0].message.content or "").strip()
        if text.startswith("```markdown"):
            text = text[len("```markdown"):].rsplit("```", 1)[0].strip()
        ok = (example.rstrip() in text and "> **Key Insight:**" in text and "## " in text and "|---|" in text.replace(" ", ""))
        return (text, f"enhanced by {LLM_MODEL}") if ok else (story, f"deterministic ({LLM_MODEL} output failed structure checks)")
    except Exception as exc:
        return story, f"deterministic (InferenceClient error: {type(exc).__name__})"


def build_lesson(topic, track, module, difficulty, concepts, order, use_llm):
    topic = re.sub(r"\s+", " ", (topic or "").strip())[:60] or "Asyncio TaskGroups in Python 3.11"
    track = track if track in TRACKS else "ai_engineering"
    difficulty = difficulty if difficulty in DIFFICULTIES else "intermediate"
    key = pick_archetype(topic, track, concepts or "")
    a = ARCHETYPES[key]["build"]()
    lesson_id = slugify(topic)
    module = slugify(module) if (module or "").strip() else ARCHETYPES[key]["module"]
    taught = [slugify(c) for c in (concepts or "").split(",") if c.strip()] or a["concepts"]

    ex = run_python(a["example"])
    example_stdout = ex["output"] if ex["exit_code"] == 0 else f"(example failed)\n{ex['error']}"
    story = build_story(a, topic, difficulty, example_stdout)
    story_source = "deterministic"
    if use_llm:
        story, story_source = enhance_story_with_llm(story, topic, a["example"])

    uth = {
        "summary": _fill(a["summary"], topic),
        "steps": [{"title": _fill(t, topic), "body": _fill(b, topic), **({"visual": json.loads(json.dumps(v).replace("{T}", json.dumps(topic)[1:-1]))} if v else {})}
                  for t, b, v in a["steps"]],
        "takeaway": _fill(a["takeaway"], topic),
    }
    challenges, solutions = [], []
    for i, ch in enumerate(a["challenges"]):
        challenges.append({"instruction": {"en": ch["instruction"]}, "starter_code": ch["starter"],
                           "expected_output": ch["expected"], "hints": {"en": ch["hints"]}, "test_code": ch["test_code"]})
        run = run_python(ch["solution"])
        solutions.append({"index": i, "code": ch["solution"], "verified_output": run["output"].strip(),
                          "source": f"PyMasters AI Lesson Studio {date.today().isoformat()}, verified with pymasters.net grading rules"})
    quiz = [{"q": {"en": q[0], "ta": q[1]}, "options": {"en": q[2], "ta": q[3]}, "correct": q[4]} for q in a["quiz"]]
    lesson = {
        "id": lesson_id,
        "topic": lesson_id,
        "track": track,
        "module": module,
        "order": max(1, int(order or 1)),
        "title": {"en": f"{topic}: {a['hook']}"},
        "description": {"en": f"Learn how {topic} works by building {a['mechanism']} step by step, with runnable code and graded practice."},
        "xp_reward": XP[difficulty],
        "next_unlock": None,
        "story_variants": {"en": story},
        "animation_sequence": [
            {"type": "StoryCard", "id": "intro", "content": "story_variant", "visual_theme": key, "duration_ms": 4000},
            {"type": "ConceptMap", "id": "map", "nodes": [{"label": topic, "children": [c.replace("_", " ") for c in taught[:5]]}], "duration_ms": 3000},
            {"type": "TerminalOutput", "id": "run", "lines": example_stdout.strip().splitlines()[:8], "duration_ms": 4000},
            {"type": "ParticleEffect", "id": "done", "theme": "solved", "duration_ms": 2000},
        ],
        "practice_challenges": challenges,
        "tags": {"concepts_taught": taught, "concepts_required": a["required"], "difficulty": difficulty,
                 "engagement_type": "hands_on", "estimated_minutes": MINUTES[difficulty], "category": track,
                 "path_memberships": [track]},
        "generated": True,
        "quiz": quiz,
        "under_the_hood": uth,
        "uth_example": a["example"],
    }
    solution_file = {"lesson_id": lesson_id, "challenges": solutions}
    report = validate_lesson(lesson, a, solutions, ex)
    return {"lesson": lesson, "solutions": solution_file, "archetype": key, "example_stdout": example_stdout,
            "story_source": story_source, "report": report, "references": [ch["solution"] for ch in a["challenges"]]}


REQUIRED_KEYS = ["id", "topic", "track", "module", "order", "title", "description", "xp_reward", "story_variants",
                 "animation_sequence", "practice_challenges"]


def validate_lesson(lesson, a, solutions, example_run) -> list:
    """Return (check, passed, detail) rows — the same checks pymasters.net CI applies to a new lesson."""
    rows = []
    missing = [k for k in REQUIRED_KEYS if k not in lesson]
    rows.append(("Schema: required lesson keys", not missing, "all present" if not missing else f"missing {missing}"))
    errs = validate_under_the_hood(lesson["under_the_hood"])
    rows.append(("validate_under_the_hood", not errs, "valid" if not errs else "; ".join(errs)))
    story = lesson["story_variants"]["en"]
    story_ok = all(s in story for s in ("## ", "|---|", "```python", "> **Key Insight:**"))
    rows.append(("Story: headings, table, runnable code, Key Insight", story_ok, "ok" if story_ok else "missing a required element"))
    lines = [ln for ln in a["example"].strip().splitlines()]
    ex_ok = example_run["exit_code"] == 0 and bool(example_run["output"].strip()) and 6 <= len(lines) <= 30
    ex_ok = ex_ok and all(a["example"].strip() != ch["solution"].strip() for ch in a["challenges"])
    rows.append(("uth_example: 6-30 lines, runs, prints, not a challenge answer", ex_ok, f"{len(lines)} lines, exit {example_run['exit_code']}"))
    for i, ch in enumerate(a["challenges"]):
        n = i + 1
        vac = harness_is_vacuous(ch["test_code"])
        rows.append((f"Challenge {n}: harness fails on its own (non-vacuous)", vac is False, "needs the learner's names" if vac is False else "passes alone or inconclusive"))
        sol = grade_submission(ch["solution"], ch["expected"], ch["test_code"])
        rows.append((f"Challenge {n}: reference solution passes", sol["success"], sol["error"].strip().splitlines()[-1] if sol["error"].strip() else "PASS"))
        out_ok = output_matches(solutions[i]["verified_output"], ch["expected"])
        rows.append((f"Challenge {n}: expected_output is what the solution prints", out_ok, repr(solutions[i]["verified_output"])[:80]))
        rejects = {name: not grade_submission(code, ch["expected"], ch["test_code"])["success"]
                   for name, code in (("empty program", ""), ("print('hi')", 'print("hi")\n'), ("unchanged starter", ch["starter"]))}
        rows.append((f"Challenge {n}: empty / print('hi') / starter all fail", all(rejects.values()),
                     ", ".join(f"{k}: {'rejected' if v else 'ACCEPTED'}" for k, v in rejects.items())))
    q_ok = len(lesson["quiz"]) == 4 and all(len(q["options"]["en"]) == len(q["options"]["ta"]) == 4 and 0 <= q["correct"] < 4 and q["q"].get("ta") for q in lesson["quiz"])
    rows.append(("Quiz: 4 bilingual questions with valid answers", q_ok, "en + ta" if q_ok else "invalid quiz"))
    return rows


def report_markdown(rows) -> str:
    passed = sum(1 for _, ok, _ in rows if ok)
    badge = "✅ READY TO COMMIT" if passed == len(rows) else f"❌ {len(rows) - passed} CHECK(S) FAILED"
    lines = [f"### {badge} · {passed}/{len(rows)} checks", "", "| Check | Result | Detail |", "|---|---|---|"]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} | {str(detail).replace('|', '/')} |" for name, ok, detail in rows]
    return "\n".join(lines)


def uth_markdown(uth: dict) -> str:
    out = [f"**Summary:** {uth['summary']}", ""]
    for i, st in enumerate(uth["steps"], 1):
        out.append(f"#### Step {i} · {st['title']}")
        out.append(st["body"])
        if "visual" in st:
            out.append(f"*Visual: `{st['visual']['type']}`* — `{json.dumps(st['visual']['props'])[:220]}`")
        out.append("")
    out.append(f"**Takeaway:** {uth['takeaway']}")
    return "\n".join(out)


def challenges_markdown(lesson: dict, references: list) -> str:
    out = []
    for i, ch in enumerate(lesson["practice_challenges"]):
        out += [f"### Practice Challenge {i + 1}", ch["instruction"]["en"], "", "**Starter code**", "```python", ch["starter_code"].rstrip(), "```",
                "**Hints**", *[f"{j}. {h}" for j, h in enumerate(ch["hints"]["en"], 1)], "",
                "**Expected output**", "```", ch["expected_output"], "```", "**test_code harness**", "```python", ch["test_code"].rstrip(), "```",
                "<details><summary>Verified reference solution</summary>", "", "```python", references[i].rstrip(), "```", "</details>", ""]
    return "\n".join(out)


def quiz_markdown(quiz: list) -> str:
    out = []
    for i, q in enumerate(quiz, 1):
        out.append(f"**Q{i}. {q['q']['en']}**  \n*{q['q']['ta']}*")
        for j, (en, ta) in enumerate(zip(q["options"]["en"], q["options"]["ta"])):
            mark = " ✅" if j == q["correct"] else ""
            out.append(f"- {chr(65 + j)}. {en} / {ta}{mark}")
        out.append("")
    return "\n".join(out)


def generate(topic, track, module, difficulty, concepts, order, use_llm):
    bundle = build_lesson(topic, track, module, difficulty, concepts, order, use_llm)
    lesson, sols = bundle["lesson"], bundle["solutions"]
    lesson_json = json.dumps(lesson, indent=2, ensure_ascii=False) + "\n"
    sol_json = json.dumps(sols, indent=2, ensure_ascii=False) + "\n"
    out_dir = tempfile.mkdtemp(prefix="pymasters_lesson_")
    lesson_path = os.path.join(out_dir, f"{lesson['id']}.json")
    sol_path = os.path.join(out_dir, f"{lesson['id']}.solutions.json")
    with open(lesson_path, "w", encoding="utf-8") as fh:
        fh.write(lesson_json)
    with open(sol_path, "w", encoding="utf-8") as fh:
        fh.write(sol_json)
    header = (f"**Lesson id:** `{lesson['id']}` · **mechanism archetype:** `{bundle['archetype']}` · "
              f"**story:** {bundle['story_source']} · **XP:** {lesson['xp_reward']}")
    paths = (f"Commit as:\n- `backend/lessons/{lesson['track']}/{lesson['id']}.json`\n- `ops/e2e/solutions/{lesson['id']}.json`\n\n"
             "Then run `pytest backend/tests/test_every_lesson_is_complete.py` in the PyMasters repo.")
    first = lesson["practice_challenges"][0]
    return (bundle, header, lesson["story_variants"]["en"], uth_markdown(lesson["under_the_hood"]), lesson["uth_example"],
            bundle["example_stdout"], challenges_markdown(lesson, bundle["references"]), quiz_markdown(lesson["quiz"]),
            lesson_json, sol_json, report_markdown(bundle["report"]), paths, [lesson_path, sol_path],
            gr.update(value="Challenge 1"), first["instruction"]["en"], first["starter_code"], "", "")


def select_challenge(bundle, which):
    if not bundle:
        return "Generate a lesson first.", ""
    ch = bundle["lesson"]["practice_challenges"][0 if which == "Challenge 1" else 1]
    return ch["instruction"]["en"], ch["starter_code"]


def load_reference(bundle, which):
    if not bundle:
        return ""
    return bundle["references"][0 if which == "Challenge 1" else 1]


def grade_in_sandbox(bundle, which, code):
    if not bundle:
        return "Generate a lesson first.", ""
    ch = bundle["lesson"]["practice_challenges"][0 if which == "Challenge 1" else 1]
    blocked = safety_gate(code)
    if blocked:
        return f"### ⛔ Not run\n{blocked}", ""
    res = grade_submission(code or "", ch["expected_output"], ch["test_code"])
    verdict = "### ✅ PASS — you nailed this challenge!" if res["success"] else "### ❌ FAIL — not yet"
    detail = f"\n\nGraded by: **{res['mode']}** (pymasters.net rules: learner code + test_code harness must run to the end)."
    if res["error"].strip():
        detail += f"\n\n**What went wrong:**\n```text\n{res['error'].strip()[-1500:]}\n```"
    return verdict + detail, res["output"]


with gr.Blocks(title=TITLE, theme=gr.themes.Soft(primary_hue="purple", secondary_hue="indigo")) as demo:
    gr.Markdown(f"# {TITLE}\nType **any** Python or AI topic and get a complete, graded [pymasters.net]({PYMASTERS_URL}) lesson: "
                "Vaathiyaar story, Under the Hood explainer, traceable example, two practice challenges with verified solutions, "
                "a bilingual quiz, commit-ready JSON and a live grading sandbox. No paid keys needed.")
    state = gr.State(None)
    with gr.Row():
        topic = gr.Textbox(label="Topic (anything!)", value="Asyncio TaskGroups in Python 3.11", scale=3,
                           placeholder="FlashAttention-2 Tiling · LoRA Fine-Tuning from Scratch · MCP Tool Servers · GraphRAG with NetworkX")
        track = gr.Dropdown(TRACKS, value="python_intermediate", label="Track", scale=1)
        difficulty = gr.Radio(DIFFICULTIES, value="intermediate", label="Difficulty", scale=1)
    with gr.Row():
        module = gr.Textbox(label="Module (optional, snake_case)", placeholder="auto from topic")
        concepts = gr.Textbox(label="Key concepts (comma-separated, optional)", placeholder="task_group, event_loop")
        order = gr.Number(value=1, precision=0, label="Order in module")
        use_llm = gr.Checkbox(value=bool(HF_TOKEN), label="Enhance story with HF InferenceClient" + ("" if HF_TOKEN else " (set HF_TOKEN secret)"),
                              interactive=bool(HF_TOKEN))
    gen_btn = gr.Button("Generate complete lesson", variant="primary")
    gr.Examples([["FlashAttention-2 Tiling", "deep_learning", "advanced"], ["LoRA Fine-Tuning from Scratch", "deep_learning", "intermediate"],
                 ["Asyncio TaskGroups in Python 3.11", "python_intermediate", "intermediate"], ["MCP Tool Servers", "ai_agents", "intermediate"],
                 ["GraphRAG with NetworkX", "ai_engineering", "advanced"], ["Python Decorators", "python_internals", "beginner"]],
                [topic, track, difficulty])
    header = gr.Markdown()
    with gr.Tabs():
        with gr.Tab("1 · Generate Lesson (Vaathiyaar Story + Under the Hood + Practice Challenges)"):
            with gr.Accordion("1. Vaathiyaar story (story_variants.en)", open=True):
                story_md = gr.Markdown()
            with gr.Accordion("2. Under the Hood — How It Works (under_the_hood)", open=True):
                uth_md = gr.Markdown()
            with gr.Accordion("3. Python's view: traceable uth_example + real stdout", open=True):
                with gr.Row():
                    uth_code = gr.Code(label="uth_example", language="python")
                    uth_out = gr.Textbox(label="Actual execution stdout", lines=12)
            with gr.Accordion("4. Practice challenges (with harnesses and verified solutions)", open=False):
                ch_md = gr.Markdown()
            with gr.Accordion("5. Bilingual concept quiz (en + ta)", open=False):
                quiz_md = gr.Markdown()
        with gr.Tab("2 · Complete PyMasters Lesson JSON & Solution Artifact"):
            report_md = gr.Markdown()
            paths_md = gr.Markdown()
            files = gr.File(label="Download lesson + solution files", file_count="multiple")
            with gr.Row():
                lesson_code = gr.Code(label="backend/lessons/<track>/<id>.json", language="json")
                sol_code = gr.Code(label="ops/e2e/solutions/<id>.json", language="json")
        with gr.Tab("3 · Live Python Practice Sandbox"):
            gr.Markdown("Edit the code and grade it exactly like pymasters.net: your program runs with the challenge's `test_code` "
                        "harness and must reach the end without an error. Imports such as `os`, `subprocess` and `socket` are disabled here.")
            which = gr.Radio(["Challenge 1", "Challenge 2"], value="Challenge 1", label="Challenge")
            sb_instr = gr.Markdown()
            sb_code = gr.Code(label="Your solution", language="python", interactive=True, lines=18)
            with gr.Row():
                starter_btn = gr.Button("Reset to starter code")
                ref_btn = gr.Button("Load verified reference solution")
                grade_btn = gr.Button("Run & grade", variant="primary")
            sb_verdict = gr.Markdown()
            sb_out = gr.Textbox(label="Program output", lines=8)

    gen_inputs = [topic, track, module, difficulty, concepts, order, use_llm]
    gen_outputs = [state, header, story_md, uth_md, uth_code, uth_out, ch_md, quiz_md, lesson_code, sol_code, report_md,
                   paths_md, files, which, sb_instr, sb_code, sb_verdict, sb_out]
    gen_btn.click(generate, gen_inputs, gen_outputs)
    demo.load(generate, gen_inputs, gen_outputs)
    which.change(select_challenge, [state, which], [sb_instr, sb_code])
    starter_btn.click(select_challenge, [state, which], [sb_instr, sb_code])
    ref_btn.click(load_reference, [state, which], sb_code)
    grade_btn.click(grade_in_sandbox, [state, which, sb_code], [sb_verdict, sb_out])
    gr.Markdown(f"---\n**Built by [PyMasters]({PYMASTERS_URL})** — Story -> Visual -> Code | Try **[Homie]({HOMIE_URL})**, a privacy-first local AI assistant.")

if __name__ == "__main__":
    demo.launch()
'''

_APP_BY_MODE = {"embeddings": _APP_EMBEDDINGS, "tts": _APP_TTS, "llm": _APP_LLM, "agent": _APP_AGENT}

_META_KEYS = ("title", "tagline", "description", "opportunity", "score", "sources", "merged_spaces", "architecture", "curriculum")


def build_unified_space_code(spec: dict) -> str:
    """Generate app.py for one consolidated multi-tab Space from its KNOWN_MUTHU88_SPACES entry."""
    meta = {k: spec[k] for k in _META_KEYS}
    meta["title"] = clean_text(meta["title"])
    meta["description"] = clean_text(meta["description"])
    prelude = (
        _APP_COMMON.replace("__TITLE_DOC__", meta["title"].replace('"', "'"))
        .replace("__SPACE_META__", repr(json.dumps(meta, ensure_ascii=False)))
    )
    return prelude + _APP_BY_MODE[spec["mode"]] + _APP_BRIEF_TAB_AND_LAUNCH


def build_lesson_generator_space_code() -> str:
    """Generate app.py for Muthu88/pymasters-ai-lesson-generator (PyMasters AI Lesson Studio)."""
    return _APP_LESSON.replace("__TITLE__", repr(LESSON_GENERATOR_SPACE["title"]))


def _space_readme_body(spec: dict) -> str:
    lines = ["## What's inside", ""]
    if spec.get("mode"):
        lines += [f"- {row[1]} (`{row[0]}`) — {row[2]}" for row in spec["curriculum"]]
        merged = ", ".join(f"`{s}`" for s in spec.get("merged_spaces", []))
        if merged:
            lines += ["", f"This Space consolidates the former {merged} Space."]
        lines += ["", "## Sources", ""] + [f"- [{s['title']}]({s['url']})" for s in spec["sources"]]
    else:
        lines += [
            "1. **Generate Lesson** — Vaathiyaar story, Under the Hood explainer, traceable `uth_example` with real stdout, "
            "two practice challenges with `test_code` harnesses and verified solutions, and a bilingual (en + ta) quiz.",
            "2. **Lesson JSON & Solution Artifact** — ready-to-commit `backend/lessons/<track>/<id>.json` and "
            "`ops/e2e/solutions/<id>.json`, with a live `validate_under_the_hood` and grading-harness badge.",
            "3. **Live Python Practice Sandbox** — edit a solution and grade it with pymasters.net rules (PASS / FAIL).",
            "",
            "Runs on CPU Basic with no paid keys. Optional: add an `HF_TOKEN` secret (a fine-grained, inference-only token) "
            "to let a Hugging Face InferenceClient polish the story text; graded code is never generated by the LLM.",
        ]
    return "\n".join(lines)


def _resolve_token(token: str | None) -> str:
    tok = token or os.environ.get("HF_TOKEN") or ""
    path = os.path.expanduser("~/.cache/huggingface/token")
    if not tok and os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            tok = f.read().strip()
    return tok


def delete_space(repo_id: str, token: str | None = None) -> dict:
    """Delete a Space; a Space that is already gone counts as deleted (missing_ok)."""
    log.info(f"Deleting merged HF Space: {repo_id}")
    try:
        if HfApi is not None:
            HfApi(token=token).delete_repo(repo_id=repo_id, repo_type="space", missing_ok=True)
        else:
            org, name = repo_id.split("/", 1)
            req = urllib.request.Request(
                "https://huggingface.co/api/repos/delete",
                data=json.dumps({"type": "space", "name": name, "organization": org}).encode("utf-8"),
                headers={"Authorization": f"Bearer {_resolve_token(token)}", "Content-Type": "application/json"},
                method="DELETE",
            )
            try:
                urllib.request.urlopen(req, timeout=30).close()
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
        return {"repo_id": repo_id, "status": "deleted"}
    except Exception as e:
        log.error(f"Failed to delete Space '{repo_id}': {e}")
        return {"repo_id": repo_id, "status": f"failed: {e}"}


def consolidate_and_publish_all_spaces(token: str | None = None, delete_merged: bool = True) -> list[dict]:
    """Publish the 4 consolidated multi-tab Spaces + the AI Lesson Studio, then delete the 4 merged redundant Spaces.

    A redundant Space is deleted only after the consolidated Space it was merged into has published successfully, so a
    failed upload never leaves its content with nowhere to live.
    """
    results = []
    published_ok = set()
    for spec in KNOWN_MUTHU88_SPACES:
        res = publish_space(
            spec["title"], spec["description"], build_unified_space_code(spec), token=token, repo_id=spec["repo_id"],
            requirements=spec["requirements"], extra_content=_space_readme_body(spec), emoji=spec["emoji"],
            color_from=spec["color_from"], color_to=spec["color_to"], tags=spec["tags"],
            commit_message=f"Consolidate {', '.join(spec['merged_spaces'])} into multi-tab {spec['repo_id']} lab",
        )
        res["action"] = "publish_consolidated"
        results.append(res)
        if res["status"] == "published":
            published_ok.add(spec["repo_id"])

    lg = LESSON_GENERATOR_SPACE
    res = publish_space(
        lg["title"], lg["description"], build_lesson_generator_space_code(), token=token, repo_id=lg["repo_id"],
        requirements=lg["requirements"], extra_content=_space_readme_body(lg), emoji=lg["emoji"],
        color_from=lg["color_from"], color_to=lg["color_to"], tags=lg["tags"],
        commit_message="Publish PyMasters AI Lesson Studio: generate complete interactive lessons for any topic",
    )
    res["action"] = "publish_lesson_generator"
    results.append(res)

    if delete_merged:
        for redundant, target in MERGED_REDUNDANT_SPACES.items():
            if target in published_ok:
                res = delete_space(redundant, token=token)
            else:
                res = {"repo_id": redundant, "status": f"skipped: {target} did not publish"}
            res["action"] = "delete_merged"
            results.append(res)
    return results


def repair_and_enhance_all_spaces(token: str | None = None) -> list[dict]:
    """Backward-compatible alias: consolidate, publish and clean up all Muthu88 Spaces."""
    return consolidate_and_publish_all_spaces(token=token, delete_merged=True)
