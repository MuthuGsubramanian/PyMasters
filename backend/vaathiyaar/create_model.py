"""
Create and push the PyMasters/Vaathiyaar custom model to Ollama Cloud.

Usage:
    python create_model.py

This reads the Modelfile and creates a custom model on Ollama Cloud
using the official Python SDK.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from ollama import Client

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
MODEL_NAME = "PyMasters/Vaathiyaar"
MODELFILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Modelfile")


def create_vaathiyaar_model():
    """Create the Vaathiyaar custom model on Ollama Cloud."""
    print(f"Reading Modelfile from: {MODELFILE_PATH}")

    with open(MODELFILE_PATH, "r", encoding="utf-8") as f:
        modelfile_content = f.read()

    print(f"Modelfile size: {len(modelfile_content)} characters")
    print(f"Creating model: {MODEL_NAME}")
    print(f"API Key: {'set' if OLLAMA_API_KEY else 'NOT SET'}")

    client = Client(
        host="https://ollama.com",
        headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"}
    )

    try:
        # Create the model
        response = client.create(
            model=MODEL_NAME,
            modelfile=modelfile_content,
        )
        print(f"Model created successfully!")
        print(f"Response: {response}")

    except Exception as e:
        print(f"Error creating model: {e}")
        print("\nTrying alternative approach...")

        # If create doesn't work via cloud, just verify the model works
        try:
            test_response = client.chat(
                model="qwen3.5",
                messages=[
                    {"role": "system", "content": "You are Vaathiyaar. Say 'Vanakkam!' in one word."},
                    {"role": "user", "content": "Hello"}
                ],
                stream=False,
            )
            print(f"Base model (qwen3.5) is accessible: {test_response['message']['content'][:100]}")
            print(f"\nNote: Custom model creation via Ollama Cloud API may not be supported yet.")
            print(f"The Vaathiyaar persona runs via system prompt injection on qwen3.5.")
            print(f"For local Ollama, run: ollama create {MODEL_NAME} -f Modelfile")
        except Exception as e2:
            print(f"Base model test also failed: {e2}")
            raise


if __name__ == "__main__":
    create_vaathiyaar_model()
