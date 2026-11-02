"""Execution audit for lesson quizzes (2026-11-02): run every "what does this print" snippet and compare
its real output with the keyed option. Run with a Python that has numpy/pandas/torch where possible.

Usage: python scripts/audit_quizzes.py [--python /path/to/python] [lesson.json ...]   (default: all lessons)
Prints MISMATCH lines for a human to review; mismatches are often snippets that rely on context the
question states (an imported module, a file, a newer Python), so this is a review aid, not a gate.
"""
import argparse
import glob
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRELUDE = """import warnings; warnings.filterwarnings('ignore')
import math, asyncio, json, re
from contextlib import contextmanager
for _m, _a in [('numpy', 'np'), ('pandas', 'pd'), ('torch', 'torch')]:
    try: globals()[_a] = __import__(_m)
    except Exception: pass
try:
    import torch.nn as nn
except Exception: pass
try:
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
except Exception: pass
try:
    from pydantic import BaseModel
except Exception: pass
"""
CONTEXT = re.compile(r"lesson's|Given |has \d+ samples|Using the")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\n", " ").replace(",", " ")).strip().strip("`")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--python", default=sys.executable)
    a = ap.parse_args()
    files = a.files or sorted(glob.glob(str(ROOT / "backend/lessons/*/*.json")))
    checked = skipped = bad = 0
    with tempfile.TemporaryDirectory() as cwd:
        for f in files:
            if f.endswith("schema.json"):
                continue
            for i, q in enumerate(json.load(open(f, encoding="utf-8")).get("quiz") or []):
                text = q["q"]["en"] if isinstance(q.get("q"), dict) else str(q.get("q"))
                if "\n" not in text:
                    continue
                stem, src = text.split("\n", 1)
                if not re.search(r"print|output|show|display|result", stem, re.I) or "print(" not in src:
                    continue
                if CONTEXT.search(stem):
                    skipped += 1
                    continue
                checked += 1
                try:
                    p = subprocess.run([a.python, "-c", PRELUDE + src], capture_output=True, text=True, timeout=60, cwd=cwd)
                except subprocess.TimeoutExpired:
                    print(f"TIMEOUT {f}[{i}]")
                    continue
                out = p.stdout.strip() or (p.stderr.strip().splitlines() or [""])[-1].split(":")[0]
                key = q["options"]["en"][q["correct"]].strip()
                if norm(out) != norm(key) and norm(key) not in norm(out):
                    bad += 1
                    print(f"MISMATCH {Path(f).parent.name}/{Path(f).name}[{i}] {stem[:60]!r}\n  ran={out[:90]!r}  key={key!r}")
    print(f"checked {checked}, context-dependent skipped {skipped}, mismatches {bad}")


if __name__ == "__main__":
    main()
