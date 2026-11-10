"""Source material: real PyMasters lessons (explanations, tables, runnable code, practice tasks).

The old pipeline fed the writer one trending item a day whose 'description' was often just a tag
list, so scripts had nothing concrete to explain. Every piece of content here is built from a full
lesson, and links back to it."""
import glob
import json
import random
import re
from datetime import date

from socialbot import config, store

# What the channel's own numbers say works: specific, practical, intermediate Python + AI engineering
# (RAG 266 views, GIL 155, list comprehensions 60, agents 37) — vs. 1-5 views for kiddy metaphors.
TRACK_WEIGHT = {
    "python_internals": 3.0, "ai_engineering": 3.0, "async_concurrency": 2.5, "performance_optimization": 2.5,
    "python_intermediate": 2.5, "python_modern": 2.5, "ai_agents": 2.5, "transformers_scratch": 2.5,
    "functional_python": 2.0, "debugging_mastery": 2.0, "error_handling": 1.5, "regex_mastery": 1.5,
    "testing_devops": 1.5, "working_with_data": 2.0, "machine_learning": 2.0, "deep_learning_complete": 2.0,
    "deep_learning": 1.5, "dsa": 2.0, "trending_ai": 2.0, "vibe_coding": 1.5, "fun_automation": 1.5,
    "web_development": 1.5, "python_fundamentals": 1.0, "ai_fundamentals": 1.0, "ai_ml_foundations": 1.0,
}
CODE_RE = re.compile(r"```python\n(.*?)```", re.S)

