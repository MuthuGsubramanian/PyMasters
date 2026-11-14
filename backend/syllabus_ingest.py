"""syllabus_ingest.py — Extract structured curriculum topics from uploaded PDF, DOCX, CSV,
and plain-text/Markdown syllabus documents using lightweight, stdlib-first parsers.
"""

from __future__ import annotations

import csv
import io
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib
from typing import Iterable

MAX_STUDIO_TOPICS = 25
MAX_STUDIO_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB for PDF/DOCX syllabi

_PREFERRED_CSV_COLS = {
    "topic",
    "topics",
    "module",
    "module_title",
    "title",
    "unit",
    "unit_title",
    "lesson",
    "subject",
    "competency",
    "skill",
}
_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-*•▪◦]+|\d{1,3}[.)]|week\s+\d+[:.\-\s]*|module\s+\d+[:.\-\s]*|unit\s+\d+[:.\-\s]*)\s*", re.I)


def normalize_topics(raw_lines: Iterable[str], limit: int = MAX_STUDIO_TOPICS) -> list[str]:
    """Normalize, clean bullet/numbering prefixes, deduplicate, and bound topic strings."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in raw_lines:
        s = re.sub(r"\s+", " ", str(raw or "")).strip()
        if not s or s.startswith("#"):
            continue
        s = _BULLET_PREFIX_RE.sub("", s).strip(" :-–—|")
        if len(s) < 3:
            continue
        # Skip pure numeric rows or generic table headers
        if s.isdigit() or s.lower() in {"topic", "topics", "module", "modules", "unit", "title", "syllabus", "week"}:
            continue
        s = s[:180]
        key = s.lower()
        if key not in seen:
            seen.add(key)
            out.append(s)
            if len(out) >= limit:
                break
    return out


def _extract_csv_lines(text: str) -> list[str]:
    reader = list(csv.reader(io.StringIO(text)))
    if not reader:
        return []
    header = [c.strip().lower() for c in reader[0]]
    col_idx = 0
    has_header = False
    for i, h in enumerate(header):
        if h in _PREFERRED_CSV_COLS:
            col_idx = i
            has_header = True
            break
    rows = reader[1:] if has_header else reader
    out: list[str] = []
    for row in rows:
        if not row:
            continue
        cell = row[col_idx] if col_idx < len(row) else row[0]
        if cell and cell.strip():
            out.append(cell.strip())
    return out


def _extract_docx_lines(data: bytes) -> list[str]:
    """Parse word/document.xml inside a .docx ZIP container using stdlib ElementTree."""
    out: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        xml_bytes = zf.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for p in root.iter(f"{ns}p"):
        chunks = [t.text for t in p.iter(f"{ns}t") if t.text]
        line = "".join(chunks).strip()
        if line:
            out.append(line)
    return out


def _unescape_pdf_string(s: str) -> str:
    s = s.replace("\\n", "\n").replace("\\r", "\n").replace("\\t", " ")
    s = s.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")
    return s


def _extract_pdf_lines(data: bytes) -> list[str]:
    """Extract text lines from PDF using pypdf if installed, else stdlib FlateDecode + literal scan."""
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(data))
        lines: list[str] = []
        for page in reader.pages:
            lines.extend((page.extract_text() or "").splitlines())
        if any(l.strip() for l in lines):
            return lines
    except Exception:
        pass

    chunks: list[str] = []
    # Decompress FlateDecode / compressed PDF object streams
    for match in re.finditer(rb"stream[\r\n]+(.*?)[\r\n]*endstream", data, re.DOTALL):
        raw_stream = match.group(1)
        text_bytes = raw_stream
        try:
            text_bytes = zlib.decompress(raw_stream)
        except Exception:
            pass
        decoded = text_bytes.decode("latin-1", errors="ignore")
        # Extract literal strings line-by-line inside PDF text operators: (text) Tj or [(a)(b)] TJ
        for line in decoded.splitlines():
            literals = re.findall(r"\(((?:\\.|[^\\)])+)\)", line)
            if literals:
                joined = " ".join(_unescape_pdf_string(lit) for lit in literals).strip()
                if joined:
                    chunks.append(joined)
            elif sum(c.isalpha() or c.isspace() for c in line) >= max(4, int(len(line) * 0.7)):
                chunks.append(line.strip())

    if not chunks:
        # Last-resort printable text extraction directly from raw PDF bytes
        raw_txt = data.decode("utf-8", errors="ignore")
        literals = re.findall(r"\(((?:\\.|[^\\)]){3,})\)", raw_txt)
        chunks.extend(_unescape_pdf_string(lit) for lit in literals)

    lines_out: list[str] = []
    for block in chunks:
        lines_out.extend(block.splitlines())
    return lines_out


def extract_topics_from_upload(
    filename: str,
    data: bytes,
    limit: int = MAX_STUDIO_TOPICS,
) -> list[str]:
    """Extract clean topic list from .pdf, .docx, .csv, or .txt/.md upload bytes."""
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else "txt"
    raw_lines: list[str]
    if ext == "docx":
        raw_lines = _extract_docx_lines(data)
    elif ext == "pdf":
        raw_lines = _extract_pdf_lines(data)
    elif ext == "csv":
        raw_lines = _extract_csv_lines(data.decode("utf-8", errors="ignore"))
    else:
        raw_lines = data.decode("utf-8", errors="ignore").splitlines()
    return normalize_topics(raw_lines, limit=limit)
