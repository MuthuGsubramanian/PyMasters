"""Semantic curriculum index — vector search + related lessons.

The curriculum is modeled as a graph (lessons linked by prerequisite chains
and module membership) with a sentence embedding per lesson. Two
interchangeable backends serve the queries:

- LocalVectorStore (default): in-process numpy matrix + fastembed
  (BAAI/bge-small-en-v1.5, 384-dim, CPU/int8). No extra infrastructure.
- HelixDB (opt-in): set HELIX_URL to a running HelixDB instance and the
  index mirrors lessons (nodes + PREREQUISITE/SAME_MODULE edges + vectors)
  into it and serves vector search from there, falling back to the local
  matrix on any failure. NOTE: the HelixDB engine image is proprietary and
  in-memory-only for self-hosters (2026-07) — see the session report before
  enabling in production.

All data is derived from backend/lessons/*.json — rebuildable at any time,
cached on disk keyed by (model, corpus hash) so warm boots skip embedding.
"""

import hashlib
import json
import os
import threading
import time
from pathlib import Path

import numpy as np

LESSONS_DIR = Path(__file__).resolve().parent.parent / "lessons"
_DEFAULT_CACHE = Path(
    os.environ.get("SEMANTIC_CACHE_DIR")
    or ("/app/data" if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data")
)
MODEL_NAME = os.environ.get("SEMANTIC_MODEL", "BAAI/bge-small-en-v1.5")


def _fake_embed():
    """Deterministic hash embeddings for tests/CI (no model download).

    Read dynamically (not at import) so pytest can flip it per-test; also
    defaults ON under pytest so unrelated TestClient tests can never trigger
    a real model download in CI.
    """
    v = os.environ.get("SEMANTIC_FAKE_EMBED")
    if v is not None:
        return v == "1"
    return "PYTEST_CURRENT_TEST" in os.environ


def _txt(v, lang="en"):
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        s = v.get(lang) or next((x for x in v.values() if isinstance(x, str)), "")
        return s if isinstance(s, str) else ""
    return ""


def _corpus_text(d):
    sv = d.get("story_variants") or {}
    story = sv.get("en") if isinstance(sv, dict) else ""
    if isinstance(story, dict):
        story = _txt(story)
    # tags is a dict in every current lesson ({concepts_taught: [...], ...});
    # legacy flat lists are still accepted.
    tags = d.get("tags") or []
    if isinstance(tags, dict):
        tag_words = [
            str(t) for key in ("concepts_taught", "concepts_required", "path_memberships")
            for t in (tags.get(key) or []) if isinstance(t, str)
        ]
    elif isinstance(tags, list):
        tag_words = [str(t) for t in tags if isinstance(t, str)]
    else:
        tag_words = []
    parts = [
        _txt(d.get("title")),
        _txt(d.get("description")),
        str(d.get("topic") or "").replace("_", " "),
        str(d.get("track") or "").replace("_", " "),
        (story or "")[:600],
        " ".join(w.replace("_", " ") for w in tag_words),
    ]
    return "\n".join(p for p in parts if p)


def load_lessons():
    """Load every lesson JSON into a light corpus record."""
    out = []
    if not LESSONS_DIR.exists():
        return out
    for fp in sorted(LESSONS_DIR.rglob("*.json")):
        if fp.name == "schema.json":
            continue
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        lid = d.get("id") or fp.stem
        out.append({
            "id": lid,
            "source_type": "lesson",
            "track": d.get("track") or fp.parent.name,
            "module": d.get("module") or "",
            "order": d.get("order") or 0,
            "topic": d.get("topic") or "",
            "title": d.get("title") or lid,
            "description": d.get("description") or "",
            "next_unlock": d.get("next_unlock") or None,
            "xp_reward": d.get("xp_reward"),
            "text": _corpus_text(d),
        })
    return out


def load_concept_nodes(db_path: str | None = None) -> list[dict]:
    """Load concept-graph nodes from concept_links.json and SQLite `concepts` table."""
    nodes: dict[str, dict] = {}
    links_file = Path(__file__).resolve().parent.parent / "graph" / "concept_links.json"
    if links_file.exists():
        try:
            raw = json.loads(links_file.read_text(encoding="utf-8"))
            for cid, llist in raw.items():
                if str(cid).startswith("_"):
                    continue
                if isinstance(llist, list):
                    title = str(cid).replace("_", " ").title()
                    nodes[str(cid)] = {
                        "id": f"concept:{cid}",
                        "concept_id": str(cid),
                        "source_type": "concept",
                        "track": "concept_graph",
                        "module": "concept_graph",
                        "order": 0,
                        "topic": str(cid),
                        "title": {"en": title},
                        "description": {"en": f"Concept node mapping {', '.join(str(x) for x in llist[:4])}"},
                        "linked_lesson_ids": [str(x) for x in llist],
                        "xp_reward": 50,
                        "text": f"{title}\n{str(cid).replace('_', ' ')}\n{' '.join(str(x) for x in llist)}",
                    }
        except Exception:
            pass

    target_db = db_path or os.environ.get("DB_PATH")
    if target_db and Path(target_db).exists():
        import sqlite3
        try:
            conn = sqlite3.connect(target_db, timeout=5.0)
            conn.row_factory = sqlite3.Row
            has_tbl = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='concepts'"
            ).fetchone()
            if has_tbl:
                for r in conn.execute("SELECT id, name, category, description FROM concepts").fetchall():
                    cid = str(r["id"])
                    prev = nodes.get(cid, {})
                    title = r["name"] or cid.replace("_", " ").title()
                    desc = r["description"] or prev.get("description", {}).get("en", "")
                    nodes[cid] = {
                        "id": f"concept:{cid}",
                        "concept_id": cid,
                        "source_type": "concept",
                        "track": "concept_graph",
                        "module": r["category"] or "concept_graph",
                        "order": 0,
                        "topic": cid,
                        "title": {"en": title},
                        "description": {"en": desc},
                        "linked_lesson_ids": prev.get("linked_lesson_ids", []),
                        "xp_reward": 50,
                        "text": f"{title}\n{r['category'] or ''}\n{desc}\n{cid.replace('_', ' ')}",
                    }
            conn.close()
        except Exception:
            pass
    return list(nodes.values())


