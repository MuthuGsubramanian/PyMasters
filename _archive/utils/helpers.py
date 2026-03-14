import openai
import os
import streamlit as st

def get_openai_response(user_input):
    """Fetch response from OpenAI's API for chatbot."""
    openai.api_key = os.getenv("OPENAI_API_KEY")
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": user_input}]
    )
    return response["choices"][0]["message"]["content"]

def load_logo():
    """Load the PyMasters logo if available."""
    logo_path = os.path.join(os.getcwd(), "assets/logo.png")
    if os.path.exists(logo_path):
        st.image(logo_path, width=200)
    else:
        st.warning("⚠️ Logo not found! Please check the assets folder.")
