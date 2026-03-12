"""Tutor response parser for the PyMasters AI Tutor.

Parses structured markers in AI tutor responses and converts them to
styled HTML matching the Obsidian Terminal design system.

Supported markers:
  - Code blocks:       ```python ... ``` or ``` ... ```
  - Concept cards:     :::concept TERM | EXPLANATION :::
  - Steps:             :::steps STEP1 | STEP2 | STEP3 :::
  - Comparison tables: :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 | ... :::
  - Plain text lines are wrapped in <p> tags.
"""
from __future__ import annotations

import html
import re


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Fenced code block: ```lang\n...code...\n``` (DOTALL so newlines match)
_RE_CODE = re.compile(
    r"```(?P<lang>[a-zA-Z0-9_+-]*)\n?(?P<code>.*?)```",
    re.DOTALL,
)

# :::concept TERM | EXPLANATION :::
_RE_CONCEPT = re.compile(
    r":::concept\s+(?P<term>[^|]+?)\s*\|\s*(?P<explanation>.+?)\s*:::",
    re.DOTALL,
)

# :::steps STEP1 | STEP2 | ... :::
_RE_STEPS = re.compile(
    r":::steps\s+(?P<steps>.+?)\s*:::",
    re.DOTALL,
)

# :::compare HEADER1,HEADER2 | ROW1COL1,ROW1COL2 | ... :::
_RE_COMPARE = re.compile(
    r":::compare\s+(?P<body>.+?)\s*:::",
    re.DOTALL,
)


# ---------------------------------------------------------------------------
# Individual renderers
# ---------------------------------------------------------------------------

def _render_code(match: re.Match) -> str:
    """Render a fenced code block as a styled HTML div."""
    lang = match.group("lang").strip()
    code = match.group("code")
    escaped_code = html.escape(code)
    lang_label = (
        f'<div style="'
        f'font-family: \'JetBrains Mono\', monospace; '
        f'font-size: 10px; '
        f'color: var(--text-muted); '
        f'text-transform: uppercase; '
        f'margin-bottom: 8px; '
        f'letter-spacing: 0.08em;'
        f'">{html.escape(lang)}</div>'
        if lang
        else ""
    )
    return (
        '<div style="'
        "background-color: var(--bg-elevated); "
        "border: 1px solid var(--border); "
        "border-radius: 6px; "
        "padding: 16px; "
        "margin: 12px 0;"
        '">'
        + lang_label
        + '<pre style="'
        "font-family: 'JetBrains Mono', monospace; "
        "font-size: 12px; "
        "color: var(--accent); "
        "white-space: pre-wrap; "
        "margin: 0; "
        "padding: 0; "
        "background: none; "
        "border: none;"
        f'">{escaped_code}</pre>'
        "</div>"
    )


def _render_concept(match: re.Match) -> str:
    """Render a concept card as a styled HTML div."""
    term = html.escape(match.group("term").strip())
    explanation = html.escape(match.group("explanation").strip())
    return (
        '<div style="'
        "background-color: var(--bg-elevated); "
        "border-left: 3px solid var(--accent); "
        "border-radius: 0 6px 6px 0; "
        "padding: 12px 16px; "
        "margin: 12px 0;"
        '">'
        '<div style="'
        "font-family: 'JetBrains Mono', monospace; "
        "font-size: 13px; "
        "font-weight: 600; "
        "color: var(--text-primary); "
        "margin-bottom: 4px;"
        f'">{term}</div>'
        '<div style="'
        "font-size: 12px; "
        "color: var(--text-secondary);"
        f'">{explanation}</div>'
        "</div>"
    )


def _render_steps(match: re.Match) -> str:
    """Render a steps block as a vertical timeline."""
    raw_steps = match.group("steps")
    steps = [s.strip() for s in raw_steps.split("|") if s.strip()]
    items_html = ""
    for i, step in enumerate(steps):
        is_last = i == len(steps) - 1
        escaped_step = html.escape(step)
        # Timeline row: dot + optional connector line + step text
        connector = (
            ""
            if is_last
            else (
                '<div style="'
                "width: 1px; "
                "background-color: var(--border); "
                "flex: 1; "
                "min-height: 12px; "
                "margin: 2px 0;"
                '"></div>'
            )
        )
        items_html += (
            '<div style="display: flex; flex-direction: row; align-items: flex-start; gap: 12px; margin-bottom: 4px;">'
            # Left column: dot + line
            '<div style="display: flex; flex-direction: column; align-items: center;">'
            '<div style="'
            "width: 8px; "
            "height: 8px; "
            "border-radius: 50%; "
            "background-color: var(--accent); "
            "flex-shrink: 0; "
            "margin-top: 2px;"
            '"></div>'
            + connector
            + "</div>"
            # Step text
            '<div style="'
            "font-size: 12px; "
            "color: var(--text-primary); "
            "padding-bottom: 8px;"
            f'">{escaped_step}</div>'
            "</div>"
        )
    return (
        '<div style="margin: 12px 0;">'
        + items_html
        + "</div>"
    )


