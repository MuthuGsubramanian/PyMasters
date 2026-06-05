"""
Vaathiyaar fine-tuning pipeline
===============================

Turns collected, rated student interactions into an improved tutor model.

Flow:
  1. Pull high-quality training pairs (JSONL) from the LIVE export endpoint
     (default) or a local SQLite DB.
  2. Build a Modelfile = the Vaathiyaar persona + the top-rated interactions
     baked in as few-shot exemplars (so the model mirrors what students rated 👍).
  3. Create the custom model on Ollama Cloud  ->  PyMasters/Vaathiyaar
  4. Print the one-liner to point the live app at the new model.

No GPU needed (uses Ollama Cloud + few-shot exemplars). For true gradient/LoRA
fine-tuning, see FINETUNE.md.

Usage
-----
  # Dry run (default) — exports data, builds Modelfile.generated, creates nothing:
  python finetune_pipeline.py --base-url https://pymasters.net --min-quality 0.7

  # From the live site, actually create the model on Ollama Cloud:
  python finetune_pipeline.py --base-url https://pymasters.net --create

  # From a local DB instead of the live endpoint:
  python finetune_pipeline.py --source local --min-quality 0.7 --create
"""

import argparse
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # so `vaathiyaar.*` imports work

MODEL_NAME = "PyMasters/Vaathiyaar"
BASE_MODELFILE = os.path.join(HERE, "Modelfile")
OUT_MODELFILE = os.path.join(HERE, "Modelfile.generated")
MIN_EXAMPLES = 10  # don't bother building a model on too little data


def fetch_jsonl(source: str, base_url: str, min_quality: float) -> str:
    """Return JSONL training content from the live endpoint or local DB."""
    if source == "local":
        from vaathiyaar.training_data import build_training_jsonl
        db_path = os.environ.get("DB_PATH", "pymasters.db")
        jsonl, _ = build_training_jsonl(db_path, min_quality=min_quality)
        return jsonl
    url = f"{base_url.rstrip('/')}/api/classroom/training/export?min_quality={min_quality}"
    print(f"Fetching training data: {url}")
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode("utf-8")


def parse_examples(jsonl: str) -> list:
    examples = []
    for line in jsonl.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            msgs = {m["role"]: m["content"] for m in obj.get("messages", [])}
            if "user" in msgs and "assistant" in msgs:
                examples.append((msgs["user"], msgs["assistant"]))
        except (json.JSONDecodeError, KeyError, TypeError):
            continue
    return examples


def build_modelfile(examples: list, max_examples: int) -> str:
    """Base persona Modelfile + top-N rated interactions as few-shot MESSAGE pairs."""
    with open(BASE_MODELFILE, "r", encoding="utf-8") as f:
        base = f.read().rstrip()

    chosen = examples[:max_examples]
    blocks = [base, "", f"# --- {len(chosen)} few-shot exemplars from 👍-rated student interactions ---"]
    for user, assistant in chosen:
        # Keep the Modelfile sane: cap length and avoid breaking the triple-quote delimiter.
        u = user[:1200].replace('"""', "'''")
        a = assistant[:2500].replace('"""', "'''")
        blocks.append(f'MESSAGE user """{u}"""')
        blocks.append(f'MESSAGE assistant """{a}"""')
    return "\n".join(blocks) + "\n"


def create_model(modelfile: str) -> bool:
    api_key = os.getenv("OLLAMA_API_KEY", "")
    if not api_key:
        print("OLLAMA_API_KEY not set — cannot create on Ollama Cloud.")
        return False
    try:
        from ollama import Client
        client = Client(host="https://ollama.com",
                        headers={"Authorization": f"Bearer {api_key}"}, timeout=300)
        print(f"Creating {MODEL_NAME} on Ollama Cloud ...")
        client.create(model=MODEL_NAME, modelfile=modelfile)
        print(f"✅ Created {MODEL_NAME}")
        return True
    except Exception as e:
        print(f"❌ Ollama Cloud create failed: {e}")
        print("   If Cloud create is unsupported, run locally where `ollama` is installed:")
        print(f"   ollama create {MODEL_NAME} -f {OUT_MODELFILE}")
        return False


def main():
    ap = argparse.ArgumentParser(description="Vaathiyaar fine-tuning pipeline")
    ap.add_argument("--source", choices=["url", "local"], default="url")
    ap.add_argument("--base-url", default="https://pymasters.net")
    ap.add_argument("--min-quality", type=float, default=0.7)
    ap.add_argument("--max-examples", type=int, default=40)
    ap.add_argument("--create", action="store_true", help="actually create the model (else dry-run)")
    ap.add_argument("--force", action="store_true", help="proceed even with few examples")
    args = ap.parse_args()

    jsonl = fetch_jsonl(args.source, args.base_url, args.min_quality)
    examples = parse_examples(jsonl)
    print(f"Found {len(examples)} high-quality examples (min_quality={args.min_quality}).")

    if len(examples) < MIN_EXAMPLES and not args.force:
        print(f"Need at least {MIN_EXAMPLES} rated examples to build a useful model "
              f"(have {len(examples)}). Let usage accumulate, or pass --force. Stopping.")
        return

    modelfile = build_modelfile(examples, args.max_examples)
    with open(OUT_MODELFILE, "w", encoding="utf-8") as f:
        f.write(modelfile)
    print(f"Wrote {OUT_MODELFILE} ({len(modelfile)} chars, "
          f"{min(len(examples), args.max_examples)} exemplars).")

    if not args.create:
        print("\nDry run complete (no model created). Re-run with --create to publish.")
        return

    if create_model(modelfile):
        print("\nNext: point the live app at the new model:")
        print('  gcloud run services update pymasters --project pymasters-app '
              '--region us-central1 --update-env-vars OLLAMA_MODEL=PyMasters/Vaathiyaar')


if __name__ == "__main__":
    main()
