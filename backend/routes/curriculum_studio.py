"""routes/curriculum_studio.py — Enterprise & Training Center Curriculum Studio endpoints:
- Semantic syllabus ingestion (.pdf, .docx, .csv, .txt or topic list) matched via fastembed
- Auto-queue missing gap topics via LearnAnything pipeline
- Explainable Curriculum Alignment Card generation
- Versioned curricula (`v1.0` -> `v1.1`), impact diff preview, and non-destructive delta publish
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from auth import get_current_user_id
from curriculum_studio import (
    apply_delta_cohort_assignment,
    build_alignment_blueprint,
    compute_version_impact_diff,
    ensure_curriculum_studio_tables,
    next_semantic_version,
)
from routes.org_curriculum import _spawn_generation, ensure_org_curriculum_tables
from routes.organizations import _org_audit, require_org_role
from semantic.store import get_index
from syllabus_ingest import (
    MAX_STUDIO_TOPICS,
    MAX_STUDIO_UPLOAD_BYTES,
    extract_topics_from_upload,
    normalize_topics,
)

router = APIRouter(tags=["curriculum_studio"])


def _db_path() -> str:
    return os.environ.get("DB_PATH", os.path.abspath("pymasters.db"))


def _conn() -> sqlite3.Connection:
    path = _db_path()
    ensure_curriculum_studio_tables(path)
    ensure_org_curriculum_tables(path)
    c = sqlite3.connect(path, timeout=10.0)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout = 10000")
    return c


class CreateCurriculumRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    group_name: str = ""
    modules: list[dict[str, Any]] = Field(default_factory=list)
    changelog: str = "Initial curriculum release"


class BumpVersionRequest(BaseModel):
    bump: str = "minor"  # "minor" | "major"
    modules: list[dict[str, Any]] = Field(default_factory=list)
    changelog: str = ""
    publish_delta: bool = False


class PublishDeltaRequest(BaseModel):
    version: Optional[str] = None
    group_name: Optional[str] = None


def _run_ingest_pipeline(
    org_id: str,
    caller: str,
    title: str,
    source_type: str,
    filename: str,
    topics: list[str],
    threshold: float,
    auto_generate_gaps: bool,
) -> dict[str, Any]:
    if not topics:
        raise HTTPException(status_code=422, detail="No valid topics found in syllabus input.")

    idx = get_index()
    matches = idx.match_topics(
        topics,
        k=3,
        threshold=threshold,
        db_path=_db_path(),
    )

    queued_jobs: list[dict[str, str]] = []
    if auto_generate_gaps:
        conn = _conn()
        jobs_to_spawn: list[tuple[str, str]] = []
        try:
            for item in matches:
                if item["status"] == "gap":
                    job_id = str(uuid.uuid4())
                    conn.execute(
                        """
                        INSERT INTO module_generation_jobs
                            (id, user_id, topic, trigger, trigger_detail, status, priority)
                        VALUES (?, ?, ?, 'curriculum_studio', ?, 'queued', 2)
                        """,
                        [job_id, caller, item["topic"], f"Studio syllabus: {title}"],
                    )
                    item["queued_job_id"] = job_id
                    item["status"] = "gap_queued"
                    queued_jobs.append({"topic": item["topic"], "job_id": job_id})
                    jobs_to_spawn.append((job_id, item["topic"]))
            conn.commit()
        finally:
            conn.close()
        for job_id, topic in jobs_to_spawn:
            _spawn_generation(job_id, caller, topic)

    ingestion_id = str(uuid.uuid4())
    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO syllabus_ingestions
                (id, org_id, title, source_type, filename, extracted_topics_json,
                 match_results_json, queued_jobs_json, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ingestion_id,
                org_id,
                title,
                source_type,
                filename,
                json.dumps(topics),
                json.dumps(matches),
                json.dumps(queued_jobs),
                caller,
            ],
        )
        _org_audit(
            conn,
            org_id,
            caller,
            "studio.ingest",
            "syllabus_ingestion",
            ingestion_id,
            {
                "title": title,
                "topics": len(topics),
                "matched": sum(1 for m in matches if m["status"] == "matched"),
                "gaps": sum(1 for m in matches if m["status"] != "matched"),
            },
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "ingestion_id": ingestion_id,
        "title": title,
        "topics_count": len(topics),
        "matched_count": sum(1 for m in matches if m["status"] == "matched"),
        "gap_count": sum(1 for m in matches if m["status"] != "matched"),
        "matches": matches,
        "queued_jobs": queued_jobs,
    }


@router.post("/api/org/{org_id}/studio/ingest")
async def ingest_syllabus(
    org_id: str,
    request: Request,
    title: Optional[str] = Form(default=None),
    threshold: float = Form(default=0.35),
    auto_generate_gaps: bool = Form(default=False),
    topics_text: Optional[str] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Ingest PDF, DOCX, CSV, TXT syllabus OR JSON topic list and match via local fastembed."""
    require_org_role(_db_path(), org_id, caller, "admin")

    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        body = await request.json()
        raw_title = str(body.get("title") or "Untitled Syllabus").strip()[:200]
        raw_topics = body.get("topics") or []
        if isinstance(raw_topics, str):
            raw_topics = raw_topics.splitlines()
        topics = normalize_topics([str(t) for t in raw_topics], limit=MAX_STUDIO_TOPICS)
        thr = float(body.get("threshold", 0.35))
        auto_gaps = bool(body.get("auto_generate_gaps", False))
        return _run_ingest_pipeline(org_id, caller, raw_title, "topics", "", topics, thr, auto_gaps)

    clean_title = (title or (file.filename if file else "Uploaded Syllabus") or "Uploaded Syllabus").strip()[:200]
    if file is not None:
        raw_bytes = await file.read()
        if len(raw_bytes) > MAX_STUDIO_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Syllabus upload exceeds 2 MB limit.")
        topics = extract_topics_from_upload(file.filename or "syllabus.txt", raw_bytes, limit=MAX_STUDIO_TOPICS)
        src_type = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "file"
        fname = file.filename or ""
    else:
        topics = normalize_topics((topics_text or "").splitlines(), limit=MAX_STUDIO_TOPICS)
        src_type = "topics"
        fname = ""

    return _run_ingest_pipeline(org_id, caller, clean_title, src_type, fname, topics, threshold, auto_generate_gaps)


