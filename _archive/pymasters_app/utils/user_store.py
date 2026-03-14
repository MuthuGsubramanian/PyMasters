"""DuckDB-backed user persistence layer."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import uuid4

import duckdb
import pickle

from config.settings import settings


class UserStore:
    """Low-level data access layer for user documents stored in DuckDB."""

    _COLUMNS: tuple[str, ...] = (
        "id",
        "name",
        "username",
        "username_normalized",
        "email",
        "phone",
        "phone_normalized",
        "password_hash",
        "role",
        "created_at",
        "updated_at",
    )

    def __init__(self, db_path: str | Path | None = None) -> None:
        path = Path(db_path or settings.duckdb_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = duckdb.connect(str(path))
        self._ensure_schema()

    # ------------------------------------------------------------------ #
    # Schema
    # ------------------------------------------------------------------ #
    def _ensure_schema(self) -> None:
        legacy_documents = self._load_legacy_documents()
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT NOT NULL,
                username_normalized TEXT NOT NULL UNIQUE,
                email TEXT,
                phone TEXT,
                phone_normalized TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );
            """
        )
        self._conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
        )
        self._conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone_normalized)"
        )
        for document in legacy_documents:
            self.insert(document)

    def _load_legacy_documents(self) -> list[dict[str, Any]]:
        """Migrate legacy Pickle-based collections when present."""

        try:
            info = self._conn.execute("PRAGMA table_info('users')").fetchall()
        except duckdb.CatalogException:
            return []

        column_names = {row[1] for row in info}
        if column_names == {"_id", "data"}:
            rows = self._conn.execute("SELECT data FROM users").fetchall()
            self._conn.execute("DROP TABLE users")
            documents: list[dict[str, Any]] = []
            for (blob,) in rows:
                try:
                    payload = pickle.loads(bytes(blob))
                except Exception:
                    continue
                username_value = payload.get("username", "") or ""
                normalized_value = payload.get("username_normalized") or username_value
                documents.append(
                    {
                        "id": str(payload.get("_id") or uuid4()),
                        "name": payload.get("name", ""),
                        "username": username_value,
                        "username_normalized": normalized_value.lower() if normalized_value else "",
                        "email": payload.get("email"),
                        "phone": payload.get("phone"),
                        "phone_normalized": payload.get("phone_normalized"),
                        "password_hash": payload.get("password_hash", ""),
                        "role": payload.get("role", "learner"),
                        "created_at": payload.get("created_at") or datetime.utcnow(),
                        "updated_at": payload.get("updated_at") or datetime.utcnow(),
                    }
                )
            return documents
        return []

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _row_to_dict(self, row: Optional[Iterable[Any]]) -> Optional[dict[str, Any]]:
        if row is None:
            return None
        return {column: value for column, value in zip(self._COLUMNS, row)}

    # ------------------------------------------------------------------ #
    # CRUD operations
    # ------------------------------------------------------------------ #
    def count(self) -> int:
        (value,) = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()
        return int(value)

    def get_by_id(self, user_id: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT * FROM users WHERE id = ? LIMIT 1", [user_id]
        ).fetchone()
        return self._row_to_dict(row)

    def get_by_username(self, username_normalized: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT * FROM users WHERE username_normalized = ? LIMIT 1",
            [username_normalized],
        ).fetchone()
        return self._row_to_dict(row)

    def get_by_email(self, email_normalized: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1", [email_normalized]
        ).fetchone()
        return self._row_to_dict(row)

    def get_by_phone(self, phone_normalized: str) -> Optional[dict[str, Any]]:
        row = self._conn.execute(
            "SELECT * FROM users WHERE phone_normalized = ? LIMIT 1",
            [phone_normalized],
        ).fetchone()
        return self._row_to_dict(row)

    def insert(self, user_doc: dict[str, Any]) -> dict[str, Any]:
        doc = user_doc.copy()
        doc.setdefault("id", str(uuid4()))
        placeholders = ",".join("?" for _ in self._COLUMNS)
        values = [doc.get(column) for column in self._COLUMNS]
        self._conn.execute(
            f"INSERT INTO users ({','.join(self._COLUMNS)}) VALUES ({placeholders})",
            values,
        )
        return doc

    def update(self, user_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        if not updates:
            return self.get_by_id(user_id)

        assignments = []
        params: list[Any] = []
        for key, value in updates.items():
            assignments.append(f"{key} = ?")
            params.append(value)
        params.append(user_id)
        statement = f"UPDATE users SET {', '.join(assignments)} WHERE id = ?"
        result = self._conn.execute(statement, params)
        if result.rowcount == 0:
            return None
        return self.get_by_id(user_id)

    def update_password(self, user_id: str, password_hash: str) -> bool:
        now = datetime.utcnow()
        result = self._conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            [password_hash, now, user_id],
        )
        return result.rowcount > 0
