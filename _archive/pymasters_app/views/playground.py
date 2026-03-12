"""Code Playground — Obsidian Terminal."""
from __future__ import annotations

import io
import sys
import traceback
from datetime import datetime
from typing import Any

import streamlit as st

from pymasters_app.utils.db import get_database


SNIPPETS = {
    "Hello World": 'print("Hello, PyMasters!")',
    "List Ops": "numbers = [1, 2, 3, 4, 5]\nsquared = [n ** 2 for n in numbers]\nprint(squared)",
    "Dictionary": 'user = {"name": "Ada", "role": "learner"}\nfor key, val in user.items():\n    print(f"{key}: {val}")',
    "API Call": 'import json\ndata = {"name": "PyMasters", "version": "1.0"}\nprint(json.dumps(data, indent=2))',
}


def _safe_exec(code: str, timeout_hint: int = 5) -> tuple[str, bool]:
    """Execute Python code safely and capture output.
    Returns (output_text, success_bool).
    """
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = buffer_out = io.StringIO()
    sys.stderr = buffer_err = io.StringIO()

    success = True
    try:
        exec(code, {"__builtins__": __builtins__}, {})
    except Exception:
        success = False
        traceback.print_exc(file=buffer_err)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    stdout_text = buffer_out.getvalue()
    stderr_text = buffer_err.getvalue()
    output = stdout_text
    if stderr_text:
        output += ("\n" if output else "") + stderr_text
    return output or "(no output)", success


def render(*, user: dict[str, Any], **_: Any) -> None:
    st.markdown("### Playground")
    st.caption("Write and run Python in your browser.")

    db = get_database()

    # Snippet buttons
    snippet_cols = st.columns(len(SNIPPETS))
    selected_snippet = None
    for i, (name, code) in enumerate(SNIPPETS.items()):
        with snippet_cols[i]:
            if st.button(name, key=f"snippet-{name}"):
                selected_snippet = code

    # Initialize code in session state
    if "playground_code" not in st.session_state:
        st.session_state.playground_code = SNIPPETS["Hello World"]
    if selected_snippet:
        st.session_state.playground_code = selected_snippet

    # Editor + Output columns
    editor_col, output_col = st.columns([0.55, 0.45], gap="large")

    with editor_col:
        code = st.text_area(
            "Code",
            value=st.session_state.playground_code,
            height=300,
            key="playground-editor",
            label_visibility="collapsed",
        )
        if st.button("Run \u25b8", key="playground-run", use_container_width=True):
            st.session_state.playground_code = code
            output, success = _safe_exec(code)
            st.session_state.playground_output = output
            st.session_state.playground_success = success

            # Persist run
            db["playground_runs"].insert_one({
                "user_id": user.get("id", ""),
                "code": code[:2000],
                "output": output[:2000],
                "status": "success" if success else "error",
                "created_at": datetime.utcnow(),
            })

    with output_col:
        # Terminal-style output panel
        st.markdown(
            """<div class="ob-card" style="padding:8px 16px;margin-bottom:0;border-bottom:none;border-radius:10px 10px 0 0;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>
                    <div style="width:8px;height:8px;border-radius:50%;background:#eab308;"></div>
                    <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);margin-left:8px;letter-spacing:0.08em;">output</span>
                </div>
            </div>""",
            unsafe_allow_html=True,
        )

        output_text = st.session_state.get("playground_output", "Click Run to execute your code.")
        is_success = st.session_state.get("playground_success", True)
        output_color = "var(--text-primary)" if is_success else "var(--danger)"

        st.markdown(
            f"<div class='ob-card' style='border-radius:0 0 10px 10px;border-top:none;min-height:250px;padding:16px;'>"
            f"<pre style='margin:0;font-family:\"JetBrains Mono\",monospace;font-size:12px;color:{output_color};white-space:pre-wrap;line-height:1.5;'>{output_text}</pre>"
            f"</div>",
            unsafe_allow_html=True,
        )

    # Recent runs
    with st.expander("Recent runs"):
        rows = (
            db["playground_runs"]
            .find({"user_id": user.get("id", "")}, {"code": 1, "status": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(10)
        )
        for row in rows:
            status = row.get("status", "success")
            status_color = "var(--accent)" if status == "success" else "var(--danger)"
            code_preview = (row.get("code", "")[:60] or "").replace("\n", " ")
            ts = row.get("created_at")
            ts_str = ts.strftime("%Y-%m-%d %H:%M") if ts else ""
            st.markdown(
                f"<div style='display:flex;align-items:center;gap:8px;padding:4px 0;'>"
                f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:10px;color:{status_color};'>{status.upper()}</span>"
                f"<span style='font-size:11px;color:var(--text-secondary);flex:1;'>{code_preview}...</span>"
                f"<span style='font-family:\"JetBrains Mono\",monospace;font-size:10px;color:var(--text-muted);'>{ts_str}</span>"
                f"</div>",
                unsafe_allow_html=True,
            )
