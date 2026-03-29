"""
trends.py -- AI & Python Trends Engine for PyMasters.

Provides daily rotating content about latest AI/ML/Python developments.
A comprehensive static knowledge base that rotates deterministically by date
so every day feels fresh without requiring live API calls.
"""

from __future__ import annotations

import hashlib
from typing import Any

# ---------------------------------------------------------------------------
# Trending Topics Knowledge Base
# ---------------------------------------------------------------------------

TRENDING_TOPICS: list[dict[str, Any]] = [
    # ── AI Agents ──────────────────────────────────────────────────────
    {
        "id": "trend_001",
        "title": "Building AI Agents with Tool Use",
        "category": "ai_agents",
        "difficulty": "intermediate",
        "summary": (
            "Modern AI agents leverage tool calling to interact with external "
            "systems -- databases, APIs, file systems -- creating autonomous "
            "workflows that go far beyond simple chat."
        ),
        "key_concepts": ["function calling", "tool use", "agent loops", "ReAct pattern"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import anthropic\n\n"
            "client = anthropic.Anthropic()\n"
            "response = client.messages.create(\n"
            "    model='claude-sonnet-4-20250514',\n"
            "    max_tokens=1024,\n"
            "    tools=[{\n"
            "        'name': 'get_weather',\n"
            "        'description': 'Get current weather for a city',\n"
            "        'input_schema': {\n"
            "            'type': 'object',\n"
            "            'properties': {'city': {'type': 'string'}},\n"
            "            'required': ['city']\n"
            "        }\n"
            "    }],\n"
            "    messages=[{'role': 'user', 'content': 'Weather in Chennai?'}]\n"
            ")"
        ),
        "why_trending": "AI agents are the fastest-growing area in AI development in 2026",
        "date_added": "2026-03",
    },
    {
        "id": "trend_002",
        "title": "Multi-Agent Orchestration Patterns",
        "category": "ai_agents",
        "difficulty": "advanced",
        "summary": (
            "Coordinate multiple specialised AI agents that collaborate on "
            "complex tasks -- one plans, another codes, a third reviews -- "
            "mirroring real engineering teams."
        ),
        "key_concepts": ["orchestrator pattern", "delegation", "agent handoff", "supervisor agent"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "# Pseudocode: supervisor dispatches sub-agents\n"
            "supervisor = Agent(role='supervisor')\n"
            "coder = Agent(role='coder')\n"
            "reviewer = Agent(role='reviewer')\n\n"
            "plan = supervisor.plan(task)\n"
            "code = coder.execute(plan)\n"
            "feedback = reviewer.review(code)\n"
            "final = coder.revise(code, feedback)"
        ),
        "why_trending": "Production systems now run dozens of cooperating agents",
        "date_added": "2026-03",
    },
    {
        "id": "trend_003",
        "title": "Agent Memory and Long-Term Context",
        "category": "ai_agents",
        "difficulty": "advanced",
        "summary": (
            "Give agents persistent memory using vector stores and structured "
            "knowledge graphs so they remember past interactions and learn "
            "from experience across sessions."
        ),
        "key_concepts": ["episodic memory", "semantic memory", "context window management", "memory retrieval"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from chromadb import Client\n\n"
            "db = Client()\n"
            "collection = db.get_or_create_collection('agent_memory')\n\n"
            "# Store a memory\n"
            "collection.add(\n"
            "    documents=['User prefers Tamil greetings'],\n"
            "    ids=['mem_001']\n"
            ")\n\n"
            "# Retrieve relevant memories\n"
            "results = collection.query(\n"
            "    query_texts=['How should I greet the user?'],\n"
            "    n_results=3\n"
            ")"
        ),
        "why_trending": "Stateful agents are replacing stateless chatbots across industries",
        "date_added": "2026-03",
    },

    # ── RAG ─────────────────────────────────────────────────────────────
    {
        "id": "trend_004",
        "title": "RAG: Retrieval Augmented Generation",
        "category": "rag",
        "difficulty": "intermediate",
        "summary": (
            "Combine LLMs with external knowledge retrieval to produce "
            "accurate, grounded answers without fine-tuning the model."
        ),
        "key_concepts": ["embeddings", "vector search", "chunking", "context injection"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from langchain.vectorstores import FAISS\n"
            "from langchain.embeddings import OpenAIEmbeddings\n\n"
            "# Index documents\n"
            "db = FAISS.from_texts(documents, OpenAIEmbeddings())\n\n"
            "# Retrieve and generate\n"
            "docs = db.similarity_search('What is RAG?', k=3)\n"
            "context = '\\n'.join(d.page_content for d in docs)"
        ),
        "why_trending": "RAG remains the most practical way to add domain knowledge to LLMs",
        "date_added": "2026-03",
    },
    {
        "id": "trend_005",
        "title": "Advanced RAG: Hybrid Search and Re-ranking",
        "category": "rag",
        "difficulty": "advanced",
        "summary": (
            "Go beyond basic vector search by combining dense and sparse "
            "retrieval with cross-encoder re-ranking for dramatically "
            "better retrieval quality."
        ),
        "key_concepts": ["hybrid search", "BM25", "cross-encoder", "re-ranking", "reciprocal rank fusion"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from sentence_transformers import CrossEncoder\n\n"
            "reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')\n"
            "pairs = [(query, doc.text) for doc in candidates]\n"
            "scores = reranker.predict(pairs)\n"
            "ranked = sorted(zip(scores, candidates), reverse=True)"
        ),
        "why_trending": "Hybrid RAG pipelines now match fine-tuned model accuracy at a fraction of the cost",
        "date_added": "2026-03",
    },

    # ── Fine-tuning ────────────────────────────────────────────────────
    {
        "id": "trend_006",
        "title": "Fine-tuning LLMs with LoRA",
        "category": "fine_tuning",
        "difficulty": "advanced",
        "summary": (
            "LoRA (Low-Rank Adaptation) lets you fine-tune billion-parameter "
            "models on a single GPU by training only small adapter matrices."
        ),
        "key_concepts": ["LoRA", "QLoRA", "PEFT", "adapter layers", "rank decomposition"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from peft import LoraConfig, get_peft_model\n\n"
            "config = LoraConfig(\n"
            "    r=16, lora_alpha=32,\n"
            "    target_modules=['q_proj', 'v_proj'],\n"
            "    lora_dropout=0.05\n"
            ")\n"
            "model = get_peft_model(base_model, config)\n"
            "model.print_trainable_parameters()\n"
            "# trainable: 0.1% of total parameters"
        ),
        "why_trending": "LoRA democratised fine-tuning -- anyone with a laptop GPU can customise an LLM",
        "date_added": "2026-03",
    },
    {
        "id": "trend_007",
        "title": "Instruction Tuning and RLHF",
        "category": "fine_tuning",
        "difficulty": "advanced",
        "summary": (
            "Transform a base language model into a helpful assistant using "
            "instruction-following datasets and reinforcement learning from "
            "human feedback."
        ),
        "key_concepts": ["SFT", "RLHF", "DPO", "preference data", "reward model"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from trl import DPOTrainer\n\n"
            "trainer = DPOTrainer(\n"
            "    model=model,\n"
            "    ref_model=ref_model,\n"
            "    train_dataset=preference_data,\n"
            "    beta=0.1,\n"
            ")\n"
            "trainer.train()"
        ),
        "why_trending": "DPO has simplified alignment, making RLHF accessible to smaller teams",
        "date_added": "2026-03",
    },

    # ── Multimodal AI ──────────────────────────────────────────────────
    {
        "id": "trend_008",
        "title": "Multimodal AI: Vision + Language",
        "category": "multimodal",
        "difficulty": "intermediate",
        "summary": (
            "Build applications that understand both images and text -- from "
            "document parsing to visual question answering -- using models "
            "like Claude, GPT-4V, and Gemini."
        ),
        "key_concepts": ["vision transformers", "image understanding", "OCR", "visual QA"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import anthropic, base64, pathlib\n\n"
            "image_data = base64.standard_b64encode(\n"
            "    pathlib.Path('chart.png').read_bytes()\n"
            ").decode()\n\n"
            "resp = anthropic.Anthropic().messages.create(\n"
            "    model='claude-sonnet-4-20250514',\n"
            "    max_tokens=512,\n"
            "    messages=[{'role': 'user', 'content': [\n"
            "        {'type': 'image', 'source': {\n"
            "            'type': 'base64',\n"
            "            'media_type': 'image/png',\n"
            "            'data': image_data}},\n"
            "        {'type': 'text', 'text': 'Summarise this chart.'}\n"
            "    ]}]\n"
            ")"
        ),
        "why_trending": "Every major model now supports images, making multimodal the new default",
        "date_added": "2026-03",
    },
    {
        "id": "trend_009",
        "title": "Audio and Speech AI with Whisper and TTS",
        "category": "multimodal",
        "difficulty": "intermediate",
        "summary": (
            "Convert speech to text with Whisper, generate natural speech "
            "with modern TTS models, and build voice-first AI applications."
        ),
        "key_concepts": ["ASR", "TTS", "Whisper", "voice cloning", "real-time transcription"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import whisper\n\n"
            "model = whisper.load_model('base')\n"
            "result = model.transcribe('lecture.mp3')\n"
            "print(result['text'])"
        ),
        "why_trending": "Voice interfaces are becoming standard in AI applications",
        "date_added": "2026-03",
    },

    # ── AI Code Generation ─────────────────────────────────────────────
    {
        "id": "trend_010",
        "title": "AI-Powered Code Generation",
        "category": "ai_coding",
        "difficulty": "beginner",
        "summary": (
            "Use AI coding assistants to write, debug, and refactor code -- "
            "understand how to write effective prompts and review AI-generated "
            "code critically."
        ),
        "key_concepts": ["code completion", "prompt engineering for code", "code review", "pair programming"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "# Example: using AI to generate a function\n"
            "# Prompt: 'Write a Python function that validates\n"
            "# an Indian phone number (+91 followed by 10 digits)'\n\n"
            "import re\n\n"
            "def validate_indian_phone(phone: str) -> bool:\n"
            "    pattern = r'^\\+91[6-9]\\d{9}$'\n"
            "    return bool(re.match(pattern, phone))"
        ),
        "why_trending": "AI coding tools are reshaping how every developer writes software",
        "date_added": "2026-03",
    },
    {
        "id": "trend_011",
        "title": "Test Generation with AI",
        "category": "ai_coding",
        "difficulty": "intermediate",
        "summary": (
            "Automatically generate comprehensive test suites using AI -- "
            "from unit tests to integration tests -- improving code quality "
            "with less manual effort."
        ),
        "key_concepts": ["test generation", "property-based testing", "mutation testing", "coverage"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "# AI-generated pytest tests\n"
            "import pytest\n"
            "from myapp.utils import validate_email\n\n"
            "@pytest.mark.parametrize('email,expected', [\n"
            "    ('user@example.com', True),\n"
            "    ('invalid', False),\n"
            "    ('a@b.c', False),\n"
            "    ('test+tag@domain.co.in', True),\n"
            "])\n"
            "def test_validate_email(email, expected):\n"
            "    assert validate_email(email) == expected"
        ),
        "why_trending": "AI-generated tests are catching bugs that manual tests miss",
        "date_added": "2026-03",
    },

    # ── Python 3.13 ────────────────────────────────────────────────────
    {
        "id": "trend_012",
        "title": "Python 3.13: Free-threaded Mode",
        "category": "python_latest",
        "difficulty": "advanced",
        "summary": (
            "Python 3.13 introduces experimental free-threaded mode that "
            "disables the GIL, enabling true multi-threaded parallelism "
            "for CPU-bound Python code."
        ),
        "key_concepts": ["GIL removal", "free-threading", "nogil", "thread safety", "parallelism"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "# Run with: python3.13t script.py  (free-threaded build)\n"
            "import threading, sys\n\n"
            "print('GIL enabled:', sys._is_gil_enabled())  # False\n\n"
            "def cpu_work(n):\n"
            "    return sum(i * i for i in range(n))\n\n"
            "threads = [threading.Thread(target=cpu_work, args=(10**7,))\n"
            "           for _ in range(4)]\n"
            "for t in threads: t.start()\n"
            "for t in threads: t.join()"
        ),
        "why_trending": "The GIL-free Python experiment is the biggest language change in a decade",
        "date_added": "2026-03",
    },
    {
        "id": "trend_013",
        "title": "Python 3.13: Improved Error Messages",
        "category": "python_latest",
        "difficulty": "beginner",
        "summary": (
            "Python 3.13 continues the trend of friendlier error messages "
            "with better suggestions, colourful tracebacks, and more "
            "precise error locations."
        ),
        "key_concepts": ["error messages", "tracebacks", "debugging", "developer experience"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "# Python 3.13 shows colour-coded tracebacks\n"
            "# and suggests fixes like:\n"
            "#   NameError: name 'prnt' is not defined.\n"
            "#   Did you mean: 'print'?\n\n"
            "# It also highlights the exact expression\n"
            "# that caused the error with ^^^^ markers"
        ),
        "why_trending": "Better errors mean faster debugging for everyone from beginners to experts",
        "date_added": "2026-03",
    },
    {
        "id": "trend_014",
        "title": "Python Type Hints: Advanced Patterns",
        "category": "python_latest",
        "difficulty": "intermediate",
        "summary": (
            "Master modern type hints including TypeVar bounds, ParamSpec, "
            "TypeVarTuple, and the new type statement for cleaner, safer code."
        ),
        "key_concepts": ["type hints", "generics", "ParamSpec", "TypeVarTuple", "type statement"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "from typing import TypeVar, Protocol\n\n"
            "# Python 3.12+ type statement\n"
            "type Vector[T] = list[T]\n"
            "type Matrix[T] = list[Vector[T]]\n\n"
            "class Comparable(Protocol):\n"
            "    def __lt__(self, other: 'Comparable') -> bool: ...\n\n"
            "def max_item[T: Comparable](items: list[T]) -> T:\n"
            "    return max(items)"
        ),
        "why_trending": "Type hints are now essential for production Python -- not optional annotations",
        "date_added": "2026-03",
    },

    # ── PyTorch / Deep Learning ────────────────────────────────────────
    {
        "id": "trend_015",
        "title": "PyTorch 2.x: torch.compile and Performance",
        "category": "deep_learning",
        "difficulty": "advanced",
        "summary": (
            "PyTorch 2.x introduces torch.compile for automatic graph "
            "optimisation, delivering up to 2x speedups with a single "
            "line of code."
        ),
        "key_concepts": ["torch.compile", "TorchDynamo", "graph capture", "kernel fusion"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import torch\n\n"
            "model = MyModel()\n"
            "optimized = torch.compile(model)  # one-line speedup\n\n"
            "# Training loop runs ~2x faster\n"
            "for batch in dataloader:\n"
            "    loss = optimized(batch)\n"
            "    loss.backward()"
        ),
        "why_trending": "torch.compile is now stable and used in most production training pipelines",
        "date_added": "2026-03",
    },
    {
        "id": "trend_016",
        "title": "Transformers Architecture Deep Dive",
        "category": "deep_learning",
        "difficulty": "advanced",
        "summary": (
            "Understand the transformer architecture that powers all modern "
            "LLMs -- self-attention, positional encoding, and how information "
            "flows through the network."
        ),
        "key_concepts": ["self-attention", "multi-head attention", "positional encoding", "layer normalisation"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import torch\nimport torch.nn as nn\nimport math\n\n"
            "class SelfAttention(nn.Module):\n"
            "    def __init__(self, d_model, n_heads):\n"
            "        super().__init__()\n"
            "        self.n_heads = n_heads\n"
            "        self.d_k = d_model // n_heads\n"
            "        self.qkv = nn.Linear(d_model, 3 * d_model)\n\n"
            "    def forward(self, x):\n"
            "        B, T, C = x.shape\n"
            "        qkv = self.qkv(x).reshape(B, T, 3, self.n_heads, self.d_k)\n"
            "        q, k, v = qkv.permute(2, 0, 3, 1, 4)\n"
            "        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)\n"
            "        att = att.softmax(dim=-1)\n"
            "        return (att @ v).transpose(1, 2).reshape(B, T, C)"
        ),
        "why_trending": "Understanding transformers is now essential literacy for any AI practitioner",
        "date_added": "2026-03",
    },

    # ── Prompt Engineering ─────────────────────────────────────────────
    {
        "id": "trend_017",
        "title": "Prompt Engineering Best Practices",
        "category": "prompt_engineering",
        "difficulty": "beginner",
        "summary": (
            "Master the art of writing effective prompts -- clear instructions, "
            "structured output, few-shot examples, and chain-of-thought "
            "reasoning for reliable AI results."
        ),
        "key_concepts": ["few-shot prompting", "chain-of-thought", "system prompts", "structured output"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "# Chain-of-thought prompting\n"
            "prompt = '''\n"
            "Solve step by step:\n"
            "A shop sells mangoes at Rs 40 each.\n"
            "If you buy 5 or more, you get 10% off.\n"
            "How much do 7 mangoes cost?\n\n"
            "Think through each step before giving the answer.\n"
            "'''"
        ),
        "why_trending": "Good prompts can be the difference between a useless and a brilliant AI response",
        "date_added": "2026-03",
    },
    {
        "id": "trend_018",
        "title": "Structured Output from LLMs",
        "category": "prompt_engineering",
        "difficulty": "intermediate",
        "summary": (
            "Force LLMs to return valid JSON, XML, or other structured "
            "formats using constrained decoding, schema validation, and "
            "output parsers."
        ),
        "key_concepts": ["JSON mode", "schema validation", "Pydantic models", "constrained decoding"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from pydantic import BaseModel\n"
            "import anthropic\n\n"
            "class MovieReview(BaseModel):\n"
            "    title: str\n"
            "    rating: float\n"
            "    summary: str\n"
            "    tags: list[str]\n\n"
            "# Use with tool_use or JSON mode to get\n"
            "# guaranteed valid structured output"
        ),
        "why_trending": "Structured output turns LLMs from chatbots into reliable API endpoints",
        "date_added": "2026-03",
    },

    # ── AI Safety ──────────────────────────────────────────────────────
    {
        "id": "trend_019",
        "title": "AI Safety and Alignment Fundamentals",
        "category": "ai_safety",
        "difficulty": "intermediate",
        "summary": (
            "Understand the core challenges of building safe AI systems -- "
            "alignment, robustness, interpretability, and responsible "
            "deployment practices."
        ),
        "key_concepts": ["alignment", "red-teaming", "constitutional AI", "interpretability"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "# Simple content safety filter\n"
            "def check_safety(text: str) -> dict:\n"
            "    flags = []\n"
            "    if contains_pii(text):\n"
            "        flags.append('pii_detected')\n"
            "    if detect_toxicity(text) > 0.8:\n"
            "        flags.append('toxic_content')\n"
            "    return {'safe': len(flags) == 0, 'flags': flags}"
        ),
        "why_trending": "Responsible AI deployment is now a regulatory and business requirement",
        "date_added": "2026-03",
    },
    {
        "id": "trend_020",
        "title": "AI Ethics and Bias Detection",
        "category": "ai_safety",
        "difficulty": "intermediate",
        "summary": (
            "Identify and mitigate bias in AI systems using fairness metrics, "
            "balanced datasets, and systematic evaluation across demographic groups."
        ),
        "key_concepts": ["fairness metrics", "bias audit", "demographic parity", "equalized odds"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from fairlearn.metrics import MetricFrame\n"
            "from sklearn.metrics import accuracy_score\n\n"
            "metric_frame = MetricFrame(\n"
            "    metrics=accuracy_score,\n"
            "    y_true=y_test,\n"
            "    y_pred=predictions,\n"
            "    sensitive_features=gender\n"
            ")\n"
            "print(metric_frame.by_group)\n"
            "print('Disparity:', metric_frame.difference())"
        ),
        "why_trending": "AI bias has real-world consequences and auditing is becoming mandatory",
        "date_added": "2026-03",
    },

    # ── Edge AI / TinyML ───────────────────────────────────────────────
    {
        "id": "trend_021",
        "title": "Edge AI and TinyML with Python",
        "category": "edge_ai",
        "difficulty": "intermediate",
        "summary": (
            "Deploy machine learning models on microcontrollers and edge "
            "devices using TensorFlow Lite, ONNX Runtime, and MicroPython."
        ),
        "key_concepts": ["model quantisation", "TFLite", "ONNX", "edge deployment", "model pruning"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import tensorflow as tf\n\n"
            "# Convert and quantise for edge\n"
            "converter = tf.lite.TFLiteConverter.from_saved_model('model/')\n"
            "converter.optimizations = [tf.lite.Optimize.DEFAULT]\n"
            "converter.target_spec.supported_types = [tf.float16]\n"
            "tflite_model = converter.convert()\n\n"
            "with open('model.tflite', 'wb') as f:\n"
            "    f.write(tflite_model)"
        ),
        "why_trending": "AI is moving from cloud to edge -- phones, IoT, and embedded devices",
        "date_added": "2026-03",
    },

    # ── Healthcare AI ──────────────────────────────────────────────────
    {
        "id": "trend_022",
        "title": "AI in Healthcare: Medical Image Analysis",
        "category": "ai_healthcare",
        "difficulty": "advanced",
        "summary": (
            "Apply deep learning to medical imaging -- X-rays, CT scans, "
            "pathology slides -- for automated diagnosis assistance and "
            "anomaly detection."
        ),
        "key_concepts": ["medical imaging", "DICOM", "segmentation", "classification", "FDA approval"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import monai\nfrom monai.transforms import (\n"
            "    Compose, LoadImage, ScaleIntensity, EnsureChannelFirst\n"
            ")\n\n"
            "transforms = Compose([\n"
            "    LoadImage(image_only=True),\n"
            "    EnsureChannelFirst(),\n"
            "    ScaleIntensity(),\n"
            "])\n"
            "# Process a chest X-ray for analysis\n"
            "image = transforms('chest_xray.dcm')"
        ),
        "why_trending": "AI-assisted diagnostics are being deployed in hospitals worldwide",
        "date_added": "2026-03",
    },

    # ── Computer Vision ────────────────────────────────────────────────
    {
        "id": "trend_023",
        "title": "Real-time Object Detection with YOLOv8+",
        "category": "computer_vision",
        "difficulty": "intermediate",
        "summary": (
            "Detect objects in images and video in real-time using the "
            "YOLO family of models -- now easier than ever with the "
            "ultralytics Python package."
        ),
        "key_concepts": ["object detection", "YOLO", "bounding boxes", "real-time inference", "tracking"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from ultralytics import YOLO\n\n"
            "model = YOLO('yolov8n.pt')\n"
            "results = model('street.jpg')\n\n"
            "for r in results:\n"
            "    for box in r.boxes:\n"
            "        cls = model.names[int(box.cls)]\n"
            "        conf = float(box.conf)\n"
            "        print(f'{cls}: {conf:.1%}')"
        ),
        "why_trending": "YOLO models keep getting faster and more accurate with each release",
        "date_added": "2026-03",
    },
    {
        "id": "trend_024",
        "title": "Image Segmentation with SAM 2",
        "category": "computer_vision",
        "difficulty": "advanced",
        "summary": (
            "Segment anything in images and video using Meta's SAM 2 model -- "
            "zero-shot segmentation that works on any object without training."
        ),
        "key_concepts": ["segmentation", "SAM", "zero-shot", "masks", "promptable segmentation"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from sam2.build_sam import build_sam2\n"
            "from sam2.sam2_image_predictor import SAM2ImagePredictor\n\n"
            "predictor = SAM2ImagePredictor(build_sam2('sam2_hiera_large'))\n"
            "predictor.set_image(image)\n"
            "masks, scores, _ = predictor.predict(\n"
            "    point_coords=[[500, 375]],\n"
            "    point_labels=[1]\n"
            ")"
        ),
        "why_trending": "SAM 2 makes previously impossible segmentation tasks trivial",
        "date_added": "2026-03",
    },

    # ── NLP / Hugging Face ─────────────────────────────────────────────
    {
        "id": "trend_025",
        "title": "NLP with Hugging Face Transformers",
        "category": "nlp",
        "difficulty": "intermediate",
        "summary": (
            "Use the Hugging Face ecosystem for NLP tasks -- sentiment "
            "analysis, named entity recognition, summarisation, and translation "
            "with pre-trained models."
        ),
        "key_concepts": ["transformers library", "pipeline API", "tokenizers", "model hub"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from transformers import pipeline\n\n"
            "# Sentiment analysis in one line\n"
            "classifier = pipeline('sentiment-analysis')\n"
            "result = classifier('PyMasters is an amazing platform!')\n"
            "print(result)\n"
            "# [{'label': 'POSITIVE', 'score': 0.9998}]"
        ),
        "why_trending": "Hugging Face has become the GitHub of machine learning models",
        "date_added": "2026-03",
    },
    {
        "id": "trend_026",
        "title": "Text Embeddings for Semantic Search",
        "category": "nlp",
        "difficulty": "intermediate",
        "summary": (
            "Convert text into dense vector representations that capture "
            "meaning, enabling semantic search, clustering, and similarity "
            "comparisons."
        ),
        "key_concepts": ["embeddings", "sentence-transformers", "cosine similarity", "vector space"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from sentence_transformers import SentenceTransformer\n"
            "from sklearn.metrics.pairwise import cosine_similarity\n\n"
            "model = SentenceTransformer('all-MiniLM-L6-v2')\n"
            "embeddings = model.encode([\n"
            "    'Python is great for AI',\n"
            "    'Machine learning with Python',\n"
            "    'How to cook biryani'\n"
            "])\n"
            "sims = cosine_similarity(embeddings)\n"
            "# First two sentences are similar, third is different"
        ),
        "why_trending": "Embeddings are the foundation of modern search and recommendation systems",
        "date_added": "2026-03",
    },

    # ── MLOps ──────────────────────────────────────────────────────────
    {
        "id": "trend_027",
        "title": "MLOps: Model Deployment with FastAPI",
        "category": "mlops",
        "difficulty": "intermediate",
        "summary": (
            "Deploy ML models as production APIs using FastAPI -- with "
            "input validation, async inference, health checks, and "
            "automatic documentation."
        ),
        "key_concepts": ["model serving", "FastAPI", "REST API", "async inference", "health checks"],
        "related_lessons": ["web_development"],
        "code_example": (
            "from fastapi import FastAPI\n"
            "from pydantic import BaseModel\n"
            "import joblib\n\n"
            "app = FastAPI()\n"
            "model = joblib.load('model.pkl')\n\n"
            "class PredictRequest(BaseModel):\n"
            "    features: list[float]\n\n"
            "@app.post('/predict')\n"
            "async def predict(req: PredictRequest):\n"
            "    prediction = model.predict([req.features])\n"
            "    return {'prediction': prediction[0].tolist()}"
        ),
        "why_trending": "FastAPI has become the standard for serving ML models in production",
        "date_added": "2026-03",
    },
    {
        "id": "trend_028",
        "title": "Experiment Tracking with MLflow",
        "category": "mlops",
        "difficulty": "intermediate",
        "summary": (
            "Track experiments, compare model versions, and manage the "
            "full ML lifecycle using MLflow -- from training to deployment."
        ),
        "key_concepts": ["experiment tracking", "model registry", "MLflow", "reproducibility"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import mlflow\n\n"
            "mlflow.set_experiment('sentiment-model')\n\n"
            "with mlflow.start_run():\n"
            "    mlflow.log_param('learning_rate', 0.001)\n"
            "    mlflow.log_param('epochs', 10)\n"
            "    # ... training ...\n"
            "    mlflow.log_metric('accuracy', 0.95)\n"
            "    mlflow.log_metric('f1_score', 0.93)\n"
            "    mlflow.sklearn.log_model(model, 'model')"
        ),
        "why_trending": "Reproducible ML experiments are now a baseline requirement for any team",
        "date_added": "2026-03",
    },

    # ── Vector Databases ───────────────────────────────────────────────
    {
        "id": "trend_029",
        "title": "Vector Databases: ChromaDB and Pinecone",
        "category": "vector_db",
        "difficulty": "intermediate",
        "summary": (
            "Store and query high-dimensional vectors at scale using "
            "purpose-built vector databases for RAG, recommendation, "
            "and similarity search applications."
        ),
        "key_concepts": ["vector store", "ANN search", "HNSW", "metadata filtering", "hybrid search"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import chromadb\n\n"
            "client = chromadb.Client()\n"
            "collection = client.create_collection('docs')\n\n"
            "collection.add(\n"
            "    documents=['Python is versatile', 'AI is transformative'],\n"
            "    ids=['doc1', 'doc2']\n"
            ")\n\n"
            "results = collection.query(\n"
            "    query_texts=['programming language'],\n"
            "    n_results=1\n"
            ")\n"
            "print(results['documents'])  # [['Python is versatile']]"
        ),
        "why_trending": "Vector databases are critical infrastructure for every AI application",
        "date_added": "2026-03",
    },

    # ── Mixture of Experts ─────────────────────────────────────────────
    {
        "id": "trend_030",
        "title": "Mixture of Experts (MoE) Architecture",
        "category": "model_architecture",
        "difficulty": "advanced",
        "summary": (
            "Understand how MoE models like Mixtral achieve GPT-4-level "
            "performance at a fraction of the compute by routing each "
            "token to only a subset of expert networks."
        ),
        "key_concepts": ["sparse models", "expert routing", "gating network", "conditional computation"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "# Simplified MoE layer concept\n"
            "import torch.nn as nn\n\n"
            "class MoELayer(nn.Module):\n"
            "    def __init__(self, d_model, n_experts, top_k=2):\n"
            "        super().__init__()\n"
            "        self.experts = nn.ModuleList(\n"
            "            [nn.Linear(d_model, d_model) for _ in range(n_experts)]\n"
            "        )\n"
            "        self.gate = nn.Linear(d_model, n_experts)\n"
            "        self.top_k = top_k"
        ),
        "why_trending": "MoE enables bigger models without proportionally bigger compute costs",
        "date_added": "2026-03",
    },

    # ── Knowledge Distillation ─────────────────────────────────────────
    {
        "id": "trend_031",
        "title": "Knowledge Distillation: Smaller, Faster Models",
        "category": "model_architecture",
        "difficulty": "advanced",
        "summary": (
            "Train compact student models that mimic larger teacher models, "
            "achieving near-teacher accuracy at a fraction of the size "
            "and inference cost."
        ),
        "key_concepts": ["teacher-student", "soft labels", "temperature scaling", "model compression"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import torch.nn.functional as F\n\n"
            "def distillation_loss(student_logits, teacher_logits,\n"
            "                      labels, temperature=4.0, alpha=0.7):\n"
            "    soft_loss = F.kl_div(\n"
            "        F.log_softmax(student_logits / temperature, dim=1),\n"
            "        F.softmax(teacher_logits / temperature, dim=1),\n"
            "        reduction='batchmean'\n"
            "    ) * (temperature ** 2)\n"
            "    hard_loss = F.cross_entropy(student_logits, labels)\n"
            "    return alpha * soft_loss + (1 - alpha) * hard_loss"
        ),
        "why_trending": "Distillation makes cutting-edge AI accessible on modest hardware",
        "date_added": "2026-03",
    },

    # ── Synthetic Data ─────────────────────────────────────────────────
    {
        "id": "trend_032",
        "title": "Synthetic Data Generation for ML",
        "category": "data_engineering",
        "difficulty": "intermediate",
        "summary": (
            "Generate realistic synthetic datasets using statistical methods "
            "and generative AI to train models when real data is scarce, "
            "expensive, or privacy-sensitive."
        ),
        "key_concepts": ["synthetic data", "data augmentation", "privacy preservation", "Faker"],
        "related_lessons": ["data_science"],
        "code_example": (
            "from faker import Faker\nimport pandas as pd\n\n"
            "fake = Faker('en_IN')  # Indian locale\n\n"
            "data = [{\n"
            "    'name': fake.name(),\n"
            "    'city': fake.city(),\n"
            "    'phone': fake.phone_number(),\n"
            "    'salary': fake.random_int(30000, 200000),\n"
            "} for _ in range(1000)]\n\n"
            "df = pd.DataFrame(data)\n"
            "print(df.describe())"
        ),
        "why_trending": "Synthetic data solves the data scarcity problem that blocks most AI projects",
        "date_added": "2026-03",
    },

    # ── Diffusion Models ───────────────────────────────────────────────
    {
        "id": "trend_033",
        "title": "Diffusion Models for Image Generation",
        "category": "generative_ai",
        "difficulty": "advanced",
        "summary": (
            "Understand how diffusion models like Stable Diffusion work -- "
            "the forward noising process, reverse denoising, and how text "
            "conditioning guides generation."
        ),
        "key_concepts": ["diffusion process", "denoising", "U-Net", "text conditioning", "CFG"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from diffusers import StableDiffusionPipeline\nimport torch\n\n"
            "pipe = StableDiffusionPipeline.from_pretrained(\n"
            "    'stabilityai/stable-diffusion-xl-base-1.0',\n"
            "    torch_dtype=torch.float16\n"
            ").to('cuda')\n\n"
            "image = pipe(\n"
            "    'A serene temple in Tamil Nadu at sunset, digital art',\n"
            "    num_inference_steps=30\n"
            ").images[0]\n"
            "image.save('temple.png')"
        ),
        "why_trending": "Diffusion models have revolutionised creative AI across images, video, and audio",
        "date_added": "2026-03",
    },

    # ── Graph Neural Networks ──────────────────────────────────────────
    {
        "id": "trend_034",
        "title": "Graph Neural Networks with PyG",
        "category": "deep_learning",
        "difficulty": "advanced",
        "summary": (
            "Apply deep learning to graph-structured data -- social networks, "
            "molecules, knowledge graphs -- using PyTorch Geometric."
        ),
        "key_concepts": ["GNN", "message passing", "node classification", "graph convolution"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "from torch_geometric.nn import GCNConv\nimport torch.nn as nn\n\n"
            "class GCN(nn.Module):\n"
            "    def __init__(self, in_channels, hidden, out_channels):\n"
            "        super().__init__()\n"
            "        self.conv1 = GCNConv(in_channels, hidden)\n"
            "        self.conv2 = GCNConv(hidden, out_channels)\n\n"
            "    def forward(self, x, edge_index):\n"
            "        x = self.conv1(x, edge_index).relu()\n"
            "        return self.conv2(x, edge_index)"
        ),
        "why_trending": "GNNs are powering breakthroughs in drug discovery and recommendation systems",
        "date_added": "2026-03",
    },

    # ── Federated Learning ─────────────────────────────────────────────
    {
        "id": "trend_035",
        "title": "Federated Learning for Privacy-Preserving AI",
        "category": "ml_systems",
        "difficulty": "advanced",
        "summary": (
            "Train ML models across decentralised data sources without "
            "sharing raw data -- essential for healthcare, finance, and "
            "any privacy-sensitive domain."
        ),
        "key_concepts": ["federated averaging", "differential privacy", "secure aggregation", "data silos"],
        "related_lessons": ["ai_fundamentals"],
        "code_example": (
            "import flwr as fl\n\n"
            "class FlowerClient(fl.client.NumPyClient):\n"
            "    def get_parameters(self, config):\n"
            "        return model.get_weights()\n\n"
            "    def fit(self, parameters, config):\n"
            "        model.set_weights(parameters)\n"
            "        model.fit(x_train, y_train, epochs=1)\n"
            "        return model.get_weights(), len(x_train), {}\n\n"
            "fl.client.start_numpy_client(\n"
            "    server_address='localhost:8080',\n"
            "    client=FlowerClient()\n"
            ")"
        ),
        "why_trending": "Privacy regulations are making federated learning a necessity, not an option",
        "date_added": "2026-03",
    },

    # ── AutoML ─────────────────────────────────────────────────────────
    {
        "id": "trend_036",
        "title": "AutoML: Automated Machine Learning Pipelines",
        "category": "mlops",
        "difficulty": "beginner",
        "summary": (
            "Automate model selection, hyperparameter tuning, and feature "
            "engineering using AutoML tools -- making ML accessible to "
            "non-specialists."
        ),
        "key_concepts": ["hyperparameter tuning", "neural architecture search", "AutoML", "Optuna"],
        "related_lessons": ["data_science"],
        "code_example": (
            "import optuna\n\n"
            "def objective(trial):\n"
            "    lr = trial.suggest_float('lr', 1e-5, 1e-1, log=True)\n"
            "    n_layers = trial.suggest_int('n_layers', 1, 5)\n"
            "    model = build_model(lr=lr, n_layers=n_layers)\n"
            "    accuracy = train_and_evaluate(model)\n"
            "    return accuracy\n\n"
            "study = optuna.create_study(direction='maximize')\n"
            "study.optimize(objective, n_trials=100)\n"
            "print('Best params:', study.best_params)"
        ),
        "why_trending": "AutoML tools are making ML practical for domain experts without ML backgrounds",
        "date_added": "2026-03",
    },

    # ── Time Series ────────────────────────────────────────────────────
    {
        "id": "trend_037",
        "title": "Time Series Forecasting with AI",
        "category": "data_science",
        "difficulty": "intermediate",
        "summary": (
            "Apply modern deep learning to time series -- from stock prices "
            "to weather data -- using transformer-based forecasting models "
            "that outperform classical methods."
        ),
        "key_concepts": ["time series transformers", "forecasting", "temporal fusion", "seasonality"],
        "related_lessons": ["data_science"],
        "code_example": (
            "from darts import TimeSeries\n"
            "from darts.models import TFTModel\n\n"
            "series = TimeSeries.from_dataframe(df, 'date', 'value')\n"
            "train, val = series.split_before(0.8)\n\n"
            "model = TFTModel(\n"
            "    input_chunk_length=30,\n"
            "    output_chunk_length=7,\n"
            "    hidden_size=64\n"
            ")\n"
            "model.fit(train, val_series=val, epochs=50)\n"
            "forecast = model.predict(n=7)"
        ),
        "why_trending": "Foundation models for time series are matching domain-specific models",
        "date_added": "2026-03",
    },

    # ── Python Web / Async ─────────────────────────────────────────────
    {
        "id": "trend_038",
        "title": "Async Python with asyncio and HTTPX",
        "category": "python_latest",
        "difficulty": "intermediate",
        "summary": (
            "Write high-performance async Python for web scraping, API "
            "calls, and server-side applications using asyncio, HTTPX, "
            "and modern async patterns."
        ),
        "key_concepts": ["asyncio", "async/await", "HTTPX", "concurrency", "event loop"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "import asyncio\nimport httpx\n\n"
            "async def fetch_all(urls: list[str]) -> list[str]:\n"
            "    async with httpx.AsyncClient() as client:\n"
            "        tasks = [client.get(url) for url in urls]\n"
            "        responses = await asyncio.gather(*tasks)\n"
            "        return [r.text for r in responses]\n\n"
            "urls = ['https://api.example.com/1', 'https://api.example.com/2']\n"
            "results = asyncio.run(fetch_all(urls))"
        ),
        "why_trending": "Async Python is essential for building scalable web and AI applications",
        "date_added": "2026-03",
    },

    # ── Data Engineering ───────────────────────────────────────────────
    {
        "id": "trend_039",
        "title": "Data Engineering with Polars",
        "category": "data_engineering",
        "difficulty": "intermediate",
        "summary": (
            "Process large datasets at blazing speed using Polars -- a "
            "Rust-powered DataFrame library that is 10-100x faster than "
            "pandas for many operations."
        ),
        "key_concepts": ["Polars", "lazy evaluation", "DataFrame", "query optimisation", "Rust backend"],
        "related_lessons": ["data_science"],
        "code_example": (
            "import polars as pl\n\n"
            "# Lazy evaluation for optimal performance\n"
            "result = (\n"
            "    pl.scan_csv('sales.csv')\n"
            "    .filter(pl.col('amount') > 1000)\n"
            "    .group_by('category')\n"
            "    .agg([\n"
            "        pl.col('amount').sum().alias('total'),\n"
            "        pl.col('amount').mean().alias('average'),\n"
            "    ])\n"
            "    .sort('total', descending=True)\n"
            "    .collect()\n"
            ")\n"
            "print(result)"
        ),
        "why_trending": "Polars is rapidly replacing pandas in performance-critical data pipelines",
        "date_added": "2026-03",
    },

    # ── Web Scraping ───────────────────────────────────────────────────
    {
        "id": "trend_040",
        "title": "Modern Web Scraping with Python",
        "category": "python_tools",
        "difficulty": "beginner",
        "summary": (
            "Extract data from websites using BeautifulSoup, Playwright, "
            "and AI-powered scraping tools that adapt to page changes "
            "automatically."
        ),
        "key_concepts": ["BeautifulSoup", "Playwright", "CSS selectors", "headless browsers", "rate limiting"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "from bs4 import BeautifulSoup\nimport httpx\n\n"
            "resp = httpx.get('https://news.ycombinator.com')\n"
            "soup = BeautifulSoup(resp.text, 'html.parser')\n\n"
            "for item in soup.select('.titleline > a')[:10]:\n"
            "    print(item.text)"
        ),
        "why_trending": "AI-enhanced scraping tools make data extraction more robust than ever",
        "date_added": "2026-03",
    },

    # ── Testing ────────────────────────────────────────────────────────
    {
        "id": "trend_041",
        "title": "Python Testing with pytest and Hypothesis",
        "category": "python_tools",
        "difficulty": "intermediate",
        "summary": (
            "Write robust tests using pytest fixtures, parametrize, and "
            "property-based testing with Hypothesis to find edge cases "
            "you would never think of manually."
        ),
        "key_concepts": ["pytest", "fixtures", "property-based testing", "Hypothesis", "parametrize"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "from hypothesis import given, strategies as st\n\n"
            "@given(st.lists(st.integers(), min_size=1))\n"
            "def test_sort_is_idempotent(xs):\n"
            "    sorted_once = sorted(xs)\n"
            "    sorted_twice = sorted(sorted_once)\n"
            "    assert sorted_once == sorted_twice\n\n"
            "@given(st.lists(st.integers(), min_size=1))\n"
            "def test_sort_preserves_length(xs):\n"
            "    assert len(sorted(xs)) == len(xs)"
        ),
        "why_trending": "Property-based testing is catching bugs that example-based tests miss",
        "date_added": "2026-03",
    },

    # ── CLI Tools ──────────────────────────────────────────────────────
    {
        "id": "trend_042",
        "title": "Building CLI Tools with Typer and Rich",
        "category": "python_tools",
        "difficulty": "beginner",
        "summary": (
            "Create beautiful command-line applications using Typer for "
            "argument parsing and Rich for colourful, formatted terminal "
            "output."
        ),
        "key_concepts": ["Typer", "Rich", "CLI", "argument parsing", "terminal UI"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "import typer\nfrom rich import print\nfrom rich.table import Table\n\n"
            "app = typer.Typer()\n\n"
            "@app.command()\n"
            "def greet(name: str, count: int = 1):\n"
            "    table = Table(title='Greetings')\n"
            "    table.add_column('No.', style='cyan')\n"
            "    table.add_column('Message', style='green')\n"
            "    for i in range(count):\n"
            "        table.add_row(str(i + 1), f'Hello, {name}!')\n"
            "    print(table)\n\n"
            "if __name__ == '__main__':\n"
            "    app()"
        ),
        "why_trending": "Rich terminal UIs are replacing plain text output in modern Python tools",
        "date_added": "2026-03",
    },

    # ── Containers ─────────────────────────────────────────────────────
    {
        "id": "trend_043",
        "title": "Docker for Python Developers",
        "category": "devops",
        "difficulty": "intermediate",
        "summary": (
            "Containerise Python applications for consistent, reproducible "
            "deployments -- from development to production -- using Docker "
            "and multi-stage builds."
        ),
        "key_concepts": ["Docker", "containers", "multi-stage builds", "docker-compose", "layers"],
        "related_lessons": ["web_development"],
        "code_example": (
            "# Dockerfile for a Python app\n"
            "FROM python:3.13-slim AS builder\n"
            "WORKDIR /app\n"
            "COPY requirements.txt .\n"
            "RUN pip install --no-cache-dir -r requirements.txt\n\n"
            "FROM python:3.13-slim\n"
            "WORKDIR /app\n"
            "COPY --from=builder /usr/local /usr/local\n"
            "COPY . .\n"
            "CMD [\"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\"]"
        ),
        "why_trending": "Containers are the universal deployment format for modern Python applications",
        "date_added": "2026-03",
    },

    # ── Security ───────────────────────────────────────────────────────
    {
        "id": "trend_044",
        "title": "Python Application Security Best Practices",
        "category": "python_tools",
        "difficulty": "intermediate",
        "summary": (
            "Secure your Python applications against common vulnerabilities "
            "-- input validation, dependency scanning, secrets management, "
            "and secure coding patterns."
        ),
        "key_concepts": ["input validation", "dependency scanning", "secrets management", "OWASP"],
        "related_lessons": ["web_development"],
        "code_example": (
            "# Secure password hashing\n"
            "from argon2 import PasswordHasher\n\n"
            "ph = PasswordHasher()\n"
            "hash_val = ph.hash('my_secure_password')\n\n"
            "# Verify\n"
            "try:\n"
            "    ph.verify(hash_val, 'my_secure_password')\n"
            "    print('Password matches')\n"
            "except Exception:\n"
            "    print('Invalid password')"
        ),
        "why_trending": "Supply chain attacks make Python dependency security more critical than ever",
        "date_added": "2026-03",
    },

    # ── Pydantic / Data Validation ─────────────────────────────────────
    {
        "id": "trend_045",
        "title": "Data Validation with Pydantic v2",
        "category": "python_tools",
        "difficulty": "beginner",
        "summary": (
            "Validate and serialise data using Pydantic v2 -- now powered "
            "by a Rust core for 5-50x faster validation with the same "
            "Pythonic API."
        ),
        "key_concepts": ["Pydantic", "data validation", "serialisation", "BaseModel", "field validators"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "from pydantic import BaseModel, Field, field_validator\n\n"
            "class Student(BaseModel):\n"
            "    name: str = Field(min_length=2)\n"
            "    age: int = Field(ge=5, le=100)\n"
            "    email: str\n"
            "    level: str = 'beginner'\n\n"
            "    @field_validator('email')\n"
            "    @classmethod\n"
            "    def validate_email(cls, v):\n"
            "        if '@' not in v:\n"
            "            raise ValueError('Invalid email')\n"
            "        return v.lower()\n\n"
            "student = Student(name='Ravi', age=25, email='Ravi@EXAMPLE.COM')\n"
            "print(student.email)  # ravi@example.com"
        ),
        "why_trending": "Pydantic v2 is now the de facto standard for Python data validation",
        "date_added": "2026-03",
    },

    # ── API Design ─────────────────────────────────────────────────────
    {
        "id": "trend_046",
        "title": "Designing RESTful APIs with Python",
        "category": "web_development",
        "difficulty": "intermediate",
        "summary": (
            "Design clean, well-documented REST APIs following best practices "
            "-- resource naming, versioning, pagination, error handling, "
            "and OpenAPI documentation."
        ),
        "key_concepts": ["REST", "API versioning", "pagination", "error codes", "OpenAPI"],
        "related_lessons": ["web_development"],
        "code_example": (
            "from fastapi import FastAPI, Query, HTTPException\n\n"
            "app = FastAPI(title='PyMasters API', version='2.0')\n\n"
            "@app.get('/api/v2/students')\n"
            "async def list_students(\n"
            "    level: str = Query(default=None),\n"
            "    page: int = Query(default=1, ge=1),\n"
            "    per_page: int = Query(default=20, le=100),\n"
            "):\n"
            "    # Pagination + filtering\n"
            "    offset = (page - 1) * per_page\n"
            "    return {'data': students[offset:offset+per_page],\n"
            "            'page': page, 'total': len(students)}"
        ),
        "why_trending": "Well-designed APIs are the backbone of every modern application",
        "date_added": "2026-03",
    },

    # ── Decorators / Metaprogramming ───────────────────────────────────
    {
        "id": "trend_047",
        "title": "Python Decorators and Metaprogramming",
        "category": "python_advanced",
        "difficulty": "advanced",
        "summary": (
            "Master decorators, metaclasses, and descriptor protocols to "
            "write elegant, reusable code that extends Python's behaviour "
            "at the class and function level."
        ),
        "key_concepts": ["decorators", "metaclasses", "descriptors", "__init_subclass__", "functools"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "import functools, time\n\n"
            "def timer(func):\n"
            "    @functools.wraps(func)\n"
            "    def wrapper(*args, **kwargs):\n"
            "        start = time.perf_counter()\n"
            "        result = func(*args, **kwargs)\n"
            "        elapsed = time.perf_counter() - start\n"
            "        print(f'{func.__name__} took {elapsed:.4f}s')\n"
            "        return result\n"
            "    return wrapper\n\n"
            "@timer\n"
            "def slow_function():\n"
            "    time.sleep(1)\n"
            "    return 'done'"
        ),
        "why_trending": "Decorators are used everywhere in modern Python -- FastAPI, pytest, dataclasses",
        "date_added": "2026-03",
    },

    # ── Pattern Matching ───────────────────────────────────────────────
    {
        "id": "trend_048",
        "title": "Structural Pattern Matching in Python",
        "category": "python_latest",
        "difficulty": "intermediate",
        "summary": (
            "Use Python's match/case statement for elegant, readable "
            "control flow -- destructure data, match types, and handle "
            "complex conditional logic cleanly."
        ),
        "key_concepts": ["match/case", "structural patterns", "destructuring", "guard clauses"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "def handle_command(command: dict):\n"
            "    match command:\n"
            "        case {'action': 'greet', 'name': name}:\n"
            "            return f'Hello, {name}!'\n"
            "        case {'action': 'add', 'x': int(x), 'y': int(y)}:\n"
            "            return f'{x} + {y} = {x + y}'\n"
            "        case {'action': 'quit'}:\n"
            "            return 'Goodbye!'\n"
            "        case _:\n"
            "            return 'Unknown command'\n\n"
            "print(handle_command({'action': 'greet', 'name': 'Muthu'}))"
        ),
        "why_trending": "Pattern matching is transforming how Pythonistas write conditional logic",
        "date_added": "2026-03",
    },

    # ── Dataclasses ────────────────────────────────────────────────────
    {
        "id": "trend_049",
        "title": "Python Dataclasses and attrs",
        "category": "python_tools",
        "difficulty": "beginner",
        "summary": (
            "Simplify class definitions using dataclasses and attrs -- "
            "automatic __init__, __repr__, __eq__, ordering, immutability, "
            "and slot-based memory optimisation."
        ),
        "key_concepts": ["dataclasses", "attrs", "slots", "frozen", "field factories"],
        "related_lessons": ["python_basics"],
        "code_example": (
            "from dataclasses import dataclass, field\n\n"
            "@dataclass(frozen=True, slots=True)\n"
            "class Point:\n"
            "    x: float\n"
            "    y: float\n\n"
            "    @property\n"
            "    def distance(self) -> float:\n"
            "        return (self.x**2 + self.y**2) ** 0.5\n\n"
            "p = Point(3.0, 4.0)\n"
            "print(p.distance)  # 5.0\n"
            "# p.x = 10  # FrozenInstanceError!"
        ),
        "why_trending": "Dataclasses with slots are the idiomatic way to define data containers",
        "date_added": "2026-03",
    },

    # ── Context Managers ───────────────────────────────────────────────
    {
        "id": "trend_050",
        "title": "Context Managers and Resource Management",
        "category": "python_advanced",
        "difficulty": "intermediate",
        "summary": (
            "Write safe, clean resource management code using context "
            "managers -- from file handling to database connections to "
            "custom cleanup logic."
        ),
        "key_concepts": ["with statement", "contextlib", "__enter__/__exit__", "async context managers"],
        "related_lessons": ["python_advanced"],
        "code_example": (
            "from contextlib import contextmanager\nimport time\n\n"
            "@contextmanager\n"
            "def timed_block(label: str):\n"
            "    start = time.perf_counter()\n"
            "    try:\n"
            "        yield\n"
            "    finally:\n"
            "        elapsed = time.perf_counter() - start\n"
            "        print(f'{label}: {elapsed:.3f}s')\n\n"
            "with timed_block('data processing'):\n"
            "    data = [x**2 for x in range(1_000_000)]"
        ),
        "why_trending": "Context managers are essential for writing production-quality Python",
        "date_added": "2026-03",
    },
]

# ---------------------------------------------------------------------------
# Category metadata
# ---------------------------------------------------------------------------

CATEGORIES: dict[str, dict[str, str]] = {
    "ai_agents": {"label": "AI Agents", "icon": "robot"},
    "rag": {"label": "RAG", "icon": "search"},
    "fine_tuning": {"label": "Fine-tuning", "icon": "tune"},
    "multimodal": {"label": "Multimodal AI", "icon": "image"},
    "ai_coding": {"label": "AI Coding", "icon": "code"},
    "python_latest": {"label": "Python Latest", "icon": "python"},
    "deep_learning": {"label": "Deep Learning", "icon": "brain"},
    "prompt_engineering": {"label": "Prompt Engineering", "icon": "chat"},
    "ai_safety": {"label": "AI Safety", "icon": "shield"},
    "edge_ai": {"label": "Edge AI", "icon": "chip"},
    "ai_healthcare": {"label": "AI Healthcare", "icon": "health"},
    "computer_vision": {"label": "Computer Vision", "icon": "eye"},
    "nlp": {"label": "NLP", "icon": "text"},
    "mlops": {"label": "MLOps", "icon": "deploy"},
    "vector_db": {"label": "Vector Databases", "icon": "database"},
    "model_architecture": {"label": "Model Architecture", "icon": "architecture"},
    "data_engineering": {"label": "Data Engineering", "icon": "data"},
    "generative_ai": {"label": "Generative AI", "icon": "sparkle"},
    "ml_systems": {"label": "ML Systems", "icon": "system"},
    "data_science": {"label": "Data Science", "icon": "chart"},
    "python_tools": {"label": "Python Tools", "icon": "tool"},
    "devops": {"label": "DevOps", "icon": "container"},
    "web_development": {"label": "Web Development", "icon": "globe"},
    "python_advanced": {"label": "Python Advanced", "icon": "expert"},
}

# ---------------------------------------------------------------------------
# Lookup indices (built once at import time)
# ---------------------------------------------------------------------------

_BY_ID: dict[str, dict] = {t["id"]: t for t in TRENDING_TOPICS}
_BY_CATEGORY: dict[str, list[dict]] = {}
for _t in TRENDING_TOPICS:
    _BY_CATEGORY.setdefault(_t["category"], []).append(_t)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _date_hash(date_str: str) -> int:
    """Return a deterministic integer for a given date string."""
    return int(hashlib.sha256(date_str.encode()).hexdigest(), 16)


def get_daily_trending(date_str: str, count: int = 5) -> list[dict]:
    """Return *count* trending topics for *date_str* (e.g. '2026-03-29').

    The selection is deterministic: the same date always returns the same
    topics, but different dates rotate through the full catalogue.
    """
    n = len(TRENDING_TOPICS)
    if n == 0:
        return []
    count = min(count, n)
    h = _date_hash(date_str)
    start = h % n
    indices = [(start + i) % n for i in range(count)]
    return [TRENDING_TOPICS[i] for i in indices]


def get_trending_for_profile(
    profile: dict,
    date_str: str,
    count: int = 5,
) -> list[dict]:
    """Return personalised trending topics based on a user profile.

    The *profile* dict should contain at least:
      - ``skill_level``  ('beginner' | 'intermediate' | 'advanced')
      - ``interests``    list[str] of category keys or free-text tags

    Topics matching the user's difficulty and interests are prioritised,
    then padded with general trending content for variety.
    """
    level = profile.get("skill_level", "beginner")
    interests = {i.lower() for i in profile.get("interests", [])}

    # Score each topic for this profile
    scored: list[tuple[float, int, dict]] = []
    for idx, topic in enumerate(TRENDING_TOPICS):
        score = 0.0
        # Difficulty match
        if topic["difficulty"] == level:
            score += 2.0
        elif (
            (level == "intermediate" and topic["difficulty"] == "beginner")
            or (level == "advanced" and topic["difficulty"] == "intermediate")
        ):
            score += 1.0
        # Interest match
        if topic["category"] in interests:
            score += 3.0
        for kw in topic.get("key_concepts", []):
            if kw.lower() in interests:
                score += 1.5
        scored.append((score, idx, topic))

    # Sort by score desc, then deterministic shuffle within same score
    h = _date_hash(date_str)
    scored.sort(key=lambda s: (-s[0], (s[1] + h) % len(TRENDING_TOPICS)))
    return [item[2] for item in scored[:count]]


def get_topic_by_id(topic_id: str) -> dict | None:
    """Return a single topic by its ``id``, or *None*."""
    return _BY_ID.get(topic_id)


def get_topics_by_category(category: str) -> list[dict]:
    """Return all topics in a category."""
    return list(_BY_CATEGORY.get(category, []))


def search_trends(query: str) -> list[dict]:
    """Simple case-insensitive text search across titles and summaries."""
    q = query.lower()
    results: list[dict] = []
    for topic in TRENDING_TOPICS:
        if q in topic["title"].lower() or q in topic["summary"].lower():
            results.append(topic)
    return results


def get_all_categories() -> dict[str, dict[str, str]]:
    """Return category metadata dict."""
    return dict(CATEGORIES)