# Our 5 live unified Gradio 5.23.1 Hugging Face Spaces (Muthu88/pymasters-*), posted one-by-one in random order
# across both LinkedIn posts and YouTube Shorts without repeating until all 5 have been covered.
HF_SPACES = [
    {
        "slug": "pymasters-ai-lesson-generator",
        "title": "PyMasters AI Lesson Studio: AST-Verified Code Sandboxes",
        "track": "ai_engineering",
        "difficulty": "intermediate",
        "topic": "AST verification and deterministic grading for AI-generated Python lessons",
        "description": (
            "Interactive Hugging Face Space that generates PyMasters AI & Python lessons with AST syntax "
            "validation, complexity checks, and runnable practice challenges."
        ),
        "concepts": ["ast.parse", "deterministic grading", "curriculum generation", "sandbox verification"],
        "story": """When an LLM generates a coding tutorial, roughly one in five code snippets contains a subtle bug, hallucinated import, or mismatched output claim. In the PyMasters AI Lesson Studio on Hugging Face Spaces, every generated lesson must pass a deterministic Python AST and execution gate before a learner ever sees it.

Instead of trusting the model's prose, the studio parses every code block into an Abstract Syntax Tree with `ast.parse`, inspects the nodes to verify which constructs are actually used, and runs each practice challenge against its expected stdout in an isolated subprocess.

```python
import ast

def audit_snippet(code: str, required: str) -> dict:
    tree = ast.parse(code)
    nodes = {type(n).__name__ for n in ast.walk(tree)}
    funcs = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    return {"valid": required in nodes, "funcs": funcs, "nodes": len(nodes)}

sample = "def sq(items):\\n    return [x * x for x in items]\\nprint(sq([2, 3, 4]))"
print(audit_snippet(sample, "ListComp"))
```

Running that snippet prints `{'valid': True, 'funcs': ['sq'], 'nodes': 16}`. By combining `ast.walk` structural checks with real stdout comparison, the Lesson Studio guarantees that a challenge asking for a list comprehension cannot be passed by a `for` loop or a hardcoded print statement.

```python
import ast

def uses_comprehension(src: str) -> bool:
     kinds = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
     return any(isinstance(n, kinds) for n in ast.walk(ast.parse(src)))

print(uses_comprehension("[n * 2 for n in range(4)]"))
print(uses_comprehension("list(map(lambda n: n * 2, range(4)))"))
```

You can generate custom lessons on any Python or AI topic, inspect the live JSON curriculum schema, and run the interactive challenge verifier directly in the Hugging Face Space or on pymasters.net.""",
        "challenges": [
            {
                "instruction": "Use ast.walk(ast.parse(code)) to count how many FunctionDef nodes exist in a snippet.",
                "expected_output": "2",
            }
        ],
    },
    {
        "slug": "pymasters-sentence-transformersall-minilm-l6-v2",
        "title": "Semantic Search Studio: Hybrid BM25 + Dense Retrieval with RRF",
        "track": "ai_engineering",
        "difficulty": "intermediate",
        "topic": "Cosine similarity embeddings and Reciprocal Rank Fusion across MiniLM and BGE",
        "description": (
            "Interactive Hugging Face Space comparing MiniLM-L6-v2 and BGE-small-en-v1.5 dense embeddings "
            "with cosine similarity matrices and Reciprocal Rank Fusion (RRF)."
        ),
        "concepts": ["cosine similarity", "Reciprocal Rank Fusion", "dense embeddings", "hybrid retrieval"],
        "story": """Dense embedding models like `all-MiniLM-L6-v2` and `bge-small-en-v1.5` map sentences into unit vectors so semantic similarity becomes a simple dot product. Yet pure vector search often misses exact error codes, function names, or version numbers that keyword search catches effortlessly.

In the PyMasters Semantic Search & Embeddings Studio on Hugging Face Spaces, you can compare dense cosine similarity side by side with hybrid Reciprocal Rank Fusion (RRF). RRF merges rankings from two different retrievers—such as keyword BM25 and dense cosine similarity—without needing to calibrate raw score scales.

```python
import math

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return round(dot / (na * nb), 3)

q = [0.8, 0.6, 0.0]
docs = {"gil": [0.7, 0.7, 0.1], "sql": [0.1, 0.2, 0.9]}
print({k: cosine(q, v) for k, v in docs.items()})
```

When two encoders or a keyword + vector retriever rank documents differently, Reciprocal Rank Fusion scores each document by `1 / (k + rank)` across every ranker and sums the reciprocals:

```python
def rrf(rankings: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for rank_list in rankings:
        for rank, doc in enumerate(rank_list, start=1):
            scores[doc] = round(scores.get(doc, 0.0) + 1.0 / (k + rank), 5)
    return sorted(scores.items(), key=lambda x: -x[1])

dense = ["doc_b", "doc_a", "doc_c"]
keyword = ["doc_a", "doc_c", "doc_b"]
print(rrf([dense, keyword], k=60)[:2])
```

`doc_a` wins because it ranks near the top in both systems (`0.03252`), beating a document that only one model liked. Try your own queries across MiniLM and BGE in the live Hugging Face Space and explore the full retrieval track on pymasters.net.""",
        "challenges": [
            {
                "instruction": "Compute the RRF score of a document ranked 1st in list A and 2nd in list B with k=60.",
                "expected_output": "0.03252",
            }
        ],
    },
    {
        "slug": "pymasters-hexgradkokoro-tts",
        "title": "Kokoro-82M Neural Speech Studio: Prosody Chunking & Audio Normalization",
        "track": "ai_engineering",
        "difficulty": "intermediate",
        "topic": "Sentence prosody chunking and RMS loudness normalization for neural TTS",
        "description": (
            "Interactive Hugging Face Space for Kokoro-82M neural speech synthesis with phoneme prosody "
            "chunking, multi-voice blending, and waveform RMS normalization."
        ),
        "concepts": ["neural TTS", "prosody chunking", "RMS normalization", "voice blending"],
        "story": """Feeding a 500-word paragraph straight into a compact neural TTS model like `Kokoro-82M` causes attention drift: the voice speeds up, swallows punctuation pauses, or clips at clause boundaries. In the PyMasters Kokoro-82M Neural Speech Studio on Hugging Face Spaces, long text is split into prosody-aware breath groups before synthesis, and the resulting audio chunks are RMS-normalized before stitching.

A breath-group chunker splits on sentence punctuation first, then breaks long clauses on commas or conjunctions so every segment stays within the model's sweet spot of 12 to 25 words:

```python
import re

def breath_chunks(text: str, max_words: int = 12) -> list[str]:
    clauses = [c.strip() for c in re.split(r"(?<=[.!?,;:])\\s+", text) if c.strip()]
    out, cur = [], []
    for c in clauses:
        if cur and len(" ".join(cur + [c]).split()) > max_words:
            out.append(" ".join(cur))
            cur = [c]
        else:
            cur.append(c)
    return out + ([" ".join(cur)] if cur else [])

txt = "Compact TTS models sound natural, provided each clause fits the attention window; long runs drift."
print(breath_chunks(txt, max_words=8))
```

Once each breath group is synthesised into floating-point PCM samples, RMS (Root Mean Square) normalization ensures uniform loudness across stitched segments:

```python
import math

def normalize_rms(samples: list[float], target: float = 0.2) -> list[float]:
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    gain = target / rms if rms > 1e-9 else 1.0
    return [round(max(-1.0, min(1.0, s * gain)), 3) for s in samples]

raw = [0.05, -0.1, 0.15, -0.05]
print(normalize_rms(raw, target=0.2))
```

Test multi-speaker voice blending, speed curves, and real-time waveform inspection in our Kokoro-82M Hugging Face Space, and build full audio pipelines on pymasters.net.""",
        "challenges": [
            {
                "instruction": "Compute the RMS value of [0.3, -0.3, 0.3, -0.3] using math.sqrt.",
                "expected_output": "0.3",
            }
        ],
    },
    {
        "slug": "pymasters-qwenqwen3-06b",
        "title": "Qwen3-0.6B Edge LLM Studio: KV-Cache Budgeting & Offline Triage",
        "track": "ai_engineering",
        "difficulty": "intermediate",
        "topic": "KV-cache memory math and thinking-token budgets for 0.6B edge LLMs",
        "description": (
            "Interactive Hugging Face Space combining Qwen3-0.6B edge reasoning with thinking-token budget "
            "controls, KV-cache memory profiling, and offline emergency survival RAG."
        ),
        "concepts": ["KV-cache math", "edge LLM inference", "thinking budget", "offline RAG"],
        "story": """Running a language model on a laptop, Raspberry Pi, or offline field device depends on two numbers: weight memory and KV-cache growth per token. In the PyMasters Qwen3-0.6B & Offline Survival Assistant Space on Hugging Face, you can control the model's reasoning token budget and see how context length affects RAM in real time.

For a transformer using Grouped-Query Attention (GQA), every generated token appends key and value vectors only for the KV heads (`n_kv_heads`), not all query heads. That keeps the KV-cache tiny enough for CPU inference:

```python
def kv_cache_mb(seq_len: int, layers: int = 28, kv_heads: int = 8, head_dim: int = 64, bytes_per_elem: int = 2) -> float:
    total_bytes = 2 * layers * kv_heads * head_dim * seq_len * bytes_per_elem
    return round(total_bytes / (1024 * 1024), 2)

for ctx in (512, 2048, 8192):
    print(f"ctx={ctx}: {kv_cache_mb(ctx)} MB")
```

At 2,048 tokens in FP16, `Qwen3-0.6B` needs just `112.0 MB` of KV-cache (`28.0 MB` at 512 tokens, `448.0 MB` at 8,192 tokens) alongside its ~600 MB quantized weights. When running on battery or in an emergency triage scenario, capping the `<think>` token budget prevents runaway reasoning loops while preserving answer accuracy:

```python
def allocate_tokens(total_budget: int, think_ratio: float = 0.35) -> dict[str, int]:
    think = min(512, int(total_budget * think_ratio))
    return {"think_tokens": think, "answer_tokens": total_budget - think}

print(allocate_tokens(600, think_ratio=0.35))
```

Experiment with live `Qwen3-0.6B` reasoning modes and the offline field-triage assistant in our Hugging Face Space, and master local LLM deployment on pymasters.net.""",
        "challenges": [
            {
                "instruction": "Calculate the FP16 KV-cache size in MB for 1024 tokens with 28 layers, 8 KV heads, and head_dim 64.",
                "expected_output": "56.0",
            }
        ],
    },
    {
        "slug": "pymasters-the-agent-sdk",
        "title": "PyMasters Agent SDK & Memory Lab: Ebbinghaus Decay Pruning",
        "track": "ai_agents",
        "difficulty": "intermediate",
        "topic": "Exponential memory forgetting curves and deterministic tool-call state machines",
        "description": (
            "Interactive Hugging Face Space demonstrating the PyMasters Agent SDK with deterministic tool "
            "routing and Ebbinghaus exponential memory decay for long-running agents."
        ),
        "concepts": ["agent memory decay", "Ebbinghaus forgetting curve", "tool-call state machine", "context pruning"],
        "story": """Long-running AI agents fail when their episodic memory buffer fills up with stale observations: latency climbs, token costs spike, and old facts contradict new state. In the PyMasters Agent SDK & Memory Forgetting Lab on Hugging Face Spaces, agents prune their memory using an Ebbinghaus exponential retention score combined with access-frequency reinforcement.

Each memory entry tracks its importance weight `w`, the number of times it was recalled `hits`, and its age in turns `t`. The effective half-life grows with each recall, so frequently used facts resist decay while one-off tool logs fade out automatically:

```python
import math

def retention(weight: float, age_turns: int, hits: int = 1, base_tau: float = 10.0) -> float:
    stability = base_tau * (1.0 + 0.5 * math.log1p(hits))
    return round(weight * math.exp(-age_turns / stability), 3)

memories = [
    ("user_tz=IST", retention(1.0, age_turns=15, hits=6)),
    ("temp_log_42", retention(0.6, age_turns=15, hits=0)),
]
print(memories)
```

Running that snippet prints `[('user_tz=IST', 0.468), ('temp_log_42', 0.134)]`. Setting a pruning threshold of `0.25` cleanly drops the transient log while keeping the reinforced user preference:

```python
import math

def prune_memory(items: list[dict], threshold: float = 0.25) -> list[str]:
    kept = []
    for m in items:
        tau = 10.0 * (1.0 + 0.5 * math.log1p(m["hits"]))
        score = m["w"] * math.exp(-m["age"] / tau)
        if score >= threshold:
            kept.append(f"{m['key']}:{score:.2f}")
    return kept

buf = [
    {"key": "api_schema", "w": 0.9, "age": 12, "hits": 4},
    {"key": "retry_trace", "w": 0.5, "age": 12, "hits": 0},
]
print(prune_memory(buf, threshold=0.25))
```

Explore the interactive memory decay simulator and deterministic agent state machine in the live Hugging Face Space, and build production agents step by step on pymasters.net.""",
        "challenges": [
            {
                "instruction": "Compute round(math.exp(-10 / 10.0), 3) for a memory after one time constant.",
                "expected_output": "0.368",
            }
        ],
    },
]


