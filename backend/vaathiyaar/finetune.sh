#!/bin/bash
# Vaathiyaar fine-tuning pipeline — see FINETUNE.md for the full runbook.
#
# Usage:
#   ./finetune.sh                 # dry run against the live site (min quality 0.7)
#   ./finetune.sh 0.8 --create    # build + create the model on Ollama Cloud
#
# Env:
#   PYMASTERS_URL   base URL to pull training data from (default https://pymasters.net)
#   OLLAMA_API_KEY  required for --create
set -e
cd "$(dirname "$0")"
MIN_QUALITY="${1:-0.7}"; shift || true
python finetune_pipeline.py --base-url "${PYMASTERS_URL:-https://pymasters.net}" \
  --min-quality "$MIN_QUALITY" "$@"