@router.get("/api/org/{org_id}/studio/ingestions")
def list_ingestions(org_id: str, caller: str = Depends(get_current_user_id)) -> dict[str, Any]:
    require_org_role(_db_path(), org_id, caller, "manager")
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT * FROM syllabus_ingestions WHERE org_id = ? ORDER BY created_at DESC LIMIT 20",
            [org_id],
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["topics"] = json.loads(d.pop("extracted_topics_json", "[]"))
            d["matches"] = json.loads(d.pop("match_results_json", "[]"))
            d["queued_jobs"] = json.loads(d.pop("queued_jobs_json", "[]"))
            out.append(d)
        return {"ingestions": out}
    finally:
        conn.close()


@router.get("/api/org/{org_id}/studio/curricula")
def list_studio_curricula(org_id: str, caller: str = Depends(get_current_user_id)) -> dict[str, Any]:
    require_org_role(_db_path(), org_id, caller, "manager")
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT * FROM org_curricula WHERE org_id = ? ORDER BY updated_at DESC",
            [org_id],
        ).fetchall()
        curricula = []
        for c in rows:
            versions = conn.execute(
                """
                SELECT * FROM org_curriculum_versions
                WHERE curriculum_id = ?
                ORDER BY created_at ASC
                """,
                [c["id"]],
            ).fetchall()
            v_out = []
            for v in versions:
                vd = dict(v)
                vd["modules"] = json.loads(vd.pop("modules_json", "[]"))
                vd["blueprint"] = json.loads(vd.pop("blueprint_json", "{}"))
                v_out.append(vd)
            latest_bp = v_out[-1]["blueprint"] if v_out else {}
            latest_mods = v_out[-1]["modules"] if v_out else []
            deltas = [
                {
                    **dict(da),
                    "added_lesson_ids": json.loads(da["added_lesson_ids_json"] or "[]"),
                    "removed_lesson_ids": json.loads(da["removed_lesson_ids_json"] or "[]"),
                }
                for da in conn.execute(
                    "SELECT * FROM cohort_delta_assignments WHERE curriculum_id = ? ORDER BY created_at DESC",
                    [c["id"]],
                ).fetchall()
            ]
            curricula.append({
                **dict(c),
                "modules": latest_mods,
                "blueprint": latest_bp,
                "versions": v_out,
                "delta_history": deltas,
            })
        return {"curricula": curricula}
    finally:
        conn.close()