def load_dynamic_lessons(db_path: str | None = None) -> list[dict]:
    """Load generated_lessons and school_concept_lessons from SQLite when available."""
    target_db = db_path or os.environ.get("DB_PATH")
    if not target_db or not Path(target_db).exists():
        return []
    import sqlite3
    out: list[dict] = []
    try:
        conn = sqlite3.connect(target_db, timeout=5.0)
        conn.row_factory = sqlite3.Row
        for tbl, src_type in (("generated_lessons", "generated"), ("school_concept_lessons", "school_concept")):
            has_tbl = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [tbl]
            ).fetchone()
            if not has_tbl:
                continue
            rows = conn.execute(f"SELECT lesson_data FROM {tbl} ORDER BY rowid DESC LIMIT 300").fetchall()
            for r in rows:
                try:
                    d = json.loads(r["lesson_data"])
                except Exception:
                    continue
                lid = d.get("id")
                if not lid:
                    continue
                out.append({
                    "id": lid,
                    "source_type": src_type,
                    "track": d.get("track") or src_type,
                    "module": d.get("module") or d.get("subject_code") or "",
                    "order": d.get("order") or 0,
                    "topic": d.get("topic") or d.get("subject_code") or "",
                    "title": d.get("title") or lid,
                    "description": d.get("description") or "",
                    "next_unlock": d.get("next_unlock"),
                    "xp_reward": d.get("xp_reward") or 50,
                    "text": _corpus_text(d),
                })
        conn.close()
    except Exception:
        pass
    return out


# ── Embedders ───────────────────────────────────────────────────────────────

class _FakeEmbedder:
    """Deterministic hash-based embedding — CI/tests only (no model download).

    Wide enough (2048 dims) that token collisions don't swamp ranking, so
    exact-token queries behave like a crude but usable lexical search.
    """
    dim = 2048

    def embed(self, texts):
        vecs = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            for tok in t.lower().split():
                tok = tok.strip(".,:;!?()[]{}'\"`")
                if len(tok) < 3:
                    continue
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
                vecs[i, h % self.dim] += 1.0
        return vecs


