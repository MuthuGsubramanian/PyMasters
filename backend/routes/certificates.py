"""
certificates.py — Verifiable Credentials & Path Completion Certificates API.

Prefix: /api/credentials
"""

from datetime import datetime, timezone
import json
import re
import secrets
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id
from database import ensure_credentials_table, get_db_path
from paths.definitions import PATHS

router = APIRouter(prefix="/api/credentials", tags=["credentials"])

ISSUER_NAME = "PyMasters"
PARTNER_NOTE = "OpenEDG Python Institute Education Partner"
_CRED_ID_RE = re.compile(r"^PYM-\d{4}-[A-F0-9]{8}$")


class ClaimCredentialRequest(BaseModel):
    kind: str = "path"
    target_id: str


def _conn(db_path: str) -> sqlite3.Connection:
    ensure_credentials_table(db_path)
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def _dedup_lessons(seq: object) -> list[str]:
    if isinstance(seq, str):
        try:
            seq = json.loads(seq)
        except Exception:
            seq = []
    if not isinstance(seq, list):
        return []
    return list(dict.fromkeys(lid for lid in seq if isinstance(lid, str) and lid.strip()))


def _all_paths_map(conn: sqlite3.Connection) -> dict[str, dict]:
    """Build ordered map of path_id -> {id, title, lessons}, merging DB rows over static PATHS."""
    catalog: dict[str, dict] = {}
    for tup in PATHS:
        pid, name, _desc, _icon, _ds, _de, _cat, _hrs, lessons_json, _concepts_json = tup
        catalog[pid] = {
            "id": pid,
            "title": name,
            "lessons": _dedup_lessons(lessons_json),
        }

    try:
        rows = conn.execute("SELECT id, name, lesson_sequence FROM learning_paths").fetchall()
        for r in rows:
            lessons = _dedup_lessons(r["lesson_sequence"])
            if r["id"] and lessons:
                catalog[r["id"]] = {
                    "id": r["id"],
                    "title": r["name"] or r["id"],
                    "lessons": lessons,
                }
    except sqlite3.OperationalError:
        pass
    return catalog


def _completed_lesson_ids(conn: sqlite3.Connection, user_id: str) -> set[str]:
    try:
        rows = conn.execute(
            "SELECT lesson_id FROM lesson_completions WHERE CAST(user_id AS TEXT) = ?",
            [str(user_id)],
        ).fetchall()
        return {r["lesson_id"] for r in rows if r["lesson_id"]}
    except sqlite3.OperationalError:
        return set()


def _format_credential_row(row: sqlite3.Row) -> dict:
    return {
        "cred_id": row["cred_id"],
        "kind": row["kind"],
        "target_id": row["target_id"],
        "title": row["title"],
        "recipient_name": row["recipient_name"],
        "lessons_completed": int(row["lessons_completed"]),
        "issued_at": row["issued_at"],
        "issuer": ISSUER_NAME,
        "partner_note": PARTNER_NOTE,
        "verify_url": f"/credentials/verify/{row['cred_id']}",
    }


@router.get("/mine")
def get_my_credentials(caller: str = Depends(get_current_user_id)):
    """Return issued credentials, claimable completed paths, and in-progress paths for the caller."""
    db_path = get_db_path()
    conn = _conn(db_path)
    try:
        issued_rows = conn.execute(
            "SELECT * FROM user_credentials WHERE CAST(user_id AS TEXT) = ? ORDER BY issued_at DESC",
            [str(caller)],
        ).fetchall()
        issued = [_format_credential_row(r) for r in issued_rows]
        issued_keys = {(r["kind"], r["target_id"]) for r in issued_rows}

        completed = _completed_lesson_ids(conn, caller)
        paths_map = _all_paths_map(conn)

        claimable = []
        in_progress = []

        for pid, pinfo in paths_map.items():
            if ("path", pid) in issued_keys:
                continue
            seq = pinfo["lessons"]
            total = len(seq)
            if total == 0:
                continue
            done_count = sum(1 for lid in seq if lid in completed)
            if done_count >= total:
                claimable.append({
                    "kind": "path",
                    "target_id": pid,
                    "title": pinfo["title"],
                    "lessons_completed": total,
                    "total_lessons": total,
                })
            elif done_count > 0:
                in_progress.append({
                    "kind": "path",
                    "target_id": pid,
                    "title": pinfo["title"],
                    "lessons_completed": done_count,
                    "total_lessons": total,
                    "percent": round(done_count / total * 100, 1),
                })

        in_progress.sort(key=lambda x: (-x["percent"], x["title"].lower()))
        return {
            "issued": issued,
            "claimable": claimable,
            "in_progress": in_progress,
        }
    finally:
        conn.close()


