"""DuckDB-backed datastore helpers for PyMasters."""
from __future__ import annotations

import os
import pickle
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any, Iterable, Iterator
from uuid import uuid4

import duckdb
from dotenv import load_dotenv
import streamlit as st

load_dotenv()


def _db_path() -> Path:
    """Return the configured DuckDB database path."""

    configured = os.getenv("DUCKDB_PATH") or "data/pymasters.duckdb"
    path = Path(configured)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _quote_identifier(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Invalid collection name: {name!r}")
    return f'"{name}"'


def _matches(document: dict[str, Any], query: dict[str, Any]) -> bool:
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict) and "$ne" in expected:
            if actual == expected["$ne"]:
                return False
            continue
        if actual != expected:
            return False
    return True


def _apply_projection(document: dict[str, Any], projection: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    include_id = projection.get("_id", 1) not in (0, False)
    for key, enabled in projection.items():
        if enabled and key in document:
            payload[key] = document[key]
    if include_id and "_id" in document:
        payload["_id"] = document["_id"]
    return payload or deepcopy(document)


class DuckDBCursor:
    """Tiny cursor abstraction that mirrors the PyMongo API used in the app."""

    def __init__(self, documents: list[dict[str, Any]]):
        self._documents = documents

    def sort(self, key_or_list: Any, direction: int | None = None) -> DuckDBCursor:
        if isinstance(key_or_list, (list, tuple)):
            spec = key_or_list
        else:
            spec = [(key_or_list, direction or 1)]
        for field, order in reversed(spec):
            reverse = order in (-1, "desc", "descending")
            self._documents.sort(key=lambda doc, field=field: doc.get(field), reverse=reverse)
        return self

    def limit(self, value: int) -> DuckDBCursor:
        if value >= 0:
            self._documents = self._documents[:value]
        return self

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self._documents)


class DuckDBCollection:
    """Collection wrapper storing pickled documents inside DuckDB."""

    def __init__(self, conn: duckdb.DuckDBPyConnection, name: str, lock: RLock):
        self._conn = conn
        self._name = name
        self._quoted_name = _quote_identifier(name)
        self._lock = lock
        self._ensure_table()

    def _ensure_table(self) -> None:
        with self._lock:
            self._conn.execute(
                f"CREATE TABLE IF NOT EXISTS {self._quoted_name} (_id TEXT PRIMARY KEY, data BLOB)"
            )

    def create_index(self, *_: Any, **__: Any) -> None:  # pragma: no cover - compatibility no-op
        return None

    def estimated_document_count(self) -> int:
        row = self._conn.execute(f"SELECT COUNT(*) FROM {self._quoted_name}").fetchone()
        return int(row[0]) if row else 0

    def find_one(self, query: dict[str, Any] | None = None) -> dict[str, Any] | None:
        query = query or {}
        for document in self._load_documents():
            if _matches(document, query):
                return deepcopy(document)
        return None

    def find(
        self, query: dict[str, Any] | None = None, projection: dict[str, Any] | None = None
    ) -> DuckDBCursor:
        query = query or {}
        projection = projection or {}
        documents: list[dict[str, Any]] = []
        for document in self._load_documents():
            if _matches(document, query):
                payload = deepcopy(document)
                if projection:
                    payload = _apply_projection(payload, projection)
                documents.append(payload)
        return DuckDBCursor(documents)

    def insert_one(self, document: dict[str, Any]):
        payload = deepcopy(document)
        payload.setdefault("_id", str(uuid4()))
        blob = pickle.dumps(payload)
        with self._lock:
            self._conn.execute(
                f"INSERT INTO {self._quoted_name} (_id, data) VALUES (?, ?)", [payload["_id"], blob]
            )

        class Result:
            inserted_id = payload["_id"]

        return Result()

    def insert_many(self, documents: Iterable[dict[str, Any]]):
        inserted_ids: list[str] = []
        for document in documents:
            result = self.insert_one(document)
            inserted_ids.append(result.inserted_id)

        class Result:
            inserted_ids = inserted_ids

        return Result()

    def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False):
        query = query or {}
        update = update or {}
        for document in self._load_documents():
            if _matches(document, query):
                updated = deepcopy(document)
                if "$set" in update:
                    updated.update(update["$set"])
                if "$setOnInsert" in update:
                    for key, value in update["$setOnInsert"].items():
                        updated.setdefault(key, value)
                self._persist(updated)

                class Result:
                    matched_count = 1
                    modified_count = 1
                    upserted_id = None

                return Result()

        if not upsert:
            class Result:
                matched_count = 0
                modified_count = 0
                upserted_id = None

            return Result()

        seed: dict[str, Any] = {}
        for key, value in query.items():
            if isinstance(value, dict) and "$ne" in value:
                continue
            seed[key] = value
        if "$setOnInsert" in update:
            seed.update(update["$setOnInsert"])
        if "$set" in update:
            seed.update(update["$set"])
        result = self.insert_one(seed)

        class UpsertResult:
            matched_count = 0
            modified_count = 0
            upserted_id = result.inserted_id

        return UpsertResult()

    def delete_one(self, query: dict[str, Any]) -> None:
        query = query or {}
        for document in self._load_documents():
            if _matches(document, query):
                with self._lock:
                    self._conn.execute(
                        f"DELETE FROM {self._quoted_name} WHERE _id = ?", [document["_id"]]
                    )
                return

    def _load_documents(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(f"SELECT data FROM {self._quoted_name}").fetchall()
        documents: list[dict[str, Any]] = []
        for (blob,) in rows:
            documents.append(pickle.loads(bytes(blob)))
        return documents

    def _persist(self, document: dict[str, Any]) -> None:
        if "_id" not in document:
            document["_id"] = str(uuid4())
        blob = pickle.dumps(document)
        with self._lock:
            self._conn.execute(
                f"UPDATE {self._quoted_name} SET data = ? WHERE _id = ?", [blob, document["_id"]]
            )


class DuckDBDatabase:
    """Container object that mimics the PyMongo subset used in the app."""

    is_local = True

    def __init__(self, conn: duckdb.DuckDBPyConnection):
        self._conn = conn
        self._collections: dict[str, DuckDBCollection] = {}
        self._lock = RLock()

    def __getitem__(self, name: str) -> DuckDBCollection:
        return self.get_collection(name)

    def get_collection(self, name: str) -> DuckDBCollection:
        if name not in self._collections:
            self._collections[name] = DuckDBCollection(self._conn, name, self._lock)
        return self._collections[name]

    def list_collection_names(self) -> list[str]:
        rows = self._conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchall()
        return sorted({row[0] for row in rows})

    def create_collection(self, name: str) -> DuckDBCollection:
        return self.get_collection(name)


@st.cache_resource(show_spinner=False)
def _cached_database(path: str) -> DuckDBDatabase:
    conn = duckdb.connect(path)
    return DuckDBDatabase(conn)


def get_database(db_name: str | None = None) -> DuckDBDatabase:
    """Return the DuckDB-backed datastore (db_name retained for compatibility)."""

    _ = db_name  # unused but kept for backward compatibility
    path = str(_db_path())
    try:
        return _cached_database(path)
    except Exception as exc:  # pragma: no cover - defensive guard for Streamlit runtime
        raise RuntimeError(f"Unable to initialize DuckDB database: {exc}") from exc
