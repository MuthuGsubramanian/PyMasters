"""Facts stated in three ML lessons must match what the code actually computes.

torch is not installed here, so each fact is recomputed with numpy / plain Python from the exact
inputs printed in the lesson.
"""
import ast
import json
import math
import re
from pathlib import Path

import numpy as np

LESSONS = Path(__file__).resolve().parent.parent / "lessons"


def _load(rel):
    return json.loads((LESSONS / rel).read_text(encoding="utf-8"))


def _story(lesson):
    return lesson["story_variants"]["en"]


def _py_blocks(text):
    return re.findall(r"```python\n(.*?)```", text, re.S)


def _tensor(code, name):
    m = re.search(r"^" + name + r" = torch\.tensor\((\[.*\])\)", code, re.M)
    assert m, f"{name} not found"
    return np.array(ast.literal_eval(m.group(1)), dtype=float)


def _bce(p, y):
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def _step(lesson, step_id):
    return next(s for s in lesson["animation_sequence"] if s.get("id") == step_id)


def _walk_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _walk_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_strings(v)


# ---------- dl_loss_functions ----------

def test_loss_story_numbers_match_the_inputs():
    lesson = _load("deep_learning_complete/dl_loss_functions.json")
    story = _story(lesson)
    mse_block, ce_block, bce_block = _py_blocks(story)[:3]

    pred, targ = _tensor(mse_block, "predictions"), _tensor(mse_block, "targets")
    mse = float(np.mean((pred - targ) ** 2))
    bce = _bce(_tensor(bce_block, "preds"), _tensor(bce_block, "targets"))

    assert f"# {mse:.4f}" in mse_block.split("MSE Loss")[1]
    assert f"# {bce:.4f}" in bce_block.split("BCE Loss")[1]
    assert (round(mse, 4), round(bce, 4)) == (0.15, 0.1446)

    # every other place the lesson states them
    assert _step(lesson, "box_mse")["value"] == f"{mse:.4f}"
    assert _step(lesson, "box_bce")["value"] == f"{bce:.4f}"
    out = _step(lesson, "output_display")["output"]
    assert f"tensor({mse:.4f})" in out and f"tensor({bce:.4f})" in out

    # the huber line in the terminal output (SmoothL1, beta=1) uses the same MSE inputs
    d = np.abs(pred - targ)
    huber = float(np.mean(np.where(d < 1, 0.5 * d * d, d - 0.5)))
    assert f"tensor({huber:.4f})" in out


def test_loss_stale_numbers_are_gone():
    text = "\n".join(_walk_strings(_load("deep_learning_complete/dl_loss_functions.json")))
    for stale in ("0.1025", "0.1269", "0.0887", "0.1167", "0.1528"):
        assert stale not in text, stale


def test_loss_execution_visualizer_numbers():
    lesson = _load("deep_learning_complete/dl_loss_functions.json")
    ev = _step(lesson, "ev_dl_loss")
    code = ev["code"]
    pred = np.array(ast.literal_eval(re.search(r"y_pred = torch\.tensor\((\[.*?\])\)", code).group(1)))
    true = np.array(ast.literal_eval(re.search(r"y_true = torch\.tensor\((\[.*?\])\)", code).group(1)))
    prob = np.array(ast.literal_eval(re.search(r"prob = torch\.tensor\((\[.*?\])\)", code).group(1)))
    label = np.array(ast.literal_eval(re.search(r"label = torch\.tensor\((\[.*?\])\)", code).group(1)))
    mse, bce = float(np.mean((pred - true) ** 2)), _bce(prob, label)
    outputs = [s["output"] for s in ev["executionSteps"]]
    assert f"MSE: {mse:.4f}" in outputs
    assert f"BCE: {bce:.4f}" in outputs
    variables = {k: v for s in ev["executionSteps"] for k, v in s["variables"].items()}
    assert variables["mse"] == f"{mse:.4f}" and variables["bce"] == f"{bce:.4f}"


# ---------- dl_rnn_text_generation ----------

def _rnn_story_parts():
    lesson = _load("deep_learning_complete/dl_rnn_text_generation.json")
    code = _py_blocks(_story(lesson))[0]
    text = re.search(r'text = """(.*?)"""', code, re.S).group(1)
    sig = re.search(r"def make_batches\(data, seq_len=(\d+), batch_size=(\d+)\)", code)
    return lesson, text, int(sig.group(1)), int(sig.group(2))


def _count_batches(n, seq_len, batch_size):
    """Mirror make_batches from the lesson on a sequence of n items."""
    num_batches = n // (seq_len * batch_size)
    width = num_batches * seq_len * batch_size // batch_size
    return len(range(0, width - seq_len, seq_len))


def test_rnn_make_batches_yields_at_least_one_batch():
    _, text, seq_len, batch_size = _rnn_story_parts()
    assert _count_batches(len(text), seq_len, batch_size) >= 1, (
        f"{len(text)} chars is too short for seq_len={seq_len}, batch_size={batch_size}")


def test_rnn_vocab_size_matches_the_text():
    lesson, text, _, _ = _rnn_story_parts()
    vocab = len(set(text))
    assert _step(lesson, "box_vocab")["value"] == str(vocab)
    assert f"Vocabulary: {vocab} unique characters" in _step(lesson, "output_display")["output"]


# ---------- deep_learning/bp_optimization ----------

def _adam_fn():
    lesson = _load("deep_learning/bp_optimization.json")
    code = next(b for b in _py_blocks(_story(lesson)) if "def adam_update" in b)
    ns = {}
    exec(code, ns)  # noqa: S102 - lesson code, pure arithmetic
    return code, ns["adam_update"]


def test_adam_update_uses_bias_corrected_second_moment():
    code, adam_update = _adam_fn()
    assert "m_hat / (v_hat**0.5 + eps)" in code
    assert "(v**0.5" not in code

    # reference Adam, first step: the update is lr * g / (|g| + eps) ~= lr
    w, g, lr, eps = 1.0, 2.0, 0.001, 1e-8
    m, v = 0.1 * g, 0.001 * g ** 2
    m_hat, v_hat = m / (1 - 0.9), v / (1 - 0.999)
    expected = w - lr * m_hat / (math.sqrt(v_hat) + eps)
    got, _, _ = adam_update(w, g, 0.0, 0.0, 1)
    assert math.isclose(got, expected, rel_tol=1e-12)
    assert math.isclose(w - got, lr, rel_tol=1e-6)
