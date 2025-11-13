"""Minimal local JSON-backed database used when MongoDB is unavailable."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence
from bson import ObjectId


def _json_serializer(value: Any) -> Any:
    """Serialize unsupported types (datetime/ObjectId) for JSON dumping."""

    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    raise TypeError(f"Type {type(value)!r} is not JSON serializable")


class LocalCursor:
    """Very small cursor abstraction that mimics pymongo's API surface."""

    def __init__(self, documents: list[dict[str, Any]]):
        self._documents = documents

    def sort(self, key_or_list: Any, direction: int | None = None) -> "LocalCursor":
        if isinstance(key_or_list, Sequence) and not isinstance(key_or_list, (str, bytes)):
            pairs: list[tuple[Any, Any]] = []
            for item in key_or_list:
                if isinstance(item, (list, tuple)) and len(item) == 2:
                    pairs.append((item[0], item[1]))
                else:
                    pairs.append((item, 1))
        else:
            pairs = [(key_or_list, direction or 1)]

        for field, direction in reversed(pairs):
            reverse = direction in (-1, "desc", "descending")
            self._documents.sort(key=lambda doc, field=field: doc.get(field), reverse=reverse)
        return self

    def limit(self, value: int) -> "LocalCursor":
        if value >= 0:
            self._documents = self._documents[: value]
        return self

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self._documents)


class LocalJSONCollection:
    """Lightweight collection persisting documents to disk as JSON."""

    def __init__(self, name: str, base_dir: Path):
        self._name = name
        self._path = base_dir / f"{name}.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._documents: list[dict[str, Any]] = []
        self._load()

    # Mongo compatibility -------------------------------------------------
    def create_index(self, *_: Any, **__: Any) -> None:  # pragma: no cover - compatibility no-op
        return None

    def estimated_document_count(self) -> int:
        return len(self._documents)

    def find_one(self, query: dict[str, Any] | None = None) -> dict[str, Any] | None:
        query = query or {}
        for document in self._documents:
            if self._matches(document, query):
                return deepcopy(document)
        return None

    def find(self, query: dict[str, Any] | None = None, projection: dict[str, Any] | None = None) -> LocalCursor:
        query = query or {}
        projection = projection or {}
        rows: list[dict[str, Any]] = []
        for document in self._documents:
            if self._matches(document, query):
                payload = deepcopy(document)
                if projection:
                    payload = {k: payload.get(k) for k in projection if projection[k]}
                    if "_id" not in payload:
                        payload["_id"] = document.get("_id")
                rows.append(payload)
        return LocalCursor(rows)

    def insert_one(self, document: dict[str, Any]):
        payload = deepcopy(document)
        payload.setdefault("_id", str(ObjectId()))
        payload["_id"] = str(payload["_id"])
        self._documents.append(payload)
        self._persist()

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
        index = self._find_index(query)
        if index is not None:
            document = self._documents[index]
            if "$set" in update:
                document.update(update["$set"])
            if "$setOnInsert" in update:
                for key, value in update["$setOnInsert"].items():
                    document.setdefault(key, value)
            self._documents[index] = document
            self._persist()

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

        new_document: dict[str, Any] = {}
        for key, value in (query or {}).items():
            if isinstance(value, dict) and "$ne" in value:
                continue
            new_document[key] = value
        if "$setOnInsert" in update:
            new_document.update(update["$setOnInsert"])
        if "$set" in update:
            new_document.update(update["$set"])
        result = self.insert_one(new_document)

        class UpsertResult:
            matched_count = 0
            modified_count = 0
            upserted_id = result.inserted_id

        return UpsertResult()

    def delete_one(self, query: dict[str, Any]):
        index = self._find_index(query)
        if index is not None:
            self._documents.pop(index)
            self._persist()

    # Helpers -------------------------------------------------------------
    def _find_index(self, query: dict[str, Any]) -> int | None:
        for idx, document in enumerate(self._documents):
            if self._matches(document, query):
                return idx
        return None

    def _matches(self, document: dict[str, Any], query: dict[str, Any]) -> bool:
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(actual, ObjectId):
                actual = str(actual)
            if isinstance(expected, dict) and "$ne" in expected:
                if str(actual) == str(expected["$ne"]):
                    return False
                continue
            if isinstance(expected, ObjectId):
                expected = str(expected)
            if actual != expected:
                return False
        return True

    def _load(self) -> None:
        if not self._path.exists():
            self._documents = []
            return
        try:
            self._documents = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self._documents = []

    def _persist(self) -> None:
        self._path.write_text(json.dumps(self._documents, default=_json_serializer, indent=2), encoding="utf-8")


class LocalJSONDatabase:
    """Container object mimicking pymongo.database.Database."""

    is_local = True

    def __init__(self, name: str, root: Path | None = None):
        self._name = name
        self._root = (root or Path(".pymasters_localdb")) / name
        self._root.mkdir(parents=True, exist_ok=True)
        self._collections: dict[str, LocalJSONCollection] = {}

    def __getitem__(self, name: str) -> LocalJSONCollection:
        if name not in self._collections:
            self._collections[name] = LocalJSONCollection(name, self._root)
        return self._collections[name]

    def list_collection_names(self) -> list[str]:
        disk_names = [path.stem for path in self._root.glob("*.json")]
        mem_names = list(self._collections.keys())
        return sorted(set(disk_names + mem_names))

    def create_collection(self, name: str) -> LocalJSONCollection:
        collection = self[name]
        collection._persist()
        return collection

