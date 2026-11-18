"""routes/school_provisioning.py — Multi-tenant school tenant config, grade/board
syllabus templates, cohort provisioning wizard API, teacher cohort scoping,
and domain-verified SSO onboarding hooks.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user_id
from routes.organizations import _org_audit, require_org_role
from school_provisioning import (
    BOARDS,
    GRADES,
    ensure_school_schema,
    get_question_bank,
    normalize_board,
    seed_school_syllabi,
    teacher_allowed_cohorts,
)

router = APIRouter(tags=["schools"])

ALLOWED_SSO_PROVIDERS = {"", "google_workspace", "entra_id", "saml"}


def _get_db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn() -> sqlite3.Connection:
    db_path = _get_db_path()
    ensure_school_schema(db_path)
    c = sqlite3.connect(db_path, timeout=10.0)
    c.row_factory = sqlite3.Row
    return c


class SchoolTenantConfigRequest(BaseModel):
    board: str = "CBSE"
    academic_year: str = "2026-27"
    sso_provider: str = ""
    sso_domain: str = ""
    hide_public_tracks: bool = True
    seat_limit: int = Field(default=250, ge=5, le=50000)


class ProvisionCohortRequest(BaseModel):
    cohort_name: str = Field(..., min_length=1, max_length=60)
    board: str = "CBSE"
    grade: int = Field(..., ge=1, le=12)
    load_all_subjects: bool = True
    subject_codes: list[str] = Field(default_factory=list)
    hide_public_tracks: bool = True
    assign_teacher_ids: list[str] = Field(default_factory=list)


class TeacherCohortAssignmentRequest(BaseModel):
    cohort_names: list[str] = Field(default_factory=list)
    subject_code: str = ""


class SchoolDomainJoinRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    cohort_name: str = ""


@router.get("/api/schools/templates")
def list_syllabus_templates(
    board: Optional[str] = Query(default=None),
    grade: Optional[int] = Query(default=None, ge=1, le=12),
    caller: str = Depends(get_current_user_id),  # noqa: ARG001
) -> dict[str, Any]:
    """List supported school boards, grades, and subjects with pedagogy mode & units."""
    seed_school_syllabi(_get_db_path())
    conn = _conn()
    try:
        sql = "SELECT * FROM syllabus_templates WHERE is_active = 1"
        params: list[Any] = []
        if board:
            try:
                norm_board = normalize_board(board)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            sql += " AND board = ?"
            params.append(norm_board)
        if grade is not None:
            sql += " AND grade = ?"
            params.append(grade)
        sql += " ORDER BY board ASC, grade ASC"

        templates = []
        for tpl in conn.execute(sql, params).fetchall():
            subjects = []
            subj_rows = conn.execute(
                """
                SELECT id, subject_code, subject_name, pedagogy_mode, term, order_index, estimated_hours
                FROM grade_subjects
                WHERE template_id = ?
                ORDER BY order_index ASC
                """,
                [tpl["id"]],
            ).fetchall()
            for sub in subj_rows:
                units = [
                    dict(u)
                    for u in conn.execute(
                        """
                        SELECT id, term, unit_order, unit_title, lesson_id, pedagogy_mode, is_required
                        FROM syllabus_module_map
                        WHERE grade_subject_id = ?
                        ORDER BY term ASC, unit_order ASC
                        """,
                        [sub["id"]],
                    ).fetchall()
                ]
                subjects.append({**dict(sub), "unit_count": len(units), "units": units})
            templates.append({**dict(tpl), "subjects": subjects})

        return {
            "boards": list(BOARDS),
            "grades": list(GRADES),
            "templates": templates,
        }
    finally:
        conn.close()


@router.get("/api/schools/question-bank")
def read_school_question_bank(
    board: str = Query(default="CBSE"),
    grade: int = Query(default=10, ge=1, le=12),
    subject_code: str = Query(default="cs_ai"),
    term: Optional[str] = Query(default=None),
    caller: str = Depends(get_current_user_id),  # noqa: ARG001
) -> dict[str, Any]:
    """Return structured 2026–27 Question Bank (MCQs, Short-Answer Viva, Practical Labs) for any Board x Grade x Subject."""
    try:
        return get_question_bank(
            db_path=_get_db_path(),
            board=board,
            grade=grade,
            subject_code=subject_code,
            term=term,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/org/{org_id}/school-config")
def get_school_config(org_id: str, caller: str = Depends(get_current_user_id)) -> dict[str, Any]:
    """Read school tenant board/SSO/seat configuration. Requires manager+."""
    require_org_role(_get_db_path(), org_id, caller, "manager")
    conn = _conn()
    try:
        org = conn.execute(
            "SELECT id, name, type, domain, plan FROM organizations WHERE id = ?",
            [org_id],
        ).fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")
        cfg = conn.execute(
            "SELECT * FROM school_tenants WHERE org_id = ?", [org_id]
        ).fetchone()
        member_count = conn.execute(
            "SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]
        ).fetchone()[0]
        return {
            "org": dict(org),
            "config": dict(cfg) if cfg else {
                "org_id": org_id,
                "board": "CBSE",
                "academic_year": "2026-27",
                "sso_provider": "",
                "sso_domain": org["domain"] or "",
                "hide_public_tracks": 1,
                "seat_limit": 250,
            },
            "seats_used": member_count,
        }
    finally:
        conn.close()


@router.put("/api/org/{org_id}/school-config")
def configure_school_tenant(
    org_id: str,
    body: SchoolTenantConfigRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Configure board, academic year, SSO domain/provider, and public-track policy."""
    require_org_role(_get_db_path(), org_id, caller, "admin")
    try:
        board = normalize_board(body.board)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    provider = body.sso_provider.strip().lower()
    if provider not in ALLOWED_SSO_PROVIDERS:
        raise HTTPException(status_code=422, detail="Unsupported SSO provider.")

    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO school_tenants
                (org_id, board, academic_year, sso_provider, sso_domain, hide_public_tracks, seat_limit, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(org_id) DO UPDATE SET
                board = excluded.board,
                academic_year = excluded.academic_year,
                sso_provider = excluded.sso_provider,
                sso_domain = excluded.sso_domain,
                hide_public_tracks = excluded.hide_public_tracks,
                seat_limit = excluded.seat_limit,
                updated_at = CURRENT_TIMESTAMP
            """,
            [
                org_id,
                board,
                body.academic_year.strip() or "2026-27",
                provider,
                body.sso_domain.strip().lower(),
                1 if body.hide_public_tracks else 0,
                body.seat_limit,
            ],
        )
        _org_audit(
            conn,
            org_id,
            caller,
            "school_config_updated",
            target_type="school_tenant",
            target_id=org_id,
            detail={"board": board, "sso_provider": provider, "hide_public_tracks": body.hide_public_tracks},
        )
        conn.commit()
        row = conn.execute("SELECT * FROM school_tenants WHERE org_id = ?", [org_id]).fetchone()
        return {"config": dict(row)}
    finally:
        conn.close()


@router.post("/api/org/{org_id}/cohorts/provision")
def provision_cohort_syllabus(
    org_id: str,
    body: ProvisionCohortRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Provision a grade cohort with All Subjects or custom subject selection."""
    require_org_role(_get_db_path(), org_id, caller, "admin")
    try:
        board = normalize_board(body.board)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    cohort_name = body.cohort_name.strip()
    if not cohort_name:
        raise HTTPException(status_code=422, detail="Cohort name is required.")

    seed_school_syllabi(_get_db_path())
    conn = _conn()
    try:
        tpl = conn.execute(
            """
            SELECT * FROM syllabus_templates
            WHERE board = ? AND grade = ? AND is_active = 1
            ORDER BY version DESC LIMIT 1
            """,
            [board, body.grade],
        ).fetchone()
        if not tpl:
            raise HTTPException(
                status_code=404,
                detail=f"No active syllabus template found for {board} Grade {body.grade}.",
            )

        all_subjects = conn.execute(
            """
            SELECT id, subject_code, subject_name, pedagogy_mode, order_index, estimated_hours
            FROM grade_subjects
            WHERE template_id = ?
            ORDER BY order_index ASC
            """,
            [tpl["id"]],
        ).fetchall()
        if not all_subjects:
            raise HTTPException(status_code=404, detail="Template has no configured subjects.")

        if body.load_all_subjects:
            chosen = list(all_subjects)
        else:
            wanted = {c.strip().lower() for c in body.subject_codes if c.strip()}
            if not wanted:
                raise HTTPException(
                    status_code=422,
                    detail="Select at least one subject or enable Load All Subjects.",
                )
            chosen = [s for s in all_subjects if s["subject_code"].lower() in wanted]
            if not chosen:
                raise HTTPException(status_code=422, detail="No matching subjects found for template.")

        subject_ids = [s["id"] for s in chosen]
        placeholders = ",".join("?" * len(subject_ids))
        units = conn.execute(
            f"""
            SELECT smm.lesson_id, smm.term, smm.unit_order, smm.unit_title, smm.pedagogy_mode,
                   gs.subject_code, gs.subject_name
            FROM syllabus_module_map smm
            JOIN grade_subjects gs ON gs.id = smm.grade_subject_id
            WHERE smm.grade_subject_id IN ({placeholders})
            ORDER BY gs.order_index ASC, smm.term ASC, smm.unit_order ASC
            """,
            subject_ids,
        ).fetchall()

        # Ensure school_tenants row reflects provisioned board defaults
        conn.execute(
            """
            INSERT INTO school_tenants (org_id, board, hide_public_tracks)
            VALUES (?, ?, ?)
            ON CONFLICT(org_id) DO UPDATE SET
                hide_public_tracks = excluded.hide_public_tracks,
                updated_at = CURRENT_TIMESTAMP
            """,
            [org_id, board, 1 if body.hide_public_tracks else 0],
        )

        # Upsert cohort enrollment
        cohort_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO cohort_enrollments
                (id, org_id, cohort_name, grade, board, template_id, selected_subjects_json,
                 provisioned_by, hide_public_tracks, status, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
            ON CONFLICT(org_id, cohort_name) DO UPDATE SET
                grade = excluded.grade,
                board = excluded.board,
                template_id = excluded.template_id,
                selected_subjects_json = excluded.selected_subjects_json,
                provisioned_by = excluded.provisioned_by,
                hide_public_tracks = excluded.hide_public_tracks,
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
            """,
            [
                cohort_id,
                org_id,
                cohort_name,
                body.grade,
                board,
                tpl["id"],
                json.dumps(subject_ids),
                caller,
                1 if body.hide_public_tracks else 0,
            ],
        )

        # Sync org_profiles preference when row exists
        conn.execute(
            """
            UPDATE org_profiles
            SET structure_preference = ?
            WHERE org_id = ?
            """,
            ["assigned" if body.hide_public_tracks else "open", org_id],
        )

        # Assign teachers to this cohort if specified
        for teacher_id in body.assign_teacher_ids:
            tid = teacher_id.strip()
            if not tid:
                continue
            member_exists = conn.execute(
                "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
                [org_id, tid],
            ).fetchone()
            if member_exists:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO cohort_teacher_assignments
                        (org_id, user_id, cohort_name, subject_code)
                    VALUES (?, ?, ?, '')
                    """,
                    [org_id, tid, cohort_name],
                )

        _org_audit(
            conn,
            org_id,
            caller,
            "cohort_provisioned",
            target_type="cohort",
            target_id=cohort_name,
            detail={
                "board": board,
                "grade": body.grade,
                "load_all_subjects": body.load_all_subjects,
                "subjects": [s["subject_code"] for s in chosen],
                "modules_count": len(units),
            },
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM cohort_enrollments WHERE org_id = ? AND cohort_name = ?",
            [org_id, cohort_name],
        ).fetchone()
        return {
            "cohort": dict(row),
            "subjects": [dict(s) for s in chosen],
            "modules": [dict(u) for u in units],
        }
    finally:
        conn.close()


@router.get("/api/org/{org_id}/cohorts")
def list_cohorts(org_id: str, caller: str = Depends(get_current_user_id)) -> dict[str, Any]:
    """List provisioned cohorts with subject breakdown and student mastery analytics."""
    member = require_org_role(_get_db_path(), org_id, caller, "manager")
    allowed = teacher_allowed_cohorts(_get_db_path(), org_id, caller, member["role"])

    conn = _conn()
    try:
        sql = "SELECT * FROM cohort_enrollments WHERE org_id = ? AND status = 'active'"
        params: list[Any] = [org_id]
        if allowed is not None:
            if not allowed:
                return {"cohorts": [], "teacher_scoped": True}
            ph = ",".join("?" * len(allowed))
            sql += f" AND cohort_name IN ({ph})"
            params.extend(allowed)
        sql += " ORDER BY grade ASC, cohort_name ASC"

        cohorts_out = []
        for row in conn.execute(sql, params).fetchall():
            subj_ids = json.loads(row["selected_subjects_json"] or "[]")
            subjects = []
            all_lesson_ids: list[str] = []
            if subj_ids:
                ph = ",".join("?" * len(subj_ids))
                for s in conn.execute(
                    f"SELECT * FROM grade_subjects WHERE id IN ({ph}) ORDER BY order_index ASC",
                    subj_ids,
                ).fetchall():
                    mods = conn.execute(
                        "SELECT lesson_id FROM syllabus_module_map WHERE grade_subject_id = ?",
                        [s["id"]],
                    ).fetchall()
                    lids = [m["lesson_id"] for m in mods]
                    all_lesson_ids.extend(lids)
                    subjects.append({**dict(s), "lesson_ids": lids, "module_count": len(lids)})

            # Student membership in cohort
            student_rows = conn.execute(
                """
                SELECT om.user_id, COALESCE(u.points, 0) AS xp
                FROM org_members om
                JOIN users u ON u.id = om.user_id
                LEFT JOIN org_member_groups omg
                  ON omg.org_id = om.org_id AND omg.user_id = om.user_id AND omg.group_name = ?
                WHERE om.org_id = ?
                  AND om.role = 'member'
                  AND (omg.group_name IS NOT NULL OR ? = 'All Students')
                """,
                [row["cohort_name"], org_id, row["cohort_name"]],
            ).fetchall()
            student_ids = [s["user_id"] for s in student_rows]
            avg_xp = (
                round(sum(s["xp"] for s in student_rows) / len(student_rows), 1)
                if student_rows
                else 0.0
            )

            completion_rate = 0.0
            avg_mastery = 0.0
            if student_ids and all_lesson_ids:
                s_ph = ",".join("?" * len(student_ids))
                l_ph = ",".join("?" * len(all_lesson_ids))
                done_cnt = conn.execute(
                    f"""
                    SELECT COUNT(*) FROM lesson_completions
                    WHERE user_id IN ({s_ph}) AND lesson_id IN ({l_ph})
                    """,
                    student_ids + all_lesson_ids,
                ).fetchone()[0]
                possible = len(student_ids) * len(all_lesson_ids)
                completion_rate = round((done_cnt / possible) * 100, 1) if possible else 0.0

                mastery_row = conn.execute(
                    f"""
                    SELECT COALESCE(AVG(mastery_level), 0)
                    FROM user_mastery
                    WHERE user_id IN ({s_ph})
                    """,
                    student_ids,
                ).fetchone()
                avg_mastery = round(float(mastery_row[0] or 0.0) * 100, 1)

            cohorts_out.append(
                {
                    **dict(row),
                    "subjects": subjects,
                    "module_count": len(all_lesson_ids),
                    "student_count": len(student_ids),
                    "avg_xp": avg_xp,
                    "completion_rate_pct": completion_rate,
                    "avg_mastery_pct": avg_mastery,
                }
            )

        return {"cohorts": cohorts_out, "teacher_scoped": allowed is not None}
    finally:
        conn.close()


@router.put("/api/org/{org_id}/teachers/{member_id}/cohorts")
def assign_teacher_cohorts(
    org_id: str,
    member_id: str,
    body: TeacherCohortAssignmentRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Scope a teacher (manager) to specific provisioned school cohorts."""
    require_org_role(_get_db_path(), org_id, caller, "admin")
    conn = _conn()
    try:
        member = conn.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [org_id, member_id],
        ).fetchone()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found in organization.")

        conn.execute(
            "DELETE FROM cohort_teacher_assignments WHERE org_id = ? AND user_id = ?",
            [org_id, member_id],
        )
        cleaned = [c.strip() for c in body.cohort_names if c.strip()]
        for cname in cleaned:
            conn.execute(
                """
                INSERT OR IGNORE INTO cohort_teacher_assignments
                    (org_id, user_id, cohort_name, subject_code)
                VALUES (?, ?, ?, ?)
                """,
                [org_id, member_id, cname, body.subject_code.strip()],
            )
        _org_audit(
            conn,
            org_id,
            caller,
            "teacher_cohorts_assigned",
            target_type="member",
            target_id=member_id,
            detail={"cohorts": cleaned, "subject_code": body.subject_code.strip()},
        )
        conn.commit()
        return {"member_id": member_id, "cohorts": cleaned}
    finally:
        conn.close()


@router.get("/api/auth/sso/{provider}/start")
def start_school_sso(
    provider: str,
    domain: str = Query(..., min_length=3, max_length=120),
) -> dict[str, Any]:
    """Return configured SSO tenant metadata or clean 404/503 if unconfigured for a school domain."""
    norm_provider = provider.strip().lower()
    if norm_provider not in {"google_workspace", "entra_id", "saml"}:
        raise HTTPException(status_code=400, detail="Unsupported SSO provider.")

    conn = _conn()
    try:
        row = conn.execute(
            """
            SELECT st.org_id, o.name AS org_name, st.sso_provider, st.sso_domain, st.board
            FROM school_tenants st
            JOIN organizations o ON o.id = st.org_id
            WHERE lower(st.sso_domain) = lower(?) AND st.sso_provider = ?
            LIMIT 1
            """,
            [domain.strip(), norm_provider],
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="No school tenant configured for this SSO domain and provider.",
            )
        return {
            "provider": row["sso_provider"],
            "org_id": row["org_id"],
            "org_name": row["org_name"],
            "domain": row["sso_domain"],
            "board": row["board"],
            "configured": True,
        }
    finally:
        conn.close()


@router.post("/api/auth/sso/domain-join")
def sso_domain_auto_join(
    body: SchoolDomainJoinRequest,
    caller: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Enroll an authenticated user into a matching verified school domain cohort (respecting seat limit)."""
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Valid email address required.")
    domain = email.split("@", 1)[1]

    conn = _conn()
    try:
        user_row = conn.execute(
            "SELECT id, email FROM users WHERE id = ?", [caller]
        ).fetchone()
        if not user_row or (user_row["email"] or "").strip().lower() != email:
            raise HTTPException(
                status_code=403,
                detail="Verified account email must match the school domain email.",
            )

        tenant = conn.execute(
            """
            SELECT st.org_id, st.seat_limit, o.name AS org_name
            FROM school_tenants st
            JOIN organizations o ON o.id = st.org_id
            WHERE lower(st.sso_domain) = ?
            LIMIT 1
            """,
            [domain],
        ).fetchone()
        if not tenant:
            raise HTTPException(status_code=404, detail="No school matches that email domain.")

        org_id = tenant["org_id"]
        already = conn.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [org_id, caller],
        ).fetchone()
        if not already:
            used = conn.execute(
                "SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]
            ).fetchone()[0]
            if used >= int(tenant["seat_limit"] or 250):
                raise HTTPException(
                    status_code=403,
                    detail="School seat limit reached. Ask your school admin to expand seats.",
                )
            conn.execute(
                """
                INSERT INTO org_members (org_id, user_id, role, invited_by)
                VALUES (?, ?, 'member', 'sso_domain_autojoin')
                """,
                [org_id, caller],
            )
            conn.execute(
                "UPDATE users SET account_type = 'organization' WHERE id = ?",
                [caller],
            )

        cohort = body.cohort_name.strip()
        if cohort:
            valid_cohort = conn.execute(
                "SELECT 1 FROM cohort_enrollments WHERE org_id = ? AND cohort_name = ? AND status = 'active'",
                [org_id, cohort],
            ).fetchone()
            if valid_cohort:
                conn.execute(
                    "INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name) VALUES (?, ?, ?)",
                    [org_id, caller, cohort],
                )

        conn.commit()
        return {"joined": True, "org_id": org_id, "org_name": tenant["org_name"], "cohort": cohort}
    finally:
        conn.close()