def hf_space_candidates() -> list:
    """Return the 5 live Muthu88/pymasters-* Hugging Face Spaces as rich source candidates."""
    out = []
    for sp in HF_SPACES:
        slug = sp["slug"]
        space_url = f"https://huggingface.co/spaces/Muthu88/{slug}"
        live_url = f"https://muthu88-{slug}.hf.space"
        out.append({
            "key": f"hf_space:{slug}",
            "id": slug,
            "is_hf_space": True,
            "track": sp["track"],
            "title": sp["title"],
            "description": sp["description"],
            "topic": sp["topic"],
            "story": sp["story"],
            "code_blocks": CODE_RE.findall(sp["story"]),
            "challenges": sp["challenges"],
            "difficulty": sp["difficulty"],
            "concepts": sp["concepts"],
            "space_url": space_url,
            "live_url": live_url,
            "url": config.SITE,
        })
    return out


def pick_hf_space(kind: str, rng=None) -> dict:
    """Randomly pick one of our 5 Hugging Face Spaces for `kind` ('linkedin' or 'short') one-by-one without
    repeating any Space until all 5 have been covered in the current cycle."""
    rng = rng if rng is not None else random.Random()
    spaces = hf_space_candidates()
    all_keys = {s["key"] for s in spaces}
    # Replay history oldest -> newest in batches of 5 distinct Spaces so each cycle covers all 5 before repeating.
    history = [
        it["source_key"]
        for it in store.items(kind=kind, limit=200)
        if it.get("status") not in ("rejected", "failed") and it.get("source_key") in all_keys
    ]
    used_in_cycle = set()
    for key in reversed(history):
        used_in_cycle.add(key)
        if len(used_in_cycle) == len(spaces):
            used_in_cycle.clear()
    available = [s for s in spaces if s["key"] not in used_in_cycle]
    return rng.choice(available)


