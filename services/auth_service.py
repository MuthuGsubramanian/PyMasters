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
        normalized_email = email.strip().lower()
        for user in self._users:
            if user.email.lower() == normalized_email and user.password == password:
                return user
        return None

    def get_user(self, user_id: int) -> Optional[User]:
        for user in self._users:
            if user.id == user_id:
                return user
        return None

    def list_users(self) -> list[User]:
        return list(self._users)

    def create_user(
        self,
        *,
        name: str,
        email: str,
        password: str,
        skill_level: str,
        learning_goals: list[str] | None = None,
        avatar_url: str | None = None,
    ) -> User:
        """Create a new in-memory user for demo purposes."""

        normalized_email = email.strip().lower()
        if not normalized_email:
            raise ValueError("Email is required.")

        if any(user.email.lower() == normalized_email for user in self._users):
            raise ValueError("That email is already registered. Try signing in instead.")

        next_id = max((user.id for user in self._users), default=0) + 1
        cleaned_name = name.strip() or normalized_email.split("@")[0].title()
        user = User(
            id=next_id,
            email=normalized_email,
            name=cleaned_name,
            password=password,
            skill_level=skill_level,
            learning_goals=learning_goals or [],
            avatar_url=avatar_url,
        )
        self._users.append(user)
        return user
