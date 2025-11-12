"""Authentication service leveraging seed data for demonstration."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Optional

from models import User


class AuthService:
    """Provide basic authentication backed by seed data."""

    def __init__(self, seed_file: Path | str = "data/seed/users.json") -> None:
        self._seed_file = Path(seed_file)
        self._users = [User(**record) for record in self._load_seed_data()]

    def _load_seed_data(self) -> Iterable[dict]:
        data = json.loads(self._seed_file.read_text(encoding="utf-8"))
        return data

    def authenticate(self, email: str, password: str) -> Optional[User]:
        for user in self._users:
            if user.email.lower() == email.lower() and user.password == password:
                return user
        return None

    def get_user(self, user_id: int) -> Optional[User]:
        for user in self._users:
            if user.id == user_id:
                return user
        return None

    def list_users(self) -> list[User]:
        return list(self._users)
