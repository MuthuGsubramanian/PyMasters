"""Load Markdown content with optional front matter."""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

import streamlit as st

def load_markdown(path: str | Path) -> Tuple[str, str]:
    """Return (metadata, markdown) for the given file."""

    path = Path(path)
    content = path.read_text(encoding="utf-8")
    if content.startswith("---"):
        _, metadata, body = content.split("---", 2)
        return metadata.strip(), body.strip()
    return "", content


def render_markdown(path: str | Path) -> None:
    """Render Markdown in Streamlit with caching."""

    metadata, body = load_markdown(path)
    if metadata:
        st.caption(metadata)
    st.markdown(body)
