"""
org_curriculum.py — org/school admins turn topics into lessons for their members.

An org admin creates a "lesson set" from a list of topics (typed, or uploaded as
a text/CSV file — one topic per line). Each topic is generated into a full lesson
via the existing 5-stage pipeline (modules/pipeline.run_pipeline), reusing the
module_generation_jobs machinery. Generated lessons start HIDDEN: the admin
reviews each and explicitly publishes it, at which point it appears in the
classrooms of the set's cohort (whole org, or a specific member group).

Design notes:
  * Generation reuses run_pipeline (in-process daemon thread, Vaathiyaar). Batch
    is capped (MAX_TOPICS) and topics are enqueued individually so one failure
    doesn't sink the set.
  * Cohort visibility is resolved in classroom._list_all_lessons (a published set
    item's lesson_id is surfaced to members whose org+group match the set).
  * Generated lessons are owned by the creating admin (generated_lessons.user_id),
    so the admin sees them for review via the normal generated-lessons path; the
    set's published items are what reach everyone else.
"""

import csv
import io
import os
import sqlite3
import threading
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user_id

router = APIRouter(tags=["org-curriculum"])

MAX_TOPICS = 10                 # per set — bounds instance load + generation cost
MAX_UPLOAD_BYTES = 512 * 1024   # a topic list is tiny; reject anything larger
_TERMINAL_JOB = ("completed", "failed")


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_org_curriculum_tables(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS org_lesson_sets (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                group_name TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'generating',
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS org_lesson_set_items (
                id TEXT PRIMARY KEY,
                set_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                job_id TEXT,
                lesson_id TEXT,
                status TEXT NOT NULL DEFAULT 'generating',
                error TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ols_org ON org_lesson_sets (org_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_olsi_set ON org_lesson_set_items (set_id)")
        conn.commit()
    finally:
        conn.close()


# Overridable seam so tests don't spawn real LLM generation threads.
def _spawn_generation(job_id: str, user_id: str, topic: str) -> None:
    from modules.pipeline import run_pipeline
    threading.Thread(target=run_pipeline, args=(job_id, user_id, topic), daemon=True).start()


def _parse_topics(raw_lines) -> list:
    """Normalize an iterable of raw lines into a clean, deduped topic list.
    Accepts CSV (first column used) or plain text (one topic per line);
    skips blanks and #-comments. Does NOT truncate — the caller enforces
    MAX_TOPICS with a clear error so topics are never silently dropped."""
    seen, topics = set(), []
    for line in raw_lines:
        s = (line or "").strip()
        if not s or s.startswith("#"):
            continue
        if "," in s:  # CSV — take the first field
            s = next(csv.reader([s]))[0].strip()
        if not s:
            continue
        s = s[:200]
        key = s.lower()
        if key not in seen:
            seen.add(key)
            topics.append(s)
    return topics


def _create_set(org_id: str, caller: str, title: str, description: str,
                group_name: str, topics: list) -> dict:
    title = (title or "").strip()[:200]
    if not title:
        raise HTTPException(status_code=422, detail="A set title is required.")
    if not topics:
        raise HTTPException(status_code=422, detail="At least one topic is required.")
    if len(topics) > MAX_TOPICS:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_TOPICS} topics per set (got {len(topics)}). "
                   "Split a larger curriculum into multiple sets.")

    set_id = str(uuid.uuid4())
    jobs = []  # (job_id, topic) to spawn AFTER commit
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO org_lesson_sets (id, org_id, title, description, group_name, status, created_by) "
            "VALUES (?, ?, ?, ?, ?, 'generating', ?)",
            [set_id, org_id, title, (description or "").strip()[:1000],
             (group_name or "").strip()[:50], caller])
        for topic in topics:
            job_id = str(uuid.uuid4())
            item_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO module_generation_jobs (id, user_id, topic, trigger, trigger_detail, status, priority) "
                "VALUES (?, ?, ?, 'org_curriculum', ?, 'queued', 2)",
                [job_id, caller, topic, f"Org curriculum: {title}"])
            conn.execute(
                "INSERT INTO org_lesson_set_items (id, set_id, topic, job_id, status) "
                "VALUES (?, ?, ?, ?, 'generating')",
                [item_id, set_id, topic, job_id])
            jobs.append((job_id, topic))
        conn.commit()
    finally:
        conn.close()

    # Generation runs after the rows are durably committed.
    for job_id, topic in jobs:
        _spawn_generation(job_id, caller, topic)

    from routes.organizations import _org_audit
    conn = _conn()
    try:
        _org_audit(conn, org_id, caller, "curriculum.create", "lesson_set", set_id,
                   {"title": title, "topics": len(topics)})
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "id": set_id, "topics": len(topics),
            "message": "Lessons are generating — review and publish them once ready."}