def _lesson_files():
    return sorted(glob.glob(str(config.LESSONS_DIR / "*" / "*.json")))


_HINDI_REPLACEMENTS = [
    (r"(?i)\bnamaste\b", "Hello"),
    (r"(?i)\bcutting\s+chai\b", "coffee"),
    (r"(?i)\bchai\b", "coffee"),
    (r"(?i)\bsamosas?\b", "snacks"),
    (r"(?i)\btapri\b", "cafe"),
    (r"(?i)\btiffin\b", "lunch"),
    (r"(?i)\bpaisa\b", "cent"),
    (r"(?i)\bjugaad\b", "workaround"),
    (r"[\u0900-\u097F]+", ""),
]


def _clean_plain_english(text: str) -> str:
    if not text:
        return ""
    out = text
    for pat, repl in _HINDI_REPLACEMENTS:
        out = re.sub(pat, repl, out)
    return out


def load_lesson(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    story = _clean_plain_english((d.get("story_variants") or {}).get("en") or "")
    title = d.get("title")
    title = _clean_plain_english(title.get("en") if isinstance(title, dict) else (title or ""))
    desc = d.get("description")
    desc = _clean_plain_english(desc.get("en") if isinstance(desc, dict) else (desc or ""))
    challenges = []
    for ch in d.get("practice_challenges") or []:
        ins = ch.get("instruction")
        challenges.append({"instruction": ins.get("en") if isinstance(ins, dict) else ins,
                           "expected_output": ch.get("expected_output")})
    track = d.get("track") or path.split("/")[-2]
    return {
        "key": f"lesson:{track}/{d.get('id')}",
        "id": d.get("id"), "track": track, "title": title or d.get("id"), "description": desc or "",
        "topic": d.get("topic") or "", "story": story, "code_blocks": CODE_RE.findall(story),
        "challenges": challenges[:3],
        "difficulty": (d.get("tags") or {}).get("difficulty", ""),
        "concepts": (d.get("tags") or {}).get("concepts_taught", []),
        "url": f"{config.SITE}/dashboard/classroom/{d.get('id')}",
    }


def candidates(include_hf_spaces: bool = True, include_trends: bool = True) -> list:
    out = []
    if include_hf_spaces:
        out.extend(hf_space_candidates())
    if include_trends:
        from socialbot import trends
        out.extend(trends.all_trend_candidates(live_network=False))
        out.extend(trends.capture_weekly_thematic(live_network=False))
    for p in _lesson_files():
        try:
            les = load_lesson(p)
        except Exception:
            continue
        # Only lessons with real substance: a proper explanation and at least one runnable code block.
        if len(les["story"]) < 700 or not les["code_blocks"]:
            continue
        out.append(les)
    return out


def _tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 2}


