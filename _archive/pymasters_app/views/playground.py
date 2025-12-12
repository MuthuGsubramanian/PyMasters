"""Interactive AI playground for experimenting with Python topics."""
from __future__ import annotations

import contextlib
import io
from typing import Any

import streamlit as st

from services.local_ai_service import LocalAIError, create_local_chat_completion
from config.settings import settings


PLAYGROUND_TOPICS = {
    "Asynchronous programming": {
        "primer": "Use asyncio to orchestrate concurrent IO-bound tasks. Master event loops, tasks, and structured concurrency.",
        "snippet": """import asyncio\n\nasync def fetch_data(delay: float, label: str) -> str:\n    await asyncio.sleep(delay)\n    return f\"{label} finished\"\n\nasync def main():\n    results = await asyncio.gather(\n        fetch_data(1, \"alpha\"),\n        fetch_data(2, \"beta\"),\n        fetch_data(0.3, \"gamma\"),\n    )\n    for line in results:\n        print(line)\n\nif __name__ == \"__main__\":\n    asyncio.run(main())\n""",
    },
    "Pandas transformations": {
        "primer": "Chain query, assign, and groupby operations to build expressive data pipelines. Favor method chaining for readability.",
        "snippet": """import pandas as pd\n\ndata = pd.DataFrame(\n    {\n        \"team\": [\"alpha\", \"beta\", \"alpha\", \"beta\"],\n        \"score\": [10, 15, 25, 5],\n        \"round\": [1, 1, 2, 2],\n    }\n)\n\nsummary = (\n    data.query(\"score > 8\")\n        .assign(bonus=lambda df: df[\"score\"] * 0.1)\n        .groupby(\"team\", as_index=False)\n        .agg(total_score=(\"score\", \"sum\"), avg_bonus=(\"bonus\", \"mean\"))\n)\nprint(summary)\n""",
    },
    "FastAPI microservices": {
        "primer": "Expose typed endpoints with dependency injection and background tasks. Perfect for small API backends.",
        "snippet": """from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get(\"/status\")\nasync def status():\n    return {\"status\": \"ok\"}\n\n@app.post(\"/echo\")\nasync def echo(payload: dict[str, str]):\n    return {\"mirrored\": payload}\n""",
    },
}


def _ai_tip(prompt: str) -> str:
    response = create_local_chat_completion(
        model=settings.local_ai_default_model,
        messages=[
            {"role": "system", "content": "You are a pragmatic Python coach. Respond with short actionable tips."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=400,
    )
    choice = response.get("choices", [{}])[0]
    if "message" in choice and "content" in choice["message"]:
        return choice["message"]["content"]
    return str(response)


def _run_code(source: str) -> tuple[str, str]:
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    local_env: dict[str, Any] = {}
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            exec(compile(source, filename="<playground>", mode="exec"), {}, local_env)
    except Exception as exc:  # pragma: no cover - runtime exec
        stderr_buffer.write(f"{type(exc).__name__}: {exc}\n")
    return stdout_buffer.getvalue(), stderr_buffer.getvalue()


def render(*, auth_manager, user: dict[str, str]) -> None:
    st.subheader("AI Playground")
    st.caption("Prototype ideas, run code snippets, and ask the local instructor for targeted guidance.")

    topic_names = list(PLAYGROUND_TOPICS.keys())
    col_topic, col_creativity = st.columns([0.6, 0.4])
    with col_topic:
        topic = st.selectbox("Topic focus", topic_names, index=0)
    with col_creativity:
        temperature = st.slider("Instructor creativity", 0.0, 1.2, 0.35, 0.05)

    details = PLAYGROUND_TOPICS[topic]
    st.markdown(f"**Primer:** {details['primer']}")

    code = st.text_area("Workspace", value=details["snippet"], height=300)
    run = st.button("Run code", type="primary")

    if run:
        stdout, stderr = _run_code(code)
        with st.expander("Console output", expanded=True):
            if stdout.strip():
                st.code(stdout, language="plaintext")
            if stderr.strip():
                st.error(stderr)
            if not stdout.strip() and not stderr.strip():
                st.info("No output produced.")

    st.divider()
    st.markdown("### Ask for a playground tip")
    question = st.text_area(
        "Ask the instructor",
        placeholder="Explain how to convert this function into an async variant...",
        height=120,
    )
    ask = st.button("Get tip", disabled=not question.strip())
    if ask and question.strip():
        with st.spinner("Summoning the local instructor..."):
            try:
                prompt = f"Topic: {topic}. Question: {question.strip()}."
                tip = _ai_tip(prompt)
            except LocalAIError as exc:
                tip = f"Local AI service unavailable: {exc}"
        st.write(tip)
