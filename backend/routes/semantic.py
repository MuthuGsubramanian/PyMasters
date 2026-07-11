"""Semantic curriculum endpoints: meaning-based search + related lessons.

Backed by backend/semantic/store.py (numpy/fastembed by default, HelixDB
when HELIX_URL is configured). The index builds in a background thread on
first use; until it is ready these endpoints return ready:false / [] and
the frontend simply hides the feature.
"""

from fastapi import APIRouter, Header, Query

from semantic.store import get_index

router = APIRouter(prefix="/api/semantic", tags=["semantic"])


def _allowed_tracks(authorization):
    """Entitlement filter — mirrors the classroom catalog gate (fails closed).

    Returns None for unrestricted (enterprise/org/super) callers, else the
    set of non-enterprise tracks present in the corpus.
    """
    from auth import optional_user_id
    from access import ENTERPRISE_TRACKS, has_enterprise_access
    from routes.classroom import _get_db_path

    idx = get_index()
    verified_user_id = optional_user_id(authorization)
    if has_enterprise_access(_get_db_path(), verified_user_id):
        return None
    return {l["track"] for l in idx.lessons if l["track"] not in ENTERPRISE_TRACKS}


@router.get("/status")
def status():
    idx = get_index()
    idx.ensure_started()
    return {
        "ready": idx.ready,
        "building": idx.building,
        "backend": idx.backend,
        "total": len(idx.lessons),
        "error": (idx.error or None) and idx.error[:200],
    }


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=200),
           k: int = Query(8, ge=1, le=25),
           authorization: str = Header(None)):
    idx = get_index()
    idx.ensure_started()
    if not idx.ready:
        return {"ready": False, "results": []}
    return {"ready": True, "results": idx.search(q, k=k, allowed_tracks=_allowed_tracks(authorization))}


@router.get("/related/{lesson_id}")
def related(lesson_id: str,
            k: int = Query(6, ge=1, le=12),
            authorization: str = Header(None)):
    idx = get_index()
    idx.ensure_started()
    if not idx.ready:
        return {"ready": False, "results": []}
    return {"ready": True, "results": idx.related(lesson_id, k=k, allowed_tracks=_allowed_tracks(authorization))}
