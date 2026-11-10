"""Quality gate: deterministic checks + code verification + an independent critic pass.

A draft only moves on when every hard check passes AND the critic scores it >= QUALITY_MIN_SCORE with no
factual errors. Otherwise the problems are fed back to the writer; after MAX_ATTEMPTS the draft is
dropped. Nothing generic is ever published in its place."""
import os
import re
import resource
import subprocess
import sys
import tempfile
from pathlib import Path

from socialbot import briefs, config, llm

BANNED = ["game-changer", "game changer", "unlock", "supercharge", "dive in", "dive into", "delve", "in today's world",
          "revolutioniz", "level up", "mind-blowing", "mind blowing", "secret sauce", "ever wondered", "buckle up",
          "spidey", "superhero", "avengers", "iron man", "chai rota", "restaurant bill", "cricket tournament", "kiddy"]

HINDI_WORDS = (
    "chai", "samosa", "samosas", "tapri", "roti", "jugaad", "namaste", "paisa", "paise",
    "lakh", "lakhs", "crore", "crores", "bhaiya", "yaar", "desi", "masala", "bazaar",
    "mandi", "kirana", "dabba", "tiffin", "pakora", "paneer", "kurta", "hinglish",
)
_HINDI_WORD_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in HINDI_WORDS) + r")\b", re.I)
_DEVANAGARI_SCRIPT_RE = re.compile(r"[\u0900-\u097F]")


def _words(s):
    return len(re.findall(r"\b[\w']+\b", s or ""))


def _banned(text):
    low = (text or "").lower()
    found = [b for b in BANNED if b in low]
    for m in _HINDI_WORD_RE.finditer(text or ""):
        w = m.group(1).lower()
        if f"Hindi word '{w}'" not in found:
            found.append(f"Hindi word '{w}' (never use Hindi words; use plain English)")
    if _DEVANAGARI_SCRIPT_RE.search(text or ""):
        found.append("Hindi/Devanagari script characters detected (never use Hindi; use plain English)")
    return found


def _compile_errors(code, label):
    try:
        compile(code, label, "exec")
        return []
    except SyntaxError as e:
        return [f"{label}: code does not compile (SyntaxError line {e.lineno}: {e.msg})"]


def _limits():
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))