def pick(kind: str, n: int = 1, seed=None) -> list:
    """Weighted pick of lessons, live daily trending topics across the 5 Finance/Risk/Cards/World/Concepts pillars,
    weekly cross-domain thematic analysis research posts, and one-by-one random Hugging Face Space rotation."""
    rng = random.Random(seed) if seed is not None else random.Random()
    if kind == "thematic":
        from socialbot import trends
        return [trends.pick_weekly_thematic(rng=rng) for _ in range(max(1, n))]
    chosen = []
    if kind in ("linkedin", "short") and n >= 1:
        roll = rng.random()
        if roll < config.TREND_SHARE:
            from socialbot import trends
            chosen.append(trends.pick_daily_trend(kind, rng=rng))
        elif roll < config.TREND_SHARE + config.HF_SPACE_SHARE:
            chosen.append(pick_hf_space(kind, rng=rng))
        if len(chosen) >= n:
            return chosen
    used = store.recently_used_sources()
    recent = [_tokens(t) for t in store.recent_topics()]
    pool = []
    for les in candidates(include_hf_spaces=False, include_trends=False):
        if (les["key"], kind) in used:
            continue
        tk = _tokens(les["title"] + " " + les["topic"])
        if any(len(tk & r) / max(1, min(len(tk), len(r))) >= 0.5 for r in recent):  # overlap vs the smaller title
            continue
        w = TRACK_WEIGHT.get(les["track"], 1.0)
        if kind == "long":
            w *= 1.0 + min(len(les["story"]), 6000) / 6000  # long-form wants the deepest lessons
        pool.append((w, les))
    while pool and len(chosen) < n:
        total = sum(w for w, _ in pool)
        r, acc = rng.random() * total, 0.0
        for i, (w, les) in enumerate(pool):
            acc += w
            if acc >= r:
                chosen.append(les)
                pool.pop(i)
                break
    return chosen