@router.post("/claim")
def claim_credential(body: ClaimCredentialRequest, caller: str = Depends(get_current_user_id)):
    """Verify 100% completion of a learning path and mint (or return existing) verifiable credential."""
    kind = (body.kind or "").strip().lower()
    target_id = (body.target_id or "").strip()
    if kind != "path":
        raise HTTPException(status_code=400, detail="Only 'path' credentials can be claimed.")
    if not target_id:
        raise HTTPException(status_code=400, detail="target_id is required.")

    db_path = get_db_path()
    conn = _conn(db_path)
    try:
        paths_map = _all_paths_map(conn)
        pinfo = paths_map.get(target_id)
        if not pinfo:
            raise HTTPException(status_code=404, detail=f"Learning path '{target_id}' not found.")

        existing = conn.execute(
            "SELECT * FROM user_credentials WHERE CAST(user_id AS TEXT) = ? AND kind = ? AND target_id = ?",
            [str(caller), kind, target_id],
        ).fetchone()
        if existing:
            return _format_credential_row(existing)

        seq = pinfo["lessons"]
        total = len(seq)
        completed = _completed_lesson_ids(conn, caller)
        done_count = sum(1 for lid in seq if lid in completed)
        if total == 0 or done_count < total:
            raise HTTPException(
                status_code=400,
                detail=f"Path incomplete: {done_count}/{total} lessons completed.",
            )

        recipient_name = "Learner"
        try:
            urow = conn.execute(
                "SELECT name, username FROM users WHERE CAST(id AS TEXT) = ?",
                [str(caller)],
            ).fetchone()
            if urow:
                recipient_name = (urow["name"] or "").strip() or (urow["username"] or "").strip() or "Learner"
        except sqlite3.OperationalError:
            pass

        now = datetime.now(timezone.utc)
        issued_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        year = now.year

        uid_val: int | str = int(caller) if str(caller).isdigit() else caller
        cred_id = ""
        for _ in range(8):
            candidate = f"PYM-{year}-{secrets.token_hex(4).upper()}"
            try:
                conn.execute(
                    """INSERT INTO user_credentials
                       (cred_id, user_id, kind, target_id, title, recipient_name, lessons_completed, issued_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    [candidate, uid_val, kind, target_id, pinfo["title"], recipient_name, total, issued_at],
                )
                conn.commit()
                cred_id = candidate
                break
            except sqlite3.IntegrityError:
                # Either user+kind+target_id already inserted concurrently, or rare cred_id collision
                race_existing = conn.execute(
                    "SELECT * FROM user_credentials WHERE CAST(user_id AS TEXT) = ? AND kind = ? AND target_id = ?",
                    [str(caller), kind, target_id],
                ).fetchone()
                if race_existing:
                    return _format_credential_row(race_existing)

        if not cred_id:
            raise HTTPException(status_code=500, detail="Could not generate unique credential ID.")

        created = conn.execute(
            "SELECT * FROM user_credentials WHERE cred_id = ?", [cred_id]
        ).fetchone()
        return _format_credential_row(created)
    finally:
        conn.close()


@router.get("/verify/{cred_id}")
def verify_credential(cred_id: str):
    """Public verification endpoint for a PyMasters credential ID (case-insensitive)."""
    norm_id = (cred_id or "").strip().upper()
    if not norm_id or len(norm_id) > 64 or not _CRED_ID_RE.fullmatch(norm_id):
        raise HTTPException(status_code=404, detail="Credential not found")

    db_path = get_db_path()
    conn = _conn(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM user_credentials WHERE UPPER(cred_id) = ?",
            [norm_id],
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Credential not found")

        return {
            "valid": True,
            "cred_id": row["cred_id"],
            "kind": row["kind"],
            "target_id": row["target_id"],
            "title": row["title"],
            "recipient_name": row["recipient_name"],
            "lessons_completed": int(row["lessons_completed"]),
            "issued_at": row["issued_at"],
            "issuer": ISSUER_NAME,
            "partner_note": PARTNER_NOTE,
        }
    finally:
        conn.close()