# numpy's OpenBLAS starts a thread per core at import; under RLIMIT_NPROC that fails and kills the snippet.
_ONE_THREAD = {k: "1" for k in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS")}
SOCIAL_VENV_PY = Path.home() / "pymasters-ops/social-venv/bin/python"


def snippet_python():
    """The social venv has the packages lessons teach (pydantic, numpy, ...); system python3 would fail them with
    ModuleNotFoundError. Fall back to the running interpreter, then python3."""
    if SOCIAL_VENV_PY.exists() and os.access(SOCIAL_VENV_PY, os.X_OK):
        return str(SOCIAL_VENV_PY)
    return sys.executable or "python3"


def run_snippet(code, timeout=10):
    """Run self-contained code in a throwaway dir with resource limits and a minimal env. Returns (ok, stdout, err)."""
    if re.search(r"\binput\s*\(|requests\.|urllib|socket|subprocess|os\.system|shutil\.rmtree", code):
        return None, "", "skipped (I/O or network)"
    with tempfile.TemporaryDirectory() as d:
        try:
            p = subprocess.run([snippet_python(), "-I", "-c", code], cwd=d, capture_output=True, text=True, timeout=timeout,
                               env={"PATH": "/usr/bin:/bin", "HOME": d, **_ONE_THREAD}, preexec_fn=_limits)
        except subprocess.TimeoutExpired:
            return False, "", "timed out"
    return p.returncode == 0, p.stdout, p.stderr[-300:]


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def hard_checks(kind, draft):
    errs = []
    if kind in ("short", "long"):
        scenes = draft.get("scenes") or [s for ch in draft.get("chapters") or [] for s in ch.get("scenes") or []]
        spoken = " ".join([draft.get("hook", "")] + [s.get("narration", "") for s in scenes] + [draft.get("cta", "")])
        n = _words(spoken)
        lo, hi = (85, 125) if kind == "short" else (850, 1500)
        if not lo <= n <= hi:
            errs.append(f"spoken word count is {n}; it must be {lo}-{hi}")
        if len(draft.get("title", "")) > (60 if kind == "short" else 70):
            errs.append("title too long")
        if kind == "short" and _words(draft.get("hook")) > 14:
            errs.append("hook must be <= 12 words")
        if "pymasters" not in (draft.get("cta", "") + draft.get("description", "")).lower():
            errs.append("cta/description must point to pymasters.net")
        if draft.get("is_hf_space") and "huggingface.co/spaces/muthu88/" not in (draft.get("description") or "").lower():
            errs.append(f"description must include the Hugging Face Space link ({draft.get('space_url', 'https://huggingface.co/spaces/Muthu88/...')})")
        vis_text = " ".join(f"{(s.get('visual') or {}).get('heading', '')} {(s.get('visual') or {}).get('note', '')}" for s in scenes)
        errs += [f"banned phrase: {b}" for b in _banned(spoken + " " + draft.get("title", "") + " " + draft.get("description", "") + " " + vis_text)]
        vis_types = {(s.get("visual") or {}).get("type") for s in scenes if (s.get("visual") or {}).get("type")}
        if len(scenes) >= 4 and len(vis_types) < 3:
            errs.append(f"video uses only {sorted(vis_types)} visual types; use at least 3 different self-explanatory visual types (flow, compare, metric, trace, code, timeline, plot, reveal)")
        for i, s in enumerate(scenes):
            v = s.get("visual") or {}
            if v.get("type") == "plot":
                from socialbot.render.scenes import _make_fn
                if not _make_fn(v.get("fn")):
                    errs.append(f"scene {i + 1}: plot fn must be a simple expression in x using math.*")
            if v.get("type") in ("code", "trace", "compare") and (v.get("code") or v.get("left")):
                errs += _compile_errors(v.get("code") or "", f"scene {i + 1}")
                if v.get("code") and len(v["code"].splitlines()) > (8 if kind == "short" else 14):
                    errs.append(f"scene {i + 1}: code block too long for the screen")
                if kind == "short" and v.get("code") and max(len(l) for l in v["code"].splitlines()) > 34:
                    errs.append(f"scene {i + 1}: code lines must be <= 32 characters in a Short")
    else:  # linkedin / thematic
        post = draft.get("post", "")
        if not 800 <= len(post) <= 1450:
            errs.append(f"post is {len(post)} characters; it must be 850-1350")
        if len(draft.get("hashtags") or []) != 3:
            errs.append("exactly three hashtags required")
        if "pymasters.net" not in post:
            errs.append("post must include a link to https://pymasters.net")
        if "pymasters" not in post.lower():
            errs.append("post must mention @PyMasters")
        if (draft.get("is_hf_space") or draft.get("style") == "hf_space") and "huggingface.co/spaces/muthu88/" not in post.lower():
            errs.append(f"post must include the Hugging Face Space link ({draft.get('space_url', 'https://huggingface.co/spaces/Muthu88/...')})")
        if re.search(r"\*\*|^#{1,6} |```", post, re.M):
            errs.append("post contains markdown; LinkedIn shows it literally")
        anim = draft.get("animation") or {}
        anim_text = (anim.get("title") or "") + " " + " ".join((b.get("caption") or "") for b in (anim.get("beats") or []))
        errs += [f"banned phrase: {b}" for b in _banned(post + " " + (draft.get("code_snippet") or "") + " " + anim_text)]
        code = (draft.get("code_snippet") or "").strip()
        variety = draft.get("format_variety") or draft.get("style") or ""
        if variety in briefs.TECH_STYLES and not code:
            errs.append("technical LinkedIn format requires a non-empty runnable code_snippet")
        if code:
            errs += _compile_errors(code, "code_snippet")
        for i, b in enumerate((draft.get("animation") or {}).get("beats") or []):
            if b.get("kind") in ("code", "trace") and b.get("code"):
                errs += _compile_errors(b["code"], f"animation beat {i + 1}")
            if b.get("kind") == "plot":
                from socialbot.render.scenes import _make_fn
                if not _make_fn(b.get("fn")):
                    errs.append(f"animation beat {i + 1}: plot fn must be a simple expression in x using math.*")
            if b.get("kind") == "code" and b.get("code") and b.get("output"):
                ok, out, err = run_snippet(b["code"])
                if ok is False and "NameError" in err and code:
                    ok, out, err = run_snippet(code + "\n" + b["code"])
                if ok is False:
                    errs.append(f"animation beat {i + 1}: code fails to run ({err.strip()[:120]})")
                elif ok and _norm(out) and _norm(b["output"]) not in _norm(out) and _norm(out) not in _norm(b["output"]):
                    errs.append(f"animation beat {i + 1}: shown output does not match real output {out.strip()[:120]!r}")
    return errs


def attach_real_outputs(kind, draft):
    """Run the draft's code and attach what it actually prints, so numbers come from execution, not memory."""
    runs = {}
    snippets = []
    if kind in ("linkedin", "thematic"):
        snippets.append(("code_snippet", draft.get("code_snippet", "")))
        snippets += [(f"beat {i + 1}", b.get("code", "")) for i, b in enumerate((draft.get("animation") or {}).get("beats") or [])
                     if b.get("kind") in ("code", "trace") and b.get("code")]
    else:
        scenes = draft.get("scenes") or [s for ch in draft.get("chapters") or [] for s in ch.get("scenes") or []]
        snippets += [(f"scene {i + 1}", s["visual"].get("code", "")) for i, s in enumerate(scenes)
                     if (s.get("visual") or {}).get("type") == "code" and s["visual"].get("code")]
    for label, code in snippets:
        ok, out, err = run_snippet(code)
        if ok is False and "NameError" in err and kind in ("linkedin", "thematic") and label != "code_snippet" and draft.get("code_snippet"):
            ok, out, err = run_snippet(draft["code_snippet"] + "\n" + code)
        if ok is None:
            continue
        runs[label] = out.strip()[:600] if ok else f"ERROR: {err.strip()[:200]}"
    draft["_real_outputs"] = runs
    return runs


def critique(kind, draft, les):
    c = llm.ask_json(briefs.critic_prompt(kind, draft, les), briefs.CRITIC_SCHEMA,
                     system="You are a meticulous technical editor. Output only the requested JSON.")
    return c


def verdict(kind, draft, les):
    """Returns (passed, score, critique, problems)."""
    problems = hard_checks(kind, draft)
    attach_real_outputs(kind, draft)
    if problems:
        return False, 0.0, {}, problems
    c = critique(kind, draft, les)
    score = float(c.get("overall") or 0)
    problems += [f"factual error: {e}" for e in c.get("factual_errors") or []]
    problems += [f"blocking: {e}" for e in c.get("blocking_issues") or []]
    if score < config.QUALITY_MIN_SCORE:
        problems += [f"polish: {e}" for e in c.get("polish") or []] or [f"editor score {score} < {config.QUALITY_MIN_SCORE}"]
    return (not problems), score, c, problems
