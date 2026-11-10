#!/usr/bin/env python3
"""PyMasters 24/7 topic innovation + lesson review daemon (ops laptop, zero GCP cost).

Each cycle:
  1. thermal/load guard: CPU zone >= 80 C (or load far above the core count) -> wait until <= 68 C;
  2. gathers what exists (backend/lessons/*/*.json ids + titles, concept gaps from backend/graph/concept_links.json
     `_gaps`, BACKLOG.md) and what is new (Hugging Face trending models + daily papers, arXiv cs.AI / cs.LG RSS,
     GitHub trending Python) - all free, unauthenticated feeds;
  3. asks Claude Code (`claude --dangerously-skip-permissions -p ... --output-format json`; fallbacks Ollama Cloud
     gpt-oss:120b, then the local llama-server) for 3 new high-impact topics that are not lessons yet and not queued;
  4. drafts the top queued topic as a complete lesson + reference solution in ~/pymasters-ops/innovation/review/;
  5. validates it deterministically with the PRODUCTION rules (vaathiyaar.grading.grade_submission / probe_harness,
     check_lesson_safety, topic_uth.validate_under_the_hood): uth_example runs cleanly and deterministically, every
     test_code fails on its own / on empty code / print("hi") / the starter, and every reference solution passes the
     harness and prints expected_output;
  6. records the result in ~/pymasters-ops/innovation/queue.json and review/INDEX.md for owner review.

Nothing here touches the repo or production: drafts stay in ~/pymasters-ops/innovation until the owner runs
`innovate_topics.py --promote <lesson_id>` (branch + PR from a separate worktree).

  innovate_topics.py --once [--topics N]     one cycle (what pymasters-innovate.timer runs every 2 h)
  innovate_topics.py --daemon [--interval S] cycles forever with a sleep between them
  innovate_topics.py --status                JSON summary of the queue
  innovate_topics.py --validate DRAFT SOLUTION   validate a lesson draft + solution file (exit 1 when invalid)
  innovate_topics.py --promote LESSON_ID     copy a validated draft into a branch of the repo and open a PR
"""
import argparse
import datetime
import fcntl
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HOME = Path.home()
REPO = Path(os.environ.get("PYMASTERS_REPO", HOME / "Documents/Development/PyMasters"))
BACKEND = REPO / "backend"
LESSONS = BACKEND / "lessons"
SOLUTIONS = REPO / "ops/e2e/solutions"
NORMALIZE_JS = REPO / "frontend/src/components/animations/normalize.js"
OPS = HOME / "pymasters-ops"
INNOV = Path(os.environ.get("INNOVATE_DIR", OPS / "innovation"))
QUEUE = INNOV / "queue.json"
REVIEW = INNOV / "review"
WORK = INNOV / "work"
LOG = INNOV / "innovate.log"
ENV_FILE = HOME / ".config/pymasters-ops/ops.env"
LLAMA_KEY = Path(f"/run/user/{os.getuid()}/eternity/keys/llama-8080.key")
LLAMA_URL = "http://127.0.0.1:8080/v1/chat/completions"
OLLAMA_URL = "https://ollama.com/api/chat"
OLLAMA_MODEL = "gpt-oss:120b"

HOT_AT, COOL_AT = 80.0, 68.0          # same hysteresis as pymasters-thermal-guard (which freezes the heavy slice)
NCPU = os.cpu_count() or 4
LOAD_HI, LOAD_LO = NCPU * 1.5, NCPU * 0.9
TOPICS_PER_CYCLE = 3
MAX_ATTEMPTS = 3                      # drafting attempts per topic before it is marked failed
REPAIR_ROUNDS = 3                     # text-mode fix-up rounds per attempt
CLAUDE_IDEATE_TIMEOUT = 900
CLAUDE_DRAFT_TIMEOUT = 2700
REQUIRED_ANIMATIONS = ("StoryCard", "ConceptMap", "CodeStepper", "TerminalOutput", "ComparisonPanel",
                       "ParticleEffect")
# Keys existing lessons put on animation steps besides the ones the component consumes.
ANIMATION_META = {"type", "id", "duration_ms", "description", "language", "theme", "message", "props", "title"}
TAG_KEYS = ("concepts_taught", "concepts_required", "difficulty", "engagement_type", "estimated_minutes", "category",
            "path_memberships")
STOP = {"a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "with", "from", "by", "your", "you", "how",
        "what", "why", "python", "using", "build", "building", "intro", "introduction", "basics", "vs", "into"}


def log(msg: str) -> None:
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    try:
        INNOV.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def load_env_file() -> None:
    """The systemd unit passes ops.env; manual runs read it here (never overriding the real environment)."""
    try:
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass


# ---------------------------------------------------------------- thermal + load guard

def cpu_temp() -> float | None:
    temps = []
    for z in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
        try:
            temps.append(int(open(z).read()) / 1000)
        except (OSError, ValueError):
            pass
    return max(temps) if temps else None


def _temps_report() -> str:
    script = OPS / "temps.py"
    if not script.exists():
        return ""
    try:
        r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=20)
        return " | ".join(r.stdout.split("\n")).strip(" |")
    except (OSError, subprocess.TimeoutExpired):
        return ""


def thermal_ok(max_wait_s: float | None = None) -> bool:
    """Block while the laptop is hot or overloaded. False when max_wait_s ran out first (skip this cycle)."""
    def hot():
        t, load = cpu_temp(), os.getloadavg()[0]
        return (t is not None and t >= HOT_AT) or load >= LOAD_HI, t, load

    is_hot, t, load = hot()
    if not is_hot:
        return True
    log(f"thermal guard: {t}C load {load:.1f} - waiting for <= {COOL_AT:.0f}C and load <= {LOAD_LO:.1f}. "
        f"{_temps_report()}")
    start = time.monotonic()
    while True:
        time.sleep(30)
        t, load = cpu_temp(), os.getloadavg()[0]
        if (t is None or t <= COOL_AT) and load <= LOAD_LO:
            log(f"thermal guard: cooled to {t}C load {load:.1f}, continuing")
            return True
        if max_wait_s is not None and time.monotonic() - start > max_wait_s:
            log(f"thermal guard: still {t}C load {load:.1f} after {max_wait_s / 60:.0f} min - skipping this cycle")
            return False


# ---------------------------------------------------------------- queue

def load_queue() -> dict:
    try:
        q = json.loads(QUEUE.read_text())
        if isinstance(q, dict) and isinstance(q.get("topics"), list):
            q.setdefault("cycles", [])
            return q
    except (OSError, ValueError):
        pass
    return {"version": 1, "updated": now_iso(), "topics": [], "cycles": []}


