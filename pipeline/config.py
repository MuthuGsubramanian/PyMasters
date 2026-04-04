import os

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PYMASTERS_REPO = "MuthuGsubramanian/PyMasters"
HOMIE_REPO = "MuthuGsubramanian/Homie"
RELEVANCE_THRESHOLD_HOMIE = 7
RELEVANCE_THRESHOLD_PYMASTERS = 7
MAX_ISSUES_PER_DAY = 3
MAX_ITEMS_PER_SOURCE = 20
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")

# Keywords for filtering AI-related content
AI_KEYWORDS = [
    "ai", "llm", "gpt", "machine learning", "neural", "transformer",
    "deep learning", "nlp", "computer vision", "generative", "diffusion",
    "language model", "openai", "anthropic", "claude", "gemini", "llama",
    "mistral", "hugging face", "pytorch", "tensorflow", "rag",
    "fine-tuning", "embedding", "vector", "agent", "chatbot",
]
