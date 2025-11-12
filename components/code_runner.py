"""Interactive code runner component."""
from __future__ import annotations

from typing import Iterable, Optional

import streamlit as st

from api.sandbox_client import ExecutionResult, execute_python


def render_code_runner(
    *,
    prompt: str,
    starter_code: str,
    unit_tests: Optional[Iterable[dict]] = None,
    key: Optional[str] = None,
) -> None:
    """Render a lightweight Python execution widget with feedback."""

    unit_tests = list(unit_tests or [])
    st.subheader("Live code playground")
    st.markdown(prompt)

    code_input = st.text_area("Write your solution", value=starter_code, height=220, key=f"code-editor-{key}")

    if st.button("Run code", key=f"run-code-{key}"):
        with st.spinner("Executing in secure sandbox..."):
            result: ExecutionResult = execute_python(code_input, unit_tests)
        _render_result(result)


def _render_result(result: ExecutionResult) -> None:
    """Render sandbox results with visual feedback."""

    if result.status == "error":
        st.error(result.feedback)
        if result.stdout:
            st.code(result.stdout, language="text")
        return

    col1, col2 = st.columns([0.6, 0.4])
    with col1:
        st.success(result.feedback)
        if result.stdout.strip():
            st.markdown("**Program output**")
            st.code(result.stdout, language="text")
    with col2:
        st.markdown("**Unit tests**")
        for test in result.tests:
            badge = "✅" if test["status"] == "pass" else "❌"
            st.markdown(f"{badge} `{test['input']}`")
            if test.get("message"):
                st.caption(test["message"])