def _render_compare(match: re.Match) -> str:
    """Render a comparison table as a styled HTML table."""
    raw_body = match.group("body")
    rows = [r.strip() for r in raw_body.split("|") if r.strip()]
    if not rows:
        return ""

    # First row = headers (comma-separated)
    headers = [h.strip() for h in rows[0].split(",")]
    header_cells = "".join(
        '<th style="'
        "font-family: 'JetBrains Mono', monospace; "
        "font-size: 10px; "
        "color: var(--text-muted); "
        "text-transform: uppercase; "
        "letter-spacing: 0.08em; "
        "padding: 8px 12px; "
        "text-align: left; "
        "border-bottom: 1px solid var(--border); "
        "font-weight: 600;"
        f'">{html.escape(h)}</th>'
        for h in headers
    )
    thead = f"<thead><tr>{header_cells}</tr></thead>"

    # Remaining rows = data rows (comma-separated cells)
    tbody_rows = ""
    for row in rows[1:]:
        cells = [c.strip() for c in row.split(",")]
        # Pad or trim to header count
        while len(cells) < len(headers):
            cells.append("")
        cells = cells[: len(headers)]
        row_cells = "".join(
            '<td style="'
            "font-size: 12px; "
            "color: var(--text-secondary); "
            "padding: 8px 12px; "
            "border-bottom: 1px solid var(--border-subtle);"
            f'">{html.escape(c)}</td>'
            for c in cells
        )
        tbody_rows += f"<tr>{row_cells}</tr>"

    tbody = f"<tbody>{tbody_rows}</tbody>"

    return (
        '<div style="'
        "background-color: var(--bg-elevated); "
        "border: 1px solid var(--border); "
        "border-radius: 6px; "
        "overflow: hidden; "
        "margin: 12px 0;"
        '">'
        f'<table style="width: 100%; border-collapse: collapse;">{thead}{tbody}</table>'
        "</div>"
    )


# ---------------------------------------------------------------------------
# Placeholder helpers — prevent double-processing of already-rendered chunks
# ---------------------------------------------------------------------------

_PLACEHOLDER_PREFIX = "\x00RENDERED"
_PLACEHOLDER_SUFFIX = "\x00"


def _make_placeholder(index: int) -> str:
    return f"{_PLACEHOLDER_PREFIX}{index}{_PLACEHOLDER_SUFFIX}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_tutor_response(text: str) -> str:
    """Parse structured markers in *text* and return styled HTML.

    Markers are replaced in order: code blocks, concept cards, steps,
    comparison tables.  Plain-text lines (not already HTML) are wrapped
    in ``<p>`` tags styled to match the Obsidian Terminal design system.

    All user-supplied content is passed through ``html.escape()`` before
    being embedded in HTML attributes or element text.

    Parameters
    ----------
    text:
        Raw response string from the AI tutor, possibly containing
        structural markers and plain-text paragraphs.

    Returns
    -------
    str
        An HTML string ready to be passed to ``st.markdown(...,
        unsafe_allow_html=True)``.
    """
    rendered_chunks: list[str] = []

    def _replace(pattern: re.Pattern, renderer) -> None:
        """Replace all occurrences of *pattern* in *text* with rendered HTML."""
        nonlocal text
        def _handler(m: re.Match) -> str:
            idx = len(rendered_chunks)
            rendered_chunks.append(renderer(m))
            return _make_placeholder(idx)
        text = pattern.sub(_handler, text)

    # Process markers in priority order (code first so backticks aren't
    # confused with concept / steps / compare syntax).
    _replace(_RE_CODE, _render_code)
    _replace(_RE_CONCEPT, _render_concept)
    _replace(_RE_STEPS, _render_steps)
    _replace(_RE_COMPARE, _render_compare)

    # Process remaining plain-text lines
    output_parts: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            # Preserve blank lines as spacing
            output_parts.append("")
            continue

        # Check if this line is entirely a placeholder
        placeholder_re = re.compile(
            rf"^({re.escape(_PLACEHOLDER_PREFIX)}\d+{re.escape(_PLACEHOLDER_SUFFIX)})+$"
        )
        if placeholder_re.match(stripped):
            # Substitute all placeholders on this line
            def _sub_placeholder(m: re.Match) -> str:
                idx = int(m.group(1))
                return rendered_chunks[idx]

            substituted = re.sub(
                rf"{re.escape(_PLACEHOLDER_PREFIX)}(\d+){re.escape(_PLACEHOLDER_SUFFIX)}",
                _sub_placeholder,
                stripped,
            )
            output_parts.append(substituted)
        elif stripped.startswith("<"):
            # Already HTML — pass through as-is
            output_parts.append(stripped)
        else:
            # Plain text — wrap in styled <p>
            output_parts.append(
                '<p style="'
                "color: var(--text-secondary); "
                "font-size: 13px; "
                "line-height: 1.6; "
                "margin: 6px 0;"
                f'">{html.escape(stripped)}</p>'
            )

    return "\n".join(output_parts)
