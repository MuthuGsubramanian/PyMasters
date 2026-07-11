"""Semantic index + endpoints. Uses deterministic fake embeddings (no model
download) — _fake_embed() defaults ON under pytest and these tests also pin
it explicitly so they never depend on that inference."""

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SEMANTIC_FAKE_EMBED", "1")

from main import app  # noqa: E402
from semantic.store import SemanticIndex, get_index, load_lessons  # noqa: E402


@pytest.fixture(scope="module")
def built_index():
    idx = SemanticIndex()
    idx._build()
    idx.ready = True
    return idx


def test_corpus_loads_all_lessons(built_index):
    assert len(built_index.lessons) > 400
    ids = [l["id"] for l in built_index.lessons]
    assert len(ids) == len(set(ids)), "duplicate lesson ids in corpus"
    # legacy duplicates removed in the 2026-07-12 dedupe stay gone
    for legacy in ("variables", "decorators", "generators", "prompt_engineering", "rag_intro"):
        assert legacy not in ids


def test_search_returns_relevant_lesson(built_index):
    # Query a lesson by its own title tokens — must rank in the top results
    # even under the fake bag-of-words embedder (real model only improves it).
    target = built_index.lessons[built_index.by_id["ds_dicts"]]
    title_en = target["title"]["en"] if isinstance(target["title"], dict) else target["title"]
    results = built_index.search(title_en, k=5)
    assert results, "no results"
    assert all("id" in r and "score" in r for r in results)
    assert any(r["id"] == "ds_dicts" for r in results)


def test_search_respects_track_entitlement(built_index):
    only = {"python_fundamentals"}
    results = built_index.search("azure cloud landing zone enterprise", k=10, allowed_tracks=only)
    assert all(r["track"] in only for r in results)


def test_related_prefers_curriculum_graph(built_index):
    res = built_index.related("variables_intro", k=6)
    assert res
    reasons = {r["reason"] for r in res}
    assert "next_step" in reasons or "same_module" in reasons
    assert all(r["id"] != "variables_intro" for r in res)


def test_related_unknown_lesson_is_empty(built_index):
    assert built_index.related("no_such_lesson") == []


def test_endpoints_before_ready_and_after(built_index, monkeypatch):
    client = TestClient(app)
    # status endpoint always answers
    s = client.get("/api/semantic/status").json()
    assert "ready" in s and "backend" in s

    # swap in the built index so /search and /related serve real data
    monkeypatch.setattr("semantic.store._INDEX", built_index)
    r = client.get("/api/semantic/search", params={"q": "for loops iteration"})
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True and body["results"]
    # anonymous caller must never see enterprise tracks
    assert all(res["track"] not in {
        "azure_enterprise", "azure_ai_foundry", "aws_enterprise",
        "gcp_vertex_ai", "cross_cloud_architecture", "frontier_ai_platforms",
    } for res in body["results"])

    r2 = client.get("/api/semantic/related/variables_intro")
    assert r2.status_code == 200 and r2.json()["results"]


def test_query_validation():
    client = TestClient(app)
    assert client.get("/api/semantic/search", params={"q": "x"}).status_code == 422
    assert client.get("/api/semantic/search").status_code == 422