def save_queue(q: dict) -> None:
    q["updated"] = now_iso()
    q["cycles"] = q["cycles"][-50:]
    INNOV.mkdir(parents=True, exist_ok=True)
    tmp = QUEUE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(q, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(QUEUE)
    write_index(q)


def counts(q: dict) -> dict:
    c = {}
    for t in q["topics"]:
        c[t.get("status", "queued")] = c.get(t.get("status", "queued"), 0) + 1
    return c


def write_index(q: dict) -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    script = OPS / "innovate_topics.py"
    by = {s: [t for t in q["topics"] if t.get("status") == s] for s in ("validated", "queued", "failed", "promoted")}
    out = ["# PyMasters innovation review queue", "",
           f"Updated {q['updated']} by `innovate_topics.py` (pymasters-innovate.timer, every 2 h). "
           f"{len(by['validated'])} lesson(s) validated and awaiting review, {len(by['queued'])} topic(s) queued.", "",
           "Every lesson below passed the production grading rules (solution passes; empty / `print(\"hi\")` / "
           "starter fail; harness fails alone; uth_example runs cleanly; under_the_hood valid).", "",
           "## Validated lessons awaiting review", ""]
    if by["validated"]:
        out += ["| Lesson | Track | Title | Validated | Draft | Promote |", "|---|---|---|---|---|---|"]
        for t in by["validated"]:
            out.append(f"| `{t['id']}` | {t.get('track', '')} | {t.get('title', '')} | {t.get('validated_at', '')[:16]} "
                       f"| [{t['id']}.json]({t['id']}.json) / [solution]({t['id']}.solution.json) "
                       f"| `{script} --promote {t['id']}` |")
    else:
        out.append("_none yet_")
    out += ["", "## Queued topics", ""]
    if by["queued"]:
        out += ["| Score | Topic | Track | Pitch | Attempts |", "|---|---|---|---|---|"]
        for t in sorted(by["queued"], key=_rank):
            out.append(f"| {t.get('score', '')} | `{t['id']}` {t.get('title', '')} | {t.get('track', '')} "
                       f"| {_cell(t.get('pitch', ''))} | {t.get('attempts', 0)} |")
    else:
        out.append("_none_")
    if by["failed"]:
        out += ["", "## Failed drafts (gave up after retries)", ""]
        out += [f"- `{t['id']}` {t.get('title', '')}: {_cell('; '.join(t.get('errors', [])[:3]))}" for t in by["failed"]]
    if by["promoted"]:
        out += ["", "## Promoted", ""]
        out += [f"- `{t['id']}` {t.get('title', '')} {t.get('pr_url', '')}" for t in by["promoted"]]
    (REVIEW / "INDEX.md").write_text("\n".join(out) + "\n", encoding="utf-8")


def _cell(s: str) -> str:
    return str(s).replace("|", "/").replace("\n", " ")[:220]


def _rank(t: dict):
    return (-float(t.get("score") or 0), t.get("attempts", 0), t.get("created", ""))


# ---------------------------------------------------------------- what exists

def _en(v) -> str:
    return v.get("en", "") if isinstance(v, dict) else (v if isinstance(v, str) else "")


def existing_lessons() -> list[dict]:
    out = []
    for f in sorted(LESSONS.glob("*/*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and d.get("id"):
            out.append({"id": d["id"], "title": _en(d.get("title")), "track": f.parent.name,
                        "order": d.get("order") if isinstance(d.get("order"), int) else 0,
                        "module": d.get("module", ""), "file": str(f)})
    return out


def tracks() -> list[str]:
    return sorted(p.name for p in LESSONS.iterdir() if p.is_dir() and any(p.glob("*.json")))


def concept_gaps() -> list[str]:
    try:
        return list(json.loads((BACKEND / "graph/concept_links.json").read_text()).get("_gaps", []))
    except (OSError, ValueError):
        return []


def backlog_items(limit: int = 30) -> list[str]:
    try:
        lines = (REPO / "BACKLOG.md").read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    items = [re.sub(r"\[link\]\([^)]*\)", "", ln[2:]).strip() for ln in lines if ln.startswith("- **")]
    return [i[:220] for i in items[:limit]]


# ---------------------------------------------------------------- free feeds

def http_get(url: str, timeout: int = 20, headers: dict | None = None) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": "pymasters-innovate/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:  # noqa: BLE001 - every feed is optional
        log(f"feed: {url} failed: {e}")
        return None


def feed_huggingface() -> list[dict]:
    out = []
    raw = http_get("https://huggingface.co/api/models?sort=trendingScore&limit=15")
    try:
        for m in json.loads(raw or "[]"):
            out.append({"source": "hf-trending-model", "title": m.get("id", ""), "tag": m.get("pipeline_tag", ""),
                        "url": f"https://huggingface.co/{m.get('id', '')}"})
    except ValueError:
        pass
    raw = http_get("https://huggingface.co/api/daily_papers?limit=15")
    try:
        for p in json.loads(raw or "[]"):
            paper = p.get("paper") or {}
            out.append({"source": "hf-daily-paper", "title": paper.get("title") or p.get("title", ""),
                        "url": f"https://huggingface.co/papers/{paper.get('id', '')}"})
    except ValueError:
        pass
    return out


def feed_arxiv(cat: str, limit: int = 12) -> list[dict]:
    raw = http_get(f"https://rss.arxiv.org/rss/{cat}")
    if not raw:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out = []
    for item in root.iter("item"):
        title = " ".join((item.findtext("title") or "").split())
        if title:
            out.append({"source": f"arxiv-{cat}", "title": title, "url": item.findtext("link") or ""})
        if len(out) >= limit:
            break
    return out


def feed_github(limit: int = 12) -> list[dict]:
    html = http_get("https://github.com/trending/python?since=daily")
    out = []
    if html:
        for art in re.findall(r"<article class=\"Box-row\">(.*?)</article>", html, re.S):
            m = re.search(r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"', art)
            if not m:
                continue
            desc = re.search(r"<p class=\"col-9[^\"]*\">\s*(.*?)\s*</p>", art, re.S)
            text = re.sub(r"<[^>]+>|\s+", " ", desc.group(1)).strip() if desc else ""
            out.append({"source": "github-trending-python", "title": m.group(1), "desc": text[:160],
                        "url": f"https://github.com/{m.group(1)}"})
            if len(out) >= limit:
                break
    if not out:  # trending page layout changed: fall back to the search API (60 req/h unauthenticated)
        since = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
        raw = http_get("https://api.github.com/search/repositories?q=language:python+topic:ai+created:%3E" + since +
                       f"&sort=stars&order=desc&per_page={limit}", headers={"Accept": "application/vnd.github+json"})
        try:
            for r in json.loads(raw or "{}").get("items", []):
                out.append({"source": "github-new-python-ai", "title": r["full_name"],
                            "desc": (r.get("description") or "")[:160], "url": r["html_url"]})
        except (ValueError, KeyError):
            pass
    return out


def feed_domain_pillars() -> list[dict]:
    """Capture live daily signals across our 5 strategic pillars: AI in Finance, AI in Risk, AI in Consumer Cards &
    Banking, AI Around the World, and AI Key Concepts, and refresh review/TRENDS_DAILY.md."""
    out = []
    try:
        if str(REPO) not in sys.path:
            sys.path.insert(0, str(REPO))
        from socialbot import trends
        daily = trends.capture_daily_trends(live_network=True)
        for it in daily:
            out.append({
                "source": f"pillar:{it['pillar_id']}",
                "title": f"[{it['pillar_label']}] {it['title']} — {it['live_headline']}",
                "desc": it["description"][:160],
                "url": it["url"],
            })
    except Exception as e:
        log(f"feed_domain_pillars: {e}")
    return out


def gather_feeds() -> list[dict]:
    items = (
        feed_domain_pillars()
        + feed_huggingface()
        + feed_arxiv("cs.AI")
        + feed_arxiv("cs.LG")
        + feed_arxiv("q-fin.RM", limit=6)
        + feed_github()
    )
    try:
        (INNOV / "feeds.json").write_text(json.dumps({"fetched": now_iso(), "items": items}, indent=2,
                                                     ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    return items


# ---------------------------------------------------------------- LLM providers

def _child_env() -> dict:
    """Do not let a nested `claude` think it runs inside the parent Claude Code session."""
    return {k: v for k, v in os.environ.items()
            if not (k.startswith("CLAUDECODE") or k in ("CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT"))}


def claude_run(prompt: str, cwd: Path, timeout: int) -> str | None:
    if not shutil.which("claude"):
        return None
    cmd = ["claude", "--dangerously-skip-permissions", "-p", prompt, "--output-format", "json"]
    if os.environ.get("INNOVATE_CLAUDE_MODEL"):
        cmd += ["--model", os.environ["INNOVATE_CLAUDE_MODEL"]]
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=_child_env(),
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        log(f"claude: timed out after {timeout}s")
        return None
    except OSError as e:
        log(f"claude: {e}")
        return None
    try:
        data = json.loads(r.stdout)
    except ValueError:
        log(f"claude: exit {r.returncode}, non-JSON output: {(r.stdout or r.stderr)[-300:]}")
        return None
    if data.get("is_error") or r.returncode != 0:
        log(f"claude: error ({data.get('subtype')}): {str(data.get('result'))[:300]}")
        return None
    log(f"claude: ok in {data.get('duration_ms', 0) / 1000:.0f}s, {data.get('num_turns')} turns, "
        f"${data.get('total_cost_usd', 0):.2f} (subscription; no GCP)")
    return data.get("result") or ""


def _post_json(url: str, body: dict, headers: dict, timeout: int) -> dict | None:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:  # noqa: BLE001
        log(f"llm: {url} failed: {e}")
        return None


def ollama_cloud(prompt: str, timeout: int = 900) -> str | None:
    key = os.environ.get("OLLAMA_API_KEY")
    if not key:
        return None
    d = _post_json(OLLAMA_URL, {"model": OLLAMA_MODEL, "stream": False, "options": {"temperature": 0.4},
                                "messages": [{"role": "user", "content": prompt}]},
                   {"Authorization": f"Bearer {key}"}, timeout)
    return ((d or {}).get("message") or {}).get("content") or None


def local_llama(prompt: str, timeout: int = 1200) -> str | None:
    headers = {}
    try:
        headers["Authorization"] = "Bearer " + LLAMA_KEY.read_text().strip()
    except OSError:
        pass
    if not thermal_ok(max_wait_s=1800):     # local inference is the one step that heats this laptop
        return None
    d = _post_json(LLAMA_URL, {"messages": [{"role": "user", "content": prompt}], "temperature": 0.4,
                               "max_tokens": 6000}, headers, timeout)
    try:
        return d["choices"][0]["message"]["content"]
    except (TypeError, KeyError, IndexError):
        return None


def text_llm(prompt: str, cwd: Path, timeout: int, skip_claude: bool = False) -> tuple[str | None, str | None]:
    """(provider, text) from the first provider that answers."""
    if not skip_claude:
        t = claude_run(prompt, cwd, timeout)
        if t:
            return "claude-code", t
    t = ollama_cloud(prompt)
    if t:
        return f"ollama-cloud {OLLAMA_MODEL}", t
    t = local_llama(prompt)
    if t:
        return "local llama-server", t
    return None, None


def extract_json(text: str):
    if not text:
        return None
    text = text.strip()
    for cand in [text] + re.findall(r"```(?:json)?\s*(.*?)```", text, re.S):
        try:
            return json.loads(cand)
        except ValueError:
            pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        i, j = text.find(open_c), text.rfind(close_c)
        if 0 <= i < j:
            try:
                return json.loads(text[i:j + 1])
            except ValueError:
                pass
    return None


# ---------------------------------------------------------------- dedup

def _tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower().replace("_", " ")) if w not in STOP}


def duplicate_of(cand: dict, known: list[dict]) -> str | None:
    cid = (cand.get("id") or "").strip().lower()
    ct = _tokens(cand.get("title", "")) | _tokens(cid)
    for k in known:
        if cid and cid == k["id"].lower():
            return k["id"]
        kt = _tokens(k.get("title", "")) | _tokens(k["id"])
        if ct and kt and len(ct & kt) / len(ct | kt) >= 0.6:
            return k["id"]
    return None


# ---------------------------------------------------------------- 1) innovate topics

def innovate(q: dict, lessons: list[dict], feeds: list[dict], want: int) -> list[dict]:
    known = [{"id": l["id"], "title": l["title"]} for l in lessons] + \
            [{"id": t["id"], "title": t.get("title", "")} for t in q["topics"]]
    track_list = tracks()
    by_track = {}
    for l in lessons:
        by_track.setdefault(l["track"], []).append(l["id"])
    catalogue = "\n".join(f"{t} ({len(ids)}): {', '.join(ids)}" for t, ids in sorted(by_track.items()))
    signals = "\n".join(f"- [{f['source']}] {f['title']}" + (f" ({f.get('tag') or f.get('desc')})"
                                                              if f.get("tag") or f.get("desc") else "")
                        for f in feeds[:60])
    queued = "\n".join(f"- {t['id']}: {t.get('title', '')}" for t in q["topics"]) or "- (empty)"
    ask = want * 2
    prompt = f"""You are the curriculum innovation lead for PyMasters (https://pymasters.net), a Python + AI learning
platform for learners from Class 6 school students to working professionals (Chennai, bilingual English/Tamil,
Vaathiyaar tutor style: Story -> Visual -> Code). Today is {datetime.date.today()}.

Propose {ask} NEW, high-impact lesson topics with catchy yet unique titles. Each must be teachable as ONE ~30 minute
hands-on lesson whose two practice challenges run in plain Python 3 stdlib (no network, no GPUs, no pip installs) and are
graded by assert harnesses. Prioritise topics across our 5 daily live domain pillars—(1) AI in Finance, (2) AI in Risk,
(3) AI in Consumer Cards & Banking, (4) AI Around the World, and (5) AI Key Concepts—inline with how PyMasters helps
engineers and analysts build and audit these systems in Python, as well as closing listed concept gaps or backlog items.
Do NOT propose anything already covered by an existing lesson id or already queued (no near-duplicates or renames).

EXISTING LESSONS by track (track (count): ids):
{catalogue}

ALREADY QUEUED:
{queued}

CONCEPT GAPS (concepts with no lesson): {', '.join(concept_gaps())}

BACKLOG (ready to build):
{chr(10).join('- ' + b for b in backlog_items())}

FRESH SIGNALS (free feeds, today):
{signals}

Reply with ONLY a JSON array (no prose), {ask} objects, best first:
[{{"id": "snake_case_lesson_id (3-50 chars, unique)",
  "title": "Learner-facing title",
  "track": "one of: {', '.join(track_list)}",
  "module": "module name within the track",
  "pitch": "one sentence: what the learner builds and why it matters",
  "why_now": "which gap / backlog item / signal this answers",
  "source_signals": ["feed titles or urls used, may be empty"],
  "concepts_taught": ["snake_case"], "concepts_required": ["snake_case"],
  "difficulty": "beginner|intermediate|advanced",
  "audience": "school|college|professional|all",
  "score": 1-10 impact for PyMasters learners}}]"""
    INNOV.mkdir(parents=True, exist_ok=True)
    provider, text = text_llm(prompt, INNOV, CLAUDE_IDEATE_TIMEOUT)
    cands = extract_json(text or "")
    if isinstance(cands, dict):
        cands = cands.get("topics") or cands.get("items") or []
    if not isinstance(cands, list):
        log(f"innovate: no usable JSON from {provider}")
        return []
    added = []
    for c in cands:
        if not isinstance(c, dict) or not c.get("title"):
            continue
        c["id"] = re.sub(r"[^a-z0-9_]", "_", str(c.get("id") or c["title"]).lower()).strip("_")[:50]
        if not re.fullmatch(r"[a-z][a-z0-9_]{2,49}", c["id"]):
            continue
        if c.get("track") not in track_list:
            log(f"innovate: skip {c['id']}: unknown track {c.get('track')!r}")
            continue
        dup = duplicate_of(c, known)
        if dup:
            log(f"innovate: skip {c['id']}: duplicates {dup}")
            continue
        try:
            score = float(c.get("score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        topic = {"id": c["id"], "title": str(c["title"])[:120], "track": c["track"],
                 "module": str(c.get("module") or ""), "pitch": str(c.get("pitch") or ""),
                 "why_now": str(c.get("why_now") or ""), "source_signals": list(c.get("source_signals") or [])[:5],
                 "concepts_taught": list(c.get("concepts_taught") or []),
                 "concepts_required": list(c.get("concepts_required") or []),
                 "difficulty": c.get("difficulty") if c.get("difficulty") in ("beginner", "intermediate", "advanced")
                 else "intermediate", "audience": str(c.get("audience") or "all"),
                 "score": max(0.0, min(10.0, score)), "status": "queued", "attempts": 0, "provider": provider,
                 "created": now_iso(), "updated": now_iso(), "errors": []}
        q["topics"].append(topic)
        known.append({"id": topic["id"], "title": topic["title"]})
        added.append(topic)
        if len(added) >= want:
            break
    log(f"innovate: {len(added)} new topic(s) from {provider}: {', '.join(t['id'] for t in added)}")
    return added


# ---------------------------------------------------------------- 3) deterministic validation

_BACKEND_READY = False


def _backend():
    """Import the production grading rules from the repo (needs the backend venv)."""
    global _BACKEND_READY
    if not _BACKEND_READY:
        sys.path.insert(0, str(BACKEND))
        _BACKEND_READY = True
    from vaathiyaar import grading, execution, topic_uth, lesson_code
    return grading, execution, topic_uth, lesson_code


def animation_contract() -> dict:
    try:
        src = NORMALIZE_JS.read_text()
        block = src[src.index("export const CONTRACT"):]
        block = block[:block.index("\n};")]
        return {m.group(1): set(re.findall(r"'([^']+)'", m.group(2)))
                for m in re.finditer(r"(\w+): \{\s*consumes: \[(.*?)\]", block, re.S)}
    except (OSError, ValueError):
        return {}


def _need_text(obj, key, lo, hi, errs, path):
    v = _en(obj.get(key)) if isinstance(obj, dict) else ""
    if not isinstance(obj, dict) or not isinstance(obj.get(key), dict) or not v.strip():
        errs.append(f"{path}: needs an object with an 'en' string")
    elif not lo <= len(v.strip()) <= hi:
        errs.append(f"{path}.en: {len(v.strip())} chars (want {lo}-{hi})")


def validate_lesson(lesson: dict, solutions: list, expect: dict | None = None) -> dict:
    """Return {"ok", "errors", "outputs"}: structure + PyMasters contracts + production grading of every challenge."""
    errs, outputs = [], {}
    if not isinstance(lesson, dict):
        return {"ok": False, "errors": ["lesson must be a JSON object"], "outputs": {}}
    grading, execution, topic_uth, lesson_code = _backend()
    expect = expect or {}

    lid = lesson.get("id")
    if not isinstance(lid, str) or not re.fullmatch(r"[a-z][a-z0-9_]{2,59}", lid):
        errs.append("id: snake_case string required")
    for k, v in expect.items():
        if lesson.get(k) != v:
            errs.append(f"{k}: must be {v!r} (got {lesson.get(k)!r})")
    if not isinstance(lesson.get("topic"), str) or not lesson.get("topic"):
        errs.append("topic: string required")
    if lesson.get("track") not in tracks():
        errs.append(f"track: must be an existing track dir under backend/lessons (got {lesson.get('track')!r})")
    if not isinstance(lesson.get("module"), str) or not lesson.get("module"):
        errs.append("module: string required")
    if not isinstance(lesson.get("order"), int):
        errs.append("order: integer required")
    _need_text(lesson, "title", 5, 120, errs, "title")
    _need_text(lesson, "description", 30, 600, errs, "description")
    _need_text(lesson, "story_variants", 600, 12000, errs, "story_variants")
    if not isinstance(lesson.get("xp_reward"), int) or not 25 <= lesson["xp_reward"] <= 500:
        errs.append("xp_reward: integer 25-500 required")

    # animation_sequence: the six primitives, each with only keys the frontend consumes
    contract = animation_contract()
    seq = lesson.get("animation_sequence")
    if not isinstance(seq, list) or not seq:
        errs.append("animation_sequence: non-empty list required")
        seq = []
    have = {a.get("type") for a in seq if isinstance(a, dict)}
    missing = [t for t in REQUIRED_ANIMATIONS if t not in have]
    if missing:
        errs.append(f"animation_sequence: missing primitive(s) {missing}")
    for i, a in enumerate(seq):
        if not isinstance(a, dict) or a.get("type") not in contract:
            errs.append(f"animation_sequence[{i}]: type must be one of {sorted(contract)}")
            continue
        extra = set(a) - contract[a["type"]] - ANIMATION_META
        if extra:
            errs.append(f"animation_sequence[{i}] ({a['type']}): keys not consumed by the frontend {sorted(extra)}; "
                        f"allowed {sorted(contract[a['type']])} + {sorted(ANIMATION_META)}")
        if a["type"] != "ParticleEffect" and not set(a) & contract[a["type"]] and not isinstance(a.get("props"), dict):
            errs.append(f"animation_sequence[{i}] ({a['type']}): carries no content keys")

    # practice challenges
    pcs = lesson.get("practice_challenges")
    if not isinstance(pcs, list) or len(pcs) != 2:
        errs.append("practice_challenges: exactly 2 challenges required")
        pcs = pcs if isinstance(pcs, list) else []
    for i, c in enumerate(pcs):
        p = f"practice_challenges[{i}]"
        if not isinstance(c, dict):
            errs.append(f"{p}: must be an object")
            continue
        _need_text(c, "instruction", 40, 2000, errs, f"{p}.instruction")
        for k in ("starter_code", "expected_output", "test_code"):
            if not isinstance(c.get(k), str) or not c[k].strip():
                errs.append(f"{p}.{k}: non-empty string required")
        hints = c.get("hints")
        if not (isinstance(hints, dict) and isinstance(hints.get("en"), list) and len(hints["en"]) >= 2
                and all(isinstance(h, str) and h.strip() for h in hints["en"])):
            errs.append(f"{p}.hints: object with an 'en' list of >= 2 hints required")
        if isinstance(c.get("test_code"), str) and "assert" not in c["test_code"]:
            errs.append(f"{p}.test_code: must assert on the learner's names")

    # quiz: 4 bilingual questions
    quiz = lesson.get("quiz")
    if not isinstance(quiz, list) or len(quiz) != 4:
        errs.append("quiz: exactly 4 questions required")
        quiz = quiz if isinstance(quiz, list) else []
    tamil = re.compile(r"[஀-௿]")
    for i, qq in enumerate(quiz):
        p = f"quiz[{i}]"
        if not isinstance(qq, dict):
            errs.append(f"{p}: must be an object")
            continue
        qt, opts = qq.get("q"), qq.get("options")
        if not (isinstance(qt, dict) and isinstance(qt.get("en"), str) and isinstance(qt.get("ta"), str)
                and tamil.search(qt["ta"])):
            errs.append(f"{p}.q: needs 'en' and Tamil 'ta' strings")
        if not (isinstance(opts, dict) and isinstance(opts.get("en"), list) and isinstance(opts.get("ta"), list)
                and len(opts["en"]) == len(opts["ta"]) >= 3):
            errs.append(f"{p}.options: needs equal-length 'en' and 'ta' lists (>= 3)")
        elif not (isinstance(qq.get("correct"), int) and 0 <= qq["correct"] < len(opts["en"])):
            errs.append(f"{p}.correct: index into options required")

    # under_the_hood + traceable example
    uth_errs = topic_uth.validate_under_the_hood(lesson.get("under_the_hood"))
    errs += [f"under_the_hood: {e}" for e in uth_errs]
    tags = lesson.get("tags")
    if not isinstance(tags, dict):
        errs.append("tags: object required")
    else:
        for k in TAG_KEYS:
            if k not in tags:
                errs.append(f"tags.{k}: required")
        for k in ("concepts_taught", "concepts_required", "path_memberships"):
            if k in tags and not isinstance(tags[k], list):
                errs.append(f"tags.{k}: list required")
        if not tags.get("concepts_taught"):
            errs.append("tags.concepts_taught: at least one concept")
        if tags.get("difficulty") not in ("beginner", "intermediate", "advanced"):
            errs.append("tags.difficulty: beginner|intermediate|advanced")
        if not isinstance(tags.get("estimated_minutes"), int):
            errs.append("tags.estimated_minutes: integer required")

    ex = lesson.get("uth_example")
    if not isinstance(ex, str) or not ex.strip():
        errs.append("uth_example: self-contained Python script required")
    else:
        n = len(ex.strip().splitlines())
        if not 10 <= n <= 25:
            errs.append(f"uth_example: {n} lines (want 10-25)")
        if any(isinstance(s, str) and s.strip() == ex.strip() for s in solutions):
            errs.append("uth_example: must not be a challenge answer")
        runs = [execution.run_code_subprocess(ex) for _ in range(2)]
        outputs["uth_example"] = runs[0]["output"]
        if runs[0]["exit_code"] != 0:
            errs.append(f"uth_example: exit {runs[0]['exit_code']}: {runs[0]['error'][-400:]}")
        elif not runs[0]["output"].strip():
            errs.append("uth_example: prints nothing")
        elif runs[0]["output"] != runs[1]["output"]:
            errs.append("uth_example: output differs between two runs (must be deterministic)")
    if not lesson_code.example_code(lesson):
        errs.append("no traceable example (lesson_code.example_code found none)")

    # production grading of each challenge with its reference solution
    if len(solutions) != len(pcs):
        errs.append(f"solution: {len(solutions)} solution(s) for {len(pcs)} challenge(s)")
    for i, c in enumerate(pcs):
        if not isinstance(c, dict) or not all(isinstance(c.get(k), str) and c[k].strip()
                                             for k in ("starter_code", "expected_output", "test_code")):
            continue
        p = f"practice_challenges[{i}]"
        tc, exp, starter = c["test_code"], c["expected_output"], c["starter_code"]
        probe = grading.probe_harness(tc)
        if probe is True:
            errs.append(f"{p}.test_code: passes on its own (vacuous) - it must reference the learner's names")
        elif probe is None:
            errs.append(f"{p}.test_code: probe inconclusive (runner busy / timeout)")
        for label, code in (("empty code", ""), ('print("hi")', 'print("hi")\n'), ("starter code", starter)):
            if grading.grade_submission(code, exp, test_code=tc)["success"]:
                errs.append(f"{p}: {label} passes the grader - test_code must fail it")
        sol = solutions[i] if i < len(solutions) else None
        if not isinstance(sol, str) or not sol.strip():
            errs.append(f"solution[{i}]: code required")
            continue
        blocked = execution.check_lesson_safety(sol, lesson_code=starter + "\n" + tc)
        if blocked:
            errs.append(f"solution[{i}]: blocked by the lesson safety gate: {blocked}")
        g = grading.grade_submission(sol, exp, test_code=tc)
        if not g["success"]:
            errs.append(f"solution[{i}]: fails its test_code: {(g['error'] or g['output'])[-500:]}")
        alone = execution.run_code_subprocess(sol)
        outputs[f"solution[{i}]"] = alone["output"]
        if alone["exit_code"] != 0:
            errs.append(f"solution[{i}]: exit {alone['exit_code']}: {alone['error'][-400:]}")
        elif not grading.output_matches(alone["output"], exp):
            errs.append(f"solution[{i}]: prints {alone['output'].strip()[:300]!r} but expected_output is "
                        f"{exp.strip()[:300]!r}")
    return {"ok": not errs, "errors": errs, "outputs": outputs}


def solution_codes(sol) -> list:
    """Accept {"challenges": [{"index", "code"}]} (repo format), a list of codes, or {"solutions": [...]}."""
    if isinstance(sol, dict) and isinstance(sol.get("challenges"), list):
        chs = sorted((c for c in sol["challenges"] if isinstance(c, dict)), key=lambda c: c.get("index", 0))
        return [c.get("code") for c in chs]
    if isinstance(sol, dict) and isinstance(sol.get("solutions"), list):
        sol = sol["solutions"]
    if isinstance(sol, list):
        return [s.get("code") if isinstance(s, dict) else s for s in sol]
    return []


def write_review(lesson: dict, codes: list, outputs: dict, provider: str) -> tuple[Path, Path]:
    REVIEW.mkdir(parents=True, exist_ok=True)
    lid = lesson["id"]
    draft, solp = REVIEW / f"{lid}.json", REVIEW / f"{lid}.solution.json"
    draft.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    sol = {"lesson_id": lid, "challenges": [
        {"index": i, "code": code if code.endswith("\n") else code + "\n",
         "verified_output": outputs.get(f"solution[{i}]", "").strip(),
         "source": f"{provider} {datetime.date.today()}, verified by innovate_topics.py (grade_submission)"}
        for i, code in enumerate(codes)]}
    solp.write_text(json.dumps(sol, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return draft, solp


# ---------------------------------------------------------------- 2) draft a lesson

def _example_lesson(track: str, lessons: list[dict]) -> tuple[str, str]:
    """A shipped lesson (same track when possible) with test_code harnesses and a stored solution, as a format
    reference."""
    pool = [l for l in lessons if l["track"] == track] + [l for l in lessons if l["track"] != track]
    for l in pool:
        sol = SOLUTIONS / f"{l['id']}.json"
        if not sol.exists():
            continue
        try:
            d = json.loads(Path(l["file"]).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        pcs = d.get("practice_challenges") or []
        types = {a.get("type") for a in d.get("animation_sequence") or [] if isinstance(a, dict)}
        if len(pcs) >= 2 and all(isinstance(c, dict) and c.get("test_code") for c in pcs) and \
                isinstance((pcs[0].get("hints")), dict) and d.get("uth_example") and \
                len(types & set(REQUIRED_ANIMATIONS)) >= 4:
            return l["file"], str(sol)
    return lessons[0]["file"], str(SOLUTIONS / f"{lessons[0]['id']}.json")


def _spec(topic: dict, expect: dict) -> str:
    return f"""TOPIC (from the innovation queue):
{json.dumps({k: topic.get(k) for k in ('id', 'title', 'track', 'module', 'pitch', 'why_now', 'concepts_taught',
                                         'concepts_required', 'difficulty', 'audience', 'source_signals')},
            indent=2, ensure_ascii=False)}

HARD REQUIREMENTS for the lesson JSON (all are checked by a deterministic validator):
- "id": "{expect['id']}", "topic": "{expect['id']}", "track": "{expect['track']}", "order": {expect['order']},
  "module": a module name, "title": {{"en": ...}}, "description": {{"en": ...}}, "xp_reward": int (100-150),
  "story_variants": {{"en": markdown story >= 600 chars, Vaathiyaar style Story -> Visual -> Code in plain English
  (Tamil terms like Vanakkam, nanba, Vaathiyaar are permitted; never use Hindi words or Hinglish such as chai, samosa,
  tapri, jugaad, paisa, lakh, crore, namaste)}}.
- "animation_sequence": a list containing at least one of EACH of StoryCard, ConceptMap, CodeStepper,
  TerminalOutput, ComparisonPanel, ParticleEffect. Each step uses only keys the frontend consumes
  (frontend/src/components/animations/normalize.js CONTRACT) plus type/id/duration_ms/description/title. E.g.
  StoryCard: content, visual_theme; ConceptMap: nodes, edges; CodeStepper: code, steps; TerminalOutput: output or
  lines; ComparisonPanel: left, right, left_label, right_label; ParticleEffect: effect ("confetti"), active (true).
- "practice_challenges": EXACTLY 2, each {{"instruction": {{"en"}}, "starter_code", "expected_output",
  "hints": {{"en": [>= 3 hints]}}, "test_code"}}. Plain Python 3 stdlib only, no network, no randomness without a
  seed, no input(). starter_code defines the function(s) with a placeholder body and the same print calls as the
  solution. expected_output is EXACTLY what the correct program prints. test_code is a harness of asserts that
  calls the learner's functions with extra cases (so it raises NameError when run alone, and fails on empty code,
  on print("hi") and on the unchanged starter code).
- "quiz": EXACTLY 4 items {{"q": {{"en", "ta"}}, "options": {{"en": [4], "ta": [4]}}, "correct": index}}; Tamil
  must be real Tamil script (technical terms may stay in English).
- "uth_example": a self-contained 10-25 line Python script (stdlib only) that demonstrates the mechanism and
  prints deterministic output. It must NOT be a challenge answer.
- "under_the_hood": {{"summary" (40-280 chars), "steps": 4-7 x {{"title" (3-80), "body" (60-600),
  optional "visual": {{"type": T, "props": {{...}}}}}}, "takeaway" (30-400)}}; at least 2 steps have a visual;
  T and its props must be from backend/vaathiyaar/topic_uth.py CONSUMES (e.g. FlowArrow stages, DataStructure
  structure/data, ComparisonPanel left/right, TerminalOutput lines, CodeStepper code/steps, VariableBox variables).
  No other keys. No "TODO"/"lorem".
- "tags": {{"concepts_taught": [...], "concepts_required": [...], "difficulty", "engagement_type": "hands_on",
  "estimated_minutes": int, "category": str, "path_memberships": [...]}}.
- Facts must be true; never quote prices, quotas or benchmark scores you cannot verify."""


def draft_lesson(q: dict, topic: dict, lessons: list[dict]) -> bool:
    lid = topic["id"]
    in_track = [l for l in lessons if l["track"] == topic["track"]]
    expect = {"id": lid, "topic": lid, "track": topic["track"],
              "order": max([l["order"] for l in in_track] or [0]) + 1}
    work = WORK / lid
    work.mkdir(parents=True, exist_ok=True)
    draft_p, sol_p = work / "draft.json", work / "solution.json"
    ex_lesson, ex_sol = _example_lesson(topic["track"], lessons)
    topic.update(status="drafting", attempts=topic.get("attempts", 0) + 1, updated=now_iso())
    save_queue(q)
    spec = _spec(topic, expect)
    result, provider, lesson, codes = None, None, None, []
    claude_down = not shutil.which("claude")

    # A) Claude Code, agentic: writes the files, runs our validator itself and iterates until it passes.
    validate_cmd = f"{sys.executable} {Path(__file__).resolve()} --validate {draft_p} {sol_p} --expect-id {lid}"
    agent_prompt = f"""You are authoring ONE new PyMasters lesson for owner review. Work only inside {work}.
Do NOT modify any file in {REPO} (read-only reference) and do not run git, deploy or network-changing commands.

Read first, for the exact format and quality bar:
- an existing lesson with harnesses: {ex_lesson}
- its stored reference solution: {ex_sol}
- the lesson rules: section "Adding or changing a lesson" in {REPO}/CLAUDE.md
- {BACKEND}/vaathiyaar/topic_uth.py (under_the_hood rules) and {NORMALIZE_JS} (CONTRACT for animation keys)

{spec}

Write:
- {draft_p}: the complete lesson JSON (2-space indent, UTF-8).
- {sol_p}: {{"lesson_id": "{lid}", "challenges": [{{"index": 0, "code": "..."}}, {{"index": 1, "code": "..."}}]}} -
  the full correct program for each challenge (it must print expected_output and pass test_code).

Then run:  {validate_cmd}
It applies the production grader. Fix every reported error and re-run until it prints "ok": true.
Finish with one line: DONE, or FAILED: <reason>."""
    if thermal_ok(max_wait_s=2700):
        for p in (draft_p, sol_p):
            p.unlink(missing_ok=True)
        log(f"draft {lid}: Claude Code agentic attempt {topic['attempts']}")
        reply = claude_run(agent_prompt, work, CLAUDE_DRAFT_TIMEOUT)
        claude_down = reply is None          # rate-limited / logged out: go straight to the fallbacks
        if reply is not None:
            try:
                lesson = json.loads(draft_p.read_text(encoding="utf-8"))
                codes = solution_codes(json.loads(sol_p.read_text(encoding="utf-8")))
                provider = "claude-code (agentic)"
                result = validate_lesson(lesson, codes, expect)
                log(f"draft {lid}: claude reply {reply.strip()[-120:]!r}; validator ok={result['ok']} "
                    f"errors={len(result['errors'])}")
            except (OSError, ValueError) as e:
                log(f"draft {lid}: claude wrote no readable draft ({e})")

    # B) text mode (claude text if the agentic files were unusable, then Ollama Cloud, then llama-server):
    #    generate -> validate -> send the errors back -> repair.
    rounds = 0
    while (result is None or not result["ok"]) and rounds < REPAIR_ROUNDS:
        rounds += 1
        if lesson is not None and result is not None:
            ask = (f"{spec}\n\nYour previous lesson failed the validator. Fix EVERY error and return the whole "
                   f"corrected object.\nERRORS:\n" + "\n".join(f"- {e}" for e in result["errors"][:40]) +
                   f"\n\nPREVIOUS:\n{json.dumps({'lesson': lesson, 'solutions': codes}, ensure_ascii=False)}")
        else:
            ask = (f"Author ONE complete PyMasters lesson.\n\n{spec}\n\nFORMAT REFERENCE (an existing lesson):\n"
                   f"{Path(ex_lesson).read_text(encoding='utf-8')[:14000]}")
        ask += ('\n\nReply with ONLY one JSON object: {"lesson": {...the lesson...}, "solutions": '
                '["full correct program for challenge 0", "... for challenge 1"]}')
        if not thermal_ok(max_wait_s=2700):
            break
        prov, text = text_llm(ask, work, CLAUDE_DRAFT_TIMEOUT, skip_claude=claude_down)
        obj = extract_json(text or "")
        if not isinstance(obj, dict) or not isinstance(obj.get("lesson"), dict):
            log(f"draft {lid}: round {rounds}: no usable JSON from {prov}")
            if prov is None:
                break
            continue
        lesson, codes, provider = obj["lesson"], solution_codes(obj.get("solutions")), prov
        result = validate_lesson(lesson, codes, expect)
        log(f"draft {lid}: round {rounds} via {prov}: ok={result['ok']} errors={len(result['errors'])}")

    if result and result["ok"]:
        d, s = write_review(lesson, codes, result["outputs"], provider)
        topic.update(status="validated", provider_draft=provider, validated_at=now_iso(), updated=now_iso(),
                     review_path=str(d), solution_path=str(s), errors=[],
                     title=_en(lesson.get("title")) or topic["title"], order=expect["order"],
                     module=lesson.get("module", topic.get("module")))
        save_queue(q)
        log(f"draft {lid}: VALIDATED -> {d}")
        return True
    topic["errors"] = (result or {}).get("errors", ["no provider produced a draft"])[:12]
    topic.update(status="failed" if topic["attempts"] >= MAX_ATTEMPTS else "queued", updated=now_iso())
    if lesson is not None:   # keep the last attempt for debugging
        (work / "last_attempt.json").write_text(json.dumps({"lesson": lesson, "solutions": codes,
                                                           "errors": topic["errors"]}, indent=2,
                                                          ensure_ascii=False), encoding="utf-8")
    save_queue(q)
    log(f"draft {lid}: not validated ({len(topic['errors'])} errors), status {topic['status']}")
    return False


# ---------------------------------------------------------------- cycle / daemon / status / promote

def run_cycle(want_topics: int = TOPICS_PER_CYCLE, max_wait_s: float | None = 2700) -> dict:
    INNOV.mkdir(parents=True, exist_ok=True)
    lock = open(INNOV / ".lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("cycle: another innovation cycle is running - skipping")
        return {"skipped": "locked"}
    started = now_iso()
    try:
        if not thermal_ok(max_wait_s=max_wait_s):
            return {"skipped": "hot"}
        load_env_file()
        q = load_queue()
        for t in q["topics"]:                        # a previous run that was killed mid-draft
            if t.get("status") == "drafting":
                t["status"] = "queued"
        lessons = existing_lessons()
        live = {l["id"] for l in lessons}
        for t in q["topics"]:                        # promoted + merged elsewhere -> no longer pending
            if t["id"] in live and t.get("status") in ("queued", "validated"):
                t["status"] = "promoted"
        feeds = gather_feeds()
        log(f"cycle: {len(lessons)} lessons, {len(concept_gaps())} gaps, {len(feeds)} feed items")
        added = innovate(q, lessons, feeds, want_topics)
        save_queue(q)
        pending = sorted((t for t in q["topics"] if t.get("status") == "queued"
                          and t.get("attempts", 0) < MAX_ATTEMPTS), key=_rank)
        drafted = None
        if pending:
            ok = draft_lesson(q, pending[0], lessons)
            drafted = {"id": pending[0]["id"], "validated": ok}
        rec = {"started": started, "finished": now_iso(), "topics_added": [t["id"] for t in added],
               "drafted": drafted, "temp_c": cpu_temp()}
        q["cycles"].append(rec)
        save_queue(q)
        log(f"cycle: done {json.dumps(rec)}")
        return rec
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def status() -> dict:
    q = load_queue()
    c = counts(q)
    return {"updated": q.get("updated"), "topics_total": len(q["topics"]), "queued": c.get("queued", 0),
            "drafting": c.get("drafting", 0), "validated_awaiting_review": c.get("validated", 0),
            "failed": c.get("failed", 0), "promoted": c.get("promoted", 0),
            "validated": [t["id"] for t in q["topics"] if t.get("status") == "validated"],
            "next_up": [t["id"] for t in sorted((t for t in q["topics"] if t.get("status") == "queued"), key=_rank)][:5],
            "last_cycle": q["cycles"][-1] if q["cycles"] else None, "cpu_temp_c": cpu_temp(),
            "queue": str(QUEUE), "index": str(REVIEW / "INDEX.md")}


def promote(lid: str) -> int:
    """Owner-run: copy a validated draft into a fresh branch (separate worktree) and open a PR."""
    q = load_queue()
    t = next((t for t in q["topics"] if t["id"] == lid), None)
    if not t or t.get("status") != "validated":
        print(f"{lid}: not a validated draft in {QUEUE}")
        return 1
    lesson = json.loads((REVIEW / f"{lid}.json").read_text(encoding="utf-8"))
    sol = json.loads((REVIEW / f"{lid}.solution.json").read_text(encoding="utf-8"))
    res = validate_lesson(lesson, solution_codes(sol), {"id": lid})
    if not res["ok"]:
        print(json.dumps(res, indent=2))
        return 1
    branch, wt = f"content/innovate-{lid}".replace("_", "-"), OPS / "work" / f"innovate-{lid}"
    git = ["git", "-C", str(REPO)]
    subprocess.run(git + ["fetch", "origin", "main"], check=True)
    subprocess.run(git + ["worktree", "add", "-b", branch, str(wt), "origin/main"], check=True)
    dst = wt / "backend/lessons" / lesson["track"] / f"{lid}.json"
    dst.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (wt / "ops/e2e/solutions" / f"{lid}.json").write_text(json.dumps(sol, indent=2, ensure_ascii=False) + "\n",
                                                           encoding="utf-8")
    w = ["git", "-C", str(wt)]
    subprocess.run(w + ["add", "-A"], check=True)
    subprocess.run(w + ["commit", "-m", f"content: add lesson {lid} ({_en(lesson.get('title'))})\n\n"
                        f"Innovated and validated by ops/laptop/innovate_topics.py; reviewed by the owner."], check=True)
    subprocess.run(w + ["push", "-u", "origin", branch], check=True)
    pr = subprocess.run(["gh", "pr", "create", "--fill", "--head", branch], cwd=wt, capture_output=True, text=True)
    print(pr.stdout or pr.stderr)
    t.update(status="promoted", pr_url=(pr.stdout or "").strip(), updated=now_iso())
    save_queue(q)
    return 0 if pr.returncode == 0 else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--once", action="store_true", help="run one innovation cycle")
    g.add_argument("--daemon", action="store_true", help="run cycles forever")
    g.add_argument("--status", action="store_true", help="print a JSON summary")
    g.add_argument("--validate", nargs=2, metavar=("DRAFT", "SOLUTION"), help="validate a draft + solution")
    g.add_argument("--promote", metavar="LESSON_ID", help="open a PR for a validated draft")
    ap.add_argument("--topics", type=int, default=TOPICS_PER_CYCLE, help="new topics per cycle")
    ap.add_argument("--interval", type=int, default=int(os.environ.get("INNOVATE_INTERVAL_S", 7200)),
                    help="daemon sleep between cycles (s)")
    ap.add_argument("--expect-id", help="with --validate: the id the draft must have")
    a = ap.parse_args(argv)
    if a.status:
        print(json.dumps(status(), indent=2, ensure_ascii=False))
        return 0
    if a.validate:
        try:
            lesson = json.loads(Path(a.validate[0]).read_text(encoding="utf-8"))
            codes = solution_codes(json.loads(Path(a.validate[1]).read_text(encoding="utf-8")))
        except (OSError, ValueError) as e:
            print(json.dumps({"ok": False, "errors": [f"cannot read input: {e}"]}))
            return 1
        expect = {"id": a.expect_id} if a.expect_id else None
        if lesson.get("id") in {l["id"] for l in existing_lessons()}:
            res = {"ok": False, "errors": [f"id {lesson.get('id')!r} already exists in backend/lessons"]}
        else:
            res = validate_lesson(lesson, codes, expect)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return 0 if res["ok"] else 1
    if a.promote:
        return promote(a.promote)
    if a.once:
        run_cycle(a.topics)
        return 0
    log(f"daemon: starting, {a.interval}s between cycles")
    while True:
        try:
            run_cycle(a.topics, max_wait_s=None)
        except Exception as e:  # noqa: BLE001 - a 24/7 loop must survive one bad cycle
            log(f"daemon: cycle crashed: {e!r}")
        time.sleep(a.interval)


if __name__ == "__main__":
    sys.exit(main())