def _reconcile_set(conn, set_id: str) -> None:
    """Pull each still-generating item's job result into the item, and roll the
    set status up to 'ready' once every item is terminal. Lazy (on read) so no
    separate worker is needed."""
    items = conn.execute(
        "SELECT id, job_id, status FROM org_lesson_set_items WHERE set_id = ?", [set_id]).fetchall()
    changed = False
    for it in items:
        if it["status"] == "generating" and it["job_id"]:
            job = conn.execute(
                "SELECT status, result_lesson_id, error_message FROM module_generation_jobs WHERE id = ?",
                [it["job_id"]]).fetchone()
            if not job:
                continue
            if job["status"] == "completed" and job["result_lesson_id"]:
                conn.execute("UPDATE org_lesson_set_items SET lesson_id = ?, status = 'generated' WHERE id = ?",
                             [job["result_lesson_id"], it["id"]])
                changed = True
            elif job["status"] == "failed":
                conn.execute("UPDATE org_lesson_set_items SET status = 'failed', error = ? WHERE id = ?",
                             [(job["error_message"] or "generation failed")[:300], it["id"]])
                changed = True
    if changed or True:
        pending = conn.execute(
            "SELECT COUNT(*) FROM org_lesson_set_items WHERE set_id = ? AND status = 'generating'",
            [set_id]).fetchone()[0]
        conn.execute("UPDATE org_lesson_sets SET status = ? WHERE id = ?",
                     ["generating" if pending else "ready", set_id])
    if changed:
        conn.commit()


class CreateSetRequest(BaseModel):
    title: str
    description: str = ""
    group_name: str = ""
    topics: list = []


def _require_admin(org_id: str, caller: str):
    from routes.organizations import require_org_role
    require_org_role(_db_path(), org_id, caller, "admin")


@router.post("/api/org/{org_id}/lesson-sets")
def create_lesson_set(org_id: str, req: CreateSetRequest, caller: str = Depends(get_current_user_id)):
    """Create a curriculum set from typed topics. Requires org admin+."""
    _require_admin(org_id, caller)
    topics = _parse_topics([str(t) for t in (req.topics or [])])
    return _create_set(org_id, caller, req.title, req.description, req.group_name, topics)


@router.post("/api/org/{org_id}/lesson-sets/upload")
async def create_lesson_set_upload(
    org_id: str,
    title: str = Form(...),
    description: str = Form(""),
    group_name: str = Form(""),
    file: UploadFile = File(...),
    caller: str = Depends(get_current_user_id),
):
    """Create a curriculum set from an uploaded text/CSV file (one topic per line)."""
    _require_admin(org_id, caller)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (topic lists are small — max 512 KB).")
    text = data.decode("utf-8", errors="ignore")
    topics = _parse_topics(io.StringIO(text).readlines())
    if not topics:
        raise HTTPException(status_code=422, detail="No topics found — put one topic per line.")
    return _create_set(org_id, caller, title, description, group_name, topics)


@router.get("/api/org/{org_id}/lesson-sets")
def list_lesson_sets(org_id: str, caller: str = Depends(get_current_user_id)):
    """List the org's curriculum sets with item/generation status. Admin+."""
    _require_admin(org_id, caller)
    conn = _conn()
    try:
        sets = conn.execute(
            "SELECT * FROM org_lesson_sets WHERE org_id = ? ORDER BY created_at DESC", [org_id]).fetchall()
        for s in sets:
            _reconcile_set(conn, s["id"])
        out = []
        for s in conn.execute(
                "SELECT * FROM org_lesson_sets WHERE org_id = ? ORDER BY created_at DESC", [org_id]).fetchall():
            items = [dict(i) for i in conn.execute(
                "SELECT id, topic, lesson_id, status, error FROM org_lesson_set_items WHERE set_id = ? "
                "ORDER BY created_at", [s["id"]]).fetchall()]
            d = dict(s)
            d["items"] = items
            d["published_count"] = sum(1 for i in items if i["status"] == "published")
            out.append(d)
    finally:
        conn.close()
    return {"sets": out}


