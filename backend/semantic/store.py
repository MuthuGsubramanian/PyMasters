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
    tags = d.get("tags") or []
    parts = [
        _txt(d.get("title")),
        _txt(d.get("description")),
        str(d.get("topic") or "").replace("_", " "),
        str(d.get("track") or "").replace("_", " "),
        (story or "")[:600],
        " ".join(tags) if isinstance(tags, list) else "",
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


# ── Embedders ───────────────────────────────────────────────────────────────

class _FakeEmbedder:
    """Deterministic hash-based embedding — CI/tests only (no model download)."""
    dim = 64

    def embed(self, texts):
        vecs = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            for tok in t.lower().split():
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
                vecs[i, h % self.dim] += 1.0
        return vecs


class _FastEmbedder:
    def __init__(self, model_name=MODEL_NAME):
        from fastembed import TextEmbedding  # lazy — big import
        self._model = TextEmbedding(model_name)

    def embed(self, texts):
        return np.array(list(self._model.embed(list(texts))), dtype=np.float32)


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
        corpus_key = hashlib.sha256(
            (MODEL_NAME + ("|fake" if _fake_embed() else "") + "\x00".join(texts)).encode()
        ).hexdigest()

        cached = self._load_cache(corpus_key, len(texts))
        if cached is not None:
            self.matrix = cached
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
            scores = self.matrix @ qvec
            top = np.argsort(-scores)[: k * 3]
            pairs = [(self.lessons[i]["id"], float(scores[i])) for i in top]
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


_INDEX = SemanticIndex()


def get_index():
    return _INDEX
