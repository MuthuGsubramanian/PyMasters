# Vaathiyaar Fine-Tuning Runbook

How the tutor improves from real student interactions.

## The loop

```
students chat / submit code      →  every interaction recorded to `training_data`
👍/👎 + code-pass outcome         →  sets quality_score (1.0 / 0.0 / 0.85 / 0.4)
GET /api/classroom/training/export?min_quality=0.7   →  high-quality JSONL
finetune_pipeline.py             →  Modelfile w/ best exemplars → PyMasters/Vaathiyaar
OLLAMA_MODEL=PyMasters/Vaathiyaar →  the live app uses the improved tutor
```

Steps 1–3 (collect → rate → export) are **live**. This pipeline is step 4.

## Quick start (no GPU needed)

Run from `backend/vaathiyaar/` with `OLLAMA_API_KEY` set:

```bash
# 1. See how much usable data exists + build the Modelfile (creates nothing):
python finetune_pipeline.py --base-url https://pymasters.net --min-quality 0.7

# 2. When you have ≥10 rated examples, create the model on Ollama Cloud:
python finetune_pipeline.py --base-url https://pymasters.net --min-quality 0.7 --create
# (or: ./finetune.sh 0.7 --create)

# 3. Point the live app at it (the script prints this command):
gcloud run services update pymasters --project pymasters-app --region us-central1 \
  --update-env-vars OLLAMA_MODEL=PyMasters/Vaathiyaar
```

Check data volume anytime: `GET /api/classroom/training/stats`.

### Rollback
```bash
gcloud run services update pymasters --project pymasters-app --region us-central1 \
  --update-env-vars OLLAMA_MODEL=qwen3.5
```

## How it improves the model

`finetune_pipeline.py` bakes the **top 👍-rated interactions** into the model's
Modelfile as few-shot `MESSAGE` exemplars on top of the Vaathiyaar persona. The
model then mirrors the responses students found most helpful — no GPU, runs via
Ollama Cloud. Re-run periodically as more rated data accumulates.

## Upgrade path: true gradient (LoRA) fine-tuning

Few-shot exemplars steer behaviour; gradient fine-tuning *learns* it. When the
dataset is large (1k+ high-quality pairs) and a GPU is available, train a LoRA
adapter and load it via the Modelfile:

1. Export: `GET /api/classroom/training/export?min_quality=0.8 > data.jsonl`
2. Train a QLoRA adapter on a GPU (e.g. **unsloth** or **llama-factory** with the
   Qwen base; or a **Vertex AI** custom-training job on GCP since there's no local GPU).
3. Convert the adapter to GGUF and reference it in the Modelfile:
   `FROM qwen3.5` + `ADAPTER ./vaathiyaar-lora.gguf`, then `ollama create`.
4. Deploy by pointing `OLLAMA_MODEL` at the new model (same as above).

The collection/rating/export half (the hard part to retrofit) is already done, so
this is a drop-in once data + GPU are ready.
