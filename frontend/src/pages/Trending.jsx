import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Flame, Search, Sparkles, ArrowRight, ChevronDown, ChevronUp,
  Code2, BookOpen, Zap, Brain, Eye, MessageSquare, Server,
  Cpu, BarChart3, Star, TrendingUp
} from 'lucide-react';

const CATEGORIES = [
  'All', 'AI Agents', 'LLMs', 'Computer Vision', 'NLP',
  'MLOps', 'Python', 'Deep Learning', 'Data Science'
];

const CATEGORY_COLORS = {
  'AI Agents':       { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30' },
  'LLMs':            { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
  'Computer Vision': { bg: 'bg-cyan-500/20',   text: 'text-cyan-300',   border: 'border-cyan-500/30' },
  'NLP':             { bg: 'bg-blue-500/20',    text: 'text-blue-300',   border: 'border-blue-500/30' },
  'MLOps':           { bg: 'bg-emerald-500/20', text: 'text-emerald-300',border: 'border-emerald-500/30' },
  'Python':          { bg: 'bg-yellow-500/20',  text: 'text-yellow-300', border: 'border-yellow-500/30' },
  'Deep Learning':   { bg: 'bg-rose-500/20',    text: 'text-rose-300',   border: 'border-rose-500/30' },
  'Data Science':    { bg: 'bg-teal-500/20',    text: 'text-teal-300',   border: 'border-teal-500/30' },
};

const DIFFICULTY_STYLES = {
  Beginner:     'bg-green-500/20 text-green-300 border-green-500/30',
  Intermediate: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Advanced:     'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const TRENDING_TOPICS = [
  {
    id: 1,
    title: 'Building AI Agents with Tool Use',
    category: 'AI Agents',
    difficulty: 'Intermediate',
    summary: 'Learn how to build autonomous AI agents that can use external tools, make decisions, and complete complex multi-step tasks using function calling and ReAct patterns.',
    whyTrending: 'AI agents are reshaping how we automate workflows. Companies are racing to deploy agent-based systems for customer support, coding, and research.',
    concepts: ['Function Calling', 'ReAct Pattern', 'Tool Integration', 'Agent Loop'],
    codeExample: `from anthropic import Anthropic

client = Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get current weather for a city",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string"}
        },
        "required": ["city"]
    }
}]

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Weather in Chennai?"}]
)`,
  },
  {
    id: 2,
    title: 'RAG Systems: Retrieval-Augmented Generation',
    category: 'LLMs',
    difficulty: 'Intermediate',
    summary: 'Build production-ready RAG pipelines that ground LLM responses in your own data. Covers chunking strategies, embedding models, vector stores, and reranking.',
    whyTrending: 'RAG has become the standard approach for enterprise AI, enabling accurate answers from proprietary data without fine-tuning.',
    concepts: ['Chunking', 'Embeddings', 'Vector Search', 'Reranking', 'Hybrid Search'],
    codeExample: `import chromadb
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')
client = chromadb.Client()
collection = client.create_collection("docs")

# Index documents
docs = ["Python is great for AI", "FastAPI is fast"]
embeddings = model.encode(docs).tolist()
collection.add(
    documents=docs,
    embeddings=embeddings,
    ids=["doc1", "doc2"]
)

# Query
query_emb = model.encode(["web framework"]).tolist()
results = collection.query(query_embeddings=query_emb, n_results=2)
print(results["documents"])`,
  },
  {
    id: 3,
    title: 'Fine-Tuning LLMs with LoRA & QLoRA',
    category: 'LLMs',
    difficulty: 'Advanced',
    summary: 'Master parameter-efficient fine-tuning techniques. Train domain-specific models using LoRA adapters with minimal GPU memory on consumer hardware.',
    whyTrending: 'QLoRA enables fine-tuning 70B models on a single GPU. Organizations are customizing open-source models for specialized tasks at unprecedented scale.',
    concepts: ['LoRA', 'QLoRA', 'PEFT', '4-bit Quantization', 'Adapter Layers'],
    codeExample: `from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B",
    load_in_4bit=True,
    device_map="auto"
)

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 4,194,304 (0.05%)`,
  },
  {
    id: 4,
    title: 'Multimodal AI: Vision + Language Models',
    category: 'Computer Vision',
    difficulty: 'Intermediate',
    summary: 'Explore multimodal models that understand both images and text. Build applications that analyze images, generate descriptions, and answer visual questions.',
    whyTrending: 'GPT-4o, Claude 3.5, and Gemini have made multimodal AI mainstream. Visual understanding is now a core capability in production AI systems.',
    concepts: ['Vision Transformers', 'CLIP', 'Image Captioning', 'VQA', 'OCR'],
    codeExample: `import anthropic, base64, httpx

client = anthropic.Anthropic()
image_data = base64.standard_b64encode(
    httpx.get("https://example.com/image.jpg").content
).decode("utf-8")

message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": image_data
            }},
            {"type": "text", "text": "Describe this image"}
        ]
    }]
)`,
  },
  {
    id: 5,
    title: 'Python 3.13 New Features',
    category: 'Python',
    difficulty: 'Beginner',
    summary: 'Explore the latest Python 3.13 features including the new REPL, experimental free-threaded mode (no GIL), improved error messages, and typing enhancements.',
    whyTrending: 'Python 3.13 introduces the experimental no-GIL build, a major step toward true parallelism that could transform Python performance for CPU-bound workloads.',
    concepts: ['Free-Threading', 'No GIL', 'JIT Compiler', 'New REPL', 'TypeIs'],
    codeExample: `# Python 3.13 - Improved error messages
# Better tracebacks with color and suggestions

# New typing features
from typing import TypeIs

def is_str_list(val: list[object]) -> TypeIs[list[str]]:
    return all(isinstance(x, str) for x in val)

# Experimental: free-threaded mode
# python3.13t  (no GIL build)
import threading

def cpu_work(n):
    return sum(i * i for i in range(n))

# True parallelism in 3.13t!
threads = [threading.Thread(target=cpu_work, args=(10**7,))
           for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()`,
  },
  {
    id: 6,
    title: 'FastAPI Best Practices & Production Patterns',
    category: 'Python',
    difficulty: 'Intermediate',
    summary: 'Master FastAPI patterns for production: dependency injection, background tasks, middleware, authentication, rate limiting, and structured logging.',
    whyTrending: 'FastAPI is now the most popular Python web framework for AI/ML APIs. Its async-first design and automatic OpenAPI docs make it ideal for serving models.',
    concepts: ['Dependency Injection', 'Middleware', 'Background Tasks', 'Pydantic v2', 'Lifespan'],
    codeExample: `from fastapi import FastAPI, Depends, HTTPException
from contextlib import asynccontextmanager
from pydantic import BaseModel

ml_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load models
    ml_models["sentiment"] = load_model("sentiment")
    yield
    # Shutdown: cleanup
    ml_models.clear()

app = FastAPI(lifespan=lifespan)

class PredictRequest(BaseModel):
    text: str

@app.post("/predict")
async def predict(req: PredictRequest):
    model = ml_models["sentiment"]
    result = model.predict(req.text)
    return {"sentiment": result, "confidence": 0.95}`,
  },
  {
    id: 7,
    title: 'PyTorch 2.x: torch.compile & Performance',
    category: 'Deep Learning',
    difficulty: 'Advanced',
    summary: 'Unlock massive speedups with torch.compile, understand TorchDynamo and TorchInductor backends, and optimize training loops for modern GPU architectures.',
    whyTrending: 'torch.compile delivers 30-200% speedups with a single line of code. PyTorch 2.x has fundamentally changed how we optimize deep learning code.',
    concepts: ['torch.compile', 'TorchDynamo', 'TorchInductor', 'Graph Capture', 'Flash Attention'],
    codeExample: `import torch
import torch.nn as nn

class TransformerBlock(nn.Module):
    def __init__(self, d_model=512, nhead=8):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, nhead)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.GELU(),
            nn.Linear(d_model * 4, d_model)
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)

    def forward(self, x):
        x = x + self.attn(self.norm1(x), self.norm1(x), self.norm1(x))[0]
        x = x + self.ff(self.norm2(x))
        return x

model = TransformerBlock().cuda()
# One line for 2x speedup!
compiled = torch.compile(model, mode="reduce-overhead")`,
  },
  {
    id: 8,
    title: 'Transformers from Scratch in Python',
    category: 'Deep Learning',
    difficulty: 'Advanced',
    summary: 'Build the Transformer architecture from the ground up. Implement self-attention, positional encoding, encoder-decoder blocks, and train on a real task.',
    whyTrending: 'Understanding Transformers at the code level is essential for AI engineers. This foundational knowledge is critical for research and debugging production models.',
    concepts: ['Self-Attention', 'Multi-Head Attention', 'Positional Encoding', 'Layer Norm', 'Masking'],
    codeExample: `import torch
import torch.nn as nn
import math

class SelfAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.d_k = d_model // num_heads
        self.num_heads = num_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, x, mask=None):
        B, T, C = x.shape
        q = self.W_q(x).view(B, T, self.num_heads, self.d_k).transpose(1, 2)
        k = self.W_k(x).view(B, T, self.num_heads, self.d_k).transpose(1, 2)
        v = self.W_v(x).view(B, T, self.num_heads, self.d_k).transpose(1, 2)

        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        attn = torch.softmax(scores, dim=-1)
        out = (attn @ v).transpose(1, 2).contiguous().view(B, T, C)
        return self.W_o(out)`,
  },
  {
    id: 9,
    title: 'Prompt Engineering Masterclass',
    category: 'LLMs',
    difficulty: 'Beginner',
    summary: 'Learn systematic prompt engineering techniques: chain-of-thought, few-shot prompting, structured outputs, system prompts, and evaluation strategies.',
    whyTrending: 'Prompt engineering is the highest-leverage AI skill. Well-crafted prompts can replace thousands of lines of code and dramatically improve AI output quality.',
    concepts: ['Chain-of-Thought', 'Few-Shot', 'System Prompts', 'Structured Output', 'Evaluation'],
    codeExample: `import anthropic

client = anthropic.Anthropic()

# Chain-of-thought with structured output
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system="""You are a Python tutor. Always:
1. Think step by step
2. Show the reasoning process
3. Provide working code examples
4. Explain common pitfalls""",
    messages=[{
        "role": "user",
        "content": """Analyze this code for bugs:

def fibonacci(n):
    if n <= 0: return 0
    if n == 1: return 1
    return fibonacci(n-1) + fibonacci(n-2)

How can we optimize it?"""
    }]
)`,
  },
  {
    id: 10,
    title: 'AI Safety & Alignment Fundamentals',
    category: 'AI Agents',
    difficulty: 'Beginner',
    summary: 'Understand the core concepts of AI safety: alignment, RLHF, constitutional AI, red-teaming, and responsible deployment practices for large language models.',
    whyTrending: 'As AI systems become more capable, safety is a top priority. Governments and organizations worldwide are establishing AI safety frameworks and regulations.',
    concepts: ['RLHF', 'Constitutional AI', 'Red-Teaming', 'Alignment', 'Guardrails'],
    codeExample: `# Implementing basic safety guardrails
from anthropic import Anthropic

client = Anthropic()

SAFETY_SYSTEM_PROMPT = """You are a helpful assistant.
Rules:
- Never generate harmful content
- Refuse requests for illegal activities
- Flag potential misuse patterns
- Be transparent about limitations
- Cite sources when making claims"""

def safe_generate(user_input: str) -> str:
    # Input validation
    if len(user_input) > 10000:
        return "Input too long. Please shorten your request."

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SAFETY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_input}]
    )
    return response.content[0].text`,
  },
  {
    id: 11,
    title: 'Vector Databases: ChromaDB & Pinecone',
    category: 'Data Science',
    difficulty: 'Intermediate',
    summary: 'Master vector databases for semantic search and AI applications. Compare ChromaDB, Pinecone, Weaviate, and Qdrant for different use cases and scale requirements.',
    whyTrending: 'Vector databases are the backbone of RAG systems and semantic search. The market is rapidly evolving with new features like hybrid search and metadata filtering.',
    concepts: ['Vector Embeddings', 'ANN Search', 'HNSW', 'Hybrid Search', 'Metadata Filtering'],
    codeExample: `import chromadb
from chromadb.utils import embedding_functions

# Use sentence-transformers for embeddings
ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(
    name="knowledge_base",
    embedding_function=ef,
    metadata={"hnsw:space": "cosine"}
)

# Add documents with metadata
collection.add(
    documents=["FastAPI is async", "Django is batteries-included"],
    metadatas=[{"topic": "web"}, {"topic": "web"}],
    ids=["d1", "d2"]
)

# Semantic search with filter
results = collection.query(
    query_texts=["async web framework"],
    n_results=5,
    where={"topic": "web"}
)`,
  },
  {
    id: 12,
    title: 'LangChain & LlamaIndex for LLM Apps',
    category: 'AI Agents',
    difficulty: 'Intermediate',
    summary: 'Build sophisticated LLM applications using LangChain and LlamaIndex. Create chains, agents, and data connectors that integrate with your existing systems.',
    whyTrending: 'LangChain and LlamaIndex have become the standard frameworks for building LLM-powered applications, with thousands of production deployments worldwide.',
    concepts: ['Chains', 'Agents', 'Data Connectors', 'Memory', 'Callbacks'],
    codeExample: `from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.anthropic import Anthropic

# LlamaIndex: build a Q&A system over your docs
documents = SimpleDirectoryReader("./data").load_data()
llm = Anthropic(model="claude-sonnet-4-20250514")

index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine(llm=llm)

response = query_engine.query(
    "What are the key features of our product?"
)
print(response)

# LangChain: create a conversational chain
from langchain_anthropic import ChatAnthropic
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory

llm = ChatAnthropic(model="claude-sonnet-4-20250514")
chain = ConversationChain(llm=llm, memory=ConversationBufferMemory())
result = chain.predict(input="Explain decorators in Python")`,
  },
  {
    id: 13,
    title: 'Stable Diffusion & Image Generation',
    category: 'Computer Vision',
    difficulty: 'Intermediate',
    summary: 'Generate and edit images with diffusion models. Understand denoising, latent spaces, ControlNet, and build custom image generation pipelines with diffusers.',
    whyTrending: 'Image generation quality has reached photorealistic levels. FLUX, SDXL, and ControlNet enable precise creative control for design, marketing, and content creation.',
    concepts: ['Diffusion Models', 'Latent Space', 'ControlNet', 'Img2Img', 'Inpainting'],
    codeExample: `from diffusers import StableDiffusionPipeline
import torch

pipe = StableDiffusionPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,
    variant="fp16"
).to("cuda")

# Enable memory optimizations
pipe.enable_model_cpu_offload()
pipe.enable_xformers_memory_efficient_attention()

image = pipe(
    prompt="A serene Tamil Nadu temple at sunset, photorealistic",
    negative_prompt="blurry, low quality",
    num_inference_steps=30,
    guidance_scale=7.5,
    width=1024,
    height=1024
).images[0]

image.save("temple_sunset.png")`,
  },
  {
    id: 14,
    title: 'Whisper & Speech Recognition with Python',
    category: 'NLP',
    difficulty: 'Intermediate',
    summary: 'Build speech-to-text systems using OpenAI Whisper. Handle multiple languages, real-time transcription, speaker diarization, and audio preprocessing.',
    whyTrending: 'Speech AI is booming with voice assistants, meeting transcription, and accessibility tools. Whisper v3 supports 99 languages with near-human accuracy.',
    concepts: ['ASR', 'Whisper', 'Speaker Diarization', 'VAD', 'Audio Preprocessing'],
    codeExample: `import whisper
import torch

# Load Whisper model
model = whisper.load_model("large-v3")

# Transcribe with language detection
result = model.transcribe(
    "meeting_recording.mp3",
    task="transcribe",
    language=None,  # Auto-detect
    word_timestamps=True,
    verbose=False
)

print(f"Detected language: {result['language']}")
print(f"Text: {result['text']}")

# Access word-level timestamps
for segment in result["segments"]:
    print(f"[{segment['start']:.1f}s - {segment['end']:.1f}s] "
          f"{segment['text']}")`,
  },
  {
    id: 15,
    title: 'Reinforcement Learning with Python',
    category: 'Deep Learning',
    difficulty: 'Advanced',
    summary: 'Master RL fundamentals: Q-learning, policy gradients, PPO, and actor-critic methods. Train agents in Gymnasium environments and apply RLHF to language models.',
    whyTrending: 'RL powers the training of the most capable AI systems. RLHF is the key technique behind ChatGPT and Claude alignment. Game AI and robotics continue to push boundaries.',
    concepts: ['Q-Learning', 'Policy Gradient', 'PPO', 'Actor-Critic', 'RLHF'],
    codeExample: `import gymnasium as gym
import numpy as np

# Q-Learning agent
env = gym.make("FrozenLake-v1", is_slippery=False)
q_table = np.zeros([env.observation_space.n, env.action_space.n])

alpha, gamma, epsilon = 0.8, 0.95, 0.1

for episode in range(10000):
    state, _ = env.reset()
    done = False

    while not done:
        if np.random.random() < epsilon:
            action = env.action_space.sample()
        else:
            action = np.argmax(q_table[state])

        next_state, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated

        q_table[state, action] += alpha * (
            reward + gamma * np.max(q_table[next_state])
            - q_table[state, action]
        )
        state = next_state`,
  },
  {
    id: 16,
    title: 'Graph Neural Networks (GNNs)',
    category: 'Deep Learning',
    difficulty: 'Advanced',
    summary: 'Learn graph neural networks for molecular discovery, social network analysis, and recommendation systems. Implement GCN, GAT, and GraphSAGE with PyG.',
    whyTrending: 'GNNs are revolutionizing drug discovery, fraud detection, and recommendation engines. PyTorch Geometric makes graph deep learning accessible.',
    concepts: ['GCN', 'GAT', 'GraphSAGE', 'Message Passing', 'Node Classification'],
    codeExample: `import torch
from torch_geometric.nn import GCNConv
from torch_geometric.datasets import Planetoid
import torch.nn.functional as F

dataset = Planetoid(root='./data', name='Cora')
data = dataset[0]

class GCN(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = GCNConv(dataset.num_features, 16)
        self.conv2 = GCNConv(16, dataset.num_classes)

    def forward(self, data):
        x, edge_index = data.x, data.edge_index
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, training=self.training)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)

model = GCN()
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)`,
  },
  {
    id: 17,
    title: 'Time Series Forecasting with AI',
    category: 'Data Science',
    difficulty: 'Intermediate',
    summary: 'Apply modern deep learning to time series: Temporal Fusion Transformers, N-BEATS, PatchTST. Compare with classical ARIMA and Prophet approaches.',
    whyTrending: 'Foundation models for time series (TimesFM, Chronos) are emerging. AI-powered forecasting outperforms traditional methods across finance, weather, and demand planning.',
    concepts: ['Temporal Fusion Transformer', 'N-BEATS', 'PatchTST', 'Prophet', 'Anomaly Detection'],
    codeExample: `from pytorch_forecasting import TemporalFusionTransformer
from pytorch_forecasting.data import TimeSeriesDataSet
import pandas as pd

# Prepare time series data
data = pd.DataFrame({
    "time_idx": range(100),
    "target": np.random.randn(100).cumsum(),
    "group": ["A"] * 100,
})

# Create dataset
dataset = TimeSeriesDataSet(
    data,
    time_idx="time_idx",
    target="target",
    group_ids=["group"],
    max_encoder_length=30,
    max_prediction_length=10,
)

# Train TFT model
trainer = pl.Trainer(max_epochs=50, accelerator="auto")
tft = TemporalFusionTransformer.from_dataset(
    dataset, learning_rate=0.03, hidden_size=16
)
trainer.fit(tft, train_dataloaders=dataset.to_dataloader())`,
  },
  {
    id: 18,
    title: 'AutoML & Hyperparameter Tuning',
    category: 'MLOps',
    difficulty: 'Intermediate',
    summary: 'Automate ML model selection and tuning with Optuna, Ray Tune, and AutoGluon. Learn Bayesian optimization, multi-fidelity methods, and neural architecture search.',
    whyTrending: 'AutoML democratizes machine learning. Optuna and Ray Tune make it easy to find optimal hyperparameters, while AutoGluon wins Kaggle competitions with zero config.',
    concepts: ['Bayesian Optimization', 'Optuna', 'Ray Tune', 'NAS', 'Multi-Fidelity'],
    codeExample: `import optuna
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.datasets import load_iris

X, y = load_iris(return_X_y=True)

def objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 500),
        "max_depth": trial.suggest_int("max_depth", 2, 32),
        "min_samples_split": trial.suggest_float(
            "min_samples_split", 0.01, 0.5
        ),
        "criterion": trial.suggest_categorical(
            "criterion", ["gini", "entropy"]
        ),
    }
    clf = RandomForestClassifier(**params, random_state=42)
    score = cross_val_score(clf, X, y, cv=5, scoring="accuracy")
    return score.mean()

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=100)
print(f"Best accuracy: {study.best_value:.4f}")
print(f"Best params: {study.best_params}")`,
  },
  {
    id: 19,
    title: 'Kubernetes for ML Workloads',
    category: 'MLOps',
    difficulty: 'Advanced',
    summary: 'Deploy and scale ML models on Kubernetes. Cover GPU scheduling, model serving with KServe, distributed training with Kubeflow, and autoscaling inference endpoints.',
    whyTrending: 'K8s has become the standard platform for ML infrastructure. KServe, Kubeflow, and Ray on K8s enable scalable, cost-efficient model serving and training.',
    concepts: ['KServe', 'Kubeflow', 'GPU Scheduling', 'Model Serving', 'HPA'],
    codeExample: `# KServe InferenceService manifest
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: sentiment-model
spec:
  predictor:
    model:
      modelFormat:
        name: pytorch
      storageUri: gs://models/sentiment-v2
      resources:
        limits:
          nvidia.com/gpu: 1
          memory: 8Gi
        requests:
          memory: 4Gi
  transformer:
    containers:
    - name: preprocessor
      image: my-registry/preprocessor:latest
      resources:
        requests:
          memory: 512Mi`,
  },
  {
    id: 20,
    title: 'MLflow & Experiment Tracking',
    category: 'MLOps',
    difficulty: 'Beginner',
    summary: 'Track experiments, manage models, and deploy ML pipelines with MLflow. Log parameters, metrics, and artifacts. Use the model registry for production deployments.',
    whyTrending: 'MLflow is the most widely adopted experiment tracking platform. Its model registry and deployment capabilities make it essential for any ML team.',
    concepts: ['Experiment Tracking', 'Model Registry', 'Artifacts', 'MLflow Projects', 'Serving'],
    codeExample: `import mlflow
import mlflow.sklearn
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, f1_score

mlflow.set_experiment("text-classification")

with mlflow.start_run(run_name="gbm-v1"):
    # Log parameters
    params = {"n_estimators": 200, "max_depth": 5, "learning_rate": 0.1}
    mlflow.log_params(params)

    # Train model
    model = GradientBoostingClassifier(**params)
    model.fit(X_train, y_train)

    # Log metrics
    preds = model.predict(X_test)
    mlflow.log_metric("accuracy", accuracy_score(y_test, preds))
    mlflow.log_metric("f1", f1_score(y_test, preds, average="weighted"))

    # Log model with signature
    mlflow.sklearn.log_model(model, "model",
        registered_model_name="text-classifier")`,
  },
  {
    id: 21,
    title: 'Agentic RAG: Autonomous Research Agents',
    category: 'AI Agents',
    difficulty: 'Advanced',
    summary: 'Build agents that autonomously research topics by querying multiple sources, synthesizing information, and iteratively refining their understanding.',
    whyTrending: 'Agentic RAG combines the best of agents and retrieval. These systems can plan research strategies, evaluate source quality, and produce comprehensive reports.',
    concepts: ['Planning', 'Multi-Source Retrieval', 'Self-Reflection', 'Iterative Refinement', 'Citation'],
    codeExample: `class ResearchAgent:
    def __init__(self, llm, retriever, max_iterations=5):
        self.llm = llm
        self.retriever = retriever
        self.max_iterations = max_iterations
        self.findings = []

    async def research(self, question: str) -> str:
        plan = await self.llm.plan_research(question)

        for step in plan.steps:
            # Retrieve relevant documents
            docs = await self.retriever.search(step.query)

            # Analyze and extract findings
            analysis = await self.llm.analyze(
                question=step.query,
                documents=docs,
                prior_findings=self.findings
            )
            self.findings.append(analysis)

            # Check if we have enough info
            if await self.llm.is_sufficient(self.findings):
                break

        return await self.llm.synthesize(question, self.findings)`,
  },
  {
    id: 22,
    title: 'Sentiment Analysis & NLP Pipelines',
    category: 'NLP',
    difficulty: 'Beginner',
    summary: 'Build production NLP pipelines for sentiment analysis, named entity recognition, text classification, and summarization using Hugging Face Transformers.',
    whyTrending: 'NLP powers every customer-facing AI feature from chatbots to content moderation. Transformer-based models achieve state-of-the-art results across all NLP tasks.',
    concepts: ['Tokenization', 'NER', 'Sentiment Analysis', 'Text Classification', 'Summarization'],
    codeExample: `from transformers import pipeline

# Sentiment analysis
sentiment = pipeline("sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english")
print(sentiment("I love learning Python!"))
# [{'label': 'POSITIVE', 'score': 0.9998}]

# Named Entity Recognition
ner = pipeline("ner", grouped_entities=True)
entities = ner("Sundar Pichai leads Google in Mountain View")
for e in entities:
    print(f"{e['word']}: {e['entity_group']} ({e['score']:.2f})")

# Zero-shot classification
classifier = pipeline("zero-shot-classification")
result = classifier(
    "FastAPI makes building APIs easy and fast",
    candidate_labels=["technology", "sports", "politics"]
)
print(f"Topic: {result['labels'][0]} ({result['scores'][0]:.2f})")`,
  },
];

const DAILY_PICKS_IDS = [1, 5, 9];

export default function Trending() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCode, setExpandedCode] = useState({});
  const [topics, setTopics] = useState(TRENDING_TOPICS);

  useEffect(() => {
    fetch('/api/trending')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { if (Array.isArray(data) && data.length) setTopics(data); })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return topics.filter(t => {
      const matchCat = activeCategory === 'All' || t.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q
        || t.title.toLowerCase().includes(q)
        || t.summary.toLowerCase().includes(q)
        || t.concepts.some(c => c.toLowerCase().includes(q))
        || t.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [topics, activeCategory, searchQuery]);

  const dailyPicks = useMemo(
    () => topics.filter(t => DAILY_PICKS_IDS.includes(t.id)),
    [topics]
  );

  const toggleCode = (id) =>
    setExpandedCode(prev => ({ ...prev, [id]: !prev[id] }));

  const catColor = (cat) => CATEGORY_COLORS[cat] || { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30' };

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center md:text-left"
      >
        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30">
            <Flame className="w-7 h-7 text-orange-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold font-display bg-gradient-to-r from-orange-400 via-red-400 to-purple-400 bg-clip-text text-transparent">
            Trending in AI & Python
          </h1>
        </div>
        <p className="text-slate-400 text-lg ml-0 md:ml-14">
          Stay ahead with the latest developments
        </p>
      </motion.div>

      {/* Category Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex flex-wrap gap-2"
      >
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
              ${activeCategory === cat
                ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg shadow-purple-500/20'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
          >
            {cat}
          </button>
        ))}
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="relative max-w-xl"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search trending topics..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all"
        />
      </motion.div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Topic Cards Grid */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory + searchQuery}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
            >
              {filtered.map((topic, i) => (
                <motion.div
                  key={topic.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  whileHover={{ scale: 1.02, y: -4 }}
                  className="group relative rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md overflow-hidden hover:border-purple-500/30 hover:bg-white/[0.07] transition-colors duration-300"
                >
                  <div className="p-5 space-y-4">
                    {/* Category + Difficulty */}
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${catColor(topic.category).bg} ${catColor(topic.category).text} ${catColor(topic.category).border}`}>
                        {topic.category}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${DIFFICULTY_STYLES[topic.difficulty]}`}>
                        {topic.difficulty}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-2">
                      {topic.title}
                    </h3>

                    {/* Summary */}
                    <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">
                      {topic.summary}
                    </p>

                    {/* Why Trending */}
                    <div className="p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-xs font-semibold text-orange-300">Why Trending</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                        {topic.whyTrending}
                      </p>
                    </div>

                    {/* Concepts Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {topic.concepts.slice(0, 4).map(c => (
                        <span key={c} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300">
                          {c}
                        </span>
                      ))}
                      {topic.concepts.length > 4 && (
                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-slate-500">
                          +{topic.concepts.length - 4}
                        </span>
                      )}
                    </div>

                    {/* Code Example Toggle */}
                    {topic.codeExample && (
                      <div>
                        <button
                          onClick={() => toggleCode(topic.id)}
                          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          {expandedCode[topic.id] ? 'Hide' : 'Show'} Code Preview
                          {expandedCode[topic.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <AnimatePresence>
                          {expandedCode[topic.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <pre className="mt-2 p-3 rounded-lg bg-black/40 border border-white/5 text-[11px] text-green-300 overflow-x-auto leading-relaxed max-h-48 overflow-y-auto">
                                <code>{topic.codeExample}</code>
                              </pre>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Explore Button */}
                    <button
                      onClick={() => navigate(`/dashboard/classroom?topic=${encodeURIComponent(topic.title)}`)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600/80 to-cyan-500/80 text-white text-sm font-semibold hover:from-purple-600 hover:to-cyan-500 transition-all group/btn"
                    >
                      <BookOpen className="w-4 h-4" />
                      Explore Topic
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">No topics found matching your search</p>
              <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search query</p>
            </motion.div>
          )}
        </div>

        {/* Daily Picks Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="lg:w-80 shrink-0"
        >
          <div className="sticky top-8 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-bold text-white">Daily Picks for You</h2>
            </div>
            <p className="text-xs text-slate-500">Personalized recommendations based on your interests</p>

            <div className="space-y-4">
              {dailyPicks.map((pick, i) => (
                <motion.div
                  key={pick.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => navigate(`/dashboard/classroom?topic=${encodeURIComponent(pick.title)}`)}
                  className="p-4 rounded-xl bg-white/[0.04] border border-white/10 hover:border-purple-500/30 hover:bg-white/[0.07] cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30 shrink-0">
                      <Star className="w-4 h-4 text-purple-300" />
                    </div>
                    <div className="min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1.5 border ${catColor(pick.category).bg} ${catColor(pick.category).text} ${catColor(pick.category).border}`}>
                        {pick.category}
                      </span>
                      <h4 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-2">
                        {pick.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{pick.summary}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="pt-3 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                Updated daily based on community activity
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
