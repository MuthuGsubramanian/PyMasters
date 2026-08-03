"""
content_requests.py — super-admin "generate this topic" queue for the daily
Claude content author.

Flow: a super admin files a request (topic + explains-essay vs classroom-
lessons) in the admin console. The cloud content-author agent polls the
PUBLIC read-only pending feed (it has no credentials), authors the content
directly into the repo, and appends the request id to
backend/content/content_requests_done.json in the same commit. Once that
commit deploys, the running app sees the id in the done-file and the request
shows as shipped — no write-back auth needed anywhere.
"""

import json
import os
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id

router = APIRouter(prefix="/api", tags=["content-requests"])

VALID_KINDS = ("explains", "lessons")
DONE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "content", "content_requests_done.json",
)


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_content_request_tables(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS content_requests (
                id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('explains', 'lessons')),
                notes TEXT DEFAULT '',
                requested_by TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


def _shipped_ids() -> set:
    """Ids fulfilled by the content author — baked into the deployed image."""
    try:
        with open(DONE_FILE, encoding="utf-8") as f:
            return {str(x) for x in json.load(f)}
    except Exception:
        return set()


def _require_super_admin(user_id: str):
    # Late import to avoid a routes<->routes import cycle at module load.
    from routes.admin import require_super_admin
    require_super_admin(user_id)


class ContentRequestIn(BaseModel):
    topic: str
    kind: str
    notes: str = ""


@router.post("/admin/content-requests")
def create_content_request(body: ContentRequestIn, user_id: str = Depends(get_current_user_id)):
    _require_super_admin(user_id)
    topic = (body.topic or "").strip()
    if not 3 <= len(topic) <= 200:
        raise HTTPException(status_code=422, detail="Topic must be 3-200 characters")
    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=422, detail="kind must be 'explains' or 'lessons'")
    notes = (body.notes or "").strip()[:1000]

    req_id = uuid.uuid4().hex[:12]
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO content_requests (id, topic, kind, notes, requested_by) VALUES (?,?,?,?,?)",
            [req_id, topic, body.kind, notes, user_id],
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": req_id, "status": "pending"}


@router.get("/admin/content-requests")
def list_content_requests(user_id: str = Depends(get_current_user_id)):
    _require_super_admin(user_id)
    shipped = _shipped_ids()
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT id, topic, kind, notes, status, created_at FROM content_requests "
            "ORDER BY created_at DESC LIMIT 200"
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        d = dict(r)
        if d["id"] in shipped:
            d["status"] = "shipped"
        out.append(d)
    return {"requests": out}


@router.delete("/admin/content-requests/{req_id}")
def cancel_content_request(req_id: str, user_id: str = Depends(get_current_user_id)):
    _require_super_admin(user_id)
    conn = _conn()
    try:
        cur = conn.execute(
            "UPDATE content_requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
            [req_id],
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="No pending request with that id")
    finally:
        conn.close()
    return {"id": req_id, "status": "cancelled"}


@router.get("/content-requests/pending")
def pending_content_requests():
    """PUBLIC read-only feed for the cloud content author (it holds no
    credentials). Exposes only the topic queue — no requester identities."""
    shipped = _shipped_ids()
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT id, topic, kind, notes, created_at FROM content_requests "
            "WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20"
        ).fetchall()
    finally:
        conn.close()
    return {"pending": [dict(r) for r in rows if r["id"] not in shipped]}