def _load_item(conn, org_id, set_id, item_id, caller):
    _require_admin(org_id, caller)
    row = conn.execute(
        "SELECT it.*, s.org_id AS org_id, s.title AS set_title FROM org_lesson_set_items it "
        "JOIN org_lesson_sets s ON s.id = it.set_id WHERE it.id = ? AND it.set_id = ?",
        [item_id, set_id]).fetchone()
    if not row or row["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return row


@router.post("/api/org/{org_id}/lesson-sets/{set_id}/items/{item_id}/publish")
def publish_item(org_id: str, set_id: str, item_id: str, caller: str = Depends(get_current_user_id)):
    """Publish a generated lesson to the set's cohort. Only 'generated' items."""
    conn = _conn()
    try:
        row = _load_item(conn, org_id, set_id, item_id, caller)
        if row["status"] not in ("generated", "published"):
            raise HTTPException(status_code=409,
                                detail=f"Lesson is {row['status']} — only generated lessons can be published.")
        conn.execute("UPDATE org_lesson_set_items SET status = 'published' WHERE id = ?", [item_id])
        from routes.organizations import _org_audit
        _org_audit(conn, org_id, caller, "curriculum.publish", "lesson_set_item", item_id,
                   {"topic": row["topic"]})
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "status": "published"}


@router.post("/api/org/{org_id}/lesson-sets/{set_id}/items/{item_id}/unpublish")
def unpublish_item(org_id: str, set_id: str, item_id: str, caller: str = Depends(get_current_user_id)):
    """Hide a previously published lesson from members again."""
    conn = _conn()
    try:
        row = _load_item(conn, org_id, set_id, item_id, caller)
        if row["status"] != "published":
            raise HTTPException(status_code=409, detail="Lesson is not published.")
        conn.execute("UPDATE org_lesson_set_items SET status = 'generated' WHERE id = ?", [item_id])
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "status": "generated"}


@router.delete("/api/org/{org_id}/lesson-sets/{set_id}")
def delete_lesson_set(org_id: str, set_id: str, caller: str = Depends(get_current_user_id)):
    """Delete a curriculum set and its items (published lessons stop showing)."""
    conn = _conn()
    try:
        s = conn.execute("SELECT org_id FROM org_lesson_sets WHERE id = ?", [set_id]).fetchone()
        if not s or s["org_id"] != org_id:
            raise HTTPException(status_code=404, detail="Set not found")
        _require_admin(org_id, caller)
        conn.execute("DELETE FROM org_lesson_set_items WHERE set_id = ?", [set_id])
        conn.execute("DELETE FROM org_lesson_sets WHERE id = ?", [set_id])
        from routes.organizations import _org_audit
        _org_audit(conn, org_id, caller, "curriculum.delete", "lesson_set", set_id, {})
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "deleted": set_id}


def published_lessons_for_user(db_path: str, user_id: str) -> list:
    """Full lesson_data dicts for every published curriculum item whose set is
    assigned to this user's org (whole-org, or a group the user belongs to).
    Consumed by classroom._list_all_lessons. Never raises."""
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT DISTINCT gl.lesson_data, s.title AS set_title
               FROM org_lesson_set_items it
               JOIN org_lesson_sets s ON s.id = it.set_id
               JOIN org_members om ON om.org_id = s.org_id AND om.user_id = ?
               LEFT JOIN org_member_groups g
                    ON g.org_id = s.org_id AND g.user_id = ? AND g.group_name = s.group_name
               JOIN generated_lessons gl ON gl.id = it.lesson_id
               WHERE it.status = 'published'
                 AND (s.group_name = '' OR g.group_name IS NOT NULL)""",
            [user_id, user_id]).fetchall()
        conn.close()
        return [(r["lesson_data"], r["set_title"]) for r in rows]
    except Exception:
        return []
