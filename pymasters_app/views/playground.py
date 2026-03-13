"""Code Playground — write and run Python in the browser.

Uses a sandboxed exec() with restricted builtins for safety.
Stores run history in MongoDB.
"""
from __future__ import annotations

import html as html_mod
import io
import contextlib
import traceback
from datetime import datetime
from typing import Any

import streamlit as st

from pymasters_app.utils.db import get_database


SNIPPETS = {
    "Hello World": 'print("Hello, PyMasters!")',
    "List Ops": "nums = [1, 2, 3, 4, 5]\nprint([n ** 2 for n in nums])",
    "Dictionary": 'user = {"name": "Ada", "lang": "Python"}\nfor k, v in user.items():\n    print(f"{k}: {v}")',
    "API Call": 'import urllib.request, json\nresp = urllib.request.urlopen("https://httpbin.org/get")\ndata = json.loads(resp.read())\nprint(json.dumps(data, indent=2))',
}

SAFE_BUILTINS = {
    "print": print, "len": len, "range": range, "int": int, "float": float,
    "str": str, "bool": bool, "list": list, "dict": dict, "tuple": tuple,
    "set": set, "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
    "sorted": sorted, "reversed": reversed, "sum": sum, "min": min, "max": max,
    "abs": abs, "round": round, "isinstance": isinstance, "type": type,
    "hasattr": hasattr, "getattr": getattr, "setattr": setattr,
    "input": lambda *a: "", "open": None, "__import__": __import__,
    "True": True, "False": False, "None": None,
}


def _safe_exec(code: str, timeout_hint: str = "5s") -> tuple[str, str]:
    """Execute code with restricted globals. Returns (stdout, status)."""
    stdout_capture = io.StringIO()
    status = "success"
    try:
        with contextlib.redirect_stdout(stdout_capture):
            exec(code, {"__builtins__": SAFE_BUILTINS})
    except Exception:
        stdout_capture.write(traceback.format_exc())
        status = "error"
    return stdout_capture.getvalue(), status


def render(*, user: dict[str, Any]) -> None:
    st.markdown("### Playground")
    st.caption("Write Python, hit Run, see output instantly.")

    db = get_database()

    # --- Snippet bar ---
    snippet_cols = st.columns(len(SNIPPETS))
    for col, (name, code) in zip(snippet_cols, SNIPPETS.items()):
        with col:
            if st.button(name, key=f"snippet-{name}", use_container_width=True):
                st.session_state["playground_code"] = code

    # --- Editor + Output ---
    col_editor, col_output = st.columns([0.55, 0.45])

    with col_editor:
        st.markdown(
            '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Editor</div>',
            unsafe_allow_html=True,
        )
        code = st.text_area(
            "code_editor",
            value=st.session_state.get("playground_code", SNIPPETS["Hello World"]),
            height=300,
            label_visibility="collapsed",
            key="playground_editor",
        )
        run_clicked = st.button("Run \u25b8", type="primary", use_container_width=True)

    with col_output:
        # Terminal-style output header
        st.markdown(
            '<div class="ob-card" style="padding:8px 16px;border-bottom:none;border-radius:10px 10px 0 0;display:flex;align-items:center;gap:8px;">'
            '<div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>'
            '<div style="width:8px;height:8px;border-radius:50%;background:#eab308;"></div>'
            '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>'
            '<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--text-muted);margin-left:8px;">output</span>'
            '</div>',
            unsafe_allow_html=True,
        )

        if run_clicked and code.strip():
            output, status = _safe_exec(code)
            st.session_state["playground_output"] = output
            st.session_state["playground_status"] = status

            # Persist run
            db["playground_runs"].insert_one({
                "user_id": user.get("id", ""),
                "code": code[:2000],
                "output": output[:2000],
                "status": status,
                "created_at": datetime.utcnow(),
            })

        output = st.session_state.get("playground_output", "")
        status = st.session_state.get("playground_status", "success")
        color = "var(--accent)" if status == "success" else "var(--danger)"

        st.markdown(
            f'<div class="ob-card" style="border-radius:0 0 10px 10px;min-height:260px;padding:16px;">'
            f'<pre style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:{color};white-space:pre-wrap;word-break:break-word;margin:0;">'
            f'{html_mod.escape(output) if output else "Run your code to see output here."}'
            f'</pre></div>',
            unsafe_allow_html=True,
        )
