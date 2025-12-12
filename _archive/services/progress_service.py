"""Service for handling learner progress."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

from models import ProgressRecord


class ProgressService:
    def __init__(self, seed_file: Path | str = "data/seed/progress.json") -> None:
        self._seed_file = Path(seed_file)
        self._progress = [self._parse_record(payload) for payload in self._load_seed_data()]

    def _load_seed_data(self) -> Iterable[dict]:
        return json.loads(self._seed_file.read_text(encoding="utf-8"))

    def _parse_record(self, payload: dict) -> ProgressRecord:
        payload = {**payload, "last_accessed": datetime.fromisoformat(payload["last_accessed"])}
        return ProgressRecord(**payload)

    def list_progress(self, user_id: int) -> List[ProgressRecord]:
        return [record for record in self._progress if record.user_id == user_id]

    def completion_percentage(self, user_id: int) -> float:
        entries = self.list_progress(user_id)
        if not entries:
            return 0.0
        return sum(record.completion_pct for record in entries) / len(entries)