class _FastEmbedder:
    def __init__(self, model_name=MODEL_NAME):
        from fastembed import TextEmbedding  # lazy — big import
        self._model = TextEmbedding(model_name)

    def embed(self, texts):
        # Small batches are load-bearing: fastembed's default (256 docs ×
        # up-to-512 tokens) materializes multi-GB attention buffers in
        # onnxruntime — that OOM-killed the 2Gi Cloud Run instance on every
        # boot (incident 2026-07-12). 8 docs/batch peaks well under 200 MB.
        bs = int(os.environ.get("SEMANTIC_EMBED_BATCH", "8"))
        return np.array(list(self._model.embed(list(texts), batch_size=bs)), dtype=np.float32)


def _normalize(m):
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


# ── Index ───────────────────────────────────────────────────────────────────

class SemanticIndex:
    NEIGHBORS = 16  # precomputed per lesson

    def __init__(self):
        self.ready = False
        self.building = False
        self.error = None
        self.backend = "local"
        self._lock = threading.Lock()
        self._embedder = None
        self.lessons = []       # corpus records, index-aligned with matrix rows
        self.by_id = {}
        self.matrix = None      # (n, dim) L2-normalized float32
        self.neighbors = {}     # id -> [(id, score), ...]
        self.inbound = {}       # id -> [ids whose next_unlock == id]
        self._helix = None

    # -- lifecycle ----------------------------------------------------------

    def ensure_started(self):
        # Ops kill switch — honored HERE (not just at app startup) because the
        # /api/semantic endpoints also call ensure_started(): during the
        # 2026-07-12 incident the index build crashed gen1 Cloud Run instances,
        # and with only the lifespan gated every status poll re-triggered the
        # build and re-crashed the process.
        if os.environ.get("SEMANTIC_AUTOSTART") == "0":
            self.error = "disabled via SEMANTIC_AUTOSTART=0"
            return
        with self._lock:
            if self.ready or self.building:
                return
            self.building = True
        threading.Thread(target=self._build_safe, name="semantic-index-build", daemon=True).start()

    def _build_safe(self):
        try:
            self._build()
            self.error = None
            self.ready = True
        except Exception as exc:  # feature degrades to absent, never breaks the app
            self.error = f"{type(exc).__name__}: {exc}"
            print(f"[semantic] index build failed: {self.error[:300]}")
        finally:
            self.building = False

    def _cache_file(self):
        return Path(_DEFAULT_CACHE) / "semantic_index.npz"

    def _build(self):
        t0 = time.time()
        self.lessons = load_lessons()
        self.by_id = {l["id"]: i for i, l in enumerate(self.lessons)}
        texts = [l["text"] for l in self.lessons]
        embed_tag = f"|fake{_FakeEmbedder.dim}" if _fake_embed() else ""
        corpus_key = hashlib.sha256(
            (MODEL_NAME + embed_tag + "\x00".join(texts)).encode()
        ).hexdigest()

        cached = self._load_cache(corpus_key, len(texts))
        if cached is not None:
            self.matrix = cached
            # Warm the query embedder now (still on the background build thread) so the
            # first learner search after a restart does not pay the ~6 s model load.
            if self._embedder is None:
                self._embedder = _FakeEmbedder() if _fake_embed() else _FastEmbedder()
                self._embedder.embed(["warm up"])
        else:
            self._embedder = _FakeEmbedder() if _fake_embed() else _FastEmbedder()
            self.matrix = _normalize(self._embedder.embed(texts))
            self._save_cache(corpus_key)

        # Graph relations from the curriculum itself
        self.inbound = {}
        for l in self.lessons:
            nxt = l.get("next_unlock")
            if nxt:
                self.inbound.setdefault(nxt, []).append(l["id"])

        # Precompute vector neighbors
        sims = self.matrix @ self.matrix.T
        np.fill_diagonal(sims, -1.0)
        k = min(self.NEIGHBORS, max(len(self.lessons) - 1, 1))
        for i, l in enumerate(self.lessons):
            idx = np.argpartition(-sims[i], k - 1)[:k]
            idx = idx[np.argsort(-sims[i][idx])]
            self.neighbors[l["id"]] = [(self.lessons[j]["id"], float(sims[i][j])) for j in idx]

        # Optional HelixDB mirror
        if os.environ.get("HELIX_URL"):
            try:
                self._helix_sync()
                self.backend = "helix"
            except Exception as exc:
                print(f"[semantic] HelixDB sync failed ({type(exc).__name__}: {str(exc)[:200]}); using local backend")
                self._helix = None
                self.backend = "local"

        print(f"[semantic] index ready: {len(self.lessons)} lessons, backend={self.backend}, {time.time()-t0:.1f}s")

    def _load_cache(self, corpus_key, n):
        try:
            fp = self._cache_file()
            if not fp.exists():
                return None
            z = np.load(fp, allow_pickle=False)
            if str(z["key"]) == corpus_key and z["matrix"].shape[0] == n:
                return z["matrix"].astype(np.float32)
        except Exception:
            pass
        return None

    def _save_cache(self, corpus_key):
        try:
            fp = self._cache_file()
            fp.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(fp, key=np.str_(corpus_key), matrix=self.matrix)
        except Exception as exc:
            print(f"[semantic] cache write skipped: {exc}")

    # -- HelixDB backend (opt-in via HELIX_URL) ------------------------------

    def _helix_sync(self):
        """Mirror lessons + edges + vectors into a HelixDB instance."""
        from helixdb import Client, g, write_batch  # official zero-dep client
        from helixdb.dsl import IndexSpec

        client = Client(os.environ["HELIX_URL"])
        setup = (
            write_batch()
            .var_as("idx", g().create_vector_index_nodes("Lesson", "embedding"))
            .returning(["idx"])
        )
        client.query().dynamic(setup.to_dynamic_request()).send()

        for i, l in enumerate(self.lessons):
            batch = (
                write_batch()
                .var_as("l", g().add_n("Lesson", {
                    "slug": l["id"],
                    "title": _txt(l["title"]),
                    "track": l["track"],
                    "module": l["module"],
                    "embedding": [float(x) for x in self.matrix[i]],
                }).value_map(["$id", "slug"]))
                .returning(["l"])
            )
            client.query().dynamic(batch.to_dynamic_request()).send()
        self._helix = client

    def _helix_search(self, qvec, k):
        from helixdb import g, read_batch
        q = (
            read_batch()
            .var_as("hits",
                    g().vector_search_nodes("Lesson", "embedding", [float(x) for x in qvec], int(k))
                       .value_map(["slug", "$distance"]))
            .returning(["hits"])
        )
        res = self._helix.query().dynamic(q.to_dynamic_request()).send()
        hits = (res or {}).get("hits") or []
        return [(h.get("slug"), 1.0 - float(h.get("$distance", 1.0))) for h in hits if h.get("slug")]

    # -- queries -------------------------------------------------------------

    def _embed_query(self, text):
        if self._embedder is None:
            self._embedder = _FakeEmbedder() if _fake_embed() else _FastEmbedder()
        v = self._embedder.embed([text])[0]
        n = np.linalg.norm(v)
        return v / (n or 1.0)

    def _record(self, lid, score=None, reason=None):
        l = self.lessons[self.by_id[lid]]
        rec = {
            "id": l["id"], "track": l["track"], "module": l["module"],
            "topic": l["topic"], "title": l["title"], "description": l["description"],
            "xp_reward": l["xp_reward"],
        }
        if score is not None:
            rec["score"] = round(float(score), 4)
        if reason:
            rec["reason"] = reason
        return rec

    def search(self, query, k=8, allowed_tracks=None):
        if not self.ready:
            return []
        qvec = self._embed_query(query)
        pairs = None
        if self._helix is not None:
            try:
                pairs = self._helix_search(qvec, k * 3)
            except Exception as exc:
                print(f"[semantic] helix search failed, local fallback: {str(exc)[:120]}")
        if pairs is None:
            # Full ranking (cheap at catalog scale): a fixed over-fetch
            # under-filled results for entitlement-restricted callers whose
            # top matches were all enterprise lessons (e.g. anonymous users
            # searching cloud topics got zero results instead of the best
            # non-enterprise ones).
            scores = self.matrix @ qvec
            order = np.argsort(-scores)
            pairs = [(self.lessons[i]["id"], float(scores[i])) for i in order]
        out = []
        for lid, score in pairs:
            if lid not in self.by_id:
                continue
            l = self.lessons[self.by_id[lid]]
            if allowed_tracks is not None and l["track"] not in allowed_tracks:
                continue
            out.append(self._record(lid, score=score))
            if len(out) >= k:
                break
        return out

    def related(self, lesson_id, k=6, allowed_tracks=None):
        if not self.ready or lesson_id not in self.by_id:
            return []
        me = self.lessons[self.by_id[lesson_id]]
        picked, seen = [], {lesson_id}

        def add(lid, reason, score=None):
            if lid in seen or lid not in self.by_id:
                return
            l = self.lessons[self.by_id[lid]]
            if allowed_tracks is not None and l["track"] not in allowed_tracks:
                return
            seen.add(lid)
            picked.append(self._record(lid, score=score, reason=reason))

        # 1. Curriculum graph: what this unlocks, what leads here, module peers
        if me.get("next_unlock"):
            add(me["next_unlock"], "next_step")
        for src in self.inbound.get(lesson_id, []):
            add(src, "prerequisite")
        peers = [l for l in self.lessons
                 if l["track"] == me["track"] and l["module"] == me["module"] and l["id"] != lesson_id]
        peers.sort(key=lambda l: abs((l.get("order") or 0) - (me.get("order") or 0)))
        for p in peers[:2]:
            add(p["id"], "same_module")

        # 2. Vector neighbors fill the rest
        for lid, score in self.neighbors.get(lesson_id, []):
            if len(picked) >= k:
                break
            add(lid, "similar", score=score)
        return picked[:k]

    def match_topics(
        self,
        topics: list[str],
        k: int = 3,
        threshold: float = 0.35,
        db_path: str | None = None,
        allowed_tracks: set[str] | None = None,
    ) -> list[dict]:
        """Semantic search across static lessons, dynamic/school lessons, and concept nodes."""
        if not topics:
            return []
        if self._embedder is None:
            self._embedder = _FakeEmbedder() if _fake_embed() else _FastEmbedder()

        base_lessons = self.lessons if self.ready and self.lessons else load_lessons()
        extras = load_dynamic_lessons(db_path) + load_concept_nodes(db_path)

        corpus: list[dict] = []
        seen_ids: set[str] = set()
        for item in list(base_lessons) + extras:
            iid = item["id"]
            if iid in seen_ids:
                continue
            if allowed_tracks is not None and item.get("source_type", "lesson") == "lesson" and item["track"] not in allowed_tracks:
                continue
            seen_ids.add(iid)
            corpus.append(item)

        if not corpus:
            return [
                {"topic": t, "best_score": 0.0, "status": "gap", "matches": []}
                for t in topics
            ]

        corpus_vecs = _normalize(self._embedder.embed([c["text"] for c in corpus]))
        query_vecs = _normalize(self._embedder.embed([str(t) for t in topics]))
        sim_matrix = query_vecs @ corpus_vecs.T

        results: list[dict] = []
        for qi, topic in enumerate(topics):
            scores = sim_matrix[qi]
            top_idx = np.argsort(-scores)[: max(k, 1)]
            matches = []
            for ci in top_idx:
                item = corpus[int(ci)]
                sc = round(float(scores[int(ci)]), 4)
                matches.append({
                    "id": item["id"],
                    "source_type": item.get("source_type", "lesson"),
                    "title": _txt(item.get("title")),
                    "description": _txt(item.get("description")),
                    "track": item.get("track", ""),
                    "module": item.get("module", ""),
                    "topic": item.get("topic", ""),
                    "score": sc,
                    "linked_lesson_ids": item.get("linked_lesson_ids", []),
                })
            best_score = matches[0]["score"] if matches else 0.0
            results.append({
                "topic": topic,
                "best_score": best_score,
                "status": "matched" if best_score >= threshold else "gap",
                "matches": matches,
            })
        return results


_INDEX = SemanticIndex()


def get_index():
    return _INDEX
