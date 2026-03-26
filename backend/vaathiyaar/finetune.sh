#!/bin/bash
# Export training data and create fine-tuned Vaathiyaar model
# Usage: ./finetune.sh [min_quality_score]

set -e

MIN_QUALITY="${1:-0.7}"

echo "=== Vaathiyaar Fine-Tuning Pipeline ==="
echo ""

echo "Step 1: Exporting training data (min quality: ${MIN_QUALITY})..."
python -c "from training_data import export_training_data; count = export_training_data('pymasters.duckdb', 'training_data.jsonl', ${MIN_QUALITY}); print(f'Exported {count} training examples')"

echo ""
echo "Step 2: Creating Vaathiyaar model from Modelfile..."
ollama create PyMasters/Vaathiyaar -f Modelfile

echo ""
echo "Model created: PyMasters/Vaathiyaar"
ollama list | grep Vaathiyaar
