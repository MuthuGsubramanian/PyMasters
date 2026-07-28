"""
playground_files.py — saved Playground code files.

Per-user named snippets saved from the Playground editor. The frontend's
localStorage autosave remains the unsaved-draft layer; these endpoints add
durable, cross-device storage with a small per-user cap. Saving your own text
is not gated by learning access — execution already is.
"""

import os
import sqlite3
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user_id

router = APIRouter(prefix="/api/playground/files", tags=["playground-files"])

MAX_FILES_PER_USER = 50
MAX_NAME_LEN = 100
MAX_CODE_LEN = 100_000  # 100 KB — far above any real playground script


def _db_path() -> str:
    return os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _conn():
    c = sqlite3.connect(_db_path())
    c.row_factory = sqlite3.Row
    return c


def ensure_playground_files_tables(db_path=None):
    conn = sqlite3.connect(db_path or _db_path())
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playground_files (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_playground_files_user "
            "ON playground_files (user_id, updated_at DESC)"
        )
        conn.commit()
    finally:
        conn.close()


class FileCreate(BaseModel):
    name: str
    code: str = ""


class FileUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None


def _clean_name(raw) -> str:
    name = (raw or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="File name can't be empty.")
    return name[:MAX_NAME_LEN]


def _clean_code(raw) -> str:
    code = raw if isinstance(raw, str) else ""
    if len(code) > MAX_CODE_LEN:
        raise HTTPException(status_code=413, detail="File is too large to save (100 KB max).")
    return code


_META_COLS = "id, name, LENGTH(code) AS size, created_at, updated_at"


def _meta_out(r) -> dict:
    return {"id": r["id"], "name": r["name"], "size": r["size"],
            "created_at": r["created_at"], "updated_at": r["updated_at"]}


def _owned_row(conn, file_id: str, caller: str):
    row = conn.execute(
        "SELECT * FROM playground_files WHERE id = ?", [file_id]
    ).fetchone()
    if not row or row["user_id"] != caller:
        # 404 for both — don't reveal other users' file ids.
        raise HTTPException(status_code=404, detail="File not found")
    return row


@router.get("")
def list_files(caller: str = Depends(get_current_user_id)):
    conn = _conn()
    try:
        rows = conn.execute(
            f"SELECT {_META_COLS} FROM playground_files "
            "WHERE user_id = ? ORDER BY updated_at DESC",
            [caller],
        ).fetchall()
    finally:
        conn.close()
    return {"files": [_meta_out(r) for r in rows], "limit": MAX_FILES_PER_USER}


@router.post("")
def create_file(req: FileCreate, caller: str = Depends(get_current_user_id)):
    name = _clean_name(req.name)
    code = _clean_code(req.code)
    conn = _conn()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM playground_files WHERE user_id = ?", [caller]
        ).fetchone()[0]
        if count >= MAX_FILES_PER_USER:
            raise HTTPException(
                status_code=409,
                detail=f"You've reached the limit of {MAX_FILES_PER_USER} saved files — "
                       "delete one to make room.")
        fid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO playground_files (id, user_id, name, code) VALUES (?, ?, ?, ?)",
            [fid, caller, name, code],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {_META_COLS} FROM playground_files WHERE id = ?", [fid]
        ).fetchone()
    finally:
        conn.close()
    return {"ok": True, "file": _meta_out(row)}


@router.get("/{file_id}")
def get_file(file_id: str, caller: str = Depends(get_current_user_id)):
    conn = _conn()
    try:
        row = _owned_row(conn, file_id, caller)
    finally:
        conn.close()
    return {"file": {"id": row["id"], "name": row["name"], "code": row["code"],
                     "created_at": row["created_at"], "updated_at": row["updated_at"]}}


@router.put("/{file_id}")
def update_file(file_id: str, req: FileUpdate, caller: str = Depends(get_current_user_id)):
    if req.name is None and req.code is None:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    sets, params = [], []
    if req.name is not None:
        sets.append("name = ?")
        params.append(_clean_name(req.name))
    if req.code is not None:
        sets.append("code = ?")
        params.append(_clean_code(req.code))
    conn = _conn()
    try:
        _owned_row(conn, file_id, caller)
        conn.execute(
            f"UPDATE playground_files SET {', '.join(sets)}, updated_at = datetime('now') "
            "WHERE id = ?",
            params + [file_id],
        )
        conn.commit()
        row = conn.execute(
            f"SELECT {_META_COLS} FROM playground_files WHERE id = ?", [file_id]
        ).fetchone()
    finally:
        conn.close()
    return {"ok": True, "file": _meta_out(row)}


@router.delete("/{file_id}")
def delete_file(file_id: str, caller: str = Depends(get_current_user_id)):
    conn = _conn()
    try:
        _owned_row(conn, file_id, caller)
        conn.execute("DELETE FROM playground_files WHERE id = ?", [file_id])
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}
