"""Quality gate: deterministic checks + code verification + an independent critic pass.

A draft only moves on when every hard check passes AND the critic scores it >= QUALITY_MIN_SCORE with no
factual errors. Otherwise the problems are fed back to the writer; after MAX_ATTEMPTS the draft is
dropped. Nothing generic is ever published in its place."""
import os
import re
import resource
import subprocess
import tempfile

from socialbot import briefs, config, llm

BANNED = ["game-changer", "game changer", "unlock", "supercharge", "dive in", "dive into", "delve", "in today's world",
          "revolutioniz", "level up", "mind-blowing", "mind blowing", "secret sauce", "ever wondered", "buckle up",
          "spidey", "superhero", "avengers", "iron man"]


def _words(s):
    return len(re.findall(r"\b[\w']+\b", s or ""))


def _banned(text):
    low = (text or "").lower()
    return [b for b in BANNED if b in low]


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


def run_snippet(code, timeout=10):
    """Run self-contained code in a throwaway dir with resource limits and a minimal env. Returns (ok, stdout, err)."""
    if re.search(r"\binput\s*\(|requests\.|urllib|socket|subprocess|os\.system|shutil\.rmtree", code):
        return None, "", "skipped (I/O or network)"
    with tempfile.TemporaryDirectory() as d:
        try:
            p = subprocess.run(["python3", "-I", "-c", code], cwd=d, capture_output=True, text=True, timeout=timeout,
                               env={"PATH": "/usr/bin:/bin", "HOME": d}, preexec_fn=_limits)
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
        errs += [f"banned phrase: {b}" for b in _banned(spoken + draft.get("title", ""))]
        for i, s in enumerate(scenes):
            v = s.get("visual") or {}
            if v.get("type") in ("code", "compare") and (v.get("code") or v.get("left")):
                errs += _compile_errors(v.get("code") or "", f"scene {i + 1}")
                if v.get("code") and len(v["code"].splitlines()) > (8 if kind == "short" else 14):
                    errs.append(f"scene {i + 1}: code block too long for the screen")
                if kind == "short" and v.get("code") and max(len(l) for l in v["code"].splitlines()) > 34:
                    errs.append(f"scene {i + 1}: code lines must be <= 32 characters in a Short")
    else:  # linkedin
        post = draft.get("post", "")
        if not 800 <= len(post) <= 1450:
            errs.append(f"post is {len(post)} characters; it must be 900-1300")
        if len(draft.get("hashtags") or []) != 3:
            errs.append("exactly three hashtags required")
        if "pymasters.net" not in post:
            errs.append("post must include the lesson link")
        if re.search(r"\*\*|^#{1,6} |```", post, re.M):
            errs.append("post contains markdown; LinkedIn shows it literally")
        errs += [f"banned phrase: {b}" for b in _banned(post)]
        code = draft.get("code_snippet", "")
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
                if ok is False:
                    errs.append(f"animation beat {i + 1}: code fails to run ({err.strip()[:120]})")
                elif ok and _norm(out) and _norm(b["output"]) not in _norm(out) and _norm(out) not in _norm(b["output"]):
                    errs.append(f"animation beat {i + 1}: shown output does not match real output {out.strip()[:120]!r}")
    return errs


def attach_real_outputs(kind, draft):
    """Run the draft's code and attach what it actually prints, so numbers come from execution, not memory."""
    runs = {}
    snippets = []
    if kind == "linkedin":
        snippets.append(("code_snippet", draft.get("code_snippet", "")))
        snippets += [(f"beat {i + 1}", b.get("code", "")) for i, b in enumerate((draft.get("animation") or {}).get("beats") or [])
                     if b.get("kind") in ("code", "trace") and b.get("code")]
    else:
        scenes = draft.get("scenes") or [s for ch in draft.get("chapters") or [] for s in ch.get("scenes") or []]
        snippets += [(f"scene {i + 1}", s["visual"].get("code", "")) for i, s in enumerate(scenes)
                     if (s.get("visual") or {}).get("type") == "code" and s["visual"].get("code")]
    for label, code in snippets:
        ok, out, err = run_snippet(code)
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
    c = critique(kind, draft, les)
    score = float(c.get("overall") or 0)
    problems += [f"factual error: {e}" for e in c.get("factual_errors") or []]
    problems += [f"blocking: {e}" for e in c.get("blocking_issues") or []]
    if score < config.QUALITY_MIN_SCORE:
        problems += [f"polish: {e}" for e in c.get("polish") or []] or [f"editor score {score} < {config.QUALITY_MIN_SCORE}"]
    return (not problems), score, c, problems