@router.post("/api/org/{org_id}/studio/curricula")
def create_studio_curriculum(
    org_id: str,
    body: CreateCurriculumRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Create a curated enterprise curriculum v1.0 with an Explainable Alignment Card."""
    require_org_role(_db_path(), org_id, caller, "admin")
    if not body.modules:
        raise HTTPException(status_code=422, detail="At least one module is required.")

    curriculum_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    title = body.title.strip()
    conn = _conn()
    try:
        blueprint = build_alignment_blueprint(conn, body.modules, title)
        conn.execute(
            """
            INSERT INTO org_curricula
                (id, org_id, title, description, group_name, active_version, created_by)
            VALUES (?, ?, ?, ?, ?, 'v1.0', ?)
            """,
            [curriculum_id, org_id, title, body.description.strip(), body.group_name.strip(), caller],
        )
        conn.execute(
            """
            INSERT INTO org_curriculum_versions
                (id, curriculum_id, version, modules_json, blueprint_json, changelog, parent_version, published_by, published_at)
            VALUES (?, ?, 'v1.0', ?, ?, ?, '', ?, CURRENT_TIMESTAMP)
            """,
            [
                version_id,
                curriculum_id,
                json.dumps(body.modules),
                json.dumps(blueprint),
                body.changelog.strip() or "Initial v1.0 release",
                caller,
            ],
        )
        assign_summary = apply_delta_cohort_assignment(
            conn,
            org_id,
            curriculum_id,
            "",
            "v1.0",
            body.group_name.strip(),
            body.modules,
            [],
            caller,
        )
        _org_audit(
            conn,
            org_id,
            caller,
            "studio.curriculum.created",
            "org_curriculum",
            curriculum_id,
            {"title": title, "version": "v1.0", "modules": len(body.modules)},
        )
        conn.commit()
        return {
            "curriculum_id": curriculum_id,
            "version": "v1.0",
            "title": title,
            "blueprint": blueprint,
            "assignment": assign_summary,
        }
    finally:
        conn.close()


@router.post("/api/org/{org_id}/studio/curricula/{curriculum_id}/versions")
def create_curriculum_version(
    org_id: str,
    curriculum_id: str,
    body: BumpVersionRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Create next semantic version (e.g. v1.0 -> v1.1), compute impact diff, and optionally publish delta."""
    require_org_role(_db_path(), org_id, caller, "admin")
    if not body.modules:
        raise HTTPException(status_code=422, detail="Updated modules list cannot be empty.")

    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT * FROM org_curricula WHERE id = ? AND org_id = ?",
            [curriculum_id, org_id],
        ).fetchone()
        if not cur:
            raise HTTPException(status_code=404, detail="Curriculum not found.")

        prev_version = cur["active_version"] or "v1.0"
        prev_row = conn.execute(
            "SELECT * FROM org_curriculum_versions WHERE curriculum_id = ? AND version = ?",
            [curriculum_id, prev_version],
        ).fetchone()
        old_modules = json.loads(prev_row["modules_json"]) if prev_row else []

        new_version = next_semantic_version(prev_version, bump=body.bump)
        blueprint = build_alignment_blueprint(conn, body.modules, cur["title"])
        impact_diff = compute_version_impact_diff(
            conn, org_id, cur["group_name"] or "", old_modules, body.modules
        )

        version_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO org_curriculum_versions
                (id, curriculum_id, version, modules_json, blueprint_json, changelog, parent_version,
                 published_by, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
            """,
            [
                version_id,
                curriculum_id,
                new_version,
                json.dumps(body.modules),
                json.dumps(blueprint),
                body.changelog.strip() or f"Update {prev_version} -> {new_version}",
                prev_version,
                caller if body.publish_delta else "",
                1 if body.publish_delta else 0,
            ],
        )

        assignment = None
        if body.publish_delta:
            conn.execute(
                "UPDATE org_curricula SET active_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [new_version, curriculum_id],
            )
            assignment = apply_delta_cohort_assignment(
                conn,
                org_id,
                curriculum_id,
                prev_version,
                new_version,
                cur["group_name"] or "",
                impact_diff["added_modules"],
                impact_diff["removed_modules"],
                caller,
            )

        _org_audit(
            conn,
            org_id,
            caller,
            "studio.curriculum.versioned",
            "org_curriculum",
            curriculum_id,
            {
                "from_version": prev_version,
                "to_version": new_version,
                "added": len(impact_diff["added_modules"]),
                "published_delta": body.publish_delta,
            },
        )
        conn.commit()
        return {
            "curriculum_id": curriculum_id,
            "from_version": prev_version,
            "version": new_version,
            "blueprint": blueprint,
            "impact_diff": impact_diff,
            "published": body.publish_delta,
            "assignment": assignment,
        }
    finally:
        conn.close()


@router.post("/api/org/{org_id}/studio/curricula/{curriculum_id}/publish-delta")
def publish_curriculum_delta(
    org_id: str,
    curriculum_id: str,
    body: PublishDeltaRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Publish a staged version (`v1.1`) so cohorts receive ONLY newly added delta modules."""
    require_org_role(_db_path(), org_id, caller, "admin")
    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT * FROM org_curricula WHERE id = ? AND org_id = ?",
            [curriculum_id, org_id],
        ).fetchone()
        if not cur:
            raise HTTPException(status_code=404, detail="Curriculum not found.")

        target_ver = body.version
        if not target_ver:
            row = conn.execute(
                "SELECT version FROM org_curriculum_versions WHERE curriculum_id = ? ORDER BY created_at DESC LIMIT 1",
                [curriculum_id],
            ).fetchone()
            target_ver = row["version"] if row else cur["active_version"]

        ver_row = conn.execute(
            "SELECT * FROM org_curriculum_versions WHERE curriculum_id = ? AND version = ?",
            [curriculum_id, target_ver],
        ).fetchone()
        if not ver_row:
            raise HTTPException(status_code=404, detail=f"Version '{target_ver}' not found.")

        from_ver = cur["active_version"] or ""
        old_row = (
            conn.execute(
                "SELECT modules_json FROM org_curriculum_versions WHERE curriculum_id = ? AND version = ?",
                [curriculum_id, from_ver],
            ).fetchone()
            if from_ver and from_ver != target_ver
            else None
        )
        old_modules = json.loads(old_row["modules_json"]) if old_row else []
        new_modules = json.loads(ver_row["modules_json"] or "[]")
        group_name = body.group_name if body.group_name is not None else (cur["group_name"] or "")

        impact_diff = compute_version_impact_diff(conn, org_id, group_name, old_modules, new_modules)
        assignment = apply_delta_cohort_assignment(
            conn,
            org_id,
            curriculum_id,
            from_ver,
            target_ver,
            group_name,
            impact_diff["added_modules"],
            impact_diff["removed_modules"],
            caller,
        )
        conn.execute(
            "UPDATE org_curriculum_versions SET published_by = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?",
            [caller, ver_row["id"]],
        )
        conn.execute(
            "UPDATE org_curricula SET active_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [target_ver, curriculum_id],
        )
        _org_audit(
            conn,
            org_id,
            caller,
            "studio.curriculum.delta_published",
            "org_curriculum",
            curriculum_id,
            {"from_version": from_ver, "to_version": target_ver, "delta_count": assignment["delta_lessons_count"]},
        )
        conn.commit()
        return {
            "curriculum_id": curriculum_id,
            "from_version": from_ver,
            "active_version": target_ver,
            "impact_diff": impact_diff,
            "assignment": assignment,
        }
    finally:
        conn.close()


def studio_assigned_lesson_ids_for_user(db_path: str, user_id: str) -> list[tuple[str, str]]:
    """Return [(lesson_id, curriculum_title)] assigned to user via Curriculum Studio."""
    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        has_tbl = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cohort_assigned_modules'"
        ).fetchone()
        if not has_tbl:
            conn.close()
            return []
        rows = conn.execute(
            """
            SELECT cam.lesson_id, oc.title
            FROM cohort_assigned_modules cam
            JOIN org_curricula oc ON oc.id = cam.curriculum_id
            WHERE CAST(cam.user_id AS TEXT) = ?
            ORDER BY cam.assigned_at ASC
            """,
            [str(user_id)],
        ).fetchall()
        conn.close()
        return [(r["lesson_id"], r["title"]) for r in rows]
    except Exception:
        return []
